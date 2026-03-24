import { MoveHorizontal } from "lucide-react";
import { getL2PhaseSettings } from "../pipeline/rhythm";
import { L2Transform } from "../pipeline/types";
import {
  CARD,
  ICON_BUTTON,
  LayerControlPanel,
  SECTION_LABEL,
  channelAccentClass,
  segmentedButtonClass,
} from "./controlPanel";

interface Props {
  onTransform: (t: L2Transform) => void;
  transforms: L2Transform[];
}

export function L2Constellation({ onTransform, transforms }: Props) {
  const { phases, spreads } = getL2PhaseSettings(transforms);

  const handleSpreadChange = (channel: number, value: number) => {
    onTransform({ type: "set_phase_spread", channel: channel as 0|1|2|3, degrees_per_step: value });
  };

  const handlePhaseChange = (channel: number, value: number) => {
    onTransform({ type: "set_phase", channel: channel as 0|1|2|3, degrees: value });
  };

  return (
    <LayerControlPanel
      layer="Layer 2"
      title="Phase"
      description="Move each channel's base phase, then spread that offset across its steps."
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
          <span className={SECTION_LABEL}>Spread / Step</span>
          {spreads.map((spread, i) => (
            <div key={i} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 ${CARD}`}>
              <span className={`text-[10px] font-mono w-6 ${channelAccentClass(i)}`}>CH{i+1}</span>
              <input
                type="range"
                min="-180"
                max="180"
                value={spread}
                onChange={(e) => handleSpreadChange(i, parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/20 [&::-webkit-slider-thumb]:bg-zinc-400"
              />
              <span className="text-[10px] font-mono text-zinc-500 w-12 text-right">
                {spread > 0 ? "+" : ""}{spread}°
              </span>
            </div>
          ))}
        </div>
    </LayerControlPanel>
  );
}
