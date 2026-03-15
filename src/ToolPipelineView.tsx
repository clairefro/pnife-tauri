import { useState } from "react";
import "./ToolPipelineView.css";
import { ToolStep } from "./CommandPalette";

export interface StepResult {
  output: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  latency_ms: number;
}

interface Props {
  steps: ToolStep[];
  results: (StepResult | null)[];
  currentStep: number | null;
  totalElapsedMs: number | null;
}

function stepLabel(step: ToolStep): string {
  if (step.type === "ai_prompt" || step.type === "prompt") {
    const p = step.prompt ?? "";
    return p.length > 72 ? p.slice(0, 69) + "…" : p;
  }
  if (step.type === "regex_replace") {
    return `/${step.pattern ?? ""}/ → ${step.replacement ?? ""}`;
  }
  return step.type;
}

function StepStatusIcon({
  index,
  currentStep,
  hasResult,
}: {
  index: number;
  currentStep: number | null;
  hasResult: boolean;
}) {
  if (hasResult) return <span className="step-status done">✓</span>;
  if (currentStep === index)
    return <span className="step-status running">◉</span>;
  return <span className="step-status pending">○</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      className={`copy-btn${copied ? " copied" : ""}`}
      onClick={handleCopy}
      title="Copy output"
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

export default function ToolPipelineView({
  steps,
  results,
  currentStep,
  totalElapsedMs,
}: Props) {
  const totalTokens = results.reduce(
    (sum, r) => sum + (r?.total_tokens ?? 0),
    0,
  );
  const allDone =
    steps.length > 0 &&
    results.length === steps.length &&
    results.every(Boolean) &&
    currentStep === null;

  return (
    <div className="pipeline-view">
      {steps.map((step, i) => {
        const result = results[i] ?? null;
        const isRunning = currentStep === i;
        const statusClass = result ? "done" : isRunning ? "running" : "pending";

        return (
          <div key={i} className={`pipeline-step ${statusClass}`}>
            <div className="pipeline-step-header">
              <StepStatusIcon
                index={i}
                currentStep={currentStep}
                hasResult={!!result}
              />
              <span className="step-type-badge">{step.type}</span>
              <span className="step-prompt-label">{stepLabel(step)}</span>
            </div>

            {isRunning && !result && (
              <div className="pipeline-step-body">
                <div className="step-running-pulse">Running…</div>
              </div>
            )}

            {result && (
              <div className="pipeline-step-body">
                <div className="step-output-row">
                  <div className="step-output">{result.output}</div>
                  <CopyButton text={result.output} />
                </div>
                <div className="step-meta">
                  {result.total_tokens != null && result.total_tokens > 0 && (
                    <span>{result.total_tokens} tokens</span>
                  )}
                  {result.latency_ms > 0 && (
                    <span>{(result.latency_ms / 1000).toFixed(2)}s</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {allDone && steps.length > 1 && (
        <div className="pipeline-summary">
          {totalTokens > 0 && <span>{totalTokens} total tokens</span>}
          {totalElapsedMs != null && (
            <span>{(totalElapsedMs / 1000).toFixed(2)}s elapsed</span>
          )}
        </div>
      )}

      {steps.length === 0 && (
        <div className="pipeline-empty">No steps in this tool.</div>
      )}
    </div>
  );
}
