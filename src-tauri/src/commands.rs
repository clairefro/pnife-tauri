use rand::Rng;
use crate::provider_config::{ProviderConfig, ProviderType};
use crate::provider_manager::
{
    save_provider_config,
    load_all_providers,
    load_all_providers_ordered,
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
    load_all_providers_ordered()
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

/// Send a minimal probe prompt to verify connectivity for a specific provider + model.
#[tauri::command]
pub async fn test_connection(provider_id: String, model_id: String) -> Result<TestResult, String> {
    crate::ai_adapter::run_test(&provider_id, &model_id).await
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ToolStepConfig {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub r#type: String,
    pub prompt: Option<String>,
    pub pattern: Option<String>,
    pub replacement: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ToolConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub shortcut: Option<String>,
    pub steps: Vec<ToolStepConfig>,
}

fn tools_config_path() -> std::path::PathBuf {
    let mut path = crate::provider_config::providers_config_path();
    path.set_file_name("tools.json");
    path
}

fn load_tools_vec() -> Result<Vec<ToolConfig>, String> {
    let path = tools_config_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn save_tools_vec(tools: &[ToolConfig]) -> Result<(), String> {
    let path = tools_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(tools).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

const ID_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

pub fn make_id(prefix: &str) -> String {
    let mut rng = rand::thread_rng();
    let suffix: String = (0..12)
        .map(|_| ID_CHARS[rng.gen_range(0..62)] as char)
        .collect();
    format!("{}_{}", prefix, suffix)
}

/// Generate a prefixed short random ID (e.g. "tool_aB3xK9mNpQ2r").
#[tauri::command]
pub fn generate_id(prefix: String) -> String {
    make_id(&prefix)
}

/// List tools from ~/.config/pnife/tools.json (or platform equivalent).
#[tauri::command]
pub fn list_tools() -> Result<Vec<ToolConfig>, String> {
    load_tools_vec()
}

/// Upsert a tool (insert or update by id) in tools.json.
/// Backfills missing ids so CLI usage can omit them.
#[tauri::command]
pub fn save_tool(mut tool: ToolConfig) -> Result<(), String> {
    if tool.id.is_empty() {
        tool.id = make_id("tool");
    }
    for step in &mut tool.steps {
        if step.id.is_empty() {
            step.id = make_id("step");
        }
    }
    let mut tools = load_tools_vec()?;
    if let Some(pos) = tools.iter().position(|t| t.id == tool.id) {
        tools[pos] = tool;
    } else {
        tools.push(tool);
    }
    save_tools_vec(&tools)
}

/// Delete a tool by id from tools.json.
#[tauri::command]
pub fn delete_tool(tool_id: String) -> Result<(), String> {
    let mut tools = load_tools_vec()?;
    tools.retain(|t| t.id != tool_id);
    save_tools_vec(&tools)
}

#[derive(serde::Deserialize)]
pub struct ToolStep {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub r#type: String,
    pub prompt: Option<String>,
    pub pattern: Option<String>,
    pub replacement: Option<String>,
}

/// Execute a pipeline of steps using the user's default provider + model.
/// Handles step types: "ai_prompt" / "prompt" (LLM call), "regex_replace".
#[tauri::command]
pub async fn run_tool(steps: Vec<ToolStep>, input: String) -> Result<String, String> {
    let default_sel = get_default_selection()?
        .ok_or_else(|| "No default provider/model configured. Please set one in the Providers tab.".to_string())?;
    let provider_id = default_sel.provider_id.clone();
    let model_id = default_sel.model_id.clone();

    let mut current = input;
    for step in &steps {
        match step.r#type.as_str() {
            "ai_prompt" | "prompt" => {
                let prompt_text = step.prompt.as_deref().unwrap_or("");
                let full_prompt = format!("{0}\n\n{1}", prompt_text, current);
                let result = crate::ai_adapter::run_prompt(
                    &provider_id, &model_id, &full_prompt, None,
                ).await?;
                current = result.content;
            }
            "regex_replace" => {
                let pattern = step.pattern.as_deref().ok_or("regex_replace step missing 'pattern'")?;
                let replacement = step.replacement.as_deref().ok_or("regex_replace step missing 'replacement'")?;
                let re = regex::Regex::new(pattern).map_err(|e| e.to_string())?;
                current = re.replace_all(&current, replacement).to_string();
            }
            other => return Err(format!("Unknown step type: {}", other)),
        }
    }
    Ok(current)
}

#[derive(serde::Serialize)]
pub struct StepResult {
    pub output: String,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    pub latency_ms: u64,
}

/// Run a single pipeline step using the user's default provider + model.
/// Called once per step by the frontend so it can show per-step progress.
#[tauri::command]
pub async fn run_tool_step(step: ToolStep, input: String) -> Result<StepResult, String> {
    match step.r#type.as_str() {
        "ai_prompt" | "prompt" => {
            let default_sel = get_default_selection()?
                .ok_or_else(|| "No default provider/model configured. Please set one in the Providers tab.".to_string())?;
            let prompt_text = step.prompt.as_deref().unwrap_or("");
            let full_prompt = format!("{}\n\n{}", prompt_text, input);
            let res = crate::ai_adapter::run_prompt(
                &default_sel.provider_id,
                &default_sel.model_id,
                &full_prompt,
                None,
            ).await?;
            Ok(StepResult {
                output: res.content,
                prompt_tokens: res.prompt_tokens,
                completion_tokens: res.completion_tokens,
                total_tokens: res.total_tokens,
                latency_ms: res.latency_ms,
            })
        }
        "regex_replace" => {
            let pattern = step.pattern.as_deref().ok_or("regex_replace step missing 'pattern'")?;
            let replacement = step.replacement.as_deref().ok_or("regex_replace step missing 'replacement'")?;
            let re = regex::Regex::new(pattern).map_err(|e| e.to_string())?;
            Ok(StepResult {
                output: re.replace_all(&input, replacement).to_string(),
                prompt_tokens: None,
                completion_tokens: None,
                total_tokens: None,
                latency_ms: 0,
            })
        }
        other => Err(format!("Unknown step type: {}", other)),
    }
}
