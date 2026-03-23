import React from "react";
import { X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  json: string;
}

export function JsonDrawer({ isOpen, onClose, json }: Props) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 top-16 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 z-50 flex flex-col">
      <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
        <h2 className="text-xs font-mono text-zinc-400 tracking-widest">OUTPUT.JSON</h2>
        <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <pre className="text-[10px] sm:text-xs font-mono text-zinc-300 whitespace-pre-wrap">
          {json}
        </pre>
      </div>
    </div>
  );
}
