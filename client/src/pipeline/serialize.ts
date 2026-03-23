import type { PresetState } from './types'
import { clampDens, clampVal, clampComp, clampCurv, clampPhas, clampHuma, clampLeng } from './defaults'

// FLUXMO build JSON format
// val and comp not yet officially in build format — shown as comments

type FluxStep = {
  leng:    number
  dens:    number
  phas:    number
  curv:    number
  gate:    number
  prob:    number
  mod_bus: number
  aux1:    number
  aux2:    number
  minv:    number
  maxv:    number
  freq:    number
  quan:    number
  s_h:     number
  huma:    number
  // pending fields — not yet in build format
  _val?:   number
  _comp?:  number
}

export type FluxChannel = {
  bpm:   number
  velo:  number
  sh16:  number
  steps: FluxStep[]
}

export type FluxJson = {
  channels: FluxChannel[]
}

export function serializePreset(state: PresetState): FluxJson {
  return {
    channels: state.channels.map(ch => ({
      bpm:  ch.bpm,
      velo: ch.velo,
      sh16: ch.sh16,
      steps: ch.steps.map(step => ({
        leng:    clampLeng(step.leng),
        dens:    clampDens(step.dens, step.leng),
        phas:    clampPhas(step.phas),
        curv:    clampCurv(step.curv),
        gate:    step.gate,
        prob:    step.prob,
        mod_bus: step.mod_bus,
        aux1:    step.aux1,
        aux2:    step.aux2,
        minv:    step.minv,
        maxv:    step.maxv,
        freq:    step.freq,
        quan:    step.quan,
        s_h:     step.s_h,
        huma:    clampHuma(step.huma),
        _val:    clampVal(step.val),
        _comp:   clampComp(step.comp),
      })),
    })),
  }
}

// Produce a human-readable JSON preview with pending-field warnings
export function serializeToPreviewString(state: PresetState): string {
  const json = serializePreset(state)
  // Remove _val and _comp from actual output; they are pending
  const cleaned = {
    channels: json.channels.map(ch => ({
      bpm: ch.bpm,
      velo: ch.velo,
      sh16: ch.sh16,
      steps: ch.steps.map(({ _val, _comp, ...rest }) => ({
        ...rest,
        '// _val (pending)':  _val,
        '// _comp (pending)': _comp,
      })),
    })),
  }
  return JSON.stringify(cleaned, null, 2)
}

// Produce the export JSON (without pending fields)
export function serializeToExportString(state: PresetState): string {
  const json = serializePreset(state)
  const cleaned = {
    channels: json.channels.map(ch => ({
      bpm: ch.bpm,
      velo: ch.velo,
      sh16: ch.sh16,
      steps: ch.steps.map(({ _val: _v, _comp: _c, ...rest }) => rest),
    })),
  }
  return JSON.stringify(cleaned, null, 2)
}
