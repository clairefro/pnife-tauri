import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import "./CommandPalette.css";

export interface ToolStep {
  id: string;
  name: string;
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

export interface CommandPaletteHandle {
  focus: () => void;
  reload: () => void;
}

const CommandPalette = forwardRef<
  CommandPaletteHandle,
  { onSelect: (tool: Tool) => void; onAddTool: () => void }
>(function CommandPalette({ onSelect, onAddTool }, ref) {
  const [query, setQuery] = useState("");
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [filtered, setFiltered] = useState<Tool[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  const loadTools = () =>
    invoke<Tool[]>("list_tools").then(setAllTools).catch(console.error);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    reload: loadTools,
  }));

  useEffect(() => {
    loadTools();
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
    setHighlightedIndex(0);
  }, [query, allTools]);

  useEffect(() => {
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightedIndex]) onSelect(filtered[highlightedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
    }
  };

  return (
    <div className="command-palette">
      <input
        ref={inputRef}
        autoFocus
        className="command-input"
        placeholder="Search tools..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <ul className="command-list">
        {filtered.map((tool, i) => (
          <li
            key={tool.id}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className={i === highlightedIndex ? "highlighted" : ""}
            onClick={() => onSelect(tool)}
            onMouseEnter={() => setHighlightedIndex(i)}
          >
            <strong>{tool.name}</strong>
            <div className="desc">{tool.description}</div>
          </li>
        ))}
        {filtered.length === 0 && <li className="empty">No tools found</li>}
      </ul>
      <button className="add-tool-btn" onClick={onAddTool}>
        + Add Tool
      </button>
    </div>
  );
});

export default CommandPalette;
