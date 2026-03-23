import { useReducer } from "react";
import { L1Transform, L2Transform, L3Transform, Pipeline, PresetState } from "./pipeline/types";
import { computeL1 } from "./pipeline/l1";
import { computeL2 } from "./pipeline/l2";
import { computeL3 } from "./pipeline/l3";

export type LayerId = "l1" | "l2" | "l3";

export type State = {
  pipeline: Pipeline;
  activeLayer: LayerId;
  l1State: PresetState;
  l2State: PresetState;
  l3State: PresetState;
};

export type Action =
  | { type: "SET_ACTIVE_LAYER"; layer: LayerId }
  | { type: "ADD_L1_TRANSFORM"; transform: L1Transform }
  | { type: "ADD_L2_TRANSFORM"; transform: L2Transform }
  | { type: "ADD_L3_TRANSFORM"; transform: L3Transform }
  | { type: "UNDO"; layer: LayerId }
  | { type: "LOAD_PIPELINE"; pipeline: Pipeline };

const initialPipeline: Pipeline = {
  version: 1,
  name: "INIT",
  layers: { l1: [], l2: [], l3: [] },
};

const initialL1 = computeL1([]);
const initialL2 = computeL2(initialL1, []);
const initialL3 = computeL3(initialL2, []);

export const initialState: State = {
  pipeline: initialPipeline,
  activeLayer: "l1",
  l1State: initialL1,
  l2State: initialL2,
  l3State: initialL3,
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_ACTIVE_LAYER":
      return { ...state, activeLayer: action.layer };

    case "ADD_L1_TRANSFORM": {
      const newL1 = [...state.pipeline.layers.l1, action.transform];
      const newPipeline = {
        ...state.pipeline,
        layers: { ...state.pipeline.layers, l1: newL1 },
      };
      const l1State = computeL1(newL1);
      const l2State = computeL2(l1State, state.pipeline.layers.l2);
      const l3State = computeL3(l2State, state.pipeline.layers.l3);
      return { ...state, pipeline: newPipeline, l1State, l2State, l3State };
    }

    case "ADD_L2_TRANSFORM": {
      const newL2 = [...state.pipeline.layers.l2, action.transform];
      const newPipeline = {
        ...state.pipeline,
        layers: { ...state.pipeline.layers, l2: newL2 },
      };
      const l2State = computeL2(state.l1State, newL2);
      const l3State = computeL3(l2State, state.pipeline.layers.l3);
      return { ...state, pipeline: newPipeline, l2State, l3State };
    }

    case "ADD_L3_TRANSFORM": {
      const newL3 = [...state.pipeline.layers.l3, action.transform];
      const newPipeline = {
        ...state.pipeline,
        layers: { ...state.pipeline.layers, l3: newL3 },
      };
      const l3State = computeL3(state.l2State, newL3);
      return { ...state, pipeline: newPipeline, l3State };
    }

    case "UNDO": {
      const layer = action.layer;
      const transforms = state.pipeline.layers[layer];
      if (transforms.length === 0) return state;

      const newTransforms = transforms.slice(0, -1);
      const newPipeline = {
        ...state.pipeline,
        layers: { ...state.pipeline.layers, [layer]: newTransforms },
      };

      if (layer === "l1") {
        const l1State = computeL1(newTransforms as L1Transform[]);
        const l2State = computeL2(l1State, state.pipeline.layers.l2);
        const l3State = computeL3(l2State, state.pipeline.layers.l3);
        return { ...state, pipeline: newPipeline, l1State, l2State, l3State };
      } else if (layer === "l2") {
        const l2State = computeL2(state.l1State, newTransforms as L2Transform[]);
        const l3State = computeL3(l2State, state.pipeline.layers.l3);
        return { ...state, pipeline: newPipeline, l2State, l3State };
      } else {
        const l3State = computeL3(state.l2State, newTransforms as L3Transform[]);
        return { ...state, pipeline: newPipeline, l3State };
      }
    }

    case "LOAD_PIPELINE": {
      const l1State = computeL1(action.pipeline.layers.l1);
      const l2State = computeL2(l1State, action.pipeline.layers.l2);
      const l3State = computeL3(l2State, action.pipeline.layers.l3);
      return {
        ...state,
        pipeline: action.pipeline,
        l1State,
        l2State,
        l3State,
      };
    }

    default:
      return state;
  }
}
