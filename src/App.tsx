import { useState } from "react";
import CommandPalette, { Tool } from "./CommandPalette";
import ProvidersPanel from "./ProvidersPanel";
import "./App.css";

type Tab = "tools" | "providers";

function App() {
  const [tab, setTab] = useState<Tab>("tools");
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

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
          <CommandPalette onSelect={setSelectedTool} />
          {selectedTool && (
            <div className="tool-details">
              <h2>{selectedTool.name}</h2>
              <p>{selectedTool.description}</p>
              <pre>{JSON.stringify(selectedTool.steps, null, 2)}</pre>
            </div>
          )}
        </>
      )}

      {tab === "providers" && <ProvidersPanel />}
    </main>
  );
}

export default App;
