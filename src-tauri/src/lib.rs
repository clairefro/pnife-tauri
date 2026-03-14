pub mod provider;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct Step {
    pub id: String,
    pub name: String,
    pub category: String,
    pub r#type: String,
    pub prompt: Option<String>,
    pub pattern: Option<String>,
    pub replacement: Option<String>,
    pub requires: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Tool {
    pub name: String,
    pub id: String,
    pub description: Option<String>,
    pub steps: Vec<Step>,
}

pub fn run_pipeline_from_file(path: &str, input: &str) -> Result<String, String> {
    run_pipeline_from_file_verbose(path, input, false)
}

pub fn run_pipeline_from_file_verbose(path: &str, input: &str, verbose: bool) -> Result<String, String> {
    let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let tool: Tool = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    run_pipeline_verbose(&tool, input, verbose)
}

pub fn run_pipeline_verbose(tool: &Tool, input: &str, verbose: bool) -> Result<String, String> {
    let mut current = input.to_string();
    for (i, step) in tool.steps.iter().enumerate() {
        if verbose {
                let step_num = i + 1;
                let step_name = &step.name;
                let step_type = &step.r#type;
                let step_category = &step.category;
                println!("Step {}: \"{}\" ({}:{})", step_num, step_name, step_category, step_type);
        }
        match step.r#type.as_str() {
            "ai_prompt" => {
                // In verbose mode, just show the output, not the prompt or description
                current = current.clone();
                if verbose {
                    println!("  Output: {}", current);
                }
            }
            "regex_replace" => {
                let pattern = step.pattern.as_deref().ok_or("Missing pattern")?;
                let replacement = step.replacement.as_deref().ok_or("Missing replacement")?;
                let re = regex::Regex::new(pattern).map_err(|e| e.to_string())?;
                current = re.replace_all(&current, replacement).to_string();
                if verbose {
                    println!("  Output: {}", current);
                }
            }
            _ => return Err(format!("Unknown step type: {}", step.r#type)),
        }
    }
    Ok(current)
}

pub fn run_pipeline(tool: &Tool, input: &str) -> Result<String, String> {
    let mut current = input.to_string();
    for step in &tool.steps {
        match step.r#type.as_str() {
            "ai_prompt" => {
                // For test, just append the prompt to the input
                let prompt = step.prompt.as_deref().unwrap_or("");
                current = format!("[PROMPT: {}] {}", prompt, current);
            }
            "regex_replace" => {
                let pattern = step.pattern.as_deref().ok_or("Missing pattern")?;
                let replacement = step.replacement.as_deref().ok_or("Missing replacement")?;
                let re = regex::Regex::new(pattern).map_err(|e| e.to_string())?;
                current = re.replace_all(&current, replacement).to_string();
            }
            _ => return Err(format!("Unknown step type: {}", step.r#type)),
        }
    }
    Ok(current)
}

// ...existing code...
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
