import { StepState, ChannelState, PresetState } from "./types";

export const DEFAULT_STEP: StepState = {
  leng: 1,
  dens: 1,
  phas: 0,
  curv: 1,
  val: 0,
  comp: 0,
  huma: 0,
  gate: 10,
  prob: 100,
  mod_bus: 3,
  aux1: 0,
  aux2: 0,
  minv: 0,
  maxv: 8000,
  freq: 1.0,
  quan: 12,
  s_h: 0,
};

export const DEFAULT_CHANNEL: ChannelState = {
  steps: [ { ...DEFAULT_STEP } ],
  bpm: 120,
  velo: 127,
  sh16: 0,
};

export const DEFAULT_PRESET: PresetState = {
  channels: [
    { ...DEFAULT_CHANNEL, steps: [{ ...DEFAULT_STEP }] },
    { ...DEFAULT_CHANNEL, steps: [{ ...DEFAULT_STEP }] },
    { ...DEFAULT_CHANNEL, steps: [{ ...DEFAULT_STEP }] },
    { ...DEFAULT_CHANNEL, steps: [{ ...DEFAULT_STEP }] },
  ],
};

export const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
