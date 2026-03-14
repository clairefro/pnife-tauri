import { useState } from "react";
import CommandPalette, { Tool } from "./CommandPalette";
import "./App.css";

function App() {
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  return (
    <main className="container">
      <h1>pnife: AI Tool Palette</h1>
      <CommandPalette onSelect={setSelectedTool} />
      {selectedTool && (
        <div className="tool-details">
          <h2>{selectedTool.name}</h2>
          <p>{selectedTool.description}</p>
          <pre>{JSON.stringify(selectedTool.steps, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}

export default App;
