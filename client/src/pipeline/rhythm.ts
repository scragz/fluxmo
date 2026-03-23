import { ChannelState, L2Transform, L3Transform } from "./types";

export type TriggerPoint = {
  stepIndex: number;
  triggerIndex: number;
  position: number;
  localPosition: number;
};

export type StepTimeline = {
  index: number;
  start: number;
  end: number;
  center: number;
  length: number;
  dens: number;
  phas: number;
  comp: number;
  triggers: TriggerPoint[];
  droppedTriggers: number;
};

export function getBarLength(channel: ChannelState): number {
  return Math.max(
    1,
    channel.steps.reduce((total, step) => total + Math.max(step.leng, 1), 0),
  );
}

export function getStepTimelines(channel: ChannelState): { barLength: number; steps: StepTimeline[] } {
  const barLength = getBarLength(channel);
  let cursor = 0;

  const steps = channel.steps.map((step, index) => {
    const length = Math.max(step.leng, 1);
    const start = cursor;
    const end = start + length;
    cursor = end;

    const triggerCount = Math.max(0, Math.round(step.dens));
    const phaseOffset = (Math.max(0, step.phas) / 360) * barLength;
    const compression = Math.max(0, step.comp) / 99;
    const spacing = triggerCount > 0 ? length / triggerCount : 0;

    const triggers: TriggerPoint[] = [];
    let droppedTriggers = 0;

    for (let triggerIndex = 0; triggerIndex < triggerCount; triggerIndex++) {
      const localPosition = triggerIndex * spacing;
      const basePosition = start + localPosition;
      const position =
        compression > 0
          ? phaseOffset + basePosition * (1 - compression)
          : start + phaseOffset + localPosition;

      if (position <= barLength) {
        triggers.push({ stepIndex: index, triggerIndex, position, localPosition });
      } else {
        droppedTriggers += 1;
      }
    }

    return {
      index,
      start,
      end,
      center: start + length / 2,
      length,
      dens: step.dens,
      phas: step.phas,
      comp: step.comp,
      triggers,
      droppedTriggers,
    };
  });

  return { barLength, steps };
}

export function getPhaseCrunchEnabled(transforms: L2Transform[]): boolean {
  const crunchTransforms = transforms.filter(
    (transform) => transform.type === "set_phase_crunch",
  ) as Extract<L2Transform, { type: "set_phase_crunch" }>[];

  if (crunchTransforms.length === 0) return false;
  return crunchTransforms[crunchTransforms.length - 1].enabled;
}

export function getDensityDeltaMatrix(
  transforms: L3Transform[],
  channels: ChannelState[],
): number[][] {
  const deltas = channels.map((channel) => channel.steps.map(() => 0));

  for (const transform of transforms) {
    if (transform.type === "set_density_delta") {
      if (deltas[transform.channel]?.[transform.step] !== undefined) {
        deltas[transform.channel][transform.step] = transform.amount;
      }
    } else if (transform.type === "set_density_delta_all") {
      deltas[transform.channel] = deltas[transform.channel].map(() => transform.amount);
    }
  }

  return deltas;
}
