import React, { useState } from "react";
import { PresetState, L1Transform } from "../pipeline/types";

interface Props {
  state: PresetState;
  onTransform: (t: L1Transform) => void;
  transforms: L1Transform[];
}

export function L1Lattice({ state, onTransform, transforms }: Props) {
  // We can infer current ratios from loop lengths
  const ratios = state.channels.map(c => c.steps.length);
  
  let baseLoop = 4;
  for (const t of transforms) {
    if (t.type === "set_base_loop") baseLoop = t.steps;
  }

  const handleRatioChange = (channel: number, delta: number) => {
    const newRatios = [...ratios];
    newRatios[channel] = Math.max(1, Math.min(16, newRatios[channel] + delta));
    onTransform({ type: "set_ratios", ratios: newRatios });
  };

  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);
  const totalLcm = ratios.reduce((acc, val) => lcm(acc, val), 1);

  return (
    <div className="p-4 flex flex-col gap-4 bg-zinc-950 border-t border-zinc-900">
      <div className="flex flex-col gap-3 max-w-md mx-auto w-full bg-zinc-900/80 p-4 rounded-2xl border border-zinc-800">
        
        <div className="flex justify-between items-center">
          <span className="text-xs font-mono text-zinc-500 w-16">RATIOS</span>
          <div className="flex gap-2">
            {ratios.map((r, i) => (
              <div key={i} className="flex flex-col items-center">
                <button onClick={() => handleRatioChange(i, 1)} className="text-zinc-500 hover:text-white px-2 py-1 text-xs">+</button>
                <div className={`w-8 h-8 flex items-center justify-center rounded bg-zinc-800 font-mono text-sm ${
                  i === 0 ? "text-orange-500" : i === 1 ? "text-green-500" : i === 2 ? "text-blue-500" : "text-red-500"
                }`}>
                  {r}
                </div>
                <button onClick={() => handleRatioChange(i, -1)} className="text-zinc-500 hover:text-white px-2 py-1 text-xs">-</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs font-mono text-zinc-500 w-16">BASE</span>
          <div className="flex items-center gap-2">
            <button onClick={() => onTransform({ type: "set_base_loop", steps: Math.max(1, baseLoop - 1) })} className="text-zinc-500 hover:text-white px-2 py-1 text-xs">-</button>
            <div className="w-12 h-8 flex items-center justify-center rounded bg-zinc-800 font-mono text-sm text-zinc-300">
              {baseLoop}
            </div>
            <button onClick={() => onTransform({ type: "set_base_loop", steps: Math.min(16, baseLoop + 1) })} className="text-zinc-500 hover:text-white px-2 py-1 text-xs">+</button>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs font-mono text-zinc-500 w-16">DENS MAP</span>
          <div className="flex gap-1 bg-zinc-950 p-1 rounded-lg">
            {["proportional", "inverse", "flat"].map(mode => {
              const densMapTransform = transforms.filter(t => t.type === "set_dens_map").pop() as Extract<L1Transform, { type: "set_dens_map" }> | undefined;
              const activeDensMap = densMapTransform ? densMapTransform.mode : "proportional";
              return (
                <button
                  key={mode}
                  onClick={() => onTransform({ type: "set_dens_map", mode: mode as any })}
                  className={`px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors ${
                    activeDensMap === mode ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  {mode.substring(0, 4)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs font-mono text-zinc-500 w-16">LENG MAP</span>
          <div className="flex gap-1 bg-zinc-950 p-1 rounded-lg">
            {["fill", "short", "long"].map(mode => {
              const lengMapTransform = transforms.filter(t => t.type === "set_leng_map").pop() as Extract<L1Transform, { type: "set_leng_map" }> | undefined;
              const activeLengMap = lengMapTransform ? lengMapTransform.mode : "fill";
              return (
                <button
                  key={mode}
                  onClick={() => onTransform({ type: "set_leng_map", mode: mode as any })}
                  className={`px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors ${
                    activeLengMap === mode ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>

        <div className="text-[10px] font-mono text-zinc-500 mt-2 text-center">
          LCM: {totalLcm} 16ths
        </div>

      </div>
    </div>
  );
}
