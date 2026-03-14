import { useState, useEffect } from "react";
import toolsData from "./tools.json";
import "./CommandPalette.css";

export interface Tool {
  id: string;
  name: string;
  description: string;
  steps: Array<{ type: string; prompt: string }>;
}

export default function CommandPalette({
  onSelect,
}: {
  onSelect: (tool: Tool) => void;
}) {
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<Tool[]>([]);

  useEffect(() => {
    const q = query.toLowerCase();
    setFiltered(
      toolsData.filter(
        (tool: Tool) =>
          tool.name.toLowerCase().includes(q) ||
          tool.description.toLowerCase().includes(q),
      ),
    );
  }, [query]);

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
