import { MoveHorizontal } from "lucide-react";
import { getPhaseCrunchEnabled } from "../pipeline/rhythm";
import { L2Transform, PresetState } from "../pipeline/types";
import {
  CARD,
  ICON_BUTTON,
  LayerControlPanel,
  SECTION_LABEL,
  SEGMENTED_GROUP,
  channelAccentClass,
  segmentedButtonClass,
} from "./controlPanel";

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
    <LayerControlPanel
      layer="Layer 2"
      title="Phase"
      description="Rotate the lanes and control drift so trigger timing swings before density and humanization."
    >
        <div className={`${CARD} flex justify-between gap-2`}>
          {["unison", "spread", "golden"].map(mode => (
            <button
              key={mode}
              onClick={() => onTransform({ type: "set_phase_all", mode: mode as any })}
              className={`flex-1 py-2 ${segmentedButtonClass(false)}`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className={`${CARD} flex items-center justify-between`}>
          <div>
            <div className={SECTION_LABEL}>Comp Link</div>
            <div className="mt-1 text-[11px] text-zinc-500">Link `COMP` to `PHAS` so late triggers compress before they clip.</div>
          </div>
          <div className={SEGMENTED_GROUP}>
            <button
              onClick={() => onTransform({ type: "set_phase_crunch", enabled: true })}
              className={segmentedButtonClass(crunchEnabled)}
            >
              On
            </button>
            <button
              onClick={() => onTransform({ type: "set_phase_crunch", enabled: false })}
              className={segmentedButtonClass(!crunchEnabled)}
            >
              Off
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={SECTION_LABEL}>Base Phase</span>
          {phases.map((phase, i) => (
            <div key={i} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 ${CARD}`}>
              <span className={`text-[10px] font-mono w-6 ${channelAccentClass(i)}`}>CH{i+1}</span>
              <div className="flex items-center gap-2">
                <div className={`${ICON_BUTTON} shrink-0 text-zinc-400`}>
                  <MoveHorizontal size={12} />
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={phase}
                  onChange={(e) => handlePhaseChange(i, parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/40 [&::-webkit-slider-thumb]:bg-zinc-100"
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-500 w-12 text-right">{phase}°</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 mt-2">
          <span className={SECTION_LABEL}>Drift / Step</span>
          {drifts.map((drift, i) => (
            <div key={i} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 ${CARD}`}>
              <span className={`text-[10px] font-mono w-6 ${channelAccentClass(i)}`}>CH{i+1}</span>
              <input
                type="range"
                min="-180"
                max="180"
                value={drift}
                onChange={(e) => handleDriftChange(i, parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/20 [&::-webkit-slider-thumb]:bg-zinc-400"
              />
              <span className="text-[10px] font-mono text-zinc-500 w-12 text-right">
                {drift > 0 ? "+" : ""}{drift}°
              </span>
            </div>
          ))}
        </div>
    </LayerControlPanel>
  );
}
