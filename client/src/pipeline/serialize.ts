import { PresetState } from "./types";

export function serialize(state: PresetState): string {
  const json = {
    version: 1,
    channels: state.channels.map(c => ({
      velo: c.velo,
      sh16: c.sh16,
      steps: c.steps.map(s => ({
        leng: s.leng,
        dens: s.dens,
        phas: s.phas,
        curv: s.curv,
        val: s.val,
        comp: s.comp,
        huma: s.huma,
        gate: s.gate,
        prob: s.prob,
        mod_bus: s.mod_bus,
        aux1: s.aux1,
        aux2: s.aux2,
        minv: s.minv,
        maxv: s.maxv,
        freq: s.freq,
        quan: s.quan,
        s_h: s.s_h
      }))
    }))
  };

  return JSON.stringify(json, null, 2);
}
