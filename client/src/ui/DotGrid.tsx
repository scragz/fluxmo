import React, { useEffect, useRef, useState } from "react";
import { getDensityDeltaMatrix, getPhaseCrunchEnabled, getStepTimelines } from "../pipeline/rhythm";
import { L1Transform, L2Transform, L3Transform, PresetState } from "../pipeline/types";
import { LayerId } from "../store";

interface Props {
  state: PresetState;
  activeLayer: LayerId;
  width: number;
  height: number;
  l1Transforms: L1Transform[];
  l2Transforms: L2Transform[];
  l3BaseState: PresetState;
  l3Transforms: L3Transform[];
  onL1RatioChange?: (channel: number, delta: number) => void;
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

type LatticeButtonLayout = {
  channel: number;
  delta: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const COLORS = ["#f97316", "#22c55e", "#3b82f6", "#ef4444"];

export function DotGrid({
  state,
  activeLayer,
  width,
  height,
  l1Transforms,
  l2Transforms,
  l3BaseState,
  l3Transforms,
  onL1RatioChange,
  onL3DensityChange,
  onL2PhaseMove,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laneLayoutsRef = useRef<LaneLayout[]>([]);
  const ringLayoutsRef = useRef<RingLayout[]>([]);
  const latticeButtonsRef = useRef<LatticeButtonLayout[]>([]);
  const [draggingL3, setDraggingL3] = useState<{ channel: number; step: number } | null>(null);
  const [draggingL2, setDraggingL2] = useState<number | null>(null);

  const densityDeltas = getDensityDeltaMatrix(l3Transforms, l3BaseState.channels);
  const crunchEnabled = getPhaseCrunchEnabled(l2Transforms);
  const ratios = getRatios(l1Transforms);

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
    latticeButtonsRef.current = [];

    if (activeLayer === "l2") {
      drawPhaseRings(ctx, state, width, height, crunchEnabled, ringLayoutsRef.current);
      return;
    }

    if (activeLayer === "l3") {
      drawEnergyGrid(ctx, state, width, height, densityDeltas, laneLayoutsRef.current);
      return;
    }

    drawLatticeGrid(ctx, state, width, height, ratios, laneLayoutsRef.current, latticeButtonsRef.current);
  }, [activeLayer, crunchEnabled, densityDeltas, height, ratios, state, width]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (activeLayer === "l1" && onL1RatioChange) {
      const button = latticeButtonsRef.current.find(
        (candidate) =>
          x >= candidate.x &&
          x <= candidate.x + candidate.width &&
          y >= candidate.y &&
          y <= candidate.y + candidate.height,
      );
      if (button) {
        onL1RatioChange(button.channel, button.delta);
      }
      return;
    }

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
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
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
  ratios: number[],
  layouts: LaneLayout[],
  buttons: LatticeButtonLayout[],
) {
  const paddingX = width * 0.08;
  const paddingY = height * 0.12;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const laneGap = Math.max(12, usableHeight * 0.04);
  const laneHeight = (usableHeight - laneGap * (state.channels.length - 1)) / Math.max(state.channels.length, 1);
  const controlRailWidth = Math.min(92, usableWidth * 0.2);
  const timelineWidth = usableWidth - controlRailWidth - 14;

  state.channels.forEach((channel, channelIndex) => {
    const { barLength, steps } = getStepTimelines(channel);
    const laneY = paddingY + channelIndex * (laneHeight + laneGap);
    const laneMid = laneY + laneHeight / 2;
    const timelineX = paddingX;
    const controlX = timelineX + timelineWidth + 14;

    ctx.fillStyle = "#09090b";
    ctx.fillRect(paddingX, laneY, usableWidth, laneHeight);
    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 1;
    ctx.strokeRect(paddingX, laneY, usableWidth, laneHeight);

    ctx.fillStyle = COLORS[channelIndex];
    ctx.fillText(`CH${channelIndex + 1}`, paddingX - 40, laneMid);

    for (let unit = 0; unit <= barLength; unit++) {
      const guideX = timelineX + (unit / barLength) * timelineWidth;
      ctx.beginPath();
      ctx.moveTo(guideX, laneY);
      ctx.lineTo(guideX, laneY + laneHeight);
      ctx.strokeStyle = unit === 0 || unit === barLength ? "#3f3f46" : "#18181b";
      ctx.lineWidth = unit % 4 === 0 ? 1.2 : 1;
      ctx.stroke();
    }

    const stepRects = steps.map((step) => {
      const stepX = timelineX + (step.start / barLength) * timelineWidth;
      const stepWidth = (step.length / barLength) * timelineWidth;

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
        const triggerX = timelineX + (trigger.position / barLength) * timelineWidth;
        ctx.beginPath();
        ctx.arc(triggerX, laneMid, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[channelIndex];
        ctx.fill();
      });
    });

    const buttonSize = Math.min(24, laneHeight - 18);
    const buttonY = laneMid - buttonSize / 2;
    const minusX = controlX;
    const badgeX = minusX + buttonSize + 8;
    const badgeWidth = 28;
    const plusX = badgeX + badgeWidth + 8;

    drawCanvasButton(ctx, minusX, buttonY, buttonSize, buttonSize, "-");
    drawCanvasButton(ctx, plusX, buttonY, buttonSize, buttonSize, "+");
    buttons.push({ channel: channelIndex, delta: -1, x: minusX, y: buttonY, width: buttonSize, height: buttonSize });
    buttons.push({ channel: channelIndex, delta: 1, x: plusX, y: buttonY, width: buttonSize, height: buttonSize });

    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.roundRect(badgeX, buttonY, badgeWidth, buttonSize, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS[channelIndex];
    ctx.fillText(String(ratios[channelIndex] ?? 4), badgeX + 9, laneMid);

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
    const trackTop = laneY + laneHeight * 0.14;
    const trackBottom = laneY + laneHeight * 0.86;
    const trackHeight = trackBottom - trackTop;

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
      const cellX = stepX + stepWidth / 2;
      const trackX = cellX - Math.min(7, stepWidth * 0.2);
      const dotX = cellX + Math.min(8, stepWidth * 0.22);
      const handleY = trackTop + (1 - (delta + 1) / 2) * trackHeight;
      const dotCount = Math.max(1, Math.min(step.dens, 12));

      ctx.fillStyle = "#0b1220";
      ctx.globalAlpha = 0.82;
      ctx.fillRect(stepX + 1, laneY + 2, Math.max(stepWidth - 2, 2), laneHeight - 4);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.strokeRect(stepX + 1, laneY + 2, Math.max(stepWidth - 2, 2), laneHeight - 4);

      ctx.beginPath();
      ctx.moveTo(trackX, trackTop);
      ctx.lineTo(trackX, trackBottom);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.stroke();

      const midY = trackTop + trackHeight / 2;
      ctx.beginPath();
      ctx.moveTo(trackX - 5, midY);
      ctx.lineTo(trackX + 5, midY);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(trackX, midY);
      ctx.lineTo(trackX, handleY);
      ctx.strokeStyle = COLORS[channelIndex];
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      for (let dot = 0; dot < dotCount; dot++) {
        const dotY = trackTop + (dot / Math.max(dotCount - 1, 1)) * trackHeight;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 1.9, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[channelIndex];
        ctx.globalAlpha = 0.9;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      drawDragHandle(ctx, trackX, handleY, COLORS[channelIndex], 12, 8);

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
    const { barLength, steps } = getStepTimelines(channel, { wrapPositions: true });
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
    const outerHandleX = cx + Math.cos(handleAngle) * (radius + 16);
    const outerHandleY = cy + Math.sin(handleAngle) * (radius + 16);
    ctx.beginPath();
    ctx.moveTo(handleX, handleY);
    ctx.lineTo(outerHandleX, outerHandleY);
    ctx.strokeStyle = COLORS[channelIndex];
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawDragHandle(ctx, outerHandleX, outerHandleY, COLORS[channelIndex], 16, 10);
    ctx.beginPath();
    ctx.arc(handleX, handleY, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#09090b";
    ctx.fill();
    ctx.strokeStyle = COLORS[channelIndex];
    ctx.lineWidth = 2;
    ctx.stroke();

    const dropped = steps.reduce((total, step) => total + step.droppedTriggers, 0);
    if (dropped > 0) {
      ctx.fillStyle = "#a1a1aa";
      ctx.fillText(`-${dropped}`, cx + radius + 14, cy);
    }
  });
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

function getRatios(transforms: L1Transform[]): number[] {
  return transforms.reduce<number[]>((current, transform) => {
    if (transform.type === "set_ratios") return [...transform.ratios];
    return current;
  }, [4, 4, 4, 4]);
}

function drawCanvasButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: "+" | "-",
) {
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 7, y + height / 2);
  ctx.lineTo(x + width - 7, y + height / 2);
  ctx.strokeStyle = "#e4e4e7";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  if (label === "+") {
    ctx.beginPath();
    ctx.moveTo(x + width / 2, y + 7);
    ctx.lineTo(x + width / 2, y + height - 7);
    ctx.stroke();
  }
}

function drawDragHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  width: number,
  height: number,
) {
  ctx.fillStyle = "#09090b";
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, Math.min(width, height) / 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 2, y - height / 2 + 2);
  ctx.lineTo(x - 2, y + height / 2 - 2);
  ctx.moveTo(x + 2, y - height / 2 + 2);
  ctx.lineTo(x + 2, y + height / 2 - 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
