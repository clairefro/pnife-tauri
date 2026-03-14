# Provider & Model Configuration Architecture

## Goals

- Securely manage multiple LLM providers (OpenAI, Anthropic, LM Studio, Ollama, Google, etc.)
- Store API keys and secrets securely using the OS keyring (via the `keyring` crate)
- Allow users to configure providers and select models via the Tauri GUI only (no direct CLI config)
- Enable headless (CLI) pipeline runs by reading provider config and secrets from backend
- Support easy provider/model switching, default selection, and connection testing

---

## Provider Struct

```
rust
debug struct ProviderConfig {
    pub id: String,           // unique, e.g. "openai"
    pub display_name: String, // e.g. "OpenAI"
    pub base_url: String,     // defaulted per provider, user-overridable
    pub provider_type: ProviderType, // Enum: OpenAI, Anthropic, LMStudio, Ollama, Google, Custom
    pub is_cloud: bool,
}
```

- **No provider-specific options at this stage.**
- API keys are NOT stored in this struct or in config files.

---

## Secret Storage

- **API keys and secrets are stored in the OS keyring** using the `keyring` crate.
- Keyring entry name pattern: `pnife-{provider_id}-apikey`
- Only the backend (GUI or CLI) can access secrets; never exposed to frontend or written to disk.
- If a secret is missing, the GUI prompts the user to enter it securely.

---

## Provider Config Storage

- All non-secret provider config is stored in a config file (e.g., `providers.json` in the app config directory).
- Example:

```json
[
  {
    "id": "openai",
    "display_name": "OpenAI",
    "base_url": "https://api.openai.com",
    "provider_type": "OpenAI",
    "is_cloud": true
  },
  ...
]
```

---

## Model Management

- Each provider can have a list of available models (fetched from API or entered manually).
- Model struct:

```
rust
debug struct ModelConfig {
    pub id: String,           // unique per provider
    pub display_name: String, // e.g. "gpt-4-turbo"
    pub provider_id: String,  // foreign key
    pub is_default: bool,
}
```

- Models are stored per provider in the config file.

---

## GUI Features

- Add/edit/remove providers
- Show default base URL, allow override
- Securely prompt for API key (never shown or stored in plain text)
- Test connection before saving
- List/add/remove models per provider
- Set default provider/model

---

## CLI Integration

- CLI can launch the GUI for provider/model config (e.g., `pnife gui`)
- CLI and backend can read provider/model config and secrets for headless operation
- CLI never writes or exposes secrets

---

## Extensibility

- Easy to add new providers (add to registry with defaults)
- Support for custom providers (manual entry)
- Schema versioning for future migrations

---

## Security Considerations

- API keys are never written to disk or logs
- Only loaded into memory when needed
- All config file writes are atomic
- Clear error messages for missing/invalid config

---

## Summary

This architecture ensures secure, flexible, and user-friendly management of LLM providers and models, supporting both GUI and headless CLI workflows, with secrets always protected by the OS keyring.
