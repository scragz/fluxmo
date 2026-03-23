// ── Step / Channel / Preset state ───────────────────────────────────────────

export type StepState = {
  // L1
  leng: number       // 1–16
  // L1 baseline, L3 refines
  dens: number       // 1–min(leng*2, 64)
  // L2
  phas: number       // 0–360
  // L3
  curv: number       // 1–8  (integer)
  val:  number       // -3.0–3.0
  comp: number       // 0–50
  huma: number       // 0–64 (per-channel, same for all steps)
  // Fixed defaults
  gate:    number    // 10
  prob:    number    // 100
  mod_bus: number    // 3
  aux1:    number    // 0
  aux2:    number    // 0
  minv:    number    // 0
  maxv:    number    // 8000
  freq:    number    // 1.0
  quan:    number    // 12
  s_h:     0 | 1    // 0
}

export type ChannelState = {
  steps: StepState[]
  bpm:   number
  velo:  number
  sh16:  number
}

export type PresetState = {
  channels: ChannelState[]  // always length 4
}

// ── L1 Transforms ────────────────────────────────────────────────────────────

export type DensMode = 'proportional' | 'inverse' | 'flat'
export type LengMode = 'fill' | 'short' | 'long'

export type L1Transform =
  | { type: 'set_ratios';    ratios: number[] }
  | { type: 'set_bpm';       bpm: number }
  | { type: 'set_base_loop'; steps: number }
  | { type: 'set_dens_map';  mode: DensMode }
  | { type: 'set_leng_map';  mode: LengMode }
  | { type: 'set_velo';      channel: 0|1|2|3; velo: number }

// ── L2 Transforms ────────────────────────────────────────────────────────────

export type PhaseAllMode = 'unison' | 'spread' | 'golden'

export type L2Transform =
  | { type: 'set_phase';     channel: 0|1|2|3; degrees: number }
  | { type: 'set_drift';     channel: 0|1|2|3; degrees_per_step: number }
  | { type: 'set_phase_all'; mode: PhaseAllMode }

// ── L3 Transforms ────────────────────────────────────────────────────────────

export type L3Transform =
  | { type: 'set_texture_point'; channel: 0|1|2|3; step: number; curv: number; val: number }
  | { type: 'set_texture_path';  channel: 0|1|2|3; points: Array<{ curv: number; val: number }> }
  | { type: 'set_busyness';      channel: 0|1|2|3; step: number; fraction: number }
  | { type: 'set_busyness_all';  channel: 0|1|2|3; fraction: number }
  | { type: 'set_channel_offset'; enabled: boolean }
  | { type: 'set_huma';          channel: 0|1|2|3; value: number }

// ── Pipeline ─────────────────────────────────────────────────────────────────

export type Pipeline = {
  version: 1
  name: string
  layers: {
    l1: L1Transform[]
    l2: L2Transform[]
    l3: L3Transform[]
  }
}
