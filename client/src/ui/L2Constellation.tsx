import React from "react";
import { PresetState, L2Transform } from "../pipeline/types";
import { getPhaseCrunchEnabled } from "../pipeline/rhythm";

interface Props {
  state: PresetState;
  onTransform: (t: L2Transform) => void;
  transforms: L2Transform[];
}

export function L2Constellation({ state, onTransform, transforms }: Props) {
  const drifts = state.channels.map(c => {
    if (c.steps.length < 2) return 0;
    let diff = c.steps[1].phas - c.steps[0].phas;
    if (diff < -180) diff += 360;
    if (diff > 180) diff -= 360;
    return diff;
  });
  const phases = state.channels.map(c => c.steps[0]?.phas || 0);
  const crunchEnabled = getPhaseCrunchEnabled(transforms);

  const handleDriftChange = (channel: number, value: number) => {
    onTransform({ type: "set_drift", channel: channel as 0|1|2|3, degrees_per_step: value });
  };

  const handlePhaseChange = (channel: number, value: number) => {
    onTransform({ type: "set_phase", channel: channel as 0|1|2|3, degrees: value });
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

        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-zinc-950/70 px-3 py-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.26em] text-zinc-400">Phase Crunch</div>
            <div className="mt-1 text-[11px] text-zinc-500">Link `COMP` to `PHAS` so late triggers compress before they clip.</div>
          </div>
          <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
            <button
              onClick={() => onTransform({ type: "set_phase_crunch", enabled: true })}
              className={`rounded px-2 py-1 text-[10px] font-mono uppercase ${
                crunchEnabled ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-white"
              }`}
            >
              On
            </button>
            <button
              onClick={() => onTransform({ type: "set_phase_crunch", enabled: false })}
              className={`rounded px-2 py-1 text-[10px] font-mono uppercase ${
                !crunchEnabled ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-white"
              }`}
            >
              Off
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-mono text-zinc-500">BASE PHASE</span>
          {phases.map((phase, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className={`text-[10px] font-mono w-6 ${
                i === 0 ? "text-orange-500" : i === 1 ? "text-green-500" : i === 2 ? "text-blue-500" : "text-red-500"
              }`}>CH{i+1}</span>
              <input
                type="range"
                min="0"
                max="360"
                value={phase}
                onChange={(e) => handlePhaseChange(i, parseInt(e.target.value))}
                className="flex-1 h-1 bg-zinc-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100"
              />
              <span className="text-[10px] font-mono text-zinc-500 w-12 text-right">{phase}°</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 mt-2">
          <span className="text-[10px] font-mono text-zinc-500">DRIFT / STEP</span>
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
