import type { L3Transform, PresetState } from './types'
import { clampCurv, clampVal, clampComp, clampHuma, fracToDens } from './defaults'
import { resolveL2Params } from './l2'
import type { L2Transform } from './types'

type TexturePoint = { curv: number; val: number }
type TexturePath  = TexturePoint[]

type L3Resolved = {
  texturePaths:    TexturePath[]         // [channel][step] override points
  stepOverrides:   Map<string, TexturePoint>  // "ch:step" → point
  busyness:        Map<string, number>   // "ch:step" → fraction
  busynessAll:     Map<number, number>   // channel → fraction
  channelOffset:   boolean
  huma:            [number, number, number, number]
}

function resolveL3(transforms: L3Transform[]): L3Resolved {
  const resolved: L3Resolved = {
    texturePaths:  [[], [], [], []],
    stepOverrides: new Map(),
    busyness:      new Map(),
    busynessAll:   new Map(),
    channelOffset: false,
    huma: [0, 0, 0, 0],
  }
  for (const t of transforms) {
    switch (t.type) {
      case 'set_texture_point':
        resolved.stepOverrides.set(`${t.channel}:${t.step}`, {
          curv: clampCurv(t.curv),
          val:  clampVal(t.val),
        })
        break
      case 'set_texture_path':
        resolved.texturePaths[t.channel] = t.points.map(p => ({
          curv: clampCurv(p.curv),
          val:  clampVal(p.val),
        }))
        break
      case 'set_busyness':
        resolved.busyness.set(`${t.channel}:${t.step}`, Math.max(0, Math.min(1, t.fraction)))
        break
      case 'set_busyness_all':
        resolved.busynessAll.set(t.channel, Math.max(0, Math.min(1, t.fraction)))
        break
      case 'set_channel_offset':
        resolved.channelOffset = t.enabled
        break
      case 'set_huma':
        resolved.huma[t.channel] = clampHuma(t.value)
        break
    }
  }
  return resolved
}

export function computeL3(
  l2State: PresetState,
  transforms: L3Transform[],
  l2Transforms: L2Transform[],
): PresetState {
  const r = resolveL3(transforms)
  const l2Params = resolveL2Params(l2Transforms)

  const channels = l2State.channels.map((ch, ci) => {
    const loopLen = ch.steps.length
    const huma    = r.huma[ci]

    // Channel phase offset: rotate which path point is used for step 0
    const phaseOffset = r.channelOffset
      ? Math.round((l2Params.basePhase[ci] / 360) * loopLen) % loopLen
      : 0

    const steps = ch.steps.map((step, si) => {
      // Texture path point for this step (with channel offset)
      const pathIndex = (si + phaseOffset) % loopLen
      const path = r.texturePaths[ci]
      const pathPoint: TexturePoint = path.length > 0
        ? path[pathIndex % path.length]
        : { curv: 1, val: 0 }

      // Step override wins over path
      const override = r.stepOverrides.get(`${ci}:${si}`)
      const { curv, val } = override ?? pathPoint

      // Busyness
      const busyFrac = r.busyness.has(`${ci}:${si}`)
        ? r.busyness.get(`${ci}:${si}`)!
        : (r.busynessAll.has(ci) ? r.busynessAll.get(ci)! : fracToDens(1, step.leng) / Math.min(step.leng * 2, 64))

      const dens = fracToDens(busyFrac, step.leng)
      const comp = clampComp(Math.round(busyFrac * 50))

      return {
        ...step,
        curv: clampCurv(curv),
        val:  clampVal(val),
        dens,
        comp,
        huma,
      }
    })

    return { ...ch, steps }
  })

  return { channels }
}
