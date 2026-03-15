import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tool } from "./CommandPalette";
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
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const handleRun = async () => {
    cancelledRef.current = false;
    setRunning(true);
    setError(null);
    setOutput("");
    try {
      const result = await invoke<string>("run_tool", {
        steps: tool.steps,
        input,
      });
      if (!cancelledRef.current) {
        setOutput(result);
      }
    } catch (e) {
      if (!cancelledRef.current) {
        setError(String(e));
      }
    } finally {
      if (!cancelledRef.current) {
        setRunning(false);
      }
    }
  };

  const handleStop = () => {
    cancelledRef.current = true;
    setRunning(false);
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
          <label className="pane-label">Output</label>
          <textarea
            className="tool-runner-textarea tool-runner-output"
            value={output}
            readOnly
            placeholder={running ? "Running…" : "Output will appear here"}
            spellCheck={false}
          />
        </div>
      </div>

      {error && <div className="tool-runner-error">{error}</div>}
    </div>
  );
}
