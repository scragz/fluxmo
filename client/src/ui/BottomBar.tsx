import React from "react";
import { Undo, Redo, Code, Download } from "lucide-react";

interface Props {
  onToggleJson: () => void;
  onExport: () => void;
  onUndo: () => void;
  canUndo: boolean;
  isExporting: boolean;
}

export function BottomBar({ onToggleJson, onExport, onUndo, canUndo, isExporting }: Props) {
  return (
    <div className="flex justify-between items-center px-4 py-3 border-t border-zinc-800 bg-zinc-950 text-zinc-400">
      <div className="flex gap-4">
        <button
          onClick={onToggleJson}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-zinc-800 hover:text-white transition-colors text-xs font-mono"
        >
          <Code size={14} /> JSON
        </button>
        <button
          onClick={onExport}
          disabled={isExporting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-xs font-mono"
        >
          <Download size={14} /> {isExporting ? "EXPORTING" : "EXPORT"}
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2 rounded-md hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <Undo size={16} />
        </button>
        <button
          disabled
          className="p-2 rounded-md hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <Redo size={16} />
        </button>
      </div>
    </div>
  );
}
