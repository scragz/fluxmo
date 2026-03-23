import React, { useEffect, useRef, useState } from "react";
import { PresetState } from "../pipeline/types";
import { LayerId } from "../store";

interface Props {
  state: PresetState;
  activeLayer: LayerId;
  width: number;
  height: number;
  isOffset?: boolean;
  l1BaseLoop?: number;
  l1DensMap?: "proportional" | "inverse" | "flat";
  onL3PointMove?: (channel: number, step: number, curv: number, val: number) => void;
  onL3PointReset?: (channel: number, step: number) => void;
  onL2PhaseMove?: (channel: number, degrees: number) => void;
}

const COLORS = ["#f97316", "#22c55e", "#3b82f6", "#ef4444"]; // orange, green, blue, red

type DotTarget = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  channel: number;
  step: number;
};

export function DotGrid({
  state,
  activeLayer,
  width,
  height,
  isOffset,
  l1BaseLoop,
  l1DensMap,
  onL3PointMove,
  onL3PointReset,
  onL2PhaseMove,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  
  // Store current positions for interpolation
  const currentDotsRef = useRef<DotTarget[][]>([]);
  
  // Interaction state
  const [draggingL3, setDraggingL3] = useState<{channel: number, step: number} | null>(null);
  const [draggingL2, setDraggingL2] = useState<number | null>(null); // channel index
  const pointerDownTimeRef = useRef<number>(0);
  const longPressTimeoutRef = useRef<number | null>(null);

  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Calculate targets based on active layer
    const targets: DotTarget[][] = state.channels.map((channel, c) => {
      const loopLength = channel.steps.length;
      return channel.steps.map((step, i) => {
        let x = 0, y = 0, radius = 4, opacity = 1;

        if (activeLayer === "l1") {
          const paddingX = width * 0.08;
          const paddingY = height * 0.14;
          const usableWidth = width - paddingX * 2;
          const usableHeight = height - paddingY * 2;
          const laneHeight = usableHeight / Math.max(state.channels.length, 1);
          const stepWidth = usableWidth / Math.max(loopLength, 1);
          const densityFraction = step.dens / Math.max(step.leng * 2, 1);
          const absoluteDensity = Math.min(step.dens / 16, 1);
          const densMapBias =
            l1DensMap === "flat" ? 0.8 :
            l1DensMap === "inverse" ? 0.95 :
            1.1;

          x = paddingX + stepWidth * (i + 0.5);
          y = paddingY + laneHeight * (c + 0.5);

          radius = 4 + step.leng * 0.85 + absoluteDensity * 8 * densMapBias;
          opacity = Math.min(0.98, 0.24 + densityFraction * 0.4 + absoluteDensity * 0.42);

        } else if (activeLayer === "l2") {
          // Radial arrangement
          const cx = width / 2;
          const cy = height / 2;
          const maxRadius = Math.min(width, height) * 0.4;
          
          // Concentric circles per channel
          const ringRadius = maxRadius * (0.4 + 0.2 * c);
          
          const angle = (step.phas - 90) * (Math.PI / 180);
          x = cx + Math.cos(angle) * ringRadius;
          y = cy + Math.sin(angle) * ringRadius;
          
          radius = 4;
          opacity = 0.8;

        } else if (activeLayer === "l3") {
          // Scatter plot
          const paddingX = width * 0.1;
          const paddingY = height * 0.1;
          const usableWidth = width - paddingX * 2;
          const usableHeight = height - paddingY * 2;

          // X: CURV (1-8)
          let xBase = paddingX + ((step.curv - 1) / 7) * usableWidth;
          if (isOffset) {
            // Offset channels slightly on X axis to avoid overlap
            const offsetAmount = (usableWidth / 8) * 0.2; // 20% of a CURV unit
            xBase += (c - 1.5) * offsetAmount;
          }
          x = xBase;
          
          // Y: VAL (-3 to 3) -> map to height (inverted so + is up)
          const valNorm = (step.val + 3) / 6; // 0 to 1
          y = paddingY + (1 - valNorm) * usableHeight;
          
          // Size by busyness
          radius = 2 + (step.dens / (step.leng * 2)) * 8;
          opacity = 0.9;
        }

        return { x, y, radius, opacity, channel: c, step: i };
      });
    });

    // Initialize current dots if empty or size changed
    if (currentDotsRef.current.length !== targets.length) {
      currentDotsRef.current = targets.map(ch => ch.map(t => ({ ...t })));
    } else {
      targets.forEach((ch, c) => {
        if (currentDotsRef.current[c].length !== ch.length) {
          currentDotsRef.current[c] = ch.map(t => ({ ...t }));
        }
      });
    }

    const render = (time: number) => {
      const now = performance.now();
      const dt = Math.max(0, Math.min((now - lastTimeRef.current) / 1000, 0.1));
      lastTimeRef.current = now;

      ctx.clearRect(0, 0, width, height);

      // Draw L3 grid if active
      if (activeLayer === "l3") {
        ctx.strokeStyle = "#27272a"; // zinc-800
        ctx.lineWidth = 1;
        
        // Center line (VAL = 0)
        ctx.beginPath();
        ctx.moveTo(width * 0.1, height / 2);
        ctx.lineTo(width * 0.9, height / 2);
        ctx.stroke();

        // CURV lines
        for (let i = 0; i < 8; i++) {
          const x = width * 0.1 + (i / 7) * (width * 0.8);
          ctx.beginPath();
          ctx.moveTo(x, height * 0.1);
          ctx.lineTo(x, height * 0.9);
          ctx.stroke();
        }
      }

      if (activeLayer === "l1") {
        const paddingX = width * 0.08;
        const paddingY = height * 0.14;
        const usableWidth = width - paddingX * 2;
        const usableHeight = height - paddingY * 2;
        const laneHeight = usableHeight / Math.max(state.channels.length, 1);
        const guideCount = Math.max(1, Math.min(16, l1BaseLoop ?? 4));

        for (let g = 0; g <= guideCount; g++) {
          const guideX = paddingX + (g / guideCount) * usableWidth;
          ctx.beginPath();
          ctx.moveTo(guideX, paddingY);
          ctx.lineTo(guideX, paddingY + usableHeight);
          ctx.strokeStyle = g === 0 || g === guideCount ? "#3f3f46" : "#27272a";
          ctx.lineWidth = g === 0 || g === guideCount ? 1.5 : 1;
          ctx.stroke();
        }

        state.channels.forEach((channel, c) => {
          const avgDensity =
            channel.steps.reduce((sum, step) => sum + step.dens, 0) / Math.max(channel.steps.length, 1);
          const avgLength =
            channel.steps.reduce((sum, step) => sum + step.leng, 0) / Math.max(channel.steps.length, 1);
          const laneTop = paddingY + laneHeight * c + laneHeight * 0.18;
          const laneInnerHeight = laneHeight * 0.64;
          const densityAlpha = Math.min(0.22, avgDensity / 64);
          const lengthWidth = usableWidth * Math.min(1, avgLength / Math.max(1, l1BaseLoop ?? 4));

          ctx.fillStyle = COLORS[c];
          ctx.globalAlpha = densityAlpha;
          ctx.fillRect(paddingX, laneTop, lengthWidth, laneInnerHeight);
          ctx.globalAlpha = 1;

          ctx.strokeStyle = "#18181b";
          ctx.lineWidth = 1;
          ctx.strokeRect(paddingX, laneTop, usableWidth, laneInnerHeight);
        });
      }

      // Draw L2 rings if active
      if (activeLayer === "l2") {
        ctx.lineWidth = 1;
        const cx = width / 2;
        const cy = height / 2;
        const maxRadius = Math.min(width, height) * 0.4;
        
        for (let c = 0; c < 4; c++) {
          const ringRadius = maxRadius * (0.4 + 0.2 * c);
          ctx.beginPath();
          ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = COLORS[c];
          ctx.globalAlpha = 0.3;
          ctx.stroke();
          ctx.globalAlpha = 1.0;
          
          // Draw handle for step 0 (base phase)
          if (state.channels[c].steps.length > 0) {
            const basePhase = state.channels[c].steps[0].phas;
            const angle = (basePhase - 90) * (Math.PI / 180);
            const hx = cx + Math.cos(angle) * ringRadius;
            const hy = cy + Math.sin(angle) * ringRadius;
            
            ctx.beginPath();
            ctx.arc(hx, hy, 8, 0, Math.PI * 2);
            ctx.strokeStyle = COLORS[c];
            ctx.lineWidth = 2;
            ctx.fillStyle = "#09090b"; // zinc-950
            ctx.fill();
            ctx.stroke();
          }
        }
      }

      // Interpolate and draw dots
      const currentDots = currentDotsRef.current;
      const lerpFactor = 1 - Math.pow(0.01, dt); // smooth spring-like interpolation

      // Draw paths for L3
      if (activeLayer === "l3") {
        for (let c = 0; c < 4; c++) {
          const chDots = currentDots[c];
          if (chDots.length < 2) continue;
          
          ctx.beginPath();
          ctx.moveTo(chDots[0].x, chDots[0].y);
          for (let i = 1; i < chDots.length; i++) {
            ctx.lineTo(chDots[i].x, chDots[i].y);
          }
          ctx.strokeStyle = COLORS[c] + "40"; // 25% opacity
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      for (let c = 0; c < targets.length; c++) {
        for (let i = 0; i < targets[c].length; i++) {
          const target = targets[c][i];
          const current = currentDots[c][i];

          // If dragging this dot, snap it to target instantly
          if (draggingL3?.channel === c && draggingL3?.step === i) {
            current.x = target.x;
            current.y = target.y;
          } else {
            current.x += (target.x - current.x) * lerpFactor;
            current.y += (target.y - current.y) * lerpFactor;
          }
          
          current.radius += (target.radius - current.radius) * lerpFactor;
          current.opacity += (target.opacity - current.opacity) * lerpFactor;

          if (activeLayer === "l1") {
            ctx.beginPath();
            ctx.arc(current.x, current.y, current.radius * 1.65, 0, Math.PI * 2);
            ctx.fillStyle = COLORS[c];
            ctx.globalAlpha = current.opacity * 0.12;
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(current.x, current.y, current.radius, 0, Math.PI * 2);
          ctx.fillStyle = COLORS[c];
          ctx.globalAlpha = current.opacity;
          ctx.fill();

          if (activeLayer === "l1") {
            ctx.strokeStyle = "#fafafa";
            ctx.globalAlpha = current.opacity * 0.35;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1.0;

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [state, activeLayer, width, height, draggingL3]);

  // Interaction handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeLayer === "l3" && onL3PointMove) {
      // Find closest dot
      let closestDist = Infinity;
      let closestDot: {channel: number, step: number} | null = null;

      currentDotsRef.current.forEach((ch, c) => {
        ch.forEach((dot, s) => {
          const dist = Math.hypot(dot.x - x, dot.y - y);
          if (dist < 20 && dist < closestDist) {
            closestDist = dist;
            closestDot = { channel: c, step: s };
          }
        });
      });

      if (closestDot) {
        setDraggingL3(closestDot);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        
        // Start long press timer
        pointerDownTimeRef.current = Date.now();
        if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = window.setTimeout(() => {
          if (onL3PointReset && closestDot) {
            onL3PointReset(closestDot.channel, closestDot.step);
            setDraggingL3(null); // Stop dragging if reset
          }
        }, 500); // 500ms for long press
      }
    } else if (activeLayer === "l2" && onL2PhaseMove) {
      // Find closest handle
      const cx = width / 2;
      const cy = height / 2;
      const maxRadius = Math.min(width, height) * 0.4;
      
      let closestDist = Infinity;
      let closestChannel: number | null = null;

      for (let c = 0; c < 4; c++) {
        if (state.channels[c].steps.length === 0) continue;
        const ringRadius = maxRadius * (0.4 + 0.2 * c);
        const basePhase = state.channels[c].steps[0].phas;
        const angle = (basePhase - 90) * (Math.PI / 180);
        const hx = cx + Math.cos(angle) * ringRadius;
        const hy = cy + Math.sin(angle) * ringRadius;
        
        const dist = Math.hypot(hx - x, hy - y);
        if (dist < 24 && dist < closestDist) { // slightly larger hit area for handles
          closestDist = dist;
          closestChannel = c;
        }
      }

      if (closestChannel !== null) {
        setDraggingL2(closestChannel);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (longPressTimeoutRef.current) {
      // Check if moved significantly
      if (draggingL3) {
        const dot = currentDotsRef.current[draggingL3.channel]?.[draggingL3.step];
        if (dot && Math.hypot(dot.x - x, dot.y - y) > 25) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
      } else {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
    }

    if (draggingL3 && activeLayer === "l3" && onL3PointMove) {
      const paddingX = width * 0.1;
      const paddingY = height * 0.1;
      const usableWidth = width - paddingX * 2;
      const usableHeight = height - paddingY * 2;

      let adjustedX = x;
      if (isOffset) {
        const offsetAmount = (usableWidth / 8) * 0.2;
        adjustedX -= (draggingL3.channel - 1.5) * offsetAmount;
      }

      // Reverse map X to CURV (1-8)
      const curvRaw = 1 + ((adjustedX - paddingX) / usableWidth) * 7;
      const curv = Math.max(1, Math.min(8, Math.round(curvRaw)));

      // Reverse map Y to VAL (-3 to 3)
      const valNorm = 1 - ((y - paddingY) / usableHeight);
      const val = Math.max(-3, Math.min(3, valNorm * 6 - 3));

      onL3PointMove(draggingL3.channel, draggingL3.step, curv, val);
    } else if (draggingL2 !== null && activeLayer === "l2" && onL2PhaseMove) {
      const cx = width / 2;
      const cy = height / 2;
      
      // Calculate angle from center
      let angle = Math.atan2(y - cy, x - cx) * (180 / Math.PI);
      // Convert to phase (0 is top, clockwise)
      let phase = angle + 90;
      if (phase < 0) phase += 360;
      
      onL2PhaseMove(draggingL2, Math.round(phase));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    if (draggingL3 || draggingL2 !== null) {
      setDraggingL3(null);
      setDraggingL2(null);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-full block touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
