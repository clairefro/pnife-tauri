use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelConfig {
    pub id: String,           // unique per provider
    pub display_name: String, // e.g. "gpt-4-turbo"
    pub provider_id: String,  // foreign key
    pub is_default: bool,
}
