import { useRef, useEffect, useCallback } from 'react'
import type { PresetState, L2Transform, PhaseAllMode } from '../pipeline/types'
import { resolveL2Params } from '../pipeline/l2'
import { CHANNEL_COLORS } from '../pipeline/defaults'

interface Props {
  state:      PresetState
  transforms: L2Transform[]
  dispatch:   (t: L2Transform) => void
}

const TAU = Math.PI * 2

function degToRad(d: number) { return (d * Math.PI) / 180 }
function phasToXY(phas: number, cx: number, cy: number, r: number) {
  const angle = degToRad(phas - 90)
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

export function L2Constellation({ state, transforms, dispatch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef   = useRef<{ channel: number; startAngle: number; basePhase: number } | null>(null)
  const { basePhase, drift } = resolveL2Params(transforms)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { width: W, height: H } = canvas
    ctx.clearRect(0, 0, W, H)

    const cx = W / 2
    const cy = H / 2
    const R  = Math.min(W, H) * 0.4

    // Draw orbit circle
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, TAU)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth   = 1
    ctx.stroke()

    // Axis lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.beginPath()
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy)
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R)
    ctx.stroke()

    // Draw dots per channel
    state.channels.forEach((ch, ci) => {
      const color = CHANNEL_COLORS[ci]
      ctx.strokeStyle = color + '30'
      ctx.lineWidth   = 1

      const pts = ch.steps.map((step) => phasToXY(step.phas, cx, cy, R))

      // Path lines
      ctx.beginPath()
      pts.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y)
        else         ctx.lineTo(pt.x, pt.y)
      })
      ctx.stroke()

      // Dots
      pts.forEach((pt) => {
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 3, 0, TAU)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.8
        ctx.fill()
        ctx.globalAlpha = 1
      })

      // Drag handle — largest dot at base phase
      const handle = phasToXY(basePhase[ci], cx, cy, R)
      ctx.beginPath()
      ctx.arc(handle.x, handle.y, 7, 0, TAU)
      ctx.strokeStyle = color
      ctx.lineWidth   = 2
      ctx.stroke()
      ctx.fillStyle = color + '30'
      ctx.fill()
    })
  }, [state, basePhase])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect()
      canvas.width  = rect.width  * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      const ctx = canvas.getContext('2d')!
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      draw()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [draw])

  useEffect(() => { draw() }, [draw])

  // Pointer drag for phase handles
  function getAngle(e: React.PointerEvent): number {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const cx     = rect.width / 2
    const cy     = rect.height / 2
    const dx     = e.clientX - rect.left - cx
    const dy     = e.clientY - rect.top  - cy
    return ((Math.atan2(dy, dx) * 180 / Math.PI) + 90 + 360) % 360
  }

  function findHandleChannel(e: React.PointerEvent): number | null {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const cx     = rect.width  / 2
    const cy     = rect.height / 2
    const R      = Math.min(rect.width, rect.height) * 0.4
    const mx     = e.clientX - rect.left
    const my     = e.clientY - rect.top

    for (let ci = 3; ci >= 0; ci--) {
      const { x, y } = phasToXY(basePhase[ci], cx, cy, R)
      if (Math.hypot(mx - x, my - y) < 16) return ci
    }
    return null
  }

  function onPointerDown(e: React.PointerEvent) {
    const ci = findHandleChannel(e)
    if (ci === null) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { channel: ci, startAngle: getAngle(e), basePhase: basePhase[ci] }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const { channel, startAngle, basePhase: bp } = dragRef.current
    const delta = getAngle(e) - startAngle
    const next  = ((bp + delta) % 360 + 360) % 360
    dispatch({ type: 'set_phase', channel: channel as 0|1|2|3, degrees: Math.round(next) })
  }

  function onPointerUp() { dragRef.current = null }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ touchAction: 'none' }}
        />
      </div>

      {/* Controls */}
      <div className="border-t border-white/10 p-4 flex flex-col gap-4">

        {/* Quick-set */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 uppercase tracking-widest w-16">Preset</span>
          {(['unison', 'spread', 'golden'] as PhaseAllMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => dispatch({ type: 'set_phase_all', mode })}
              className="px-3 py-1 text-xs rounded border border-white/10 text-white/40 hover:text-white hover:border-white/30 uppercase tracking-widest transition-colors"
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Per-channel drift sliders */}
        <div className="flex flex-col gap-2">
          {([0, 1, 2, 3] as const).map(ci => (
            <div key={ci} className="flex items-center gap-3">
              <span className="text-xs w-8" style={{ color: CHANNEL_COLORS[ci] }}>
                CH{ci + 1}
              </span>
              <span className="text-xs text-white/30 w-12 text-right">
                {Math.round(basePhase[ci])}°
              </span>
              <input
                type="range"
                min={0} max={360} step={1}
                value={basePhase[ci]}
                onChange={e => dispatch({ type: 'set_phase', channel: ci, degrees: Number(e.target.value) })}
                className="flex-1 accent-current"
                style={{ accentColor: CHANNEL_COLORS[ci] }}
              />
              <span className="text-xs text-white/30 w-8 text-right">
                drift
              </span>
              <input
                type="number"
                value={drift[ci]}
                min={-360} max={360}
                onChange={e => dispatch({ type: 'set_drift', channel: ci, degrees_per_step: Number(e.target.value) })}
                className="w-16 px-1 py-0.5 bg-white/5 border border-white/20 rounded text-xs text-white text-right"
                style={{ borderColor: CHANNEL_COLORS[ci] + '40' }}
              />
              <span className="text-xs text-white/30">°/step</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
