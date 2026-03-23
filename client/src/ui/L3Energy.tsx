import { useRef, useEffect, useCallback, useState } from 'react'
import type { PresetState, L3Transform } from '../pipeline/types'
import { CHANNEL_COLORS } from '../pipeline/defaults'
import { densToFrac } from '../pipeline/defaults'

interface Props {
  state:      PresetState
  transforms: L3Transform[]
  dispatch:   (t: L3Transform) => void
}

const CURV_COUNT = 8
const VAL_MIN    = -3.0
const VAL_MAX    =  3.0

// Resolve channel offset and huma from transforms
function resolveL3Meta(transforms: L3Transform[]) {
  let channelOffset = false
  const huma: [number, number, number, number] = [0, 0, 0, 0]
  for (const t of transforms) {
    if (t.type === 'set_channel_offset') channelOffset = t.enabled
    if (t.type === 'set_huma') huma[t.channel] = t.value
  }
  return { channelOffset, huma }
}

export function L3Energy({ state, transforms, dispatch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef   = useRef<{ ci: number; si: number } | null>(null)
  const [selectedDot, setSelectedDot] = useState<{ ci: number; si: number } | null>(null)
  const { channelOffset, huma } = resolveL3Meta(transforms)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { width: W, height: H } = canvas
    ctx.clearRect(0, 0, W, H)

    const PAD = { top: 20, right: 16, bottom: 20, left: 36 }
    const innerW = W - PAD.left - PAD.right
    const innerH = H - PAD.top  - PAD.bottom

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth   = 1

    // CURV vertical lines (8 columns)
    for (let c = 0; c <= CURV_COUNT; c++) {
      const x = PAD.left + (c / CURV_COUNT) * innerW
      ctx.beginPath()
      ctx.moveTo(x, PAD.top)
      ctx.lineTo(x, PAD.top + innerH)
      ctx.stroke()
    }

    // VAL horizontal lines at -3,-2,-1,0,1,2,3
    for (let v = VAL_MIN; v <= VAL_MAX; v++) {
      const y = PAD.top + ((VAL_MAX - v) / (VAL_MAX - VAL_MIN)) * innerH
      ctx.beginPath()
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(PAD.left + innerW, y)
      ctx.strokeStyle = v === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'
      ctx.stroke()
    }

    // Axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font      = `${10 / window.devicePixelRatio}px ui-monospace`
    ctx.textAlign = 'center'
    for (let c = 1; c <= CURV_COUNT; c++) {
      const x = PAD.left + ((c - 0.5) / CURV_COUNT) * innerW
      ctx.fillText(String(c), x, PAD.top + innerH + 14)
    }
    ctx.textAlign = 'right'
    for (let v = VAL_MIN; v <= VAL_MAX; v++) {
      const y = PAD.top + ((VAL_MAX - v) / (VAL_MAX - VAL_MIN)) * innerH + 3
      ctx.fillText(v === 0 ? '0' : String(v), PAD.left - 4, y)
    }

    function dotToXY(curv: number, val: number) {
      const x = PAD.left + ((curv - 1 + 0.5) / CURV_COUNT) * innerW
      const y = PAD.top  + ((VAL_MAX - val) / (VAL_MAX - VAL_MIN)) * innerH
      return { x, y }
    }

    // Draw dots per channel
    state.channels.forEach((ch, ci) => {
      const color = CHANNEL_COLORS[ci]

      // Path lines
      ctx.strokeStyle = color + '25'
      ctx.lineWidth   = 1
      ctx.beginPath()
      ch.steps.forEach((step, si) => {
        const { x, y } = dotToXY(step.curv, step.val)
        if (si === 0) ctx.moveTo(x, y)
        else          ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Dots
      ch.steps.forEach((step, si) => {
        const { x, y }  = dotToXY(step.curv, step.val)
        const busyFrac   = densToFrac(step.dens, step.leng)
        const dotRadius  = 3 + busyFrac * 5
        const isSelected = selectedDot?.ci === ci && selectedDot?.si === si

        ctx.beginPath()
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2)
        ctx.fillStyle   = color + (isSelected ? 'ff' : '99')
        ctx.fill()
        if (isSelected) {
          ctx.strokeStyle = 'white'
          ctx.lineWidth   = 1.5
          ctx.stroke()
        }
      })
    })
  }, [state, selectedDot])

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

  function canvasToParams(e: React.PointerEvent): { curv: number; val: number } {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const PAD    = { top: 20, right: 16, bottom: 20, left: 36 }
    const innerW = rect.width  - PAD.left - PAD.right
    const innerH = rect.height - PAD.top  - PAD.bottom

    const px  = e.clientX - rect.left
    const py  = e.clientY - rect.top
    const fx  = (px - PAD.left) / innerW
    const fy  = (py - PAD.top)  / innerH

    const curv = Math.max(1, Math.min(8, Math.round(fx * CURV_COUNT + 0.5)))
    const val  = Math.max(VAL_MIN, Math.min(VAL_MAX, VAL_MAX - fy * (VAL_MAX - VAL_MIN)))
    return { curv, val }
  }

  function findDot(e: React.PointerEvent): { ci: number; si: number } | null {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const PAD    = { top: 20, right: 16, bottom: 20, left: 36 }
    const innerW = rect.width  - PAD.left - PAD.right
    const innerH = rect.height - PAD.top  - PAD.bottom

    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    for (let ci = 3; ci >= 0; ci--) {
      for (let si = 0; si < state.channels[ci].steps.length; si++) {
        const step = state.channels[ci].steps[si]
        const x    = PAD.left + ((step.curv - 1 + 0.5) / CURV_COUNT) * innerW
        const y    = PAD.top  + ((VAL_MAX - step.val) / (VAL_MAX - VAL_MIN)) * innerH
        if (Math.hypot(mx - x, my - y) < 12) return { ci, si }
      }
    }
    return null
  }

  function onPointerDown(e: React.PointerEvent) {
    const dot = findDot(e)
    if (!dot) { setSelectedDot(null); return }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = dot
    setSelectedDot(dot)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const { ci, si } = dragRef.current
    const { curv, val } = canvasToParams(e)
    dispatch({ type: 'set_texture_point', channel: ci as 0|1|2|3, step: si, curv, val })
  }

  function onPointerUp() { dragRef.current = null }

  function onDoubleClick(e: React.MouseEvent) {
    const dot = findDot(e as unknown as React.PointerEvent)
    if (!dot) return
    dispatch({ type: 'set_texture_point', channel: dot.ci as 0|1|2|3, step: dot.si, curv: 1, val: 0 })
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Texture plane */}
      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          style={{ touchAction: 'none' }}
        />
      </div>

      {/* Busyness strip */}
      <div className="border-t border-white/10 p-3 flex flex-col gap-1.5">
        {state.channels.map((ch, ci) => (
          <div key={ci} className="flex items-center gap-2">
            <span className="text-xs w-8" style={{ color: CHANNEL_COLORS[ci] }}>CH{ci+1}</span>
            <div className="flex gap-0.5 flex-1 h-6 items-end">
              {ch.steps.map((step, si) => {
                const frac = densToFrac(step.dens, step.leng)
                return (
                  <div
                    key={si}
                    className="flex-1 rounded-sm cursor-ns-resize"
                    style={{
                      height: `${Math.max(4, frac * 100)}%`,
                      backgroundColor: CHANNEL_COLORS[ci],
                      opacity: 0.5 + frac * 0.5,
                    }}
                    onPointerDown={() => {}}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom controls */}
      <div className="border-t border-white/10 px-4 py-3 flex flex-col gap-3">
        {/* Channel offset */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40 uppercase tracking-widest">CH Offset</span>
          {[true, false].map(val => (
            <button
              key={String(val)}
              onClick={() => dispatch({ type: 'set_channel_offset', enabled: val })}
              className={[
                'px-3 py-1 text-xs rounded border uppercase tracking-widest transition-colors',
                channelOffset === val
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'border-white/10 text-white/40 hover:text-white/60',
              ].join(' ')}
            >
              {val ? 'ON' : 'OFF'}
            </button>
          ))}
        </div>

        {/* HUMA per channel */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-white/40 uppercase tracking-widest w-12">Huma</span>
          {([0, 1, 2, 3] as const).map(ci => (
            <div key={ci} className="flex items-center gap-1">
              <span className="text-xs" style={{ color: CHANNEL_COLORS[ci] }}>{ci+1}</span>
              <input
                type="range"
                min={0} max={64} step={1}
                value={huma[ci]}
                onChange={e => dispatch({ type: 'set_huma', channel: ci, value: Number(e.target.value) })}
                className="w-20"
                style={{ accentColor: CHANNEL_COLORS[ci] }}
              />
              <span className="text-xs text-white/30 w-5">{huma[ci]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
