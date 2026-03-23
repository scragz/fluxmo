import type { LayerIndex } from './LayerStrip'

interface Props {
  activeLayer: LayerIndex
  canUndo:     boolean
  canRedo:     boolean
  onUndo:      () => void
  onRedo:      () => void
  onJson:      () => void
  onExport:    () => void
}

export function BottomBar({ canUndo, canRedo, onUndo, onRedo, onJson, onExport }: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-white/10">
      <button
        onClick={onJson}
        className="px-3 py-1 text-xs tracking-widest uppercase rounded border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors"
      >
        JSON
      </button>

      <button
        onClick={onExport}
        className="px-3 py-1 text-xs tracking-widest uppercase rounded border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors"
      >
        EXPORT
      </button>

      <div className="ml-auto flex gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="w-8 h-7 flex items-center justify-center rounded border border-white/20 text-white/60 disabled:opacity-20 hover:enabled:text-white hover:enabled:border-white/40 transition-colors"
          title="Undo"
        >
          ↩
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="w-8 h-7 flex items-center justify-center rounded border border-white/20 text-white/60 disabled:opacity-20 hover:enabled:text-white hover:enabled:border-white/40 transition-colors"
          title="Redo"
        >
          ↪
        </button>
      </div>
    </div>
  )
}
