import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tool } from "./CommandPalette";
import ToolPipelineView, { StepResult } from "./ToolPipelineView";
import "./ToolRunner.css";

const SAMPLE_INPUT =
  `The old lighthouse had stood at the edge of the cliff for over a century, ` +
  `its light extinguished since the harbor closed. Sarah climbed the winding stairs ` +
  `each morning, collecting the silence like driftwood, pressing it into her notebooks. ` +
  `She told herself it was research, that she was writing a history of the coast, ` +
  `but really she was stalling.\n\n` +
  `Below, the village had changed around her absence. New cafés replaced the chandleries, ` +
  `tourists photographed the boats that no longer fished. Her brother had left for the city ` +
  `at eighteen and never looked back. She had stayed, watching the sea, ` +
  `waiting for something she couldn't name.`;

interface Props {
  tool: Tool;
}

export default function ToolRunner({ tool }: Props) {
  const [input, setInput] = useState(SAMPLE_INPUT);
  const [stepResults, setStepResults] = useState<(StepResult | null)[]>([]);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalElapsedMs, setTotalElapsedMs] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  // Reset pipeline state when user switches to a different tool
  useEffect(() => {
    cancelledRef.current = true;
    setRunning(false);
    setStepResults([]);
    setCurrentStep(null);
    setTotalElapsedMs(null);
    setError(null);
  }, [tool.id]);

  const handleRun = async () => {
    cancelledRef.current = false;
    setRunning(true);
    setError(null);
    setStepResults(new Array(tool.steps.length).fill(null));
    setCurrentStep(null);
    setTotalElapsedMs(null);

    const startTime = Date.now();
    let current = input;

    try {
      for (let i = 0; i < tool.steps.length; i++) {
        if (cancelledRef.current) break;
        setCurrentStep(i);

        const result = await invoke<StepResult>("run_tool_step", {
          step: tool.steps[i],
          input: current,
        });

        if (cancelledRef.current) break;
        current = result.output;
        setStepResults((prev) => {
          const next = [...prev];
          next[i] = result;
          return next;
        });
      }
    } catch (e) {
      if (!cancelledRef.current) {
        setError(String(e));
      }
    } finally {
      if (!cancelledRef.current) {
        setCurrentStep(null);
        setTotalElapsedMs(Date.now() - startTime);
        setRunning(false);
      }
    }
  };

  const handleStop = () => {
    cancelledRef.current = true;
    setRunning(false);
    setCurrentStep(null);
    setError(null);
  };

  return (
    <div className="tool-runner">
      <div className="tool-runner-header">
        <div className="tool-runner-title">
          <span className="tool-runner-name">{tool.name}</span>
          <span className="tool-runner-desc">{tool.description}</span>
        </div>
        {running ? (
          <button className="btn-stop" onClick={handleStop}>
            ■ Stop
          </button>
        ) : (
          <button
            className="btn-run"
            onClick={handleRun}
            disabled={!input.trim()}
          >
            ▶ Run
          </button>
        )}
      </div>

      <div className="tool-runner-body">
        <div className="tool-runner-pane">
          <label className="pane-label">Input</label>
          <textarea
            className="tool-runner-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter input text…"
            spellCheck={false}
          />
        </div>

        <div className="tool-runner-pane">
          <label className="pane-label">Pipeline</label>
          <ToolPipelineView
            steps={tool.steps}
            results={stepResults}
            currentStep={currentStep}
            totalElapsedMs={totalElapsedMs}
          />
        </div>
      </div>

      {error && <div className="tool-runner-error">{error}</div>}
    </div>
  );
}
