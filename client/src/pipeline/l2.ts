import type { L2Transform, PresetState, PhaseAllMode } from './types'
import { clampPhas } from './defaults'

const GOLDEN_PHASES: [number, number, number, number] = [0, 137.5, 275, 52.5]
const SPREAD_PHASES: [number, number, number, number] = [0, 90, 180, 270]

type L2Resolved = {
  basePhase: [number, number, number, number]
  drift:     [number, number, number, number]
}

function resolveL2(transforms: L2Transform[]): L2Resolved {
  const resolved: L2Resolved = {
    basePhase: [0, 0, 0, 0],
    drift:     [0, 0, 0, 0],
  }
  for (const t of transforms) {
    switch (t.type) {
      case 'set_phase':
        resolved.basePhase[t.channel] = t.degrees
        break
      case 'set_drift':
        resolved.drift[t.channel] = t.degrees_per_step
        break
      case 'set_phase_all': {
        let phases: [number, number, number, number]
        switch (t.mode as PhaseAllMode) {
          case 'unison': phases = [0, 0, 0, 0]; break
          case 'spread': phases = SPREAD_PHASES; break
          case 'golden': phases = GOLDEN_PHASES; break
        }
        resolved.basePhase = [...phases] as [number, number, number, number]
        break
      }
    }
  }
  return resolved
}

export function computeL2(l1State: PresetState, transforms: L2Transform[]): PresetState {
  const { basePhase, drift } = resolveL2(transforms)

  const channels = l1State.channels.map((ch, ci) => ({
    ...ch,
    steps: ch.steps.map((step, si) => ({
      ...step,
      phas: clampPhas(Math.round(basePhase[ci] + si * drift[ci])),
    })),
  }))

  return { channels }
}

// Expose resolved phase/drift for UI use
export function resolveL2Params(transforms: L2Transform[]) {
  return resolveL2(transforms)
}
