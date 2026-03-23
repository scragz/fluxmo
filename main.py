#!/usr/bin/env python3
"""
FLUX Community Preset Editor — CLI entry point.

Reverse-engineered file format parser/editor for FLUX Eurorack sequencer
presets and persistent configuration files (firmware v1.07–v1.08).

Usage:
  python3 main.py show   <file.TXT>
  python3 main.py pref   <PREF*.TXT>
  python3 main.py step   <file.TXT> <ch> <step>
  python3 main.py diff   <A.TXT> <B.TXT>
  python3 main.py set    <file.TXT> <param> <ch> <step> <value> [out.TXT]
  python3 main.py build  <preset.json> <out.TXT>
  python3 main.py hex    <file.TXT> [offset] [length]
  python3 main.py map
"""

import os
import sys

from src.fluxmo.pref import FluxPrefs
from src.fluxmo.preset import FluxPreset, AUX_MODES, STEP_ARRAYS_U8, STEP_PARAM_SPECS, OFFSET_PHAS, OFFSET_MINV, OFFSET_MAXV, OFFSET_FREQ, OFFSET_CH_RECORDS, CH_RECORD_SIZE, CH_CURV_IDX, CH_VELO_IDX, CH_SH16_IDX, CH_BPM_IDX, OFFSET_AUX1_CANDIDATE, OFFSET_AUX2_CANDIDATE
from src.fluxmo.diff import diff_presets, hexdump


USAGE = """
FLUX Community Preset Editor  (reverse-engineered v1.07 format)

Usage:
  python3 main.py show   <file.TXT>           Show all decoded parameters
  python3 main.py pref   <PREF*.TXT>          Show persistent config file
  python3 main.py step   <file.TXT> <ch> <s>  Show single step (ch=1-4, s=1-16)
  python3 main.py diff   <A.TXT> <B.TXT>      Diff two files (byte-level)
  python3 main.py set    <file.TXT> <param> <ch> <step> <value> [out.TXT]
  python3 main.py build  <preset.json> <out.TXT>  Build a fresh preset from JSON
  python3 main.py hex    <file.TXT> [offset] [length]  Hexdump region
  python3 main.py map                          Print parameter offset map

Editable parameters (confirmed/likely):
  loop       Channel loop end 1–16            uint8  control bytes 0x0A00–0x0A07
  gate       Trigger length % 0–99            uint8  offset 0x0040
  curv       TM curve label                   u8     offset 0x0280 (likely; accepts 1, 2.0.., NL2.0..)
  leng       Step length in 16ths 1–32        uint8  offset 0x0080
  aux1       AUX1 mode index (experimental)   uint8  offset 0x1900 (provisional late AUX indexing)
  aux2       AUX2 mode index (see map)         uint8  offset 0x00C0
  dens       Trigger density 0–64             uint8  offset 0x0200
  huma       Humanize 0–127                   uint8  offset 0x0340
  phas       Phase shift degrees 0–360        uint16 offset 0x0380
  mod_bus    Mod bus bitmask YEL=1,GRY=2,PUR=4 uint8 offset 0x0480
  prob_val   Probability % 0–100              uint8  offset 0x0640
  quan       Quantizer semitones 0–12         uint8  offset 0x07C0
  minv       Min CV voltage mV (signed)        int16  offset 0x0500
  maxv       Max CV voltage mV 0–8000         uint16 offset 0x0580
  freq       LFO frequency Hz                 float  offset 0x0680
"""

# Maps CLI param name → (FluxPreset attribute, type)
SET_PARAMS = {name: (spec.attr, spec.value_type) for name, spec in STEP_PARAM_SPECS.items()}


def cmd_show(path):
    if 'PREF' in os.path.basename(path).upper():
        FluxPrefs.from_file(path).display()
    else:
        FluxPreset.from_file(path).display(verbose=True)


def cmd_pref(path):
    FluxPrefs.from_file(path).display()


def cmd_step(path, ch_s, step_s):
    ch   = int(ch_s)   - 1
    step = int(step_s) - 1
    p = FluxPreset.from_file(path)
    print(f"=== CH{ch+1} STEP{step+1} ===")
    for name, (val, cert) in p.get_step(ch, step).items():
        print(f"  {name:<12} = {val:<15}  ({cert})")


def cmd_diff(path_a, path_b):
    diff_presets(path_a, path_b)


def cmd_set(path, param, ch_s, step_s, val_s, out_path=None):
    ch   = int(ch_s)   - 1
    step = int(step_s) - 1
    if param not in SET_PARAMS:
        print(f"Unknown param '{param}'. Run 'map' for a list.")
        return
    spec = STEP_PARAM_SPECS[param]
    _, typ = SET_PARAMS[param]
    if typ == 'f32':
        val = float(val_s)
    elif param in {'aux1', 'aux2', 'mod_bus', 'curv'}:
        val = val_s
    else:
        val = int(val_s, 0) if val_s.startswith('0x') else int(val_s)
    p = FluxPreset.from_file(path)
    try:
        if param == 'loop':
            coerced = p._coerce_value(spec, val, 'loop')
            p.loop[ch] = [coerced] * 16
            p.loop_end[ch] = coerced
        else:
            coerced = p._coerce_value(spec, val, param)
            p._set_step_value(ch, step, param, coerced, param)
    except ValueError as exc:
        print(f"Parameter error: {exc}")
        return
    shown_value = p.get_step(ch, step)[spec.display_name][0]
    out = out_path or path
    p.save(out)
    print(f"Set {param} ch{ch+1} step{step+1} = {shown_value}  →  saved to {out}")


def cmd_build(json_path, out_path):
    try:
        p = FluxPreset.from_json_file(json_path)
    except ValueError as exc:
        print(f"Preset JSON error: {exc}")
        return
    p.save(out_path)
    print(f"Built preset from {json_path}  →  saved to {out_path}")


def cmd_hex(path, offset_s='0', length_s='256'):
    with open(path, 'rb') as f: data = f.read()
    offset = int(offset_s, 0)
    length = int(length_s, 0)
    print(f"Hexdump of {path} @ 0x{offset:04X} ({length} bytes):")
    hexdump(data, offset, length)


def cmd_map():
    print("=== FLUX Preset Parameter Offset Map ===")
    print()
    print("Per-step arrays (64 entries each = 4ch × 16 steps):")
    print("  Slot order: step-major (CH1/S1, CH2/S1, CH3/S1, CH4/S1, CH1/S2, ...)")
    print(f"  {'Offset':>8}  {'Size':>5}  {'Param':<12}  Certainty")
    print(f"  {'------':>8}  {'----':>5}  {'-----':<12}  ---------")
    for off, (name, cert) in sorted(STEP_ARRAYS_U8.items()):
        print(f"  0x{off:04X}    uint8  {name:<12}  {cert}")
    print(f"  0x{OFFSET_PHAS:04X}   uint16  {'PHAS_deg':<12}  CONFIRMED  (64×2 bytes, 0-360°)")
    print(f"  0x{OFFSET_MINV:04X}   int16   {'MINV_mV':<12}  LIKELY     (64×2 bytes, signed mV)")
    print(f"  0x{OFFSET_MAXV:04X}   uint16  {'MAXV_mV':<12}  CONFIRMED  (64×2 bytes)")
    print(f"  0x{OFFSET_FREQ:04X}   float32 {'FREQ_Hz':<12}  CONFIRMED  (64×4 bytes)")
    print("  0x0A00   u8×4   LOOP_END      CONFIRMED  (per-channel sequence end)")
    print("  0x0A04   u8×4   LOOP_START    CONFIRMED  (per-channel sequence start)")
    print()
    print("Late-file AUX arrays:")
    print(
        f"  0x{OFFSET_AUX1_CANDIDATE:04X}   u8×64  AUX1          UNCERTAIN  "
        "experimental late-file array; channel-major rotated left by 4"
    )
    print(
        f"  0x{OFFSET_AUX2_CANDIDATE:04X}   u8×64  AUX2?         TBD        "
        "candidate array with the same provisional indexing as 0x1900"
    )
    print()
    print("Per-channel records (4 × 128 bytes starting at 0x1B80):")
    print(f"  CH idx  u16[{CH_CURV_IDX}]=UNKNOWN?  u16[{CH_VELO_IDX}]=VELO  u16[{CH_SH16_IDX}]=SH16  u16[{CH_BPM_IDX}]=BPM")
    print()
    print("AUX mode indices:")
    for i, name in enumerate(AUX_MODES[:30]):
        print(f"  {i:3d} = {name}")
    print("  ... (see AUX_MODES in src/fluxmo/preset.py for full table)")


def main():
    if len(sys.argv) < 2:
        print(USAGE)
        return

    cmd = sys.argv[1].lower()

    if cmd == 'show' and len(sys.argv) >= 3:
        cmd_show(sys.argv[2])
    elif cmd == 'pref' and len(sys.argv) >= 3:
        cmd_pref(sys.argv[2])
    elif cmd == 'step' and len(sys.argv) >= 5:
        cmd_step(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == 'diff' and len(sys.argv) >= 4:
        cmd_diff(sys.argv[2], sys.argv[3])
    elif cmd == 'set' and len(sys.argv) >= 7:
        out = sys.argv[7] if len(sys.argv) >= 8 else None
        cmd_set(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6], out)
    elif cmd == 'build' and len(sys.argv) >= 4:
        cmd_build(sys.argv[2], sys.argv[3])
    elif cmd == 'hex' and len(sys.argv) >= 3:
        offs = sys.argv[3] if len(sys.argv) >= 4 else '0'
        leng = sys.argv[4] if len(sys.argv) >= 5 else '256'
        cmd_hex(sys.argv[2], offs, leng)
    elif cmd == 'map':
        cmd_map()
    else:
        print(USAGE)


if __name__ == '__main__':
    main()
