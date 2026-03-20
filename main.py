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
  python3 main.py hex    <file.TXT> [offset] [length]
  python3 main.py map
"""

import os
import sys

from src.fluxmo.pref import FluxPrefs
from src.fluxmo.preset import FluxPreset, AUX_MODES, STEP_ARRAYS_U8, OFFSET_PHAS, OFFSET_MINV, OFFSET_MAXV, OFFSET_FREQ, OFFSET_CH_RECORDS, CH_RECORD_SIZE, CH_PPQN_IDX, CH_VELO_IDX, CH_SH16_IDX, CH_BPM_IDX
from src.fluxmo.diff import diff_presets, hexdump


USAGE = """
FLUX Community Preset Editor  (reverse-engineered v1.07 format)

Usage:
  python3 main.py show   <file.TXT>           Show all decoded parameters
  python3 main.py pref   <PREF*.TXT>          Show persistent config file
  python3 main.py step   <file.TXT> <ch> <s>  Show single step (ch=1-4, s=1-16)
  python3 main.py diff   <A.TXT> <B.TXT>      Diff two files (byte-level)
  python3 main.py set    <file.TXT> <param> <ch> <step> <value> [out.TXT]
  python3 main.py hex    <file.TXT> [offset] [length]  Hexdump region
  python3 main.py map                          Print parameter offset map

Editable parameters (confirmed/likely):
  loop       Loop length 1–16                 uint8  offset 0x0000
  gate       Trigger length % 0–99            uint8  offset 0x0040
  leng       Step length in 16ths 1–16        uint8  offset 0x0080
  aux2       AUX2 mode index (see map)         uint8  offset 0x00C0
  dens       Trigger density 0–64             uint8  offset 0x0200
  huma       Humanize 0–127                   uint8  offset 0x0340
  phas       Phase shift degrees 0–360        uint16 offset 0x0380
  mod_bus    Mod bus bitmask YEL=1,GRY=2,PUR=4 uint8 offset 0x0480
  prob_val   Probability % 0–100              uint8  offset 0x0640
  quan       Quantizer semitones 0–12         uint8  offset 0x07C0
  aux1       AUX1 mode index (see map)         uint8  offset 0x0A00
  minv       Min CV voltage mV (signed)        int16  offset 0x0500
  maxv       Max CV voltage mV 0–8000         uint16 offset 0x0580
  freq       LFO frequency Hz                 float  offset 0x0680
"""

# Maps CLI param name → (FluxPreset attribute, type)
SET_PARAMS = {
    'loop':     ('loop',     'u8'),    # LIKELY — loop length (1-16, default=1)
    'gate':     ('gate',     'u8'),    # LIKELY — trigger length (0-99%, default=10)
    'dens':     ('dens',     'u8'),    # CONFIRMED — trigger density 0-64
    'leng':     ('leng',     'u8'),    # CONFIRMED
    'aux1':     ('aux1',     'u8'),    # LIKELY — AUX output 1 mode (0x0A00)
    'aux2':     ('aux2',     'u8'),    # LIKELY — AUX output 2 mode (0x00C0)
    'huma':     ('huma',     'u8'),    # LIKELY — humanize 0-127
    'phas':     ('phas',     'u16'),   # CONFIRMED — phase degrees 0-360
    'cvsel':    ('cvsel',    'u8'),    # UNCERTAIN — LFO CV source 0-9
    'sync':     ('sync',     'u8'),    # UNCERTAIN — LFO sync mode 0-4
    'mod_bus':  ('mod_bus',  'u8'),    # CONFIRMED
    's_h':      ('s_h',      'u8'),    # UNCERTAIN — sample & hold 0/1
    'prob_val': ('prob_val', 'u8'),    # LIKELY — probability 0-100
    'minv':     ('minv',     'i16'),   # LIKELY — min CV mV (signed)
    'maxv':     ('maxv',     'u16'),   # CONFIRMED — max CV mV
    'quan':     ('quan',     'u8'),    # LIKELY — quantizer semitones (default=12)
    'freq':     ('freq',     'f32'),   # CONFIRMED — LFO freq Hz
}


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
    attr, typ = SET_PARAMS[param]
    val = float(val_s) if typ == 'f32' else int(val_s, 0) if val_s.startswith('0x') else int(val_s)
    p = FluxPreset.from_file(path)
    getattr(p, attr)[ch][step] = val
    out = out_path or path
    p.save(out)
    print(f"Set {param} ch{ch+1} step{step+1} = {val}  →  saved to {out}")


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
    print(f"  {'Offset':>8}  {'Size':>5}  {'Param':<12}  Certainty")
    print(f"  {'------':>8}  {'----':>5}  {'-----':<12}  ---------")
    for off, (name, cert) in sorted(STEP_ARRAYS_U8.items()):
        print(f"  0x{off:04X}    uint8  {name:<12}  {cert}")
    print(f"  0x{OFFSET_PHAS:04X}   uint16  {'PHAS_deg':<12}  CONFIRMED  (64×2 bytes, 0-360°)")
    print(f"  0x{OFFSET_MINV:04X}   int16   {'MINV_mV':<12}  LIKELY     (64×2 bytes, signed mV)")
    print(f"  0x{OFFSET_MAXV:04X}   uint16  {'MAXV_mV':<12}  CONFIRMED  (64×2 bytes)")
    print(f"  0x{OFFSET_FREQ:04X}   float32 {'FREQ_Hz':<12}  CONFIRMED  (64×4 bytes)")
    print()
    print("Per-channel records (4 × 128 bytes starting at 0x1B80):")
    print(f"  CH idx  u16[{CH_PPQN_IDX}]=PPQN  u16[{CH_VELO_IDX}]=VELO  u16[{CH_SH16_IDX}]=SH16  u16[{CH_BPM_IDX}]=BPM")
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
