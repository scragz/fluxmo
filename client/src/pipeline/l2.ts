import { PresetState, L2Transform } from "./types";
import { getL2PhaseSettings } from "./rhythm";

export function computeL2(l1State: PresetState, transforms: L2Transform[]): PresetState {
  // Start with L1 state
  const state = JSON.parse(JSON.stringify(l1State)) as PresetState;
  const { phases, spreads } = getL2PhaseSettings(transforms);

  state.channels.forEach((channel, c) => {
    channel.steps.forEach((step, i) => {
      const phase = phases[c] + i * spreads[c];
      step.phas = Math.max(0, Math.min(360, Math.round(phase)));
    });
  });

  return state;
}
