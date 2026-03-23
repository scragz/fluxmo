import React, { useState, useEffect } from "react";
import { PresetState, L3Transform } from "../pipeline/types";

interface Props {
  state: PresetState;
  onTransform: (t: L3Transform) => void;
  transforms: L3Transform[];
}

export function L3Energy({ state, onTransform, transforms }: Props) {
  // Infer busyness from state (dens / (leng * 2))
  const busyness = state.channels.map(c => 
    c.steps.map(s => s.dens / (s.leng * 2))
  );

  const humas = state.channels.map(c => c.steps[0]?.huma || 0);

  const offsetTransforms = transforms.filter(t => t.type === "set_channel_offset") as Extract<L3Transform, { type: "set_channel_offset" }>[];
  const isOffset = offsetTransforms.length > 0 ? offsetTransforms[offsetTransforms.length - 1].enabled : false;

  const handleBusynessChange = (channel: number, step: number, value: number) => {
    onTransform({ type: "set_busyness", channel: channel as 0|1|2|3, step, fraction: value });
  };

  const handleHumaChange = (channel: number, value: number) => {
    onTransform({ type: "set_huma", channel: channel as 0|1|2|3, value });
  };

  return (
    <div className="p-4 flex flex-col gap-4 bg-zinc-950 border-t border-zinc-900">
      <div className="flex flex-col gap-3 max-w-md mx-auto w-full bg-zinc-900/80 p-4 rounded-2xl border border-zinc-800">
        
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] font-mono text-zinc-500">CH OFFSET</span>
          <div className="flex gap-1 bg-zinc-950 p-1 rounded-lg">
            <button
              onClick={() => onTransform({ type: "set_channel_offset", enabled: true })}
              className={`px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors ${
                isOffset ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              ON
            </button>
            <button
              onClick={() => onTransform({ type: "set_channel_offset", enabled: false })}
              className={`px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors ${
                !isOffset ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              OFF
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-mono text-zinc-500">BUSYNESS</span>
          {busyness.map((chBusyness, c) => (
            <div key={c} className="flex h-10 gap-2 items-end">
              <span className={`text-[10px] font-mono w-6 mb-1 ${
                c === 0 ? "text-orange-500" : c === 1 ? "text-green-500" : c === 2 ? "text-blue-500" : "text-red-500"
              }`}>CH{c+1}</span>
              <div 
                className="flex-1 flex gap-1 h-full items-end"
                onDoubleClick={() => {
                  const firstVal = chBusyness[0] || 0.5;
                  onTransform({ type: "set_busyness_all", channel: c as 0|1|2|3, fraction: firstVal });
                }}
              >
                {chBusyness.map((b, s) => (
                  <div 
                    key={s} 
                    className="flex-1 h-full relative group cursor-pointer touch-none"
                    onPointerDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const fraction = 1 - (y / rect.height);
                      handleBusynessChange(c, s, Math.max(0, Math.min(1, fraction)));
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (e.buttons !== 1) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const fraction = 1 - (y / rect.height);
                      handleBusynessChange(c, s, Math.max(0, Math.min(1, fraction)));
                    }}
                    onPointerUp={(e) => {
                      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                    }}
                  >
                    <div 
                      className="absolute bottom-0 inset-x-0 bg-zinc-800 rounded-t-sm transition-all"
                      style={{ height: `${Math.max(10, b * 100)}%` }}
                    >
                      <div className={`absolute inset-0 rounded-t-sm opacity-50 group-hover:opacity-100 transition-opacity ${
                        c === 0 ? "bg-orange-500" : c === 1 ? "bg-green-500" : c === 2 ? "bg-blue-500" : "bg-red-500"
                      }`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <span className="text-[10px] font-mono text-zinc-500">HUMA</span>
          <div className="flex gap-2">
            {humas.map((huma, c) => (
              <div key={c} className="flex-1 flex flex-col items-center gap-1">
                <input
                  type="range"
                  min="0"
                  max="64"
                  value={huma}
                  onChange={(e) => handleHumaChange(c, parseInt(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-400"
                />
                <span className={`text-[8px] font-mono ${
                  c === 0 ? "text-orange-500" : c === 1 ? "text-green-500" : c === 2 ? "text-blue-500" : "text-red-500"
                }`}>CH{c+1}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
