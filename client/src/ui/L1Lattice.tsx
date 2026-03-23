import React from "react";
import { Minus, Plus } from "lucide-react";
import { PresetState, L1Transform } from "../pipeline/types";
import {
  CARD,
  ICON_BUTTON,
  LayerControlPanel,
  SECTION_LABEL,
  SEGMENTED_GROUP,
  VALUE_PILL,
  channelAccentClass,
  segmentedButtonClass,
} from "./controlPanel";

interface Props {
  state: PresetState;
  onTransform: (t: L1Transform) => void;
  transforms: L1Transform[];
}

export function L1Lattice({ state, onTransform, transforms }: Props) {
  const ratios = transforms.reduce<number[]>((current, transform) => {
    if (transform.type === "set_ratios") return [...transform.ratios];
    return current;
  }, [4, 4, 4, 4]);
  const stepCounts = state.channels.map(c => c.steps.length);
  const densMapTransform = transforms.filter(t => t.type === "set_dens_map").pop() as Extract<L1Transform, { type: "set_dens_map" }> | undefined;
  const lengMapTransform = transforms.filter(t => t.type === "set_leng_map").pop() as Extract<L1Transform, { type: "set_leng_map" }> | undefined;
  const activeDensMap = densMapTransform ? densMapTransform.mode : "proportional";
  const activeLengMap = lengMapTransform ? lengMapTransform.mode : "fill";
  
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
  const totalLcm = stepCounts.reduce((acc, val) => lcm(acc, val), 1);

  return (
    <LayerControlPanel
      layer="Layer 1"
      title="Lattice"
      description="Shape the base loop and lane ratios before the downstream phase and energy edits kick in."
    >
        <div className="flex flex-col gap-2">
          {ratios.map((ratio, i) => (
            <div
              key={i}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 ${CARD} py-2.5`}
            >
              <div className="min-w-0">
                <div className={`text-[11px] font-mono uppercase tracking-[0.22em] ${channelAccentClass(i)}`}>
                  CH{i + 1}
                </div>
                <div className="mt-1 text-[10px] font-mono text-zinc-500">{stepCounts[i]} steps</div>
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => handleRatioChange(i, -1)}
                  className={ICON_BUTTON}
                  aria-label={`Decrease ratio channel ${i + 1}`}
                >
                  <Minus size={14} />
                </button>
                <div className={`min-w-12 ${VALUE_PILL} ${channelAccentClass(i)}`}>
                  {ratio}
                </div>
                <button
                  onClick={() => handleRatioChange(i, 1)}
                  className={ICON_BUTTON}
                  aria-label={`Increase ratio channel ${i + 1}`}
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="text-right text-[10px] font-mono text-zinc-500">
                {Math.round((ratio / 4) * 100)}%
              </div>
            </div>
          ))}
        </div>

        <div className={`grid grid-cols-[auto_1fr] items-center gap-3 ${CARD}`}>
          <span className={SECTION_LABEL}>Base Loop</span>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => onTransform({ type: "set_base_loop", steps: Math.max(1, baseLoop - 1) })}
              className={ICON_BUTTON}
              aria-label="Decrease lattice base"
            >
              <Minus size={14} />
            </button>
            <div className={`min-w-14 ${VALUE_PILL} text-zinc-200`}>
              {baseLoop}
            </div>
            <button
              onClick={() => onTransform({ type: "set_base_loop", steps: Math.min(16, baseLoop + 1) })}
              className={ICON_BUTTON}
              aria-label="Increase lattice base"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className={`grid grid-cols-[auto_1fr] items-center gap-3 ${CARD}`}>
          <span className={SECTION_LABEL}>Dens Map</span>
          <div className={`justify-self-end ${SEGMENTED_GROUP}`}>
            {["proportional", "inverse", "flat"].map(mode => {
              return (
                <button
                  key={mode}
                  onClick={() => onTransform({ type: "set_dens_map", mode: mode as any })}
                  aria-label={`Set density map ${mode}`}
                  className={segmentedButtonClass(activeDensMap === mode)}
                >
                  {mode.substring(0, 4)}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`grid grid-cols-[auto_1fr] items-center gap-3 ${CARD}`}>
          <span className={SECTION_LABEL}>Leng Map</span>
          <div className={`justify-self-end ${SEGMENTED_GROUP}`}>
            {["fill", "short", "long"].map(mode => {
              return (
                <button
                  key={mode}
                  onClick={() => onTransform({ type: "set_leng_map", mode: mode as any })}
                  aria-label={`Set length map ${mode}`}
                  className={segmentedButtonClass(activeLengMap === mode)}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-1 text-center text-[10px] font-mono text-zinc-500">
          LCM: {totalLcm} 16ths
        </div>
    </LayerControlPanel>
  );
}
