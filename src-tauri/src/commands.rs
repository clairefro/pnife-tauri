use crate::provider_config::{ProviderConfig, ProviderType};
use crate::provider_manager::{
    save_provider_config,
    load_all_providers,
    remove_provider,
    set_api_key,
    get_api_key,
    save_models,
    load_models,
    get_default_selection,
    set_default_selection,
    clear_default_selection,
    DefaultSelection,
};
use crate::model::ModelConfig;
use crate::ai_adapter::{AiResponse, TestResult};

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn list_providers() -> Result<Vec<ProviderConfig>, String> {
    let map = load_all_providers()?;
    Ok(map.into_values().collect())
}

#[tauri::command]
pub fn add_provider(provider: ProviderConfig, api_key: String) -> Result<(), String> {
    save_provider_config(&provider)?;
    set_api_key(&provider.id, &api_key)?;
    Ok(())
}

#[tauri::command]
pub fn delete_provider(provider_id: String) -> Result<(), String> {
    remove_provider(&provider_id)
}

#[tauri::command]
pub fn set_provider_api_key(provider_id: String, api_key: String) -> Result<(), String> {
    set_api_key(&provider_id, &api_key)
}

#[tauri::command]
pub fn test_provider_api_key(provider_id: String) -> Result<bool, String> {
    let key = get_api_key(&provider_id)?;
    Ok(!key.is_empty())
}

#[tauri::command]
pub fn list_models(provider_id: String) -> Result<Vec<ModelConfig>, String> {
    load_models(&provider_id)
}

#[tauri::command]
pub fn save_models_for_provider(
    provider_id: String,
    models: Vec<ModelConfig>,
) -> Result<(), String> {
    save_models(&provider_id, &models)
}

#[tauri::command]
pub fn get_default_provider_model() -> Result<Option<DefaultSelection>, String> {
    get_default_selection()
}

#[tauri::command]
pub fn set_default_provider_model(provider_id: String, model_id: String) -> Result<(), String> {
    set_default_selection(&DefaultSelection { provider_id, model_id })
}

#[tauri::command]
pub fn clear_default_provider_model() -> Result<(), String> {
    clear_default_selection()
}

/// Fetch the list of model IDs from a running local server (LM Studio or Ollama).
/// Returns an error for cloud providers — use the static list on the frontend instead.
#[tauri::command]
pub fn fetch_local_models(provider_id: String) -> Result<Vec<String>, String> {
    let providers = load_all_providers()?;
    let provider = providers
        .get(&provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let base = provider.base_url.trim_end_matches('/');

    match &provider.provider_type {
        ProviderType::Ollama => {
            // GET /api/tags → { "models": [{ "name": "llama3.2", … }, …] }
            let url = format!("{}/api/tags", base);
            let resp: serde_json::Value = reqwest::blocking::get(&url)
                .map_err(|e| format!("Could not reach Ollama at {}: {}", url, e))?
                .json()
                .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;
            let names = resp["models"]
                .as_array()
                .ok_or("Unexpected Ollama response: no 'models' array")?
                .iter()
                .filter_map(|m| m["name"].as_str().map(String::from))
                .collect();
            Ok(names)
        }
        ProviderType::LMStudio => {
            // GET /v1/models → { "data": [{ "id": "…" }, …] }
            let url = format!("{}/v1/models", base);
            let resp: serde_json::Value = reqwest::blocking::get(&url)
                .map_err(|e| format!("Could not reach LM Studio at {}: {}", url, e))?
                .json()
                .map_err(|e| format!("Failed to parse LM Studio response: {}", e))?;
            let ids = resp["data"]
                .as_array()
                .ok_or("Unexpected LM Studio response: no 'data' array")?
                .iter()
                .filter_map(|m| m["id"].as_str().map(String::from))
                .collect();
            Ok(ids)
        }
        t => Err(format!(
            "{:?} is a cloud provider — model IDs must be entered manually",
            t
        )),
    }
}

/// Send a prompt to the given provider + model and return the response with usage data.
#[tauri::command]
pub async fn ai_prompt(
    provider_id: String,
    model_id: String,
    prompt: String,
    system_prompt: Option<String>,
) -> Result<AiResponse, String> {
    crate::ai_adapter::run_prompt(&provider_id, &model_id, &prompt, system_prompt.as_deref()).await
}

/// Send a minimal probe prompt to verify connectivity for a provider + model.
#[tauri::command]
pub async fn test_connection(provider_id: String) -> Result<TestResult, String> {
    crate::ai_adapter::run_test(&provider_id).await
}
