use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelConfig {
    pub id: String,          // unique per provider
    pub provider_id: String, // foreign key
    pub is_default: bool,
}
