export type StepState = {
  leng: number;
  dens: number;
  phas: number;
  curv: number;
  val: number;
  comp: number;
  huma: number;
  gate: number;
  prob: number;
  mod_bus: number;
  aux1: number;
  aux2: number;
  minv: number;
  maxv: number;
  freq: number;
  quan: number;
  s_h: 0 | 1;
};

export type ChannelState = {
  steps: StepState[];
  bpm: number;
  velo: number;
  sh16: number;
};

export type PresetState = {
  channels: ChannelState[];
};

export type L1Transform =
  | { type: "set_ratios"; ratios: number[] }
  | { type: "set_bpm"; bpm: number }
  | { type: "set_base_loop"; steps: number }
  | { type: "set_dens_map"; mode: "proportional" | "inverse" | "flat" }
  | { type: "set_leng_map"; mode: "fill" | "short" | "long" }
  | { type: "set_velo"; channel: 0 | 1 | 2 | 3; velo: number };

export type L2Transform =
  | { type: "set_phase"; channel: 0 | 1 | 2 | 3; degrees: number }
  | { type: "set_drift"; channel: 0 | 1 | 2 | 3; degrees_per_step: number }
  | { type: "set_phase_all"; mode: "unison" | "spread" | "golden" };

export type L3Transform =
  | { type: "set_texture_point"; channel: 0 | 1 | 2 | 3; step: number; curv: number; val: number }
  | { type: "set_texture_path"; channel: 0 | 1 | 2 | 3; points: Array<{ curv: number; val: number }> }
  | { type: "set_busyness"; channel: 0 | 1 | 2 | 3; step: number; fraction: number }
  | { type: "set_busyness_all"; channel: 0 | 1 | 2 | 3; fraction: number }
  | { type: "set_channel_offset"; enabled: boolean }
  | { type: "set_huma"; channel: 0 | 1 | 2 | 3; value: number };

export type Pipeline = {
  version: 1;
  name: string;
  layers: {
    l1: L1Transform[];
    l2: L2Transform[];
    l3: L3Transform[];
  };
};
