import { useState, useRef } from 'react'
import { useAppStore } from './store'
import type { LayerIndex } from './ui/LayerStrip'
import { LayerStrip } from './ui/LayerStrip'
import { BottomBar }  from './ui/BottomBar'
import { JsonDrawer } from './ui/JsonDrawer'
import { L1Lattice }  from './ui/L1Lattice'
import { L2Constellation } from './ui/L2Constellation'
import { L3Energy }   from './ui/L3Energy'
import { serializeToExportString } from './pipeline/serialize'
import type { L1Transform, L2Transform, L3Transform } from './pipeline/types'

export default function App() {
  const { state, dispatch, computed, canUndo, canRedo } = useAppStore()
  const [activeLayer, setActiveLayer]   = useState<LayerIndex>(0)
  const [jsonOpen, setJsonOpen]         = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)

  // Swipe handling
  const touchStart = useRef<number | null>(null)
  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = e.touches[0].clientX
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStart.current === null) return
    const dx = e.changedTouches[0].clientX - touchStart.current
    touchStart.current = null
    if (Math.abs(dx) < 40) return
    if (dx < 0) setActiveLayer(l => Math.min(2, l + 1) as LayerIndex)
    else        setActiveLayer(l => Math.max(0, l - 1) as LayerIndex)
  }

  // Undo/redo dispatch per layer
  function handleUndo() {
    if (activeLayer === 0) dispatch({ type: 'UNDO_L1' })
    if (activeLayer === 1) dispatch({ type: 'UNDO_L2' })
    if (activeLayer === 2) dispatch({ type: 'UNDO_L3' })
  }
  function handleRedo() {
    if (activeLayer === 0) dispatch({ type: 'REDO_L1' })
    if (activeLayer === 1) dispatch({ type: 'REDO_L2' })
    if (activeLayer === 2) dispatch({ type: 'REDO_L3' })
  }

  const activeCanUndo = [canUndo.l1, canUndo.l2, canUndo.l3][activeLayer]
  const activeCanRedo = [canRedo.l1, canRedo.l2, canRedo.l3][activeLayer]

  async function handleExport() {
    const json = serializeToExportString(computed.l3State)
    try {
      await navigator.clipboard.writeText(json)
    } catch {
      const el = document.createElement('textarea')
      el.value = json
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 1500)
  }

  function handleSave() {
    const data = JSON.stringify(state.pipeline, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${state.pipeline.name || 'UNTITLED'}.rfg.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const pipeline = JSON.parse(ev.target?.result as string)
        dispatch({ type: 'LOAD_PIPELINE', pipeline })
      } catch {
        alert('Invalid .rfg.json file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div
      className="flex flex-col h-full bg-[#0a0a0c] select-none relative overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center border-b border-white/5 shrink-0">
        <div className="px-4 py-2 text-xs text-white/20 tracking-[0.3em] uppercase font-medium">
          FLUXMO LIVE
        </div>
        <div className="ml-auto flex items-center gap-2 px-3 py-2">
          <label className="text-xs text-white/30 hover:text-white/60 cursor-pointer px-2 py-1 rounded border border-white/10 hover:border-white/20 uppercase tracking-widest transition-colors">
            LOAD
            <input type="file" accept=".rfg.json,.json" className="sr-only" onChange={handleLoad} />
          </label>
          <button
            onClick={handleSave}
            className="text-xs text-white/30 hover:text-white/60 px-2 py-1 rounded border border-white/10 hover:border-white/20 uppercase tracking-widest transition-colors"
          >
            SAVE
          </button>
          <input
            type="text"
            value={state.pipeline.name}
            maxLength={8}
            onChange={e => dispatch({ type: 'SET_NAME', name: e.target.value })}
            className="w-20 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white/50 text-center uppercase tracking-widest focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      {/* Layer strip */}
      <div className="shrink-0">
        <LayerStrip
          active={activeLayer}
          pipeline={state.pipeline}
          onChange={setActiveLayer}
        />
      </div>

      {/* Layer content */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        {activeLayer === 0 && (
          <L1Lattice
            state={computed.l1State}
            transforms={state.pipeline.layers.l1}
            dispatch={(t: L1Transform) => dispatch({ type: 'ADD_L1', transform: t })}
          />
        )}
        {activeLayer === 1 && (
          <L2Constellation
            state={computed.l2State}
            transforms={state.pipeline.layers.l2}
            dispatch={(t: L2Transform) => dispatch({ type: 'ADD_L2', transform: t })}
          />
        )}
        {activeLayer === 2 && (
          <L3Energy
            state={computed.l3State}
            transforms={state.pipeline.layers.l3}
            dispatch={(t: L3Transform) => dispatch({ type: 'ADD_L3', transform: t })}
          />
        )}

        {/* JSON drawer overlays the layer content */}
        <JsonDrawer
          open={jsonOpen}
          state={computed.l3State}
          onClose={() => setJsonOpen(false)}
        />
      </div>

      {/* Bottom bar */}
      <div className="shrink-0">
        <BottomBar
          activeLayer={activeLayer}
          canUndo={activeCanUndo}
          canRedo={activeCanRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onJson={() => setJsonOpen(o => !o)}
          onExport={handleExport}
        />
      </div>

      {/* Copy feedback toast */}
      {copyFeedback && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 border border-white/20 rounded px-4 py-2 text-xs text-white pointer-events-none z-50">
          Copied to clipboard
        </div>
      )}
    </div>
  )
}
