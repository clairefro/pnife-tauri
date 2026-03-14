use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderConfig {
    pub name: String,
    pub base_url: String,
    pub api_key: String, // This will be encrypted at rest
    pub is_cloud: bool,
}

impl ProviderConfig {
    pub fn new(name: &str, base_url: &str, api_key: &str, is_cloud: bool) -> Self {
        Self {
            name: name.to_string(),
            base_url: base_url.to_string(),
            api_key: api_key.to_string(),
            is_cloud,
        }
    }
}

pub fn save_provider_config(provider: &ProviderConfig) -> Result<(), String> {
    // Encrypt the API key before saving (simple XOR for demo, use real crypto in prod)
    let mut config = provider.clone();
    config.api_key = xor_encrypt(&config.api_key, "pnife-key");
    let path = format!(".pnife-provider-{}.json", config.name);
    std::fs::write(&path, serde_json::to_string(&config).unwrap())
        .map_err(|e| e.to_string())
}

pub fn load_provider_config(name: &str) -> Result<ProviderConfig, String> {
    let path = format!(".pnife-provider-{}.json", name);
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut config: ProviderConfig = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    config.api_key = xor_encrypt(&config.api_key, "pnife-key"); // decrypt
    Ok(config)
}

fn xor_encrypt(data: &str, key: &str) -> String {
    data.bytes()
        .zip(key.bytes().cycle())
        .map(|(b, k)| b ^ k)
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<_>>()
        .join("")
}

fn xor_decrypt(hex: &str, key: &str) -> String {
    let bytes: Vec<u8> = hex
        .as_bytes()
        .chunks(2)
        .map(|chunk| u8::from_str_radix(std::str::from_utf8(chunk).unwrap(), 16).unwrap())
        .collect();
    bytes
        .into_iter()
        .zip(key.bytes().cycle())
        .map(|(b, k)| (b ^ k) as char)
        .collect()
}
