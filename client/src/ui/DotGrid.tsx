import React, { useEffect, useRef, useState } from "react";
import { PresetState, L2Transform, L3Transform } from "../pipeline/types";
import { getDensityDeltaMatrix, getPhaseCrunchEnabled, getStepTimelines } from "../pipeline/rhythm";
import { LayerId } from "../store";

interface Props {
  state: PresetState;
  activeLayer: LayerId;
  width: number;
  height: number;
  l2Transforms: L2Transform[];
  l3BaseState: PresetState;
  l3Transforms: L3Transform[];
  onL3DensityChange?: (channel: number, step: number, amount: number) => void;
  onL2PhaseMove?: (channel: number, degrees: number) => void;
}

type LaneLayout = {
  channel: number;
  x: number;
  y: number;
  width: number;
  height: number;
  stepRects: Array<{ step: number; x: number; width: number }>;
};

type RingLayout = {
  channel: number;
  cx: number;
  cy: number;
  radius: number;
};

const COLORS = ["#f97316", "#22c55e", "#3b82f6", "#ef4444"];

export function DotGrid({
  state,
  activeLayer,
  width,
  height,
  l2Transforms,
  l3BaseState,
  l3Transforms,
  onL3DensityChange,
  onL2PhaseMove,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laneLayoutsRef = useRef<LaneLayout[]>([]);
  const ringLayoutsRef = useRef<RingLayout[]>([]);
  const [draggingL3, setDraggingL3] = useState<{ channel: number; step: number } | null>(null);
  const [draggingL2, setDraggingL2] = useState<number | null>(null);

  const densityDeltas = getDensityDeltaMatrix(l3Transforms, l3BaseState.channels);
  const crunchEnabled = getPhaseCrunchEnabled(l2Transforms);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = "middle";
    ctx.font = "11px monospace";

    laneLayoutsRef.current = [];
    ringLayoutsRef.current = [];

    if (activeLayer === "l2") {
      drawPhaseRings(ctx, state, width, height, crunchEnabled, ringLayoutsRef.current);
      return;
    }

    if (activeLayer === "l3") {
      drawEnergyGrid(ctx, state, width, height, densityDeltas, laneLayoutsRef.current);
      return;
    }

    drawLatticeGrid(ctx, state, width, height, laneLayoutsRef.current);
  }, [activeLayer, crunchEnabled, densityDeltas, height, state, width]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (activeLayer === "l3" && onL3DensityChange) {
      const lane = laneLayoutsRef.current.find(
        (candidate) =>
          x >= candidate.x &&
          x <= candidate.x + candidate.width &&
          y >= candidate.y &&
          y <= candidate.y + candidate.height,
      );
      if (!lane) return;

      const stepRect = findNearestStepRect(lane, x);
      if (!stepRect) return;

      setDraggingL3({ channel: lane.channel, step: stepRect.step });
      event.currentTarget.setPointerCapture(event.pointerId);
      onL3DensityChange(lane.channel, stepRect.step, densityAmountFromPointer(lane, y));
    }

    if (activeLayer === "l2" && onL2PhaseMove) {
      const ring = findClosestRing(ringLayoutsRef.current, x, y);
      if (!ring) return;

      setDraggingL2(ring.channel);
      event.currentTarget.setPointerCapture(event.pointerId);
      onL2PhaseMove(ring.channel, phaseFromRingPointer(ring, x, y));
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (draggingL3 && onL3DensityChange) {
      const lane = laneLayoutsRef.current.find((candidate) => candidate.channel === draggingL3.channel);
      if (!lane) return;
      onL3DensityChange(draggingL3.channel, draggingL3.step, densityAmountFromPointer(lane, y));
    }

    if (draggingL2 !== null && onL2PhaseMove) {
      const ring = ringLayoutsRef.current.find((candidate) => candidate.channel === draggingL2);
      if (!ring) return;
      onL2PhaseMove(draggingL2, phaseFromRingPointer(ring, x, y));
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingL3 || draggingL2 !== null) {
      setDraggingL3(null);
      setDraggingL2(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="block h-full w-full touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}

function drawLatticeGrid(
  ctx: CanvasRenderingContext2D,
  state: PresetState,
  width: number,
  height: number,
  layouts: LaneLayout[],
) {
  const paddingX = width * 0.08;
  const paddingY = height * 0.12;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const laneGap = Math.max(12, usableHeight * 0.04);
  const laneHeight = (usableHeight - laneGap * (state.channels.length - 1)) / Math.max(state.channels.length, 1);

  state.channels.forEach((channel, channelIndex) => {
    const { barLength, steps } = getStepTimelines(channel);
    const laneY = paddingY + channelIndex * (laneHeight + laneGap);
    const laneMid = laneY + laneHeight / 2;

    ctx.fillStyle = "#09090b";
    ctx.fillRect(paddingX, laneY, usableWidth, laneHeight);
    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 1;
    ctx.strokeRect(paddingX, laneY, usableWidth, laneHeight);

    ctx.fillStyle = COLORS[channelIndex];
    ctx.fillText(`CH${channelIndex + 1}`, paddingX - 40, laneMid);

    for (let unit = 0; unit <= barLength; unit++) {
      const guideX = paddingX + (unit / barLength) * usableWidth;
      ctx.beginPath();
      ctx.moveTo(guideX, laneY);
      ctx.lineTo(guideX, laneY + laneHeight);
      ctx.strokeStyle = unit === 0 || unit === barLength ? "#3f3f46" : "#18181b";
      ctx.lineWidth = unit % 4 === 0 ? 1.2 : 1;
      ctx.stroke();
    }

    const stepRects = steps.map((step) => {
      const stepX = paddingX + (step.start / barLength) * usableWidth;
      const stepWidth = (step.length / barLength) * usableWidth;

      ctx.fillStyle = COLORS[channelIndex];
      ctx.globalAlpha = 0.08;
      ctx.fillRect(stepX, laneY, Math.max(stepWidth, 1), laneHeight);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = "#27272a";
      ctx.strokeRect(stepX, laneY, Math.max(stepWidth, 1), laneHeight);

      return { step: step.index, x: stepX, width: stepWidth };
    });

    steps.forEach((step) => {
      step.triggers.forEach((trigger) => {
        const triggerX = paddingX + (trigger.position / barLength) * usableWidth;
        ctx.beginPath();
        ctx.arc(triggerX, laneMid, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[channelIndex];
        ctx.fill();
      });
    });

    layouts.push({
      channel: channelIndex,
      x: paddingX,
      y: laneY,
      width: usableWidth,
      height: laneHeight,
      stepRects,
    });
  });
}

function drawEnergyGrid(
  ctx: CanvasRenderingContext2D,
  state: PresetState,
  width: number,
  height: number,
  densityDeltas: number[][],
  layouts: LaneLayout[],
) {
  const paddingX = width * 0.08;
  const paddingY = height * 0.1;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const laneGap = Math.max(18, usableHeight * 0.05);
  const laneHeight = (usableHeight - laneGap * (state.channels.length - 1)) / Math.max(state.channels.length, 1);

  state.channels.forEach((channel, channelIndex) => {
    const { barLength, steps } = getStepTimelines(channel);
    const laneY = paddingY + channelIndex * (laneHeight + laneGap);
    const baselineY = laneY + laneHeight * 0.58;

    ctx.fillStyle = "#050816";
    ctx.fillRect(paddingX, laneY, usableWidth, laneHeight);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1;
    ctx.strokeRect(paddingX, laneY, usableWidth, laneHeight);

    ctx.fillStyle = COLORS[channelIndex];
    ctx.fillText(`CH${channelIndex + 1}`, paddingX - 40, laneY + laneHeight / 2);

    const stepRects = steps.map((step) => {
      const stepX = paddingX + (step.start / barLength) * usableWidth;
      const stepWidth = (step.length / barLength) * usableWidth;
      const delta = densityDeltas[channelIndex]?.[step.index] ?? 0;
      const deltaHeight = Math.abs(delta) * laneHeight * 0.3;
      const blockX = stepX + 2;
      const blockWidth = Math.max(10, stepWidth - 4);

      ctx.fillStyle = "#0b1220";
      ctx.fillRect(blockX, laneY + 2, blockWidth, laneHeight - 4);
      ctx.strokeStyle = COLORS[channelIndex];
      ctx.globalAlpha = 0.18;
      ctx.strokeRect(blockX, laneY + 2, blockWidth, laneHeight - 4);
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.moveTo(blockX + 6, baselineY);
      ctx.lineTo(blockX + blockWidth - 6, baselineY);
      ctx.strokeStyle = "#1f2937";
      ctx.stroke();

      if (deltaHeight > 0) {
        ctx.fillStyle = COLORS[channelIndex];
        ctx.globalAlpha = 0.72;
        ctx.fillRect(
          blockX + blockWidth * 0.18,
          delta >= 0 ? baselineY - deltaHeight : baselineY,
          Math.max(8, blockWidth * 0.2),
          deltaHeight,
        );
        ctx.globalAlpha = 1;
      }

      const pipCount = Math.min(step.dens, 12);
      const pipRows = 2;
      const pipCols = Math.max(1, Math.ceil(pipCount / pipRows));
      const pipSpacingX = Math.max(6, Math.min(10, blockWidth / Math.max(2, pipCols + 1)));
      const pipSpacingY = 9;
      const pipStartX = blockX + blockWidth * 0.48;
      const pipStartY = laneY + laneHeight * 0.25;

      for (let pip = 0; pip < pipCount; pip++) {
        const col = Math.floor(pip / pipRows);
        const row = pip % pipRows;
        ctx.beginPath();
        ctx.arc(
          pipStartX + col * pipSpacingX,
          pipStartY + row * pipSpacingY,
          2.4,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = COLORS[channelIndex];
        ctx.globalAlpha = 0.95 - row * 0.18;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`${step.dens}`, blockX + blockWidth - 14, laneY + 12);

      return { step: step.index, x: stepX, width: stepWidth };
    });

    layouts.push({
      channel: channelIndex,
      x: paddingX,
      y: laneY,
      width: usableWidth,
      height: laneHeight,
      stepRects,
    });
  });
}

function drawPhaseRings(
  ctx: CanvasRenderingContext2D,
  state: PresetState,
  width: number,
  height: number,
  crunchEnabled: boolean,
  layouts: RingLayout[],
) {
  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) * 0.16;
  const ringGap = Math.min(width, height) * 0.095;

  state.channels.forEach((channel, channelIndex) => {
    const { barLength, steps } = getStepTimelines(channel);
    const radius = baseRadius + channelIndex * ringGap;
    layouts.push({ channel: channelIndex, cx, cy, radius });

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS[channelIndex];
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.moveTo(cx, cy - radius - 12);
    ctx.lineTo(cx, cy - radius + 12);
    ctx.strokeStyle = "#52525b";
    ctx.lineWidth = 1;
    ctx.stroke();

    steps.forEach((step) => {
      step.triggers.forEach((trigger) => {
        const angle = (trigger.position / barLength) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[channelIndex];
        ctx.fill();
      });
    });

    const phase = channel.steps[0]?.phas || 0;
    const handleAngle = (phase / 360) * Math.PI * 2 - Math.PI / 2;
    const handleX = cx + Math.cos(handleAngle) * radius;
    const handleY = cy + Math.sin(handleAngle) * radius;
    ctx.beginPath();
    ctx.arc(handleX, handleY, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#09090b";
    ctx.fill();
    ctx.strokeStyle = COLORS[channelIndex];
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = COLORS[channelIndex];
    ctx.fillText(`CH${channelIndex + 1}`, cx - 18, cy - radius - 18);

    const dropped = steps.reduce((total, step) => total + step.droppedTriggers, 0);
    if (dropped > 0) {
      ctx.fillStyle = "#a1a1aa";
      ctx.fillText(`-${dropped}`, cx + radius + 14, cy);
    }
  });

  if (crunchEnabled) {
    ctx.fillStyle = "#d4d4d8";
    ctx.fillText("COMP LINK", cx - 34, cy);
  }
}

function findClosestRing(layouts: RingLayout[], x: number, y: number): RingLayout | null {
  let closest: RingLayout | null = null;
  let closestDistance = Infinity;

  for (const layout of layouts) {
    const distance = Math.abs(Math.hypot(x - layout.cx, y - layout.cy) - layout.radius);
    if (distance < 22 && distance < closestDistance) {
      closestDistance = distance;
      closest = layout;
    }
  }

  return closest;
}

function findNearestStepRect(lane: LaneLayout, x: number) {
  return lane.stepRects.reduce<{ step: number; x: number; width: number } | null>((closest, rect) => {
    if (x >= rect.x && x <= rect.x + rect.width) return rect;
    if (!closest) return rect;

    const closestCenter = closest.x + closest.width / 2;
    const rectCenter = rect.x + rect.width / 2;
    return Math.abs(rectCenter - x) < Math.abs(closestCenter - x) ? rect : closest;
  }, null);
}

function densityAmountFromPointer(lane: LaneLayout, y: number): number {
  const normalized = 1 - (y - lane.y) / lane.height;
  return clamp(normalized * 2 - 1, -1, 1);
}

function phaseFromRingPointer(ring: RingLayout, x: number, y: number): number {
  let angle = Math.atan2(y - ring.cy, x - ring.cx) * (180 / Math.PI);
  angle += 90;
  if (angle < 0) angle += 360;
  return Math.round(angle);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
