import { useReducer, useMemo } from 'react'
import type { Pipeline, L1Transform, L2Transform, L3Transform, PresetState } from './pipeline/types'
import { computeL1 } from './pipeline/l1'
import { computeL2 } from './pipeline/l2'
import { computeL3 } from './pipeline/l3'

// ── State ─────────────────────────────────────────────────────────────────────

type UndoStack<T> = {
  past:    T[][]   // each entry is a full transforms snapshot
  present: T[]
  future:  T[][]
}

export type AppState = {
  pipeline: Pipeline
  undo: {
    l1: UndoStack<L1Transform>
    l2: UndoStack<L2Transform>
    l3: UndoStack<L3Transform>
  }
}

function emptyUndo<T>(initial: T[]): UndoStack<T> {
  return { past: [], present: initial, future: [] }
}

const INITIAL_STATE: AppState = {
  pipeline: {
    version: 1,
    name: 'UNTITLED',
    layers: { l1: [], l2: [], l3: [] },
  },
  undo: {
    l1: emptyUndo([]),
    l2: emptyUndo([]),
    l3: emptyUndo([]),
  },
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'ADD_L1'; transform: L1Transform }
  | { type: 'ADD_L2'; transform: L2Transform }
  | { type: 'ADD_L3'; transform: L3Transform }
  | { type: 'REPLACE_L1'; transforms: L1Transform[] }
  | { type: 'REPLACE_L2'; transforms: L2Transform[] }
  | { type: 'REPLACE_L3'; transforms: L3Transform[] }
  | { type: 'UNDO_L1' }
  | { type: 'UNDO_L2' }
  | { type: 'UNDO_L3' }
  | { type: 'REDO_L1' }
  | { type: 'REDO_L2' }
  | { type: 'REDO_L3' }
  | { type: 'SET_NAME'; name: string }
  | { type: 'LOAD_PIPELINE'; pipeline: Pipeline }

// ── Reducer helpers ───────────────────────────────────────────────────────────

function pushTransform<T>(stack: UndoStack<T>, next: T[]): UndoStack<T> {
  return {
    past:    [...stack.past, stack.present],
    present: next,
    future:  [],
  }
}

function undoStack<T>(stack: UndoStack<T>): UndoStack<T> {
  if (stack.past.length === 0) return stack
  const prev = stack.past[stack.past.length - 1]
  return {
    past:    stack.past.slice(0, -1),
    present: prev,
    future:  [stack.present, ...stack.future],
  }
}

function redoStack<T>(stack: UndoStack<T>): UndoStack<T> {
  if (stack.future.length === 0) return stack
  const next = stack.future[0]
  return {
    past:    [...stack.past, stack.present],
    present: next,
    future:  stack.future.slice(1),
  }
}

// Last-wins: replace any existing transform of same type (and channel if applicable)
function mergeTransform<T extends L1Transform | L2Transform | L3Transform>(
  existing: T[],
  next: T,
): T[] {
  // For per-channel transforms, match type + channel
  const hasChannel = 'channel' in next
  const idx = existing.findIndex(t => {
    if (t.type !== next.type) return false
    if (hasChannel && 'channel' in t) return (t as any).channel === (next as any).channel
    return true
  })
  if (idx >= 0) {
    const result = [...existing]
    result[idx] = next
    return result
  }
  return [...existing, next]
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_L1': {
      const next = mergeTransform(state.undo.l1.present, action.transform) as L1Transform[]
      const stack = pushTransform(state.undo.l1, next)
      return { ...state, undo: { ...state.undo, l1: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l1: next } } }
    }
    case 'ADD_L2': {
      const next = mergeTransform(state.undo.l2.present, action.transform) as L2Transform[]
      const stack = pushTransform(state.undo.l2, next)
      return { ...state, undo: { ...state.undo, l2: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l2: next } } }
    }
    case 'ADD_L3': {
      const next = mergeTransform(state.undo.l3.present, action.transform) as L3Transform[]
      const stack = pushTransform(state.undo.l3, next)
      return { ...state, undo: { ...state.undo, l3: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l3: next } } }
    }
    case 'REPLACE_L1': {
      const stack = pushTransform(state.undo.l1, action.transforms)
      return { ...state, undo: { ...state.undo, l1: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l1: action.transforms } } }
    }
    case 'REPLACE_L2': {
      const stack = pushTransform(state.undo.l2, action.transforms)
      return { ...state, undo: { ...state.undo, l2: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l2: action.transforms } } }
    }
    case 'REPLACE_L3': {
      const stack = pushTransform(state.undo.l3, action.transforms)
      return { ...state, undo: { ...state.undo, l3: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l3: action.transforms } } }
    }
    case 'UNDO_L1': {
      const stack = undoStack(state.undo.l1)
      return { ...state, undo: { ...state.undo, l1: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l1: stack.present } } }
    }
    case 'UNDO_L2': {
      const stack = undoStack(state.undo.l2)
      return { ...state, undo: { ...state.undo, l2: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l2: stack.present } } }
    }
    case 'UNDO_L3': {
      const stack = undoStack(state.undo.l3)
      return { ...state, undo: { ...state.undo, l3: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l3: stack.present } } }
    }
    case 'REDO_L1': {
      const stack = redoStack(state.undo.l1)
      return { ...state, undo: { ...state.undo, l1: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l1: stack.present } } }
    }
    case 'REDO_L2': {
      const stack = redoStack(state.undo.l2)
      return { ...state, undo: { ...state.undo, l2: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l2: stack.present } } }
    }
    case 'REDO_L3': {
      const stack = redoStack(state.undo.l3)
      return { ...state, undo: { ...state.undo, l3: stack }, pipeline: { ...state.pipeline, layers: { ...state.pipeline.layers, l3: stack.present } } }
    }
    case 'SET_NAME':
      return { ...state, pipeline: { ...state.pipeline, name: action.name.slice(0, 8).toUpperCase() } }
    case 'LOAD_PIPELINE': {
      const p = action.pipeline
      return {
        pipeline: p,
        undo: {
          l1: emptyUndo(p.layers.l1),
          l2: emptyUndo(p.layers.l2),
          l3: emptyUndo(p.layers.l3),
        },
      }
    }
    default:
      return state
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export type ComputedState = {
  l1State: PresetState
  l2State: PresetState
  l3State: PresetState
}

export function useAppStore() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  const computed: ComputedState = useMemo(() => {
    const l1State = computeL1(state.pipeline.layers.l1)
    const l2State = computeL2(l1State, state.pipeline.layers.l2)
    const l3State = computeL3(l2State, state.pipeline.layers.l3, state.pipeline.layers.l2)
    return { l1State, l2State, l3State }
  }, [state.pipeline.layers])

  const canUndo = {
    l1: state.undo.l1.past.length > 0,
    l2: state.undo.l2.past.length > 0,
    l3: state.undo.l3.past.length > 0,
  }

  const canRedo = {
    l1: state.undo.l1.future.length > 0,
    l2: state.undo.l2.future.length > 0,
    l3: state.undo.l3.future.length > 0,
  }

  return { state, dispatch, computed, canUndo, canRedo }
}
