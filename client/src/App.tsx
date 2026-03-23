import React, { useReducer, useState, useEffect, useRef } from "react";
import { SlidersHorizontal, X } from "lucide-react";
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
  const [controlsOpen, setControlsOpen] = useState(true);
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
  const baseLoopTransforms = state.pipeline.layers.l1.filter(t => t.type === "set_base_loop") as Extract<typeof state.pipeline.layers.l1[number], { type: "set_base_loop" }>[];
  const densMapTransforms = state.pipeline.layers.l1.filter(t => t.type === "set_dens_map") as Extract<typeof state.pipeline.layers.l1[number], { type: "set_dens_map" }>[];
  const l1BaseLoop = baseLoopTransforms.length > 0 ? baseLoopTransforms[baseLoopTransforms.length - 1].steps : 4;
  const l1DensMap = densMapTransforms.length > 0 ? densMapTransforms[densMapTransforms.length - 1].mode : "proportional";

  const controls = (
    <>
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
    </>
  );

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
              l1BaseLoop={l1BaseLoop}
              l1DensMap={l1DensMap}
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

          <div className="pointer-events-none absolute inset-x-3 bottom-3 top-3 z-20 flex items-end justify-end sm:inset-y-4 sm:right-4 sm:left-auto sm:items-start">
            {!controlsOpen && (
              <button
                onClick={() => setControlsOpen(true)}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-zinc-950/78 px-4 py-2 text-[11px] font-mono tracking-[0.24em] text-zinc-100 uppercase shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:border-white/20 hover:bg-zinc-900/82"
              >
                <SlidersHorizontal size={14} />
                Controls
              </button>
            )}

            {controlsOpen && (
              <div className="pointer-events-auto w-full max-w-[26rem] overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950/66 shadow-[0_30px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-zinc-400">Live Controls</p>
                    <p className="mt-1 text-xs text-zinc-500">Tune the active layer without leaving the canvas.</p>
                  </div>
                  <button
                    onClick={() => setControlsOpen(false)}
                    className="rounded-full border border-white/10 p-2 text-zinc-400 transition hover:border-white/20 hover:text-white"
                    aria-label="Hide controls"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="max-h-[min(32rem,calc(100vh-12rem))] overflow-y-auto">
                  {controls}
                </div>
              </div>
            )}
          </div>
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
