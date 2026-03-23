import { PresetState, L1Transform, StepState } from "./types";
import { DEFAULT_PRESET, DEFAULT_STEP, clamp } from "./defaults";

export function computeL1(transforms: L1Transform[]): PresetState {
  // Start with defaults
  let ratios = [4, 4, 4, 4];
  let baseLoop = 4;
  let densMap: "proportional" | "inverse" | "flat" = "proportional";
  let lengMap: "fill" | "short" | "long" = "fill";
  let velos = [127, 127, 127, 127];

  // Apply transforms (last wins)
  for (const t of transforms) {
    if (t.type === "set_ratios") ratios = [...t.ratios];
    else if (t.type === "set_base_loop") baseLoop = t.steps;
    else if (t.type === "set_dens_map") densMap = t.mode;
    else if (t.type === "set_leng_map") lengMap = t.mode;
    else if (t.type === "set_velo") velos[t.channel] = t.velo;
  }

  const maxRatio = Math.max(...ratios);
  const minRatio = Math.min(...ratios);
  const range = Math.max(1, maxRatio - minRatio);

  const channels = ratios.map((ratio, c) => {
    const loopLength = clamp(Math.round((baseLoop * ratio) / 4), 1, 16);
    
    // DENS baseline fraction
    let fraction = 0.25;
    if (densMap === "proportional") {
      fraction = ratio / maxRatio;
    } else if (densMap === "inverse") {
      fraction = 1 - (ratio - minRatio) / range;
    }

    // LENG per channel
    let leng = 1;
    if (lengMap === "fill") {
      leng = Math.max(1, Math.floor(baseLoop / loopLength));
    } else if (lengMap === "long") {
      leng = baseLoop;
    }

    const steps: StepState[] = Array.from({ length: loopLength }).map(() => {
      const actualDens = clamp(Math.round(fraction * leng * 2), 1, Math.min(leng * 2, 64));
      return {
        ...DEFAULT_STEP,
        leng,
        dens: actualDens,
      };
    });

    return {
      steps,
      velo: velos[c],
      sh16: 0,
    };
  });

  return { channels };
}
