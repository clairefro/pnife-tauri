import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import CommandPalette, { Tool, CommandPaletteHandle } from "./CommandPalette";
import ProvidersPanel, { DefaultSelection } from "./ProvidersPanel";
import ToolRunner from "./ToolRunner";
import "./App.css";

type Tab = "tools" | "providers";

function StatusBar({
  defaultSelection,
  onSetUpClick,
}: {
  defaultSelection: DefaultSelection | null;
  onSetUpClick: () => void;
}) {
  return (
    <div className="status-bar">
      {defaultSelection ? (
        <span className="status-default">
          Default: {defaultSelection.provider_id} / {defaultSelection.model_id}
        </span>
      ) : (
        <span className="status-no-default">
          ⚠ No default model configured.{" "}
          <button className="status-link" onClick={onSetUpClick}>
            Set up
          </button>
        </span>
      )}
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("tools");
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [defaultSelection, setDefaultSelection] =
    useState<DefaultSelection | null>(null);
  const cmdRef = useRef<CommandPaletteHandle>(null);
  const handleBack = () => {
    setSelectedTool(null);
    cmdRef.current?.focus();
  };

  useEffect(() => {
    invoke<DefaultSelection | null>("get_default_provider_model")
      .then(setDefaultSelection)
      .catch(console.error);
  }, []);

  return (
    <main className="container">
      <div className="app-header">
        <h1>pnife</h1>
        <nav className="tab-nav">
          <button
            className={`tab-btn${tab === "tools" ? " active" : ""}`}
            onClick={() => setTab("tools")}
          >
            Tools
          </button>
          <button
            className={`tab-btn${tab === "providers" ? " active" : ""}`}
            onClick={() => setTab("providers")}
          >
            Providers
          </button>
        </nav>
      </div>

      {tab === "tools" && (
        <>
          <CommandPalette ref={cmdRef} onSelect={setSelectedTool} />
          {selectedTool && (
            <ToolRunner tool={selectedTool} onBack={handleBack} />
          )}
        </>
      )}

      {tab === "providers" && (
        <ProvidersPanel
          defaultSelection={defaultSelection}
          onDefaultSelectionChange={setDefaultSelection}
        />
      )}

      <StatusBar
        defaultSelection={defaultSelection}
        onSetUpClick={() => setTab("providers")}
      />
    </main>
  );
}

export default App;
