import React from "react";
import { PresetState, L2Transform } from "../pipeline/types";

interface Props {
  state: PresetState;
  onTransform: (t: L2Transform) => void;
}

export function L2Constellation({ state, onTransform }: Props) {
  // Infer drift from step 0 and step 1
  const drifts = state.channels.map(c => {
    if (c.steps.length < 2) return 0;
    let diff = c.steps[1].phas - c.steps[0].phas;
    if (diff < -180) diff += 360;
    if (diff > 180) diff -= 360;
    return diff;
  });

  const handleDriftChange = (channel: number, value: number) => {
    onTransform({ type: "set_drift", channel: channel as 0|1|2|3, degrees_per_step: value });
  };

  return (
    <div className="p-4">
      <div className="flex w-full flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-900/72 p-4">
        
        <div className="flex justify-between gap-2">
          {["unison", "spread", "golden"].map(mode => (
            <button
              key={mode}
              onClick={() => onTransform({ type: "set_phase_all", mode: mode as any })}
              className="flex-1 py-2 rounded-lg bg-zinc-800 text-xs font-mono uppercase text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 mt-2">
          {drifts.map((drift, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className={`text-[10px] font-mono w-6 ${
                i === 0 ? "text-orange-500" : i === 1 ? "text-green-500" : i === 2 ? "text-blue-500" : "text-red-500"
              }`}>CH{i+1}</span>
              <input
                type="range"
                min="-180"
                max="180"
                value={drift}
                onChange={(e) => handleDriftChange(i, parseInt(e.target.value))}
                className="flex-1 h-1 bg-zinc-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-400"
              />
              <span className="text-[10px] font-mono text-zinc-500 w-12 text-right">
                {drift > 0 ? "+" : ""}{drift}°
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
