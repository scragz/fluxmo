import type { Pipeline } from '../pipeline/types'

export type LayerIndex = 0 | 1 | 2

const LAYERS = [
  { label: 'LATTICE', key: 'l1' },
  { label: 'PHASE',   key: 'l2' },
  { label: 'ENERGY',  key: 'l3' },
] as const

interface Props {
  active:   LayerIndex
  pipeline: Pipeline
  onChange: (layer: LayerIndex) => void
}

function layerStatus(transforms: unknown[]): 'empty' | 'active' {
  return transforms.length > 0 ? 'active' : 'empty'
}

export function LayerStrip({ active, pipeline, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10">
      {LAYERS.map(({ label, key }, i) => {
        const status = layerStatus(pipeline.layers[key])
        const isActive = active === i
        return (
          <button
            key={key}
            onClick={() => onChange(i as LayerIndex)}
            className={[
              'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium tracking-widest uppercase transition-colors',
              isActive
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            <span
              className={[
                'w-1.5 h-1.5 rounded-full',
                status === 'active' ? 'bg-current' : 'border border-current opacity-50',
              ].join(' ')}
            />
            {label}
          </button>
        )
      })}

      <div className="ml-auto text-white/30 text-xs tracking-widest">
        {pipeline.name || 'UNTITLED'}
      </div>
    </div>
  )
}
