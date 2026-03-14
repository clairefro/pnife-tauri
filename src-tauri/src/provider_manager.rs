use crate::provider_config::{ProviderConfig, providers_config_path};
use crate::model::ModelConfig;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use serde_json;
use std::fs;
use std::collections::HashMap;

// ── Key derivation ────────────────────────────────────────────────────────────

/// Returns the macOS IOPlatformUUID, falling back to hostname+user.
fn machine_id() -> String {
    if let Ok(out) = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
    {
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            if line.contains("IOPlatformUUID") {
                if let Some(uuid) = line.split('"').nth(3) {
                    return uuid.to_string();
                }
            }
        }
    }
    let hostname = std::process::Command::new("hostname")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_default();
    format!("{}-{}", hostname, user)
}

/// Path for the per-install random secret — kept SEPARATE from api-keys.json
/// so a partial leak of either file alone is not enough to decrypt.
/// Stored under ~/.local/share/pnife/ (XDG data dir) on all platforms, which
/// is a different tree than ~/Library/Application Support/pnife/ on macOS.
fn keymat_path() -> std::path::PathBuf {
    // Use the user's home dir directly so it's outside the app-support dir
    let mut path = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push(".pnife_keymat");
    path
}

/// Reads the 32-byte random secret, creating it on first launch.
fn load_or_create_keymat() -> [u8; 32] {
    let path = keymat_path();
    if path.exists() {
        if let Ok(data) = fs::read(&path) {
            if data.len() == 32 {
                let mut out = [0u8; 32];
                out.copy_from_slice(&data);
                return out;
            }
        }
    }
    // Generate fresh secret
    let mut secret = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut secret);
    let _ = fs::write(&path, &secret);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    secret
}

/// SHA-256(prefix || machine_id || random_keymat) → 32-byte AES-256 key.
/// Requires BOTH the hardware UUID and the per-install secret to reproduce.
fn derive_key() -> [u8; 32] {
    let keymat = load_or_create_keymat();
    let mut h = Sha256::new();
    h.update(b"pnife-api-keys-v1:");
    h.update(machine_id().as_bytes());
    h.update(&keymat);
    h.finalize().into()
}

// v1: = old scheme (UUID only). v2: = current scheme (UUID + random keymat).
// Legacy v1: entries are re-encrypted to v2: transparently on first read.
const ENC_PREFIX: &str = "v2:";

fn encrypt_value(plaintext: &str) -> Result<String, String> {
    let key_bytes = derive_key();
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let mut ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;
    let mut combined = nonce_bytes.to_vec();
    combined.append(&mut ciphertext);
    Ok(format!("{}{}", ENC_PREFIX, B64.encode(&combined)))
}

fn decrypt_value(encoded: &str) -> Result<String, String> {
    let b64 = encoded
        .strip_prefix(ENC_PREFIX)
        .ok_or("not an encrypted value")?;
    aes_gcm_decrypt(b64, &derive_key())
}

/// Decrypts a legacy v1: blob using the old UUID-only key (no keymat).
fn decrypt_v1(encoded: &str) -> Result<String, String> {
    let b64 = encoded.strip_prefix("v1:").ok_or("not a v1 blob")?;
    let mut h = Sha256::new();
    h.update(b"pnife-api-keys-v1:");
    h.update(machine_id().as_bytes());
    let old_key: [u8; 32] = h.finalize().into();
    aes_gcm_decrypt(b64, &old_key)
}

fn aes_gcm_decrypt(b64: &str, key_bytes: &[u8; 32]) -> Result<String, String> {
    let combined = B64.decode(b64).map_err(|e| e.to_string())?;
    if combined.len() < 13 {
        return Err("ciphertext too short".to_string());
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key_bytes));
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "decryption failed – wrong machine?".to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

// ── File I/O ──────────────────────────────────────────────────────────────────

fn api_keys_path() -> std::path::PathBuf {
    let mut path = providers_config_path();
    path.set_file_name("api-keys.json");
    path
}

/// Loads the raw map of provider_id → encrypted blob (base64 strings).
fn load_raw_keys() -> HashMap<String, String> {
    let path = api_keys_path();
    if !path.exists() {
        return HashMap::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

fn save_raw_keys(keys: &HashMap<String, String>) -> Result<(), String> {
    let path = api_keys_path();
    fs::write(&path, serde_json::to_string_pretty(keys).unwrap())
        .map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct DefaultSelection {
    pub provider_id: String,
    pub model_id: String,
}

fn default_selection_path() -> std::path::PathBuf {
    let mut path = providers_config_path();
    path.set_file_name("default-selection.json");
    path
}

pub fn get_default_selection() -> Result<Option<DefaultSelection>, String> {
    let path = default_selection_path();
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

pub fn set_default_selection(selection: &DefaultSelection) -> Result<(), String> {
    let path = default_selection_path();
    fs::write(&path, serde_json::to_string_pretty(selection).unwrap())
        .map_err(|e| e.to_string())
}

pub fn clear_default_selection() -> Result<(), String> {
    let path = default_selection_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn save_provider_config(provider: &ProviderConfig) -> Result<(), String> {
    let path = providers_config_path();
    let mut providers = load_all_providers()?;
    providers.insert(provider.id.clone(), provider.clone());
    let list: Vec<_> = providers.values().cloned().collect();
    fs::write(&path, serde_json::to_string_pretty(&list).unwrap())
        .map_err(|e| e.to_string())
}

pub fn load_all_providers() -> Result<HashMap<String, ProviderConfig>, String> {
    let path = providers_config_path();
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    // Support both Vec<ProviderConfig> (current) and legacy HashMap formats.
    // On unrecognized format (e.g. data from a previous app version), start fresh.
    if let Ok(list) = serde_json::from_str::<Vec<ProviderConfig>>(&data) {
        return Ok(list.into_iter().map(|p| (p.id.clone(), p)).collect());
    }
    if let Ok(map) = serde_json::from_str::<HashMap<String, ProviderConfig>>(&data) {
        return Ok(map);
    }
    Ok(HashMap::new())
}

pub fn remove_provider(id: &str) -> Result<(), String> {
    let mut providers = load_all_providers()?;
    providers.remove(id);
    let path = providers_config_path();
    let list: Vec<_> = providers.values().cloned().collect();
    fs::write(&path, serde_json::to_string_pretty(&list).unwrap())
        .map_err(|e| e.to_string())
}

pub fn set_api_key(provider_id: &str, api_key: &str) -> Result<(), String> {
    let mut keys = load_raw_keys();
    if api_key.is_empty() {
        keys.remove(provider_id);
    } else {
        keys.insert(provider_id.to_string(), encrypt_value(api_key)?);
    }
    save_raw_keys(&keys)
}

pub fn get_api_key(provider_id: &str) -> Result<String, String> {
    let keys = load_raw_keys();
    match keys.get(provider_id) {
        None => Ok(String::new()),
        Some(blob) => {
            // Current format — normal decrypt
            if blob.starts_with(ENC_PREFIX) {
                return decrypt_value(blob);
            }
            // Legacy v1: (UUID-only key) — decrypt with old key then re-encrypt with new
            if blob.starts_with("v1:") {
                let plaintext = decrypt_v1(blob)?;
                let _ = set_api_key(provider_id, &plaintext);
                return Ok(plaintext);
            }
            // Plaintext (pre-encryption era) — re-encrypt transparently
            let plaintext = blob.clone();
            let _ = set_api_key(provider_id, &plaintext);
            Ok(plaintext)
        }
    }
}

// Model management (per provider)
pub fn save_models(provider_id: &str, models: &[ModelConfig]) -> Result<(), String> {
    let mut path = providers_config_path();
    path.set_file_name(format!("models-{}.json", provider_id));
    fs::write(&path, serde_json::to_string_pretty(models).unwrap())
        .map_err(|e| e.to_string())
}

pub fn load_models(provider_id: &str) -> Result<Vec<ModelConfig>, String> {
    let mut path = providers_config_path();
    path.set_file_name(format!("models-{}.json", provider_id));
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_key_round_trip() {
        let test_id = "_pnife_test_roundtrip";
        let test_key = "test-api-key-value";

        let result = set_api_key(test_id, test_key);
        assert!(result.is_ok(), "set_api_key failed: {:?}", result);

        let read_back = get_api_key(test_id);
        assert!(read_back.is_ok(), "get_api_key failed: {:?}", read_back);
        assert_eq!(read_back.unwrap(), test_key, "key mismatch");

        // Verify ciphertext starts with version prefix and is not the plaintext
        let raw = load_raw_keys();
        let blob = raw.get(test_id).unwrap();
        assert!(blob.starts_with(ENC_PREFIX), "blob missing v1: prefix");
        assert_ne!(blob, test_key, "key was stored as plaintext!");

        // cleanup
        let mut keys = load_raw_keys();
        keys.remove(test_id);
        let _ = save_raw_keys(&keys);
    }
}
