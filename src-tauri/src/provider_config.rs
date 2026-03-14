use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub enum ProviderType {
    OpenAI,
    Anthropic,
    LMStudio,
    Ollama,
    Google,
    Custom,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderConfig {
    pub id: String,           // unique, e.g. "openai"
    pub display_name: String, // e.g. "OpenAI"
    pub base_url: String,     // defaulted per provider, user-overridable
    pub provider_type: ProviderType,
    pub is_cloud: bool,
}

impl ProviderConfig {
    pub fn default_base_url(provider_type: &ProviderType) -> &'static str {
        // TODO: add provider types compatible with flyllym
        match provider_type {
            ProviderType::OpenAI => "https://api.openai.com",
            ProviderType::Anthropic => "https://api.anthropic.com",
            ProviderType::LMStudio => "http://localhost:1234",
            ProviderType::Ollama => "http://localhost:11434",
            ProviderType::Google => "https://generativelanguage.googleapis.com",
            ProviderType::Custom => "",
        }
    }
}

pub fn providers_config_path() -> PathBuf {
    // Use config dir, e.g. ~/.config/pnife/providers.json
    let mut dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("pnife");
    std::fs::create_dir_all(&dir).ok();
    dir.push("providers.json");
    dir
}
