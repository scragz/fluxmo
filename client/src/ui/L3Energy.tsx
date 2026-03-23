import React from "react";
import { PresetState, L3Transform } from "../pipeline/types";
import { getDensityDeltaMatrix } from "../pipeline/rhythm";

interface Props {
  state: PresetState;
  baseState: PresetState;
  onTransform: (t: L3Transform) => void;
  transforms: L3Transform[];
}

export function L3Energy({ state, baseState, onTransform, transforms }: Props) {
  const densityDeltas = getDensityDeltaMatrix(transforms, baseState.channels);
  const humas = state.channels.map(c => c.steps[0]?.huma || 0);

  const offsetTransforms = transforms.filter(t => t.type === "set_channel_offset") as Extract<L3Transform, { type: "set_channel_offset" }>[];
  const isOffset = offsetTransforms.length > 0 ? offsetTransforms[offsetTransforms.length - 1].enabled : false;

  const handleDensityDeltaChange = (channel: number, step: number, value: number) => {
    onTransform({ type: "set_density_delta", channel: channel as 0|1|2|3, step, amount: value });
  };

  const handleHumaChange = (channel: number, value: number) => {
    onTransform({ type: "set_huma", channel: channel as 0|1|2|3, value });
  };

  return (
    <div className="p-4">
      <div className="flex w-full flex-col gap-4 rounded-[28px] border border-cyan-500/15 bg-[linear-gradient(180deg,rgba(8,12,18,0.96),rgba(10,10,14,0.9))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.3)]">
        <div className="rounded-2xl border border-cyan-500/12 bg-cyan-500/6 px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.32em] text-cyan-200/70">Energy Field</div>
          <div className="mt-1 text-sm text-zinc-200">Push or starve existing trigger density per step.</div>
          <div className="mt-2 flex justify-between text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
            <span>- lean out</span>
            <span>0 baseline</span>
            <span>+ drive</span>
          </div>
        </div>
        
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
          {densityDeltas.map((channelDeltas, c) => (
            <div key={c} className="rounded-2xl border border-white/8 bg-zinc-950/72 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-[11px] font-mono uppercase tracking-[0.24em] ${
                  c === 0 ? "text-orange-400" : c === 1 ? "text-green-400" : c === 2 ? "text-blue-400" : "text-red-400"
                }`}>CH{c+1}</span>
                <span className="text-right text-[10px] font-mono text-zinc-500">
                  {deltaLabel(channelDeltas)}
                </span>
              </div>
              <div className="flex h-20 gap-2 items-center">
                <span className={`text-[10px] font-mono w-6 ${
                c === 0 ? "text-orange-500" : c === 1 ? "text-green-500" : c === 2 ? "text-blue-500" : "text-red-500"
              }`}>CH{c+1}</span>
                <div 
                  className="flex-1 flex gap-1 h-full items-center"
                  onDoubleClick={() => {
                    onTransform({ type: "set_density_delta_all", channel: c as 0|1|2|3, amount: 0 });
                  }}
                >
                  {channelDeltas.map((delta, s) => (
                    <div 
                      key={s} 
                      className="flex-1 h-full relative group cursor-pointer touch-none rounded-md bg-zinc-900/70"
                      onPointerDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const normalized = 1 - (y / rect.height);
                        const amount = Math.max(-1, Math.min(1, normalized * 2 - 1));
                        handleDensityDeltaChange(c, s, amount);
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        if (e.buttons !== 1) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const normalized = 1 - (y / rect.height);
                        const amount = Math.max(-1, Math.min(1, normalized * 2 - 1));
                        handleDensityDeltaChange(c, s, amount);
                      }}
                      onPointerUp={(e) => {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }}
                    >
                      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-700" />
                      <div 
                        className={`absolute inset-x-0 bg-zinc-800 transition-all ${
                          delta >= 0 ? "bottom-1/2 rounded-t-sm" : "top-1/2 rounded-b-sm"
                        }`}
                        style={{ height: `${Math.max(0, Math.abs(delta) * 50)}%` }}
                      >
                        <div className={`absolute inset-0 ${delta >= 0 ? "rounded-t-sm" : "rounded-b-sm"} opacity-60 group-hover:opacity-100 transition-opacity ${
                          c === 0 ? "bg-orange-500" : c === 1 ? "bg-green-500" : c === 2 ? "bg-blue-500" : "bg-red-500"
                        }`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 rounded-2xl border border-white/8 bg-zinc-950/72 px-4 py-3">
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

function deltaLabel(deltas: number[]): string {
  const maxDelta = deltas.reduce((max, value) => Math.abs(value) > Math.abs(max) ? value : max, 0);
  const pct = Math.round(maxDelta * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
