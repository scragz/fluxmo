import { useEffect, useRef } from 'react'
import type { PresetState } from '../pipeline/types'
import { serializeToPreviewString } from '../pipeline/serialize'

interface Props {
  open:    boolean
  state:   PresetState
  onClose: () => void
}

export function JsonDrawer({ open, state, onClose }: Props) {
  const json = serializeToPreviewString(state)
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (open && preRef.current) preRef.current.scrollTop = 0
  }, [open, json])

  return (
    <div
      className={[
        'absolute inset-x-0 bottom-0 bg-[#0d0d10] border-t border-white/10 transition-transform duration-300',
        open ? 'translate-y-0' : 'translate-y-full',
      ].join(' ')}
      style={{ height: '60%', zIndex: 50 }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex gap-2 items-center">
          <span className="text-xs tracking-widest text-white/40 uppercase">Output JSON</span>
          <span className="text-xs text-yellow-400/70">
            ⚠ val / comp not yet emitted — pending build format support
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white text-sm"
        >
          ✕
        </button>
      </div>

      <pre
        ref={preRef}
        className="overflow-auto h-[calc(100%-40px)] p-3 text-xs text-green-300/80 leading-relaxed scrollbar-hide"
        style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}
      >
        {json}
      </pre>
    </div>
  )
}
