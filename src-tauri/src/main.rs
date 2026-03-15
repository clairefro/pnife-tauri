// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::{Parser, Subcommand};
use pnife_lib::provider_config::{ProviderConfig, ProviderType};
use pnife_lib::provider_manager::{save_provider_config, set_api_key};

#[derive(Parser)]
#[command(name = "pnife")]
#[command(about = "Pnife: AI Pipeline Runner", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Run a pipeline from a JSON file
    Run {
        /// Path to the pipeline JSON file
        #[arg(short, long)]
        pipeline: String,
        /// Input text for the pipeline
        #[arg(short, long)]
        input: String,
        /// Verbose output (show step progress)
        #[arg(short, long, default_value_t = false)]
        verbose: bool,
    },
    /// Register a new LLM provider (local or cloud)
    RegisterProvider {
        /// Provider name (e.g. openai, local-llm)
        #[arg(short, long)]
        name: String,
        /// Base URL for the provider
        #[arg(short, long)]
        base_url: String,
        /// API key for the provider
        #[arg(short, long)]
        api_key: String,
        /// Is this a cloud provider?
        #[arg(long, default_value_t = true)]
        is_cloud: bool,
    },
}

fn main() {
    let cli = Cli::parse();
    match &cli.command {
        Some(Commands::Run { pipeline, input, verbose }) => {
            match pnife_lib::run_pipeline_from_file_verbose(pipeline, input, *verbose) {
                Ok(output) => {
                    println!("Pipeline output: {}", output);
                }
                Err(e) => {
                    eprintln!("Pipeline error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        Some(Commands::RegisterProvider { name, base_url, api_key, is_cloud }) => {
            // Guess provider type from name (simple heuristic, can be improved)
            let provider_type = match name.to_lowercase().as_str() {
                "openai" => ProviderType::OpenAI,
                "anthropic" => ProviderType::Anthropic,
                "lmstudio" => ProviderType::LMStudio,
                "ollama" => ProviderType::Ollama,
                "google" => ProviderType::Google,
                _ => ProviderType::Custom,
            };
            let provider = ProviderConfig {
                id: name.clone(),
                display_name: name.clone(),
                base_url: base_url.clone(),
                provider_type,
                is_cloud: *is_cloud,
                models: vec![],
            };
            match save_provider_config(&provider) {
                Ok(_) => match set_api_key(&provider.id, api_key) {
                    Ok(_) => println!("Provider '{}' registered successfully.", name),
                    Err(e) => {
                        eprintln!("Provider config saved, but failed to store API key: {}", e);
                        std::process::exit(1);
                    }
                },
                Err(e) => {
                    eprintln!("Failed to register provider: {}", e);
                    std::process::exit(1);
                }
            }
        }
        None => {
            pnife_lib::run();
        }
    }
}
