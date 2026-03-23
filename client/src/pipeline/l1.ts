import type { L1Transform, PresetState, ChannelState, DensMode, LengMode } from './types'
import {
  DEFAULT_RATIOS, DEFAULT_BPM, DEFAULT_BASE_LOOP,
  DEFAULT_DENS_MODE, DEFAULT_LENG_MODE, DEFAULT_VELO,
  defaultStep, fracToDens, clampLeng,
} from './defaults'

// Resolve last-wins for each transform type
type L1Resolved = {
  ratios:   number[]
  bpm:      number
  baseLoop: number
  densMode: DensMode
  lengMode: LengMode
  velo:     [number, number, number, number]
}

export function resolveL1(transforms: L1Transform[]): L1Resolved {
  const resolved: L1Resolved = {
    ratios:   DEFAULT_RATIOS.slice(),
    bpm:      DEFAULT_BPM,
    baseLoop: DEFAULT_BASE_LOOP,
    densMode: DEFAULT_DENS_MODE,
    lengMode: DEFAULT_LENG_MODE,
    velo:     [DEFAULT_VELO, DEFAULT_VELO, DEFAULT_VELO, DEFAULT_VELO],
  }
  for (const t of transforms) {
    switch (t.type) {
      case 'set_ratios':    resolved.ratios = t.ratios.map(r => Math.max(1, Math.min(16, r))); break
      case 'set_bpm':       resolved.bpm = Math.max(20, Math.min(300, t.bpm)); break
      case 'set_base_loop': resolved.baseLoop = Math.max(1, Math.min(16, t.steps)); break
      case 'set_dens_map':  resolved.densMode = t.mode; break
      case 'set_leng_map':  resolved.lengMode = t.mode; break
      case 'set_velo':      resolved.velo[t.channel] = Math.max(0, Math.min(127, t.velo)); break
    }
  }
  return resolved
}

export function computeL1(transforms: L1Transform[]): PresetState {
  const r = resolveL1(transforms)
  const { ratios, bpm, baseLoop, densMode, lengMode, velo } = r

  // Pad/trim to 4 channels
  const ch4Ratios = [0, 1, 2, 3].map(i => ratios[i] ?? ratios[ratios.length - 1] ?? 1)

  const minRatio = Math.min(...ch4Ratios)
  const maxRatio = Math.max(...ch4Ratios)
  const range    = maxRatio - minRatio || 1

  const channels: ChannelState[] = ch4Ratios.map((ratio, ci) => {
    const loopLen = Math.max(1, Math.min(16, ratio))

    // DENS baseline fraction
    let densFrac: number
    switch (densMode) {
      case 'proportional': densFrac = ratio / maxRatio; break
      case 'inverse':      densFrac = 1 - (ratio - minRatio) / range; break
      case 'flat':         densFrac = 0.25; break
    }

    // LENG per channel
    let leng: number
    switch (lengMode) {
      case 'fill':  leng = clampLeng(Math.max(1, Math.floor(baseLoop / ratio))); break
      case 'short': leng = 1; break
      case 'long':  leng = clampLeng(baseLoop); break
    }

    const dens = fracToDens(densFrac, leng)

    const steps = Array.from({ length: loopLen }, () => ({
      ...defaultStep(),
      leng,
      dens,
    }))

    return {
      steps,
      bpm,
      velo: velo[ci],
      sh16: 0,
    }
  })

  return { channels }
}

// LCM utility for display
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b) }
export function lcm(nums: number[]): number {
  return nums.reduce((acc, n) => (acc * n) / gcd(acc, n), 1)
}

export function computeLCM(transforms: L1Transform[]): number {
  const r = resolveL1(transforms)
  const ch4Ratios = [0, 1, 2, 3].map(i => r.ratios[i] ?? r.ratios[r.ratios.length - 1] ?? 1)
  return lcm(ch4Ratios)
}
