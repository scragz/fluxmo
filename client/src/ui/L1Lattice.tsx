import type { PresetState, L1Transform, DensMode, LengMode } from '../pipeline/types'
import { resolveL1, computeLCM } from '../pipeline/l1'
import { CHANNEL_COLORS } from '../pipeline/defaults'

interface Props {
  state:      PresetState
  transforms: L1Transform[]
  dispatch:   (t: L1Transform) => void
}

export function L1Lattice({ state, transforms, dispatch }: Props) {
  const r    = resolveL1(transforms)
  const lcm_ = computeLCM(transforms)
  const lcmSec = (lcm_ / (r.bpm / 60 / 4)).toFixed(1)

  function setRatio(i: number, val: number) {
    const next = [...r.ratios]
    next[i] = Math.max(1, Math.min(16, val))
    dispatch({ type: 'set_ratios', ratios: next })
  }

  function addRatio() {
    if (r.ratios.length >= 4) return
    dispatch({ type: 'set_ratios', ratios: [...r.ratios, 1] })
  }

  function removeRatio() {
    if (r.ratios.length <= 1) return
    dispatch({ type: 'set_ratios', ratios: r.ratios.slice(0, -1) })
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-auto flex-1">
      {/* Dot Grid */}
      <div className="flex flex-col gap-2">
        {state.channels.map((ch, ci) => (
          <div key={ci} className="flex items-center gap-1.5">
            <span className="text-xs w-8 text-white/30" style={{ color: CHANNEL_COLORS[ci] }}>
              CH{ci + 1}
            </span>
            <div className="flex gap-1 flex-wrap">
              {ch.steps.map((step, si) => {
                const size = 6 + step.leng * 1.5
                const opacity = 0.3 + (step.dens / Math.max(1, Math.min(step.leng * 2, 64))) * 0.7
                return (
                  <div
                    key={si}
                    className="rounded-full"
                    style={{
                      width:  size,
                      height: size,
                      backgroundColor: CHANNEL_COLORS[ci],
                      opacity,
                      flexShrink: 0,
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="border-t border-white/10 pt-4 flex flex-col gap-4">

        {/* Ratios */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/40 w-16 uppercase tracking-widest">Ratios</span>
          <div className="flex gap-1 items-center flex-wrap">
            {r.ratios.map((ratio, i) => (
              <div key={i} className="flex items-center gap-0.5">
                <button
                  className="w-7 h-7 text-xs rounded border border-white/20 text-white/60 hover:border-white/50 hover:text-white"
                  style={{ borderColor: CHANNEL_COLORS[i] + '60', color: CHANNEL_COLORS[i] }}
                  onClick={() => setRatio(i, ratio - 1)}
                >−</button>
                <span
                  className="w-8 text-center text-sm font-medium"
                  style={{ color: CHANNEL_COLORS[i] }}
                >{ratio}</span>
                <button
                  className="w-7 h-7 text-xs rounded border border-white/20 text-white/60 hover:border-white/50 hover:text-white"
                  style={{ borderColor: CHANNEL_COLORS[i] + '60', color: CHANNEL_COLORS[i] }}
                  onClick={() => setRatio(i, ratio + 1)}
                >+</button>
              </div>
            ))}
            {r.ratios.length < 4 && (
              <button
                onClick={addRatio}
                className="w-7 h-7 text-xs rounded border border-white/20 text-white/40 hover:text-white hover:border-white/40"
              >+</button>
            )}
            {r.ratios.length > 1 && (
              <button
                onClick={removeRatio}
                className="w-7 h-7 text-xs rounded border border-white/20 text-white/40 hover:text-white hover:border-white/40"
              >−</button>
            )}
          </div>
        </div>

        {/* BPM + Base Loop */}
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40 uppercase tracking-widest">BPM</span>
            <input
              type="number"
              value={r.bpm}
              min={20} max={300}
              onChange={e => dispatch({ type: 'set_bpm', bpm: Number(e.target.value) })}
              className="w-16 px-2 py-1 bg-white/5 border border-white/20 rounded text-sm text-white text-center"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40 uppercase tracking-widest">Base</span>
            <input
              type="number"
              value={r.baseLoop}
              min={1} max={16}
              onChange={e => dispatch({ type: 'set_base_loop', steps: Number(e.target.value) })}
              className="w-12 px-2 py-1 bg-white/5 border border-white/20 rounded text-sm text-white text-center"
            />
          </div>
        </div>

        {/* Dens Map */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/40 uppercase tracking-widest w-16">Dens</span>
          {(['proportional', 'inverse', 'flat'] as DensMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => dispatch({ type: 'set_dens_map', mode })}
              className={[
                'px-3 py-1 text-xs rounded border uppercase tracking-widest transition-colors',
                r.densMode === mode
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20',
              ].join(' ')}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Leng Map */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/40 uppercase tracking-widest w-16">Leng</span>
          {(['fill', 'short', 'long'] as LengMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => dispatch({ type: 'set_leng_map', mode })}
              className={[
                'px-3 py-1 text-xs rounded border uppercase tracking-widest transition-colors',
                r.lengMode === mode
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20',
              ].join(' ')}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Channel Velocities */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-white/40 uppercase tracking-widest w-16">Velo</span>
          {([0, 1, 2, 3] as const).map(ci => (
            <div key={ci} className="flex items-center gap-1">
              <span className="text-xs" style={{ color: CHANNEL_COLORS[ci] }}>
                {ci + 1}
              </span>
              <input
                type="number"
                value={r.velo[ci]}
                min={0} max={127}
                onChange={e => dispatch({ type: 'set_velo', channel: ci, velo: Number(e.target.value) })}
                className="w-14 px-1 py-0.5 bg-white/5 border border-white/20 rounded text-xs text-white text-center"
                style={{ borderColor: CHANNEL_COLORS[ci] + '40' }}
              />
            </div>
          ))}
        </div>

        {/* LCM info */}
        <div className="text-xs text-white/30 border-t border-white/10 pt-3">
          LCM: {lcm_} 16ths @ {r.bpm}bpm ≈ {lcmSec}s
        </div>
      </div>
    </div>
  )
}
