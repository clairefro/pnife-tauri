use crate::provider_config::ProviderType;
use crate::provider_manager::{load_all_providers, get_api_key, load_models};
use flyllm::{create_instance, LlmRequest};
use flyllm::providers::Message;
use flyllm::providers::ProviderType as FlyType;
use serde::{Deserialize, Serialize};

/// Maps our ProviderType to flyllm's. Custom providers are treated as
/// OpenAI-compatible (they send a custom endpoint_url instead).
fn to_fly_type(t: &ProviderType) -> FlyType {
    match t {
        ProviderType::OpenAI => FlyType::OpenAI,
        ProviderType::Anthropic => FlyType::Anthropic,
        ProviderType::LMStudio => FlyType::LMStudio,
        ProviderType::Ollama => FlyType::Ollama,
        ProviderType::Google => FlyType::Google,
        ProviderType::Custom => FlyType::OpenAI, // OpenAI-compatible
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiResponse {
    pub content: String,
    pub model: String,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    pub latency_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestResult {
    pub ok: bool,
    pub model_id: String,
    pub latency_ms: u64,
    pub error: Option<String>,
}

/// Build a flyllm instance for the given provider using stored credentials.
fn build_instance(
    provider_id: &str,
) -> Result<
    (std::sync::Arc<dyn flyllm::LlmInstance + Send + Sync>, String),
    String,
> {
    let providers = load_all_providers()?;
    let provider = providers
        .get(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let api_key = get_api_key(provider_id).unwrap_or_default();
    let fly_type = to_fly_type(&provider.provider_type);

    // Always forward our stored base_url as the endpoint so local servers
    // and custom proxies work correctly.
    let endpoint = if !provider.base_url.is_empty() {
        Some(provider.base_url.clone())
    } else {
        None
    };

    let instance = create_instance(fly_type, api_key, String::new(), vec![], true, endpoint);
    Ok((instance, provider_id.to_string()))
}

/// Send a prompt to the specified provider + model and return a structured response.
pub async fn run_prompt(
    provider_id: &str,
    model_id: &str,
    prompt: &str,
    system_prompt: Option<&str>,
) -> Result<AiResponse, String> {
    let (instance, _) = build_instance(provider_id)?;

    let mut messages = Vec::new();
    if let Some(sys) = system_prompt {
        if !sys.is_empty() {
            messages.push(Message {
                role: "system".to_string(),
                content: sys.to_string(),
            });
        }
    }
    messages.push(Message {
        role: "user".to_string(),
        content: prompt.to_string(),
    });

    let request = LlmRequest {
        messages,
        model: Some(model_id.to_string()),
        max_tokens: None,
        temperature: None,
    };

    let start = std::time::Instant::now();
    let response = instance.generate(&request).await.map_err(|e| e.to_string())?;
    let latency_ms = start.elapsed().as_millis() as u64;

    Ok(AiResponse {
        content: response.content,
        model: response.model,
        prompt_tokens: response.usage.as_ref().map(|u| u.prompt_tokens),
        completion_tokens: response.usage.as_ref().map(|u| u.completion_tokens),
        total_tokens: response.usage.as_ref().map(|u| u.total_tokens),
        latency_ms,
    })
}

/// Send a minimal probe prompt to verify the provider + model are reachable.
/// Uses the provider's default model, falling back to the first configured model.
pub async fn run_test(provider_id: &str) -> Result<TestResult, String> {
    let models = load_models(provider_id)?;
    let model = models
        .iter()
        .find(|m| m.is_default)
        .or_else(|| models.first())
        .ok_or("No models configured for this provider")?;

    let model_id = model.id.clone();

    let start = std::time::Instant::now();
    match run_prompt(provider_id, &model_id, "Respond with exactly: ok", Some("You are a test. Reply with only the word ok.")).await {
        Ok(resp) => Ok(TestResult {
            ok: true,
            model_id: resp.model,
            latency_ms: start.elapsed().as_millis() as u64,
            error: None,
        }),
        Err(e) => Ok(TestResult {
            ok: false,
            model_id,
            latency_ms: start.elapsed().as_millis() as u64,
            error: Some(e),
        }),
    }
}
