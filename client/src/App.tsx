import React, { useReducer, useState, useEffect, useRef } from "react";
import { reducer, initialState, LayerId } from "./store";
import { LayerStrip } from "./ui/LayerStrip";
import { BottomBar } from "./ui/BottomBar";
import { JsonDrawer } from "./ui/JsonDrawer";
import { DotGrid } from "./ui/DotGrid";
import { L1Lattice } from "./ui/L1Lattice";
import { L2Constellation } from "./ui/L2Constellation";
import { L3Energy } from "./ui/L3Energy";
import { serialize } from "./pipeline/serialize";
import { L3Transform } from "./pipeline/types";

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleExport = () => {
    const json = serialize(state.l3State);
    navigator.clipboard.writeText(json);
    alert("Copied to clipboard!");
  };

  const activeState = 
    state.activeLayer === "l1" ? state.l1State :
    state.activeLayer === "l2" ? state.l2State :
    state.l3State;

  const offsetTransforms = state.pipeline.layers.l3.filter(t => t.type === "set_channel_offset") as Extract<L3Transform, { type: "set_channel_offset" }>[];
  const isOffset = offsetTransforms.length > 0 ? offsetTransforms[offsetTransforms.length - 1].enabled : false;

  return (
    <div className="fixed inset-0 bg-zinc-950 text-white flex flex-col font-sans overflow-hidden">
      <LayerStrip
        activeLayer={state.activeLayer}
        onSelect={(layer) => dispatch({ type: "SET_ACTIVE_LAYER", layer })}
        l1Configured={state.pipeline.layers.l1.length > 0}
        l2Configured={state.pipeline.layers.l2.length > 0}
        l3Configured={state.pipeline.layers.l3.length > 0}
      />

      <div className="flex-1 flex flex-col relative overflow-hidden">
        <div className="flex-1 relative" ref={containerRef}>
          {dimensions.width > 0 && (
            <DotGrid
              state={activeState}
              activeLayer={state.activeLayer}
              width={dimensions.width}
              height={dimensions.height}
              isOffset={isOffset}
              onL3PointMove={(channel, step, curv, val) => {
                dispatch({
                  type: "ADD_L3_TRANSFORM",
                  transform: { type: "set_texture_point", channel: channel as 0|1|2|3, step, curv, val }
                });
              }}
              onL3PointReset={(channel, step) => {
                dispatch({
                  type: "ADD_L3_TRANSFORM",
                  transform: { type: "set_texture_point", channel: channel as 0|1|2|3, step, curv: 1, val: 0 }
                });
              }}
              onL2PhaseMove={(channel, degrees) => {
                dispatch({
                  type: "ADD_L2_TRANSFORM",
                  transform: { type: "set_phase", channel: channel as 0|1|2|3, degrees }
                });
              }}
            />
          )}
        </div>

        <div className="shrink-0 z-10 max-h-[50vh] overflow-y-auto">
          {state.activeLayer === "l1" && (
            <L1Lattice
              state={state.l1State}
              transforms={state.pipeline.layers.l1}
              onTransform={(t) => dispatch({ type: "ADD_L1_TRANSFORM", transform: t })}
            />
          )}
          {state.activeLayer === "l2" && (
            <L2Constellation
              state={state.l2State}
              onTransform={(t) => dispatch({ type: "ADD_L2_TRANSFORM", transform: t })}
            />
          )}
          {state.activeLayer === "l3" && (
            <L3Energy
              state={state.l3State}
              transforms={state.pipeline.layers.l3}
              onTransform={(t) => dispatch({ type: "ADD_L3_TRANSFORM", transform: t })}
            />
          )}
        </div>
      </div>

      <JsonDrawer
        isOpen={jsonOpen}
        onClose={() => setJsonOpen(false)}
        json={serialize(state.l3State)}
      />

      <BottomBar
        onToggleJson={() => setJsonOpen(!jsonOpen)}
        onExport={handleExport}
        onUndo={() => dispatch({ type: "UNDO", layer: state.activeLayer })}
        canUndo={state.pipeline.layers[state.activeLayer].length > 0}
      />
    </div>
  );
}
