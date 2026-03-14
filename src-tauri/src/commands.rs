use crate::provider_config::ProviderConfig;
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
