import { ReactNode } from "react";

export const PANEL_SHELL = "flex w-full flex-col gap-3 rounded-[28px] border border-white/10 bg-zinc-900/72 p-4";
export const CARD = "rounded-2xl border border-white/8 bg-zinc-950/72 px-3 py-3";
export const CARD_PADDED = "rounded-2xl border border-white/8 bg-zinc-950/72 px-4 py-3";
export const SECTION_LABEL = "text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500";
export const SEGMENTED_GROUP = "flex gap-1 rounded-xl bg-zinc-900 p-1";
export const ICON_BUTTON = "flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-zinc-300 transition hover:border-white/20 hover:text-white";
export const VALUE_PILL = "rounded-full border border-white/8 bg-zinc-900 px-3 py-1.5 text-center font-mono text-sm";

export function LayerControlPanel({
  layer,
  title,
  description,
  children,
}: {
  layer: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="p-4">
      <div className={PANEL_SHELL}>
        <div className={CARD_PADDED}>
          <div className="text-[10px] font-mono uppercase tracking-[0.32em] text-zinc-400">{layer}</div>
          <div className="mt-1 text-sm text-zinc-100">{title}</div>
          <div className="mt-1 text-[11px] leading-5 text-zinc-500">{description}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function channelAccentClass(channel: number): string {
  if (channel === 0) return "text-orange-400";
  if (channel === 1) return "text-green-400";
  if (channel === 2) return "text-blue-400";
  return "text-red-400";
}

export function segmentedButtonClass(active: boolean): string {
  return `rounded-lg px-2 py-1 text-[10px] font-mono uppercase transition-colors ${
    active ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
  }`;
}
