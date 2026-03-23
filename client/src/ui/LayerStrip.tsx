import React from "react";
import { LayerId } from "../store";

interface Props {
  activeLayer: LayerId;
  onSelect: (layer: LayerId) => void;
  l1Configured: boolean;
  l2Configured: boolean;
  l3Configured: boolean;
}

export function LayerStrip({ activeLayer, onSelect, l1Configured, l2Configured, l3Configured }: Props) {
  const layers: { id: LayerId; label: string; configured: boolean }[] = [
    { id: "l1", label: "LATTICE", configured: l1Configured },
    { id: "l2", label: "PHASE", configured: l2Configured },
    { id: "l3", label: "ENERGY", configured: l3Configured },
  ];

  return (
    <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800 bg-zinc-950">
      {layers.map((l) => (
        <button
          key={l.id}
          onClick={() => onSelect(l.id)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono tracking-wider transition-colors ${
            activeLayer === l.id
              ? "bg-zinc-800 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {l.label}
          <span className={`text-[10px] ${l.configured ? "text-emerald-400" : "text-zinc-600"}`}>
            {l.configured ? "●" : "○"}
          </span>
        </button>
      ))}
    </div>
  );
}
