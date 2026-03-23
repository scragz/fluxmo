import { PresetState, L2Transform } from "./types";

export function computeL2(l1State: PresetState, transforms: L2Transform[]): PresetState {
  // Start with L1 state
  const state = JSON.parse(JSON.stringify(l1State)) as PresetState;

  let phases = [0, 0, 0, 0];
  let drifts = [0, 0, 0, 0];

  for (const t of transforms) {
    if (t.type === "set_phase") {
      phases[t.channel] = t.degrees;
    } else if (t.type === "set_drift") {
      drifts[t.channel] = t.degrees_per_step;
    } else if (t.type === "set_phase_all") {
      if (t.mode === "unison") {
        phases = [0, 0, 0, 0];
      } else if (t.mode === "spread") {
        phases = [0, 90, 180, 270];
      } else if (t.mode === "golden") {
        phases = [0, 137.5, 275, 52.5];
      }
    }
  }

  state.channels.forEach((channel, c) => {
    channel.steps.forEach((step, i) => {
      step.phas = Math.round(phases[c] + i * drifts[c]) % 360;
      if (step.phas < 0) step.phas += 360;
    });
  });

  return state;
}
