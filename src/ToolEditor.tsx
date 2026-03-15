import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tool, ToolStep } from "./CommandPalette";
import "./ToolEditor.css";

interface Props {
  tool?: Tool; // undefined = new tool
  onSave: (tool: Tool) => void;
  onCancel: () => void;
  onDelete?: () => void; // only for editing existing tools
}

interface DraftStep extends ToolStep {
  _key: string; // stable drag-drop key
}

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function blankStep(type: "ai_prompt" | "regex_replace"): DraftStep {
  return {
    _key: makeKey(),
    type,
    prompt: type === "ai_prompt" ? "" : undefined,
    pattern: type === "regex_replace" ? "" : undefined,
    replacement: type === "regex_replace" ? "" : undefined,
  };
}

function toolToDraft(tool: Tool): DraftStep[] {
  return tool.steps.map((s) => ({ ...s, _key: makeKey() }));
}

export default function ToolEditor({
  tool,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const isNew = !tool;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(tool?.name ?? "");
  const [description, setDescription] = useState(tool?.description ?? "");
  const [steps, setSteps] = useState<DraftStep[]>(
    tool ? toolToDraft(tool) : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag state
  const dragIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);

  // ---------- step mutations ----------
  const addStep = (type: "ai_prompt" | "regex_replace") => {
    setSteps((prev) => [...prev, blankStep(type)]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, patch: Partial<DraftStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  };

  // ---------- drag-and-drop ----------
  const handleDragStart = (idx: number) => {
    dragIndex.current = idx;
  };

  const handleDragEnter = (idx: number) => {
    dragOverIndex.current = idx;
    setSteps((prev) => {
      const from = dragIndex.current;
      if (from === null || from === idx) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      dragIndex.current = idx;
      return next;
    });
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    dragOverIndex.current = null;
  };

  // ---------- save ----------
  const handleSave = async () => {
    if (!name.trim()) {
      setError("Tool name is required.");
      return;
    }
    const cleanSteps: ToolStep[] = steps.map(({ _key, ...rest }) => rest);
    const result: Tool = {
      id: tool?.id ?? `tool_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      steps: cleanSteps,
    };
    setSaving(true);
    setError(null);
    try {
      await invoke("save_tool", { tool: result });
      onSave(result);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <div className="tool-editor">
      <div className="tool-editor-header">
        <span className="tool-editor-title">
          {isNew ? "New Tool" : `Edit: ${tool.name}`}
        </span>
        <div className="tool-editor-header-actions">
          {!isNew &&
            onDelete &&
            (confirmDelete ? (
              <>
                <span className="confirm-label">Delete?</span>
                <button
                  className="btn-confirm-delete"
                  onClick={onDelete}
                  disabled={saving}
                >
                  Yes
                </button>
                <button
                  className="btn-cancel-inline"
                  onClick={() => setConfirmDelete(false)}
                  disabled={saving}
                >
                  No
                </button>
              </>
            ) : (
              <button
                className="btn-delete"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                title="Delete tool"
              >
                Delete
              </button>
            ))}
          <button className="btn-cancel" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-save"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="tool-editor-meta">
        <div className="tool-editor-field">
          <label className="field-label">Name</label>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tool name"
            maxLength={80}
          />
        </div>
        <div className="tool-editor-field">
          <label className="field-label">Description</label>
          <input
            className="field-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            maxLength={200}
          />
        </div>
      </div>

      <div className="tool-editor-steps-header">
        <span className="steps-label">Steps</span>
        <div className="add-step-btns">
          <button
            className="btn-add-step"
            onClick={() => addStep("ai_prompt")}
            title="Add AI Prompt step"
          >
            + AI Prompt
          </button>
          <button
            className="btn-add-step"
            onClick={() => addStep("regex_replace")}
            title="Add Regex Replace step"
          >
            + Regex Replace
          </button>
        </div>
      </div>

      <div className="tool-editor-steps">
        {steps.length === 0 && (
          <div className="steps-empty">No steps yet. Add a step above.</div>
        )}
        {steps.map((step, idx) => (
          <div
            key={step._key}
            className="step-card"
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragEnter={() => handleDragEnter(idx)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="step-card-header">
              <span className="drag-handle" title="Drag to reorder">
                ⠿
              </span>
              <span className={`step-type-badge step-type-${step.type}`}>
                {step.type === "ai_prompt" ? "AI Prompt" : "Regex Replace"}
              </span>
              <span className="step-num">Step {idx + 1}</span>
              <button
                className="btn-remove-step"
                onClick={() => removeStep(idx)}
                title="Remove step"
              >
                ✕
              </button>
            </div>

            {step.type === "ai_prompt" && (
              <div className="step-field">
                <label className="field-label">Prompt</label>
                <textarea
                  className="field-textarea"
                  value={step.prompt ?? ""}
                  onChange={(e) => updateStep(idx, { prompt: e.target.value })}
                  placeholder="Instruction sent to the AI model, followed by the input text…"
                  rows={4}
                />
              </div>
            )}

            {step.type === "regex_replace" && (
              <>
                <div className="step-field">
                  <label className="field-label">Pattern (regex)</label>
                  <input
                    className="field-input field-mono"
                    value={step.pattern ?? ""}
                    onChange={(e) =>
                      updateStep(idx, { pattern: e.target.value })
                    }
                    placeholder="e.g. \s+"
                    spellCheck={false}
                  />
                </div>
                <div className="step-field">
                  <label className="field-label">Replacement</label>
                  <input
                    className="field-input field-mono"
                    value={step.replacement ?? ""}
                    onChange={(e) =>
                      updateStep(idx, { replacement: e.target.value })
                    }
                    placeholder="e.g. ' '"
                    spellCheck={false}
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {error && <div className="tool-editor-error">{error}</div>}
    </div>
  );
}
