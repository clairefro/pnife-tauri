import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./CommandPalette.css";

export interface ToolStep {
  type: string;
  prompt?: string;
  pattern?: string;
  replacement?: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  shortcut?: string;
  steps: ToolStep[];
}

export default function CommandPalette({
  onSelect,
}: {
  onSelect: (tool: Tool) => void;
}) {
  const [query, setQuery] = useState("");
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [filtered, setFiltered] = useState<Tool[]>([]);

  useEffect(() => {
    invoke<Tool[]>("list_tools").then(setAllTools).catch(console.error);
  }, []);

  useEffect(() => {
    const q = query.toLowerCase();
    setFiltered(
      allTools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(q) ||
          tool.description.toLowerCase().includes(q),
      ),
    );
  }, [query, allTools]);

  return (
    <div className="command-palette">
      <input
        autoFocus
        className="command-input"
        placeholder="Search tools..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="command-list">
        {filtered.map((tool) => (
          <li key={tool.id} onClick={() => onSelect(tool)}>
            <strong>{tool.name}</strong>
            <div className="desc">{tool.description}</div>
          </li>
        ))}
        {filtered.length === 0 && <li className="empty">No tools found</li>}
      </ul>
    </div>
  );
}
