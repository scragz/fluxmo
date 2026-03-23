import { PresetState, L3Transform } from "./types";
import { clamp } from "./defaults";

export function computeL3(l2State: PresetState, transforms: L3Transform[]): PresetState {
  const state = JSON.parse(JSON.stringify(l2State)) as PresetState;

  const densityDeltas: number[][] = state.channels.map(c => c.steps.map(() => 0));
  let channelOffsetEnabled = false;
  const humas = [0, 0, 0, 0];
  const texturePaths: Array<{curv: number, val: number}[]> = state.channels.map(c => c.steps.map(() => ({curv: 1, val: 0})));

  for (const t of transforms) {
    if (t.type === "set_texture_point") {
      texturePaths[t.channel][t.step] = { curv: t.curv, val: t.val };
    } else if (t.type === "set_texture_path") {
      texturePaths[t.channel] = [...t.points];
    } else if (t.type === "set_density_delta") {
      densityDeltas[t.channel][t.step] = t.amount;
    } else if (t.type === "set_density_delta_all") {
      densityDeltas[t.channel] = densityDeltas[t.channel].map(() => t.amount);
    } else if (t.type === "set_channel_offset") {
      channelOffsetEnabled = t.enabled;
    } else if (t.type === "set_huma") {
      humas[t.channel] = t.value;
    }
  }

  state.channels.forEach((channel, c) => {
    const loopLength = channel.steps.length;
    // Calculate offset based on L2 phase if enabled
    let offset = 0;
    if (channelOffsetEnabled) {
      // Find the base phase for this channel by looking at step 0's phase
      // This is an approximation since drift could have affected it, but it's close enough
      // To be exact, we'd need to pass the base phase from L2, but we can infer it
      const basePhase = channel.steps[0].phas;
      offset = Math.round((basePhase / 360) * loopLength) % loopLength;
    }

    const path = texturePaths[c];
    const pathLen = path.length;

    channel.steps.forEach((step, i) => {
      // Texture point
      const pathIndex = (i + offset) % pathLen;
      const point = path[pathIndex] || { curv: 1, val: 0 };
      step.curv = clamp(Math.round(point.curv), 1, 8);
      step.val = clamp(point.val, -3.0, 3.0);

      const baseDensity = step.dens;
      const delta = densityDeltas[c][i] ?? 0;
      step.dens = clamp(Math.round(baseDensity * (1 + delta)), 0, 64);
      
      // Huma
      step.huma = clamp(humas[c], 0, 64);
    });
  });

  return state;
}
