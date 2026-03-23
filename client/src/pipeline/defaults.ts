import type { StepState } from './types'

export const CHANNEL_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#ef4444'] as const
export const CHANNEL_NAMES  = ['CH1', 'CH2', 'CH3', 'CH4'] as const

export const DEFAULT_RATIOS     = [3, 4, 5, 7]
export const DEFAULT_BPM        = 120
export const DEFAULT_BASE_LOOP  = 4
export const DEFAULT_DENS_MODE  = 'proportional' as const
export const DEFAULT_LENG_MODE  = 'fill' as const
export const DEFAULT_VELO       = 127

// CURV values: indices 1–8 map to division counts
export const CURV_VALUES = [1, 2, 3, 4, 5, 6, 7, 8] as const

export function defaultStep(): StepState {
  return {
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
  }
}

// Clamp helpers
export function clampDens(dens: number, leng: number): number {
  const max = Math.min(leng * 2, 64)
  return Math.max(1, Math.min(max, dens))
}

export function clampVal(val: number): number {
  return Math.max(-3.0, Math.min(3.0, val))
}

export function clampCurv(curv: number): number {
  return Math.max(1, Math.min(8, Math.round(curv)))
}

export function clampPhas(phas: number): number {
  return ((phas % 360) + 360) % 360
}

export function clampComp(comp: number): number {
  return Math.max(0, Math.min(50, comp))
}

export function clampHuma(huma: number): number {
  return Math.max(0, Math.min(64, huma))
}

export function clampLeng(leng: number): number {
  return Math.max(1, Math.min(16, leng))
}

// Compute actual dens from fraction and leng
export function fracToDens(fraction: number, leng: number): number {
  const max = Math.min(leng * 2, 64)
  return clampDens(Math.round(fraction * max), leng)
}

// Compute dens fraction from dens and leng
export function densToFrac(dens: number, leng: number): number {
  const max = Math.min(leng * 2, 64)
  return max > 0 ? dens / max : 0
}
