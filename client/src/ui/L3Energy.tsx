import { getDensityDeltaMatrix } from "../pipeline/rhythm";
import { L3Transform, PresetState } from "../pipeline/types";
import {
  CARD,
  LayerControlPanel,
  SECTION_LABEL,
  SEGMENTED_GROUP,
  channelAccentClass,
  segmentedButtonClass,
} from "./controlPanel";

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
    <LayerControlPanel
      layer="Layer 3"
      title="Energy"
      description="Push or starve trigger density per step, then add human feel without leaving the active lane."
    >
        <div className={CARD}>
          <div className="mt-2 flex justify-between text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">
            <span>- lean out</span>
            <span>0 baseline</span>
            <span>+ drive</span>
          </div>
        </div>

        <div className={`${CARD} flex items-center justify-between`}>
          <span className={SECTION_LABEL}>Ch Offset</span>
          <div className={SEGMENTED_GROUP}>
            <button
              onClick={() => onTransform({ type: "set_channel_offset", enabled: true })}
              className={segmentedButtonClass(isOffset)}
            >
              On
            </button>
            <button
              onClick={() => onTransform({ type: "set_channel_offset", enabled: false })}
              className={segmentedButtonClass(!isOffset)}
            >
              Off
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {densityDeltas.map((channelDeltas, c) => (
            <div key={c} className={CARD}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className={`text-[11px] font-mono uppercase tracking-[0.24em] ${channelAccentClass(c)}`}>CH{c+1}</div>
                  <div className="mt-1 text-[10px] text-zinc-500">Drag the handle. Dots show density distribution beside each step.</div>
                </div>
                <div className="text-right text-[10px] font-mono text-zinc-500">
                  {deltaLabel(channelDeltas)}
                </div>
              </div>
              <div
                className="overflow-x-auto"
                onDoubleClick={() => {
                  onTransform({ type: "set_density_delta_all", channel: c as 0|1|2|3, amount: 0 });
                }}
              >
                <div className="flex min-w-max items-end gap-1.5">
                  {channelDeltas.map((delta, s) => (
                    <EnergyStepControl
                      key={s}
                      channel={c}
                      colorClass={channelColorClass(c)}
                      density={state.channels[c]?.steps[s]?.dens ?? baseState.channels[c]?.steps[s]?.dens ?? 0}
                      delta={delta}
                      onChange={(value) => handleDensityDeltaChange(c, s, value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={`${CARD} mt-2 px-4`}>
          <span className={SECTION_LABEL}>Huma</span>
          <div className="flex gap-2">
            {humas.map((huma, c) => (
              <div key={c} className="flex-1 flex flex-col items-center gap-1">
                <input
                  type="range"
                  min="0"
                  max="64"
                  value={huma}
                  onChange={(e) => handleHumaChange(c, parseInt(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/25 [&::-webkit-slider-thumb]:bg-zinc-400"
                />
                <span className={`text-[8px] font-mono ${channelAccentClass(c)}`}>CH{c+1}</span>
              </div>
            ))}
          </div>
        </div>
    </LayerControlPanel>
  );
}

function deltaLabel(deltas: number[]): string {
  const maxDelta = deltas.reduce((max, value) => Math.abs(value) > Math.abs(max) ? value : max, 0);
  const pct = Math.round(maxDelta * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function EnergyStepControl({
  channel,
  colorClass,
  density,
  delta,
  onChange,
}: {
  channel: number;
  colorClass: string;
  density: number;
  delta: number;
  onChange: (value: number) => void;
}) {
  const applyFromPointer = (element: HTMLButtonElement, clientY: number) => {
    const rect = element.getBoundingClientRect();
    const y = clientY - rect.top;
    const normalized = 1 - y / rect.height;
    onChange(Math.max(-1, Math.min(1, normalized * 2 - 1)));
  };

  const thumbPosition = `${(1 - (delta + 1) / 2) * 100}%`;
  const dotCount = Math.max(1, Math.min(density, 12));

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        className="group relative flex h-24 w-6 touch-none items-center justify-center rounded-2xl border border-white/8 bg-zinc-900/80"
        onPointerDown={(event) => {
          applyFromPointer(event.currentTarget, event.clientY);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          applyFromPointer(event.currentTarget, event.clientY);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        aria-label={`Adjust energy for channel ${channel + 1}`}
      >
        <div className="absolute inset-y-2 left-[0.62rem] w-px bg-zinc-700" />
        <div className="absolute left-2 top-1/2 w-3 -translate-y-1/2 border-t border-dashed border-zinc-600" />
        <div className={`absolute left-[0.28rem] h-4 w-3 rounded-full border border-white/20 bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] ${colorClass}`} style={{ top: `calc(${thumbPosition} - 0.5rem)` }}>
          <div className="absolute inset-y-0.75 left-1.25 w-px bg-current/80" />
          <div className="absolute inset-y-0.75 left-1.75 w-px bg-current/50" />
        </div>
        <div className="absolute inset-y-2 right-[0.38rem] flex flex-col items-center justify-between">
          {Array.from({ length: dotCount }).map((_, index) => (
            <span key={index} className={`h-1 w-1 rounded-full ${colorClass} opacity-90`} />
          ))}
        </div>
      </button>
      <span className="text-[8px] font-mono text-zinc-500">{density}</span>
    </div>
  );
}

function channelColorClass(channel: number): string {
  return channelAccentClass(channel);
}
