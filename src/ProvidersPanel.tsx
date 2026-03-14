import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./ProvidersPanel.css";

// ── Types ────────────────────────────────────────────────────────────────────

type ProviderType =
  | "OpenAI"
  | "Anthropic"
  | "LMStudio"
  | "Ollama"
  | "Google"
  | "Custom";

interface ProviderConfig {
  id: string;
  display_name: string;
  base_url: string;
  provider_type: ProviderType;
  is_cloud: boolean;
}

interface ModelConfig {
  id: string;
  display_name: string;
  provider_id: string;
  is_default: boolean;
}

interface DefaultSelection {
  provider_id: string;
  model_id: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_TYPES: ProviderType[] = [
  "OpenAI",
  "Anthropic",
  "LMStudio",
  "Ollama",
  "Google",
  "Custom",
];

const DEFAULT_URLS: Record<ProviderType, string> = {
  OpenAI: "https://api.openai.com",
  Anthropic: "https://api.anthropic.com",
  LMStudio: "http://localhost:1234",
  Ollama: "http://localhost:11434",
  Google: "https://generativelanguage.googleapis.com",
  Custom: "",
};

const DEFAULT_IDS: Record<ProviderType, string> = {
  OpenAI: "openai",
  Anthropic: "anthropic",
  LMStudio: "lmstudio",
  Ollama: "ollama",
  Google: "google",
  Custom: "",
};

const DEFAULT_NAMES: Record<ProviderType, string> = {
  OpenAI: "OpenAI",
  Anthropic: "Anthropic",
  LMStudio: "LM Studio",
  Ollama: "Ollama",
  Google: "Google",
  Custom: "",
};

const CLOUD_DEFAULT: Record<ProviderType, boolean> = {
  OpenAI: true,
  Anthropic: true,
  LMStudio: false,
  Ollama: false,
  Google: true,
  Custom: false,
};

const TYPE_COLORS: Record<ProviderType, string> = {
  OpenAI: "#10a37f",
  Anthropic: "#c96442",
  LMStudio: "#7c5cbf",
  Ollama: "#4e9de0",
  Google: "#4285f4",
  Custom: "#888",
};

// ── Blank form state ─────────────────────────────────────────────────────────

interface ProviderForm {
  id: string;
  display_name: string;
  provider_type: ProviderType;
  base_url: string;
  is_cloud: boolean;
  api_key: string;
}

const BLANK_PROVIDER_FORM: ProviderForm = {
  id: "openai",
  display_name: "OpenAI",
  provider_type: "OpenAI",
  base_url: "https://api.openai.com",
  is_cloud: true,
  api_key: "",
};

interface ModelForm {
  id: string;
  display_name: string;
  is_default: boolean;
}

const BLANK_MODEL_FORM: ModelForm = {
  id: "",
  display_name: "",
  is_default: false,
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ProvidersPanel() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<Record<string, ModelConfig[]>>({});
  const [defaultSelection, setDefaultSelection] =
    useState<DefaultSelection | null>(null);
  const [apiKeyStatuses, setApiKeyStatuses] = useState<
    Record<string, boolean | null>
  >({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showApiKeyInput, setShowApiKeyInput] = useState<
    Record<string, boolean>
  >({});
  const [apiKeyErrors, setApiKeyErrors] = useState<Record<string, string>>({});
  const [apiKeySaved, setApiKeySaved] = useState<Record<string, boolean>>({});
  const [addModelForms, setAddModelForms] = useState<Record<string, ModelForm>>(
    {},
  );
  const [showAddModelForm, setShowAddModelForm] = useState<
    Record<string, boolean>
  >({});
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({});

  const [showAddProvider, setShowAddProvider] = useState(false);
  const [providerForm, setProviderForm] =
    useState<ProviderForm>(BLANK_PROVIDER_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Load providers ──────────────────────────────────────────────────────────

  const loadProviders = useCallback(async () => {
    try {
      const list = await invoke<ProviderConfig[]>("list_providers");
      setProviders(list);
      // Test API key status for each
      const statuses: Record<string, boolean | null> = {};
      await Promise.all(
        list.map(async (p) => {
          try {
            statuses[p.id] = await invoke<boolean>("test_provider_api_key", {
              providerId: p.id,
            });
          } catch {
            statuses[p.id] = false;
          }
        }),
      );
      setApiKeyStatuses(statuses);
      // Load models for all providers
      await Promise.all(list.map((p) => loadModels(p.id)));
    } catch (e) {
      console.error("Failed to load providers:", e);
    }
  }, []); // loadModels added below, referenced via stable ref

  const loadModels = useCallback(async (providerId: string) => {
    try {
      const list = await invoke<ModelConfig[]>("list_models", { providerId });
      setModels((prev) => ({ ...prev, [providerId]: list }));
    } catch (e) {
      console.error("Failed to load models:", e);
    }
  }, []);

  const loadDefaultSelection = useCallback(async () => {
    try {
      const sel = await invoke<DefaultSelection | null>(
        "get_default_provider_model",
      );
      setDefaultSelection(sel);
    } catch (e) {
      console.error("Failed to load default selection:", e);
    }
  }, []);

  useEffect(() => {
    loadProviders();
    loadDefaultSelection();
  }, [loadProviders, loadDefaultSelection]);

  // ── Set default provider+model ──────────────────────────────────────────────

  const handleSetDefault = async (providerId: string, modelId: string) => {
    const isCurrent =
      defaultSelection?.provider_id === providerId &&
      defaultSelection?.model_id === modelId;
    try {
      if (isCurrent) {
        await invoke("clear_default_provider_model");
        setDefaultSelection(null);
      } else {
        await invoke("set_default_provider_model", { providerId, modelId });
        setDefaultSelection({ provider_id: providerId, model_id: modelId });
      }
    } catch (e) {
      console.error("Failed to set default:", e);
    }
  };

  // ── Add provider ────────────────────────────────────────────────────────────

  const handleProviderTypeChange = (type: ProviderType) => {
    setProviderForm((prev) => ({
      ...prev,
      provider_type: type,
      id: DEFAULT_IDS[type],
      display_name: DEFAULT_NAMES[type],
      base_url: DEFAULT_URLS[type],
      is_cloud: CLOUD_DEFAULT[type],
    }));
  };

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!providerForm.id.trim()) {
      setFormError("ID is required.");
      return;
    }
    if (!providerForm.display_name.trim()) {
      setFormError("Display name is required.");
      return;
    }
    setSaving(true);
    try {
      const provider: ProviderConfig = {
        id: providerForm.id.trim(),
        display_name: providerForm.display_name.trim(),
        base_url: providerForm.base_url.trim(),
        provider_type: providerForm.provider_type,
        is_cloud: providerForm.is_cloud,
      };
      await invoke("add_provider", {
        provider,
        apiKey: providerForm.api_key,
      });
      setShowAddProvider(false);
      setProviderForm(BLANK_PROVIDER_FORM);
      await loadProviders();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete provider ─────────────────────────────────────────────────────────

  const handleDeleteProvider = async (providerId: string) => {
    try {
      await invoke("delete_provider", { providerId });
      // Clear default if it pointed to this provider
      if (defaultSelection?.provider_id === providerId) {
        await invoke("clear_default_provider_model");
        setDefaultSelection(null);
      }
      await loadProviders();
      setModels((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
    } catch (e) {
      setApiKeyErrors((prev) => ({ ...prev, [providerId]: String(e) }));
    }
  };

  // ── Update API key ──────────────────────────────────────────────────────────

  const handleUpdateApiKey = async (providerId: string) => {
    const key = apiKeyInputs[providerId] ?? "";
    setApiKeyErrors((prev) => ({ ...prev, [providerId]: "" }));
    try {
      await invoke("set_provider_api_key", { providerId, apiKey: key });
      const ok = await invoke<boolean>("test_provider_api_key", { providerId });
      setApiKeyStatuses((prev) => ({ ...prev, [providerId]: ok }));
      setShowApiKeyInput((prev) => ({ ...prev, [providerId]: false }));
      setApiKeyInputs((prev) => ({ ...prev, [providerId]: "" }));
      setApiKeySaved((prev) => ({ ...prev, [providerId]: true }));
      setTimeout(
        () => setApiKeySaved((prev) => ({ ...prev, [providerId]: false })),
        2000,
      );
    } catch (e) {
      setApiKeyErrors((prev) => ({ ...prev, [providerId]: String(e) }));
    }
  };

  // ── Add model ───────────────────────────────────────────────────────────────

  const handleAddModel = async (providerId: string) => {
    const form = addModelForms[providerId] ?? BLANK_MODEL_FORM;
    if (!form.id.trim() || !form.display_name.trim()) return;
    const existing = models[providerId] ?? [];
    const newModel: ModelConfig = {
      id: form.id.trim(),
      display_name: form.display_name.trim(),
      provider_id: providerId,
      is_default: form.is_default,
    };
    // If this is_default, unset others
    const updated = [
      ...existing.map((m) =>
        form.is_default ? { ...m, is_default: false } : m,
      ),
      newModel,
    ];
    try {
      await invoke("save_models_for_provider", {
        providerId,
        models: updated,
      });
      setModels((prev) => ({ ...prev, [providerId]: updated }));
      setAddModelForms((prev) => ({ ...prev, [providerId]: BLANK_MODEL_FORM }));
      setShowAddModelForm((prev) => ({ ...prev, [providerId]: false }));
      setModelErrors((prev) => ({ ...prev, [providerId]: "" }));
    } catch (e) {
      setModelErrors((prev) => ({ ...prev, [providerId]: String(e) }));
    }
  };

  // ── Delete model ────────────────────────────────────────────────────────────

  const handleDeleteModel = async (providerId: string, modelId: string) => {
    const existing = models[providerId] ?? [];
    const updated = existing.filter((m) => m.id !== modelId);
    try {
      await invoke("save_models_for_provider", {
        providerId,
        models: updated,
      });
      setModels((prev) => ({ ...prev, [providerId]: updated }));
    } catch (e) {
      setModelErrors((prev) => ({ ...prev, [providerId]: String(e) }));
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="providers-panel">
      <div className="providers-header">
        <h2>Providers</h2>
        <button
          className="btn-primary"
          onClick={() => {
            setShowAddProvider((v) => !v);
            setFormError(null);
          }}
        >
          {showAddProvider ? "Cancel" : "+ Add Provider"}
        </button>
      </div>

      {/* Add Provider Form */}
      {showAddProvider && (
        <form className="add-provider-form" onSubmit={handleAddProvider}>
          <h3>New Provider</h3>
          <div className="form-row">
            <label>Type</label>
            <select
              value={providerForm.provider_type}
              onChange={(e) =>
                handleProviderTypeChange(e.target.value as ProviderType)
              }
            >
              {PROVIDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>ID</label>
            <input
              type="text"
              placeholder="e.g. openai"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={providerForm.id}
              onChange={(e) =>
                setProviderForm((prev) => ({ ...prev, id: e.target.value }))
              }
            />
          </div>
          <div className="form-row">
            <label>Display Name</label>
            <input
              type="text"
              placeholder="e.g. OpenAI"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={providerForm.display_name}
              onChange={(e) =>
                setProviderForm((prev) => ({
                  ...prev,
                  display_name: e.target.value,
                }))
              }
            />
          </div>
          <div className="form-row">
            <label>Base URL</label>
            <input
              type="text"
              placeholder="https://..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={providerForm.base_url}
              onChange={(e) =>
                setProviderForm((prev) => ({
                  ...prev,
                  base_url: e.target.value,
                }))
              }
            />
          </div>
          <div className="form-row">
            <label>API Key</label>
            <input
              type="password"
              placeholder="sk-..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={providerForm.api_key}
              onChange={(e) =>
                setProviderForm((prev) => ({
                  ...prev,
                  api_key: e.target.value,
                }))
              }
            />
          </div>

          {formError && <div className="form-error">{formError}</div>}
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save Provider"}
            </button>
          </div>
        </form>
      )}

      {/* Provider List */}
      {providers.length === 0 && !showAddProvider && (
        <div className="providers-empty">
          No providers configured. Add one to get started.
        </div>
      )}

      <div className="providers-list">
        {providers.map((p) => {
          const keyOk = apiKeyStatuses[p.id];
          const providerModels = models[p.id] ?? [];
          const showKeyInput = showApiKeyInput[p.id] ?? false;

          return (
            <div key={p.id} className="provider-card">
              {/* ── Left: provider info ── */}
              <div className="provider-card-left">
                <div className="provider-card-title">
                  <span
                    className="provider-type-badge"
                    style={{ background: TYPE_COLORS[p.provider_type] }}
                  >
                    {p.provider_type}
                  </span>
                  <span className="provider-name">{p.display_name}</span>
                </div>

                <div className="provider-url">{p.base_url}</div>

                <span className="provider-cloud-badge">
                  {p.is_cloud ? "☁ Cloud" : "⬡ Local"}
                </span>

                <div className="provider-key-row">
                  <span
                    className={`key-status ${
                      keyOk === true
                        ? "key-ok"
                        : keyOk === false
                          ? "key-missing"
                          : "key-unknown"
                    }`}
                  >
                    {keyOk === true
                      ? "✓ API key set"
                      : keyOk === false
                        ? "✗ No API key"
                        : "· · ·"}
                  </span>
                  <button
                    className="btn-sm"
                    onClick={() =>
                      setShowApiKeyInput((prev) => ({
                        ...prev,
                        [p.id]: !prev[p.id],
                      }))
                    }
                  >
                    {showKeyInput ? "Cancel" : "Update Key"}
                  </button>
                </div>

                {showKeyInput && (
                  <div className="api-key-update-row">
                    <input
                      type="password"
                      className="api-key-input"
                      placeholder="New API key…"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={apiKeyInputs[p.id] ?? ""}
                      onChange={(e) =>
                        setApiKeyInputs((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateApiKey(p.id);
                      }}
                    />
                    <button
                      className="btn-primary-sm"
                      onClick={() => handleUpdateApiKey(p.id)}
                    >
                      Save
                    </button>
                  </div>
                )}
                {apiKeyErrors[p.id] && (
                  <div className="form-error">{apiKeyErrors[p.id]}</div>
                )}
                {apiKeySaved[p.id] && (
                  <div className="key-saved-msg">✓ Key saved</div>
                )}

                <button
                  className="btn-danger-sm card-delete-btn"
                  onClick={() => handleDeleteProvider(p.id)}
                  title="Delete provider"
                >
                  Delete
                </button>
              </div>

              {/* ── Right: models ── */}
              <div className="provider-card-right">
                <div className="models-header">Models</div>

                {providerModels.length === 0 && (
                  <div className="models-empty">No models configured.</div>
                )}

                {providerModels.map((m) => {
                  const isDefault =
                    defaultSelection?.provider_id === p.id &&
                    defaultSelection?.model_id === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`model-row${isDefault ? " model-row-default" : ""}`}
                      onClick={() => handleSetDefault(p.id, m.id)}
                      title={
                        isDefault
                          ? "Click to unset as default"
                          : "Click to set as default"
                      }
                    >
                      <div className="model-default-radio">
                        <span
                          className={`radio-dot${isDefault ? " radio-dot-active" : ""}`}
                        />
                      </div>
                      <div className="model-info">
                        <span className="model-name">{m.display_name}</span>
                        <span className="model-id">{m.id}</span>
                      </div>
                      <button
                        className="btn-danger-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteModel(p.id, m.id);
                        }}
                        title="Remove model"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}

                {!(showAddModelForm[p.id] ?? false) ? (
                  <button
                    className="btn-sm add-model-btn"
                    onClick={() =>
                      setShowAddModelForm((prev) => ({ ...prev, [p.id]: true }))
                    }
                  >
                    + Add Model
                  </button>
                ) : (
                  <div className="add-model-form">
                    <input
                      type="text"
                      placeholder="Model ID (e.g. gpt-4o)"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={addModelForms[p.id]?.id ?? ""}
                      onChange={(e) =>
                        setAddModelForms((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] ?? BLANK_MODEL_FORM),
                            id: e.target.value,
                          },
                        }))
                      }
                    />
                    <input
                      type="text"
                      placeholder="Display name (e.g. GPT-4o)"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={addModelForms[p.id]?.display_name ?? ""}
                      onChange={(e) =>
                        setAddModelForms((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] ?? BLANK_MODEL_FORM),
                            display_name: e.target.value,
                          },
                        }))
                      }
                    />
                    <div className="add-model-actions">
                      <button
                        className="btn-primary-sm"
                        onClick={() => handleAddModel(p.id)}
                      >
                        Add
                      </button>
                      <button
                        className="btn-sm"
                        onClick={() =>
                          setShowAddModelForm((prev) => ({
                            ...prev,
                            [p.id]: false,
                          }))
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {modelErrors[p.id] && (
                  <div className="form-error">{modelErrors[p.id]}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
