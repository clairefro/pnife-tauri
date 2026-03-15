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
  is_default: boolean;
}

export interface DefaultSelection {
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

const DEFAULT_API_KEYS: Record<ProviderType, string> = {
  OpenAI: "",
  Anthropic: "",
  LMStudio: "lm-studio",
  Ollama: "ollama",
  Google: "",
  Custom: "",
};

// Well-known model IDs for cloud providers shown as datalist suggestions.
// LMStudio / Ollama are empty here — models are fetched live from the server.
const KNOWN_MODELS: Record<ProviderType, string[]> = {
  OpenAI: [
    "gpt-5.4",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5.3-codex",
    "gpt-4.1",
    "gpt-4.1-mini",
    "o3-high",
    "o3-mini",
    "gpt-4o",
    "gpt-4o-mini",
    "o1",
    "o1-mini",
    "o3",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
  ],
  Anthropic: [
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    "claude-haiku-3-5",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  Google: [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.0-pro-exp",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  LMStudio: [],
  Ollama: [],
  Custom: [],
};

const LOCAL_PROVIDER_TYPES: ProviderType[] = ["LMStudio", "Ollama"];

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
  is_default: boolean;
}

const BLANK_MODEL_FORM: ModelForm = {
  id: "",
  is_default: false,
};

// ── Main component ────────────────────────────────────────────────────────────

interface ProvidersPanelProps {
  defaultSelection: DefaultSelection | null;
  onDefaultSelectionChange: (sel: DefaultSelection | null) => void;
}

export default function ProvidersPanel({
  defaultSelection,
  onDefaultSelectionChange,
}: ProvidersPanelProps) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<Record<string, ModelConfig[]>>({});
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

  // ── Fetched local model lists (LMStudio / Ollama) ─────────────────────────
  const [localModels, setLocalModels] = useState<Record<string, string[]>>({});
  const [fetchingLocalModels, setFetchingLocalModels] = useState<
    Record<string, boolean>
  >({});
  const [localModelFetchError, setLocalModelFetchError] = useState<
    Record<string, string>
  >({});

  // ── Connection test ────────────────────────────────────────────────────────
  interface TestResult {
    ok: boolean;
    model_id: string;
    latency_ms: number;
    error?: string;
  }
  // Keys are "providerId:modelId"
  const [testingConn, setTestingConn] = useState<Record<string, boolean>>({});
  const [connResults, setConnResults] = useState<Record<string, TestResult>>(
    {},
  );

  const [showAddProvider, setShowAddProvider] = useState(false);
  const [providerForm, setProviderForm] =
    useState<ProviderForm>(BLANK_PROVIDER_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Edit provider ──────────────────────────────────────────────────────────
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editProviderForm, setEditProviderForm] =
    useState<ProviderForm>(BLANK_PROVIDER_FORM);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // ── Confirm modal ──────────────────────────────────────────────────────────
  interface ConfirmPending {
    type: "provider" | "model";
    providerId: string;
    modelId?: string;
    label: string;
  }
  const [confirmPending, setConfirmPending] = useState<ConfirmPending | null>(
    null,
  );

  // ── Load providers ──────────────────────────────────────────────────────────

  const loadProviders = useCallback(async () => {
    try {
      const list = await invoke<ProviderConfig[]>("list_providers");
      // Pin the provider that owns the default model to the top; preserve
      // backend order for the rest (backend now stores insertion order).
      const sel = await invoke<{
        provider_id: string;
        model_id: string;
      } | null>("get_default_provider_model");
      const sorted = sel
        ? [
            ...list.filter((p) => p.id === sel.provider_id),
            ...list.filter((p) => p.id !== sel.provider_id),
          ]
        : list;
      setProviders(sorted);
      onDefaultSelectionChange(sel);
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

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // ── Set default provider+model ──────────────────────────────────────────────

  const handleSetDefault = async (providerId: string, modelId: string) => {
    const isCurrent =
      defaultSelection?.provider_id === providerId &&
      defaultSelection?.model_id === modelId;
    try {
      if (isCurrent) {
        await invoke("clear_default_provider_model");
        onDefaultSelectionChange(null);
      } else {
        await invoke("set_default_provider_model", { providerId, modelId });
        onDefaultSelectionChange({
          provider_id: providerId,
          model_id: modelId,
        });
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
      api_key: DEFAULT_API_KEYS[type],
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
    if (providers.some((p) => p.id === providerForm.id.trim())) {
      setFormError(
        `A provider with ID "${providerForm.id.trim()}" already exists.`,
      );
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

  const handleDeleteProvider = (providerId: string) => {
    const p = providers.find((p) => p.id === providerId);
    setConfirmPending({
      type: "provider",
      providerId,
      label: `Delete provider "${p?.display_name ?? providerId}"?`,
    });
  };

  const _doDeleteProvider = async (providerId: string) => {
    try {
      await invoke("delete_provider", { providerId });
      if (defaultSelection?.provider_id === providerId) {
        await invoke("clear_default_provider_model");
        onDefaultSelectionChange(null);
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

  // ── Fetch local models (LMStudio / Ollama) ─────────────────────────────────

  const handleFetchLocalModels = async (providerId: string) => {
    setFetchingLocalModels((prev) => ({ ...prev, [providerId]: true }));
    setLocalModelFetchError((prev) => ({ ...prev, [providerId]: "" }));
    try {
      const ids = await invoke<string[]>("fetch_local_models", { providerId });
      setLocalModels((prev) => ({ ...prev, [providerId]: ids }));
    } catch (e) {
      setLocalModelFetchError((prev) => ({ ...prev, [providerId]: String(e) }));
    } finally {
      setFetchingLocalModels((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  // ── Test connection ────────────────────────────────────────────────────────

  const handleTestConnection = async (providerId: string, modelId: string) => {
    const key = `${providerId}:${modelId}`;
    setTestingConn((prev) => ({ ...prev, [key]: true }));
    setConnResults((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const result = await invoke<{
        ok: boolean;
        model_id: string;
        latency_ms: number;
        error?: string;
      }>("test_connection", { providerId, modelId });
      setConnResults((prev) => ({ ...prev, [key]: result }));
      setTimeout(
        () =>
          setConnResults((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          }),
        3000,
      );
    } catch (e) {
      const result = {
        ok: false,
        model_id: modelId,
        latency_ms: 0,
        error: String(e),
      };
      setConnResults((prev) => ({ ...prev, [key]: result }));
      setTimeout(
        () =>
          setConnResults((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          }),
        3000,
      );
    } finally {
      setTestingConn((prev) => ({ ...prev, [key]: false }));
    }
  };

  // ── Add model ───────────────────────────────────────────────────────────────

  const handleAddModel = async (providerId: string) => {
    const form = addModelForms[providerId] ?? BLANK_MODEL_FORM;
    if (!form.id.trim()) return;
    const existing = models[providerId] ?? [];
    if (existing.some((m) => m.id === form.id.trim())) {
      setModelErrors((prev) => ({
        ...prev,
        [providerId]: `Model "${form.id.trim()}" already exists.`,
      }));
      return;
    }
    const newModel: ModelConfig = {
      id: form.id.trim(),
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

  const handleDeleteModel = (providerId: string, modelId: string) => {
    setConfirmPending({
      type: "model",
      providerId,
      modelId,
      label: `Remove model "${modelId}"?`,
    });
  };

  const _doDeleteModel = async (providerId: string, modelId: string) => {
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

  // ── Confirm delete ──────────────────────────────────────────────────────────

  const handleConfirmDelete = async () => {
    if (!confirmPending) return;
    setConfirmPending(null);
    if (confirmPending.type === "provider") {
      await _doDeleteProvider(confirmPending.providerId);
    } else if (confirmPending.type === "model" && confirmPending.modelId) {
      await _doDeleteModel(confirmPending.providerId, confirmPending.modelId);
    }
  };

  // ── Save edit provider ──────────────────────────────────────────────────────

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditFormError(null);
    if (!editProviderForm.display_name.trim()) {
      setEditFormError("Display name is required.");
      return;
    }
    setEditSaving(true);
    try {
      const provider: ProviderConfig = {
        id: editProviderForm.id,
        display_name: editProviderForm.display_name.trim(),
        base_url: editProviderForm.base_url.trim(),
        provider_type: editProviderForm.provider_type,
        is_cloud: editProviderForm.is_cloud,
      };
      await invoke("add_provider", {
        provider,
        apiKey: editProviderForm.api_key,
      });
      setEditingProvider(null);
      await loadProviders();
    } catch (e) {
      setEditFormError(String(e));
    } finally {
      setEditSaving(false);
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
        {providers.length > 0 && !defaultSelection && (
          <div className="no-default-warning">
            ⚠ Please select a default model
          </div>
        )}
        {providers.map((p) => {
          const keyOk = apiKeyStatuses[p.id];
          const providerModels = models[p.id] ?? [];
          const showKeyInput = showApiKeyInput[p.id] ?? false;

          return (
            <div key={p.id} className="provider-card">
              {/* ── Left: provider info ── */}
              <div className="provider-card-left">
                {editingProvider === p.id ? (
                  <form
                    className="edit-provider-form"
                    onSubmit={handleSaveEdit}
                  >
                    <div className="provider-card-title">
                      <span
                        className="provider-type-badge"
                        style={{ background: TYPE_COLORS[p.provider_type] }}
                      >
                        {p.provider_type}
                      </span>
                      <span className="provider-name">{p.id}</span>
                    </div>
                    <div className="form-row">
                      <label>Display Name</label>
                      <input
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={editProviderForm.display_name}
                        onChange={(e) =>
                          setEditProviderForm((prev) => ({
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
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={editProviderForm.base_url}
                        onChange={(e) =>
                          setEditProviderForm((prev) => ({
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
                        placeholder="Leave blank to keep current"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={editProviderForm.api_key}
                        onChange={(e) =>
                          setEditProviderForm((prev) => ({
                            ...prev,
                            api_key: e.target.value,
                          }))
                        }
                      />
                    </div>
                    {editFormError && (
                      <div className="form-error">{editFormError}</div>
                    )}
                    <div className="card-actions">
                      <button
                        type="submit"
                        className="btn-primary-sm"
                        disabled={editSaving}
                      >
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => setEditingProvider(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="provider-card-title">
                      <span
                        className="provider-type-badge"
                        style={{ background: TYPE_COLORS[p.provider_type] }}
                      >
                        {p.provider_type}
                      </span>
                      <span className="provider-name">{p.display_name}</span>
                      <span className="provider-cloud-badge">
                        {p.is_cloud ? "☁ Cloud" : "⬡ Local"}
                      </span>
                    </div>

                    <div className="provider-url">{p.base_url}</div>

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

                    <div className="card-actions">
                      <button
                        className="btn-sm"
                        onClick={() => {
                          setEditingProvider(p.id);
                          setEditProviderForm({
                            id: p.id,
                            display_name: p.display_name,
                            provider_type: p.provider_type,
                            base_url: p.base_url,
                            is_cloud: p.is_cloud,
                            api_key: "",
                          });
                          setEditFormError(null);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-danger-sm"
                        onClick={() => handleDeleteProvider(p.id)}
                        title="Delete provider"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
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
                        {isDefault && (
                          <span className="model-default-tag">DEFAULT</span>
                        )}
                      </div>
                      <div className="model-info">
                        <span className="model-id">{m.id}</span>
                      </div>
                      {(() => {
                        const tkey = `${p.id}:${m.id}`;
                        const result = connResults[tkey];
                        return (
                          <>
                            {result && (
                              <span
                                className={`conn-result ${result.ok ? "conn-ok" : "conn-fail"}`}
                                title={result.error ?? ""}
                              >
                                {result.ok
                                  ? `✓ ${result.latency_ms}ms`
                                  : `✗ ${result.error ?? "Failed"}`}
                              </span>
                            )}
                            <button
                              className="btn-sm btn-test"
                              disabled={testingConn[tkey] ?? false}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTestConnection(p.id, m.id);
                              }}
                              title="Test this model"
                            >
                              {testingConn[tkey] ? "…" : "Test"}
                            </button>
                          </>
                        );
                      })()}
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
                    onClick={() => {
                      setShowAddModelForm((prev) => ({
                        ...prev,
                        [p.id]: true,
                      }));
                      // Auto-fetch available models for local providers
                      if (LOCAL_PROVIDER_TYPES.includes(p.provider_type)) {
                        handleFetchLocalModels(p.id);
                      }
                    }}
                  >
                    + Add Model
                  </button>
                ) : (
                  <div className="add-model-form">
                    <div className="add-model-input-row">
                      <input
                        type="text"
                        list={`model-suggestions-${p.id}`}
                        placeholder="Custom or click to view suggested"
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
                      {LOCAL_PROVIDER_TYPES.includes(p.provider_type) && (
                        <button
                          className="btn-sm btn-icon"
                          title="Refresh available models from server"
                          disabled={fetchingLocalModels[p.id] ?? false}
                          onClick={() => handleFetchLocalModels(p.id)}
                        >
                          {fetchingLocalModels[p.id] ? "…" : "↺"}
                        </button>
                      )}
                    </div>
                    {/* Datalist: local → fetched IDs; cloud → known IDs */}
                    <datalist id={`model-suggestions-${p.id}`}>
                      {(LOCAL_PROVIDER_TYPES.includes(p.provider_type)
                        ? (localModels[p.id] ?? [])
                        : KNOWN_MODELS[p.provider_type]
                      ).map((modelId) => (
                        <option key={modelId} value={modelId} />
                      ))}
                    </datalist>
                    {localModelFetchError[p.id] && (
                      <div className="form-error">
                        {localModelFetchError[p.id]}
                      </div>
                    )}
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

      {/* Confirm delete modal */}
      {confirmPending && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <p>{confirmPending.label}</p>
            <div className="confirm-actions">
              <button className="btn-danger-sm" onClick={handleConfirmDelete}>
                Delete
              </button>
              <button
                className="btn-sm"
                onClick={() => setConfirmPending(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
