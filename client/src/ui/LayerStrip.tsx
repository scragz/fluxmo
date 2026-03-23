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
    <div className="border-b border-zinc-800/80 bg-zinc-950/95 px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-white/10 bg-zinc-900/70 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl">
        {layers.map((l) => (
          <button
            key={l.id}
            onClick={() => onSelect(l.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-mono uppercase tracking-[0.22em] transition sm:px-5 sm:py-2.5 sm:text-sm ${
              activeLayer === l.id
                ? "bg-white text-zinc-950 shadow-[0_8px_30px_rgba(255,255,255,0.18)]"
                : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
            }`}
          >
            {l.label}
            <span className={`text-[10px] ${l.configured ? "text-emerald-500" : "text-zinc-600"}`}>
              {l.configured ? "●" : "○"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
