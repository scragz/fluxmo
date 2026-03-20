#!/usr/bin/env python3
"""
FLUX by IOLabs - Community Preset Editor
=========================================
Reverse-engineered file format parser/editor for FLUX Eurorack sequencer
presets and persistent configuration files.

FLUX is a 4-channel, 16-step-per-channel Temporal Modulation Synthesis
sequencer. Presets are stored as binary .TXT files on a FAT16 micro SD card:
  - FLUX/NAME____.TXT  (~8196 bytes) — sequencer preset
  - PREFxxx.TXT        (20–262 bytes) — persistent device configuration

HOW TO CONTRIBUTE
-----------------
Many parameter offsets are confirmed; others are marked UNCERTAIN.
To help map unknown offsets:
  1. Change ONE parameter on the device
  2. Save the preset
  3. Run: python3 flux_editor.py diff OLD.TXT NEW.TXT
  4. Report the offset + value change to the community forum

Certainty levels used in this file:
  CONFIRMED  — verified against known default values from manual
  LIKELY     — strongly inferred from context / value matches
  UNCERTAIN  — structural guess, needs hardware validation

File format analyzed from firmware v1.07 (DEFAULT_.TXT preset).
"""

import struct
import sys
import os
import copy
from typing import Optional

# ---------------------------------------------------------------------------
# AUX Mode index table (from manual p.21, "AUX modes in order of appearance")
# ---------------------------------------------------------------------------
AUX_MODES = [
    'OFF', 'ON', 'START', 'SOS', '1st', 'Last',
    'DEL1', 'DEL2', 'DEL3', 'DEL4', 'DEL5', 'DEL6', 'DEL7', 'DEL8',
    'TL1',  'TL2',  'TL3',  'TL4',  'TL5',  'TL6',  'TL7',  'TL8',
    'TL9',  'TL10', 'TL11', 'TL12', 'TL13', 'TL14', 'TL15', 'TL16',
    '& (AND)', '!& (NAND)', '|| (OR)', '!|| (NOR)', 'x|| (XOR)',
    'CV>1V', 'CV>2V', 'CV>3V', 'CV>4V', 'CV>5V', 'CV>6V', 'CV>7V',
    'CV<1V', 'CV<2V', 'CV<3V', 'CV<4V', 'CV<5V', 'CV<6V', 'CV<7V',
] + [f'PPQ{i}' for i in range(1, 49)] + [f'/{i}' for i in range(1, 17)]

def aux_name(idx: int) -> str:
    if 0 <= idx < len(AUX_MODES):
        return AUX_MODES[idx]
    return f'UNKNOWN({idx})'

# ---------------------------------------------------------------------------
# MOD bus bitmask (YELLOW=bit0, GREY=bit1, PURPLE=bit2)
# ---------------------------------------------------------------------------
def mod_bus_name(val: int) -> str:
    if val == 0: return 'OFF'
    names = []
    if val & 0x01: names.append('Y')
    if val & 0x02: names.append('G')
    if val & 0x04: names.append('P')
    return '+'.join(names)

def mod_bus_full(val: int) -> str:
    if val == 0: return 'OFF'
    names = []
    if val & 0x01: names.append('YEL')
    if val & 0x02: names.append('GRY')
    if val & 0x04: names.append('PUR')
    return '+'.join(names)

# ---------------------------------------------------------------------------
# PREF file (persistent configuration, saved to SD root)
# ---------------------------------------------------------------------------

class FluxPrefs:
    """
    Parses PREF*.TXT files — persistent device configuration.

    Format versions detected from bytes 2-3:
      01 05 → firmware ~1.05 (20 bytes)
      01 06 → firmware ~1.06 (20 bytes)
      03 03 → firmware 1.06N+ (44–262 bytes)
    """

    CLK_MODES = {0: 'INT', 1: 'EXT', 2: 'EXTS', 3: 'MIDI', 4: 'BURST'}
    BTN_MODES = {0: 'MOM', 1: 'LAT'}

    def __init__(self):
        self.raw = bytearray()
        self.fmt_major = 0
        self.fmt_minor = 0
        self.status_byte = 0       # byte 0, LIKELY: 0xF0=saved state, 0x01=loaded
        self.clk_mode = 0          # LIKELY: byte 5
        self.star_mode = 0         # LIKELY: byte 6 (*-button: 0=MOM, 1=LAT)
        self.all_mode = 0          # LIKELY: byte 7 (ALL-button: 0=MOM, 1=LAT)
        self.shuf = [0, 0, 0, 0]   # CONFIRMED: bytes 8-15, uint16 LE per channel (degrees)
        self.sh16 = [2, 2, 2, 2]   # CONFIRMED: bytes 16-19, uint8 per channel
        self.velo = [127]*4        # CONFIRMED: bytes 20-43 (v3.3+), uint16 LE
        self.aux1_velo = [127]*4   # CONFIRMED
        self.aux2_velo = [127]*4   # CONFIRMED
        self.bpm = None            # CONFIRMED: bytes 44-45 (v3.3+), stored as BPM-95; None if pre-v3.3

    @classmethod
    def from_file(cls, path: str) -> 'FluxPrefs':
        p = cls()
        with open(path, 'rb') as f:
            p.raw = bytearray(f.read())
        p._parse()
        return p

    def _parse(self):
        d = self.raw
        if len(d) < 4:
            raise ValueError(f"PREF file too short: {len(d)} bytes")

        self.status_byte = d[0]                          # byte 0: UNCERTAIN state/flags
        self.fmt_major = d[2]
        self.fmt_minor = d[3]

        if len(d) >= 8:
            self.clk_mode  = d[5]                       # LIKELY
            self.star_mode = d[6]                       # LIKELY
            self.all_mode  = d[7]                       # LIKELY

        # CONFIRMED: SHUF per channel as uint16 LE at bytes 8-15
        if len(d) >= 16:
            for ch in range(4):
                self.shuf[ch] = struct.unpack_from('<H', d, 8 + ch*2)[0]

        # CONFIRMED: SH16 per channel as uint8 at bytes 16-19
        if len(d) >= 20:
            for ch in range(4):
                self.sh16[ch] = d[16 + ch]

        # CONFIRMED (v3.3+): VELO, AUX1, AUX2 as uint16 LE starting at byte 20
        if len(d) >= 44:
            for ch in range(4):
                base = 20 + ch * 6
                self.velo[ch]     = struct.unpack_from('<H', d, base + 0)[0]
                self.aux1_velo[ch] = struct.unpack_from('<H', d, base + 2)[0]
                self.aux2_velo[ch] = struct.unpack_from('<H', d, base + 4)[0]

        # CONFIRMED (v3.3+): BPM stored as (BPM - 95) at bytes 44-45
        if len(d) >= 46:
            bpm_stored = struct.unpack_from('<H', d, 44)[0]
            if bpm_stored <= 400:  # sanity check (BPM range ~5-490)
                self.bpm = bpm_stored + 95

    def to_bytes(self) -> bytes:
        """Serialize back to binary. Preserves unknown regions from original."""
        d = bytearray(self.raw)

        if len(d) >= 8:
            d[5] = self.clk_mode & 0xFF
            d[6] = self.star_mode & 0xFF
            d[7] = self.all_mode & 0xFF

        if len(d) >= 16:
            for ch in range(4):
                struct.pack_into('<H', d, 8 + ch*2, self.shuf[ch])

        if len(d) >= 20:
            for ch in range(4):
                d[16 + ch] = self.sh16[ch] & 0xFF

        if len(d) >= 44:
            for ch in range(4):
                base = 20 + ch * 6
                struct.pack_into('<H', d, base + 0, self.velo[ch])
                struct.pack_into('<H', d, base + 2, self.aux1_velo[ch])
                struct.pack_into('<H', d, base + 4, self.aux2_velo[ch])

        if len(d) >= 46 and self.bpm is not None:
            struct.pack_into('<H', d, 44, max(0, self.bpm - 95))

        return bytes(d)

    def save(self, path: str):
        with open(path, 'wb') as f:
            f.write(self.to_bytes())

    def display(self):
        print(f"=== FLUX PREF file (format v{self.fmt_major}.{self.fmt_minor}) ===")
        print(f"  Size: {len(self.raw)} bytes")
        print(f"  Status byte:  0x{self.status_byte:02X}  (UNCERTAIN: device state flag)")
        print(f"  CLK mode:     {self.CLK_MODES.get(self.clk_mode, self.clk_mode)}  (LIKELY)")
        print(f"  * button:     {self.BTN_MODES.get(self.star_mode, self.star_mode)}  (LIKELY)")
        print(f"  ALL button:   {self.BTN_MODES.get(self.all_mode, self.all_mode)}  (LIKELY)")
        if self.bpm is not None:
            print(f"  BPM:          {self.bpm}  (CONFIRMED, stored as BPM-95={self.bpm-95})")
        else:
            print(f"  BPM:          (not stored in format v{self.fmt_major}.{self.fmt_minor})")
        print()
        print(f"  {'':8}  CH1   CH2   CH3   CH4")
        print(f"  SHUF (°):  {self.shuf[0]:<5} {self.shuf[1]:<5} {self.shuf[2]:<5} {self.shuf[3]:<5}  (CONFIRMED)")
        print(f"  SH16:      {self.sh16[0]:<5} {self.sh16[1]:<5} {self.sh16[2]:<5} {self.sh16[3]:<5}  (CONFIRMED)")
        print(f"  VELO:      {self.velo[0]:<5} {self.velo[1]:<5} {self.velo[2]:<5} {self.velo[3]:<5}  (CONFIRMED)")
        print(f"  AUX1 VEL:  {self.aux1_velo[0]:<5} {self.aux1_velo[1]:<5} {self.aux1_velo[2]:<5} {self.aux1_velo[3]:<5}  (CONFIRMED)")
        print(f"  AUX2 VEL:  {self.aux2_velo[0]:<5} {self.aux2_velo[1]:<5} {self.aux2_velo[2]:<5} {self.aux2_velo[3]:<5}  (CONFIRMED)")


# ---------------------------------------------------------------------------
# FLUX preset file layout constants
# ---------------------------------------------------------------------------

# Per-step parameter arrays: each is 64 bytes (4ch × 16 steps).
# Step index = channel * 16 + step (0-indexed).
# All offsets are for the start of the 64-byte array.

STEP_ARRAYS_U8 = {
    # offset: (param_name, certainty)
    #
    # Full per-step parameter list from UI (firmware v1.08):
    #
    #  RHYTHMS page:  PROB | DENS | PHAS | MASK
    #                 LOOP | CURV | COMP | MSK>
    #                 MOD  | VAL  | LENG | AUX1
    #                 GATE | DIFF | HUMA | AUX2
    #
    #  LFO/CV page:   CVSEL | ATK  | FREQ
    #                 S+H   | REL  | SYNC
    #                 MINV  | ACUR | QUAN
    #                 MAXV  | RCUR | SCAL
    #
    0x0000: ('LOOP',     'LIKELY'),      # Loop length per step (1–16). Default=1.
    0x0040: ('GATE',     'LIKELY'),      # Gate/trigger length (0–99%). Default=10. Values 10-90 in corpus.
    0x0080: ('LENG',     'CONFIRMED'),   # Step length (0–8, displayed as N/16). Default=1.
    0x00C0: ('AUX2',     'LIKELY'),      # AUX output 2 mode index (see AUX_MODES). Default=1=ON.
                                          # v1/v2 show full variation; v3 corpus all=1. CURV is unlocated.
    # 0x0100–0x01FF: 256 bytes, sparse [0, 51, 64, 192] — bitmask pattern.
    #   Candidates: MASK (8-bit bitmask per step), MSK> (mask shift).
    #   Two blocks at 0x0100 and 0x0140 share same [0,51,192] signature; 0x0100 also has 64.
    0x0200: ('DENS',     'CONFIRMED'),   # Trigger density (0–64 gates/step). Default=1. User confirmed.
    # 0x0240: values [0, 50] in 2 presets (MAC0204). Unknown — possible COMP (+50) or MSK>.
    # 0x0280–0x033F: all zero in all 32 presets. Candidates: COMP (-99..+99 signed), DIFF (always 0),
    #   AUX1/AUX2 (unlocated — should vary per channel, not found in 0x0000–0x07FF).
    0x0340: ('HUMA',     'LIKELY'),      # Humanize (0–127). Default=0. Values 0–100 seen in corpus.
    # 0x0380–0x03FF: PHAS — see OFFSET_PHAS below (uint16 LE, 128 bytes)
    0x0400: ('CVSEL',    'UNCERTAIN'),   # LFO CV source select (0–9 enum). Default=0(VOLT?).
    0x0440: ('SYNC',     'UNCERTAIN'),   # LFO sync mode (0–4). Default=0(OFF).
    0x0480: ('MOD_BUS',  'CONFIRMED'),   # Modulation bus bitmask (YEL=1,GRY=2,PUR=4). Default=3(Y+G).
    # 0x04C0: all zero. Candidate: ATK(0), DIFF(0), S+H(0), or other default-0 param.
    # 0x0500–0x057F: MINV — see OFFSET_MINV (int16 LE mV, 128 bytes)
    # 0x0580–0x05FF: MAXV — see OFFSET_MAXV (uint16 LE mV, 128 bytes)
    # 0x0600–0x063F: all zero. Candidate: ATK(0), ACUR(0.00 as f32), or other default-0 param.
    0x0640: ('PROB_V',   'LIKELY'),      # Probability 0–100 OR REL 0–100 — both default=100, indistinguishable
                                         # in corpus. "PROB_V" label retained; counterpart REL unlocated.
    # 0x0680–0x077F: FREQ — see OFFSET_FREQ (float32 LE, 256 bytes)
    0x0780: ('S_H',      'UNCERTAIN'),   # Sample & Hold — binary (0=OFF, 1=ON). Default=OFF.
    0x07C0: ('QUAN',     'LIKELY'),      # Quantizer semitones (0–12). Default=12 (chromatic). Constant in
                                         # all 32 presets; NOT AUX2 (which should vary per user report).
}

# PHAS: Phase shift in degrees, stored as uint16 LE (0–360°). 128 bytes = 64 × uint16.
OFFSET_PHAS = 0x0380   # CONFIRMED — 32 × uint16 at 0x0380, 32 × uint16 at 0x03C0

# MINV: CV output minimum voltage, stored as int16 LE mV. 128 bytes = 64 × int16.
OFFSET_MINV = 0x0500   # LIKELY — int16 mV. Values 500–2000 seen, MINV < MAXV confirmed.

# MAXV: CV output max voltage, stored as uint16 mV (0–8000)
OFFSET_MAXV = 0x0580   # CONFIRMED — 64 × uint16 LE

# FREQ: CV LFO frequency in Hz, stored as float32
OFFSET_FREQ = 0x0680   # CONFIRMED — 64 × float32 LE

# Per-channel record offsets (4 records × 128 bytes, starting at 0x1B80)
OFFSET_CH_RECORDS = 0x1B80
CH_RECORD_SIZE = 0x80  # 128 bytes

# Within each 128-byte per-channel record (uint16 LE indices):
CH_PPQN_IDX  = 19   # CONFIRMED: PPQN=4 matches
CH_VELO_IDX  = 21   # CONFIRMED: VELO=127 matches
CH_SH16_IDX  = 49   # CONFIRMED: SH16=2 matches
CH_BPM_IDX   = 60   # LIKELY: value matches PREF BPM (may be PREF mirror, not independent)
CH_RNG2_BYTE = 0x54 # CONFIRMED: 12-byte UUID at byte offset 0x54

# Uncertain per-channel record uint16 values (0-indexed) in all known presets:
# [0]:1 [1]:1 [2]:1 [3]:8 [4]:10 [5]:99 [6]:1 [7]:64 [8]:1 [9]:58
# GATE was previously speculated at [4], but GATE is now confirmed as per-step at 0x0200.
# [4]=10, [5]=99 identities unknown. [7]=64, [9]=58 unknown.
# [35]:8000, [37]:8000 (probably MAXV mirrors); [39]:100, [41]:100 (prob mirrors?)


# ---------------------------------------------------------------------------
# FLUX Preset
# ---------------------------------------------------------------------------

class FluxPreset:
    """
    Parses FLUX/*.TXT preset files (~8196 bytes).

    The file contains 64 step slots (4 channels × 16 steps).
    Step addressing: slot = channel * 16 + step  (both 0-indexed)

    Data is stored in parallel arrays (not interleaved per step):
      Section 0x0000–0x07FF: Per-step parameter arrays (uint8 or uint16/float32)
      Section 0x0800–0x1B7F: Evolve LFO + Macro Pot modulation data (partially decoded)
      Section 0x1B80–0x1D7F: Per-channel configuration records (4 × 128 bytes)
      Section 0x1D80–0x2003: Additional state data (partially decoded)
    """

    EXPECTED_SIZE = 8196

    def __init__(self):
        self.raw = bytearray(self.EXPECTED_SIZE)
        # per-step arrays, shape [4 channels][16 steps]
        self.loop     = [[1]*16 for _ in range(4)]    # LIKELY (loop length, default=1)
        self.gate     = [[10]*16 for _ in range(4)]   # LIKELY (trigger length 0-99%, default=10)
        self.leng     = [[1]*16 for _ in range(4)]    # CONFIRMED
        self.aux2     = [[1]*16 for _ in range(4)]    # LIKELY (AUX2 mode index, default=1=ON at 0x00C0)
        self.dens     = [[1]*16 for _ in range(4)]    # CONFIRMED (0-64 gates/step)
        self.huma     = [[0]*16 for _ in range(4)]    # LIKELY (humanize 0-127, default=0)
        self.phas     = [[0]*16 for _ in range(4)]    # CONFIRMED (uint16 LE, degrees 0-360)
        self.cvsel    = [[0]*16 for _ in range(4)]    # UNCERTAIN (LFO CV source, 0-9)
        self.sync     = [[0]*16 for _ in range(4)]    # UNCERTAIN (LFO sync mode, 0-4)
        self.mod_bus  = [[3]*16 for _ in range(4)]    # CONFIRMED (YEL+GRY=3)
        self.s_h      = [[0]*16 for _ in range(4)]    # UNCERTAIN (sample & hold, 0/1)
        self.minv     = [[0]*16 for _ in range(4)]    # LIKELY (int16 LE mV)
        self.maxv     = [[8000]*16 for _ in range(4)] # CONFIRMED (uint16 mV)
        self.prob_val = [[100]*16 for _ in range(4)]  # LIKELY (prob or REL, both default=100)
        self.freq     = [[1.0]*16 for _ in range(4)]  # CONFIRMED (float32 Hz)
        self.quan     = [[12]*16 for _ in range(4)]   # LIKELY (quantizer semitones, default=12)
        self.aux1     = [[1]*16 for _ in range(4)]    # LIKELY (AUX1 mode index, default=1=ON at 0x0A00)
        # per-channel (from channel records at 0x1B80)
        self.bpm      = [120]*4   # LIKELY: mirrors PREF BPM (BPM - 95 stored)
        self.ppqn     = [4]*4     # CONFIRMED
        self.velo     = [127]*4   # CONFIRMED
        self.sh16     = [2]*4     # CONFIRMED

    KNOWN_SIZES = {3860: 'v1', 6404: 'v2', 8196: 'v3'}

    @classmethod
    def from_file(cls, path: str) -> 'FluxPreset':
        p = cls()
        with open(path, 'rb') as f:
            p.raw = bytearray(f.read())
        sz = len(p.raw)
        if sz not in cls.KNOWN_SIZES:
            print(f"WARNING: unknown size {sz} bytes (known: {list(cls.KNOWN_SIZES.keys())})")
        elif sz != cls.EXPECTED_SIZE:
            fmt = cls.KNOWN_SIZES[sz]
            print(f"NOTE: {fmt} format ({sz} bytes) — older firmware. Some params may be absent.")
        p._parse()
        return p

    def _slot(self, ch: int, step: int) -> int:
        """Linear index for channel/step combo."""
        return ch * 16 + step

    def _parse(self):
        d = self.raw
        if len(d) < self.EXPECTED_SIZE:
            print(f"  NOTE: file is {len(d)} bytes (expected {self.EXPECTED_SIZE}). "
                  f"Older format — only parsing confirmed regions.")

        def safe_u8(off):  return d[off] if off < len(d) else 0
        def safe_u16(off): return struct.unpack_from('<H', d, off)[0] if off+2 <= len(d) else 0
        def safe_s16(off): return struct.unpack_from('<h', d, off)[0] if off+2 <= len(d) else 0
        def safe_f32(off): return struct.unpack_from('<f', d, off)[0] if off+4 <= len(d) else 0.0

        for ch in range(4):
            for step in range(16):
                idx = self._slot(ch, step)
                self.loop[ch][step]     = safe_u8(0x0000 + idx)
                self.gate[ch][step]     = safe_u8(0x0040 + idx)   # LIKELY (default=10)
                self.leng[ch][step]     = safe_u8(0x0080 + idx)
                self.aux2[ch][step]     = safe_u8(0x00C0 + idx)   # LIKELY AUX2 (v1/v2 confirmed)
                self.dens[ch][step]     = safe_u8(0x0200 + idx)   # CONFIRMED
                self.huma[ch][step]     = safe_u8(0x0340 + idx)   # LIKELY (humanize 0-127)
                self.phas[ch][step]     = safe_u16(OFFSET_PHAS + idx*2)  # CONFIRMED uint16
                self.cvsel[ch][step]    = safe_u8(0x0400 + idx)   # UNCERTAIN
                self.sync[ch][step]     = safe_u8(0x0440 + idx)   # UNCERTAIN
                self.mod_bus[ch][step]  = safe_u8(0x0480 + idx)
                self.s_h[ch][step]      = safe_u8(0x0780 + idx)   # UNCERTAIN
                self.minv[ch][step]     = safe_s16(OFFSET_MINV + idx*2)  # LIKELY int16 mV
                self.maxv[ch][step]     = safe_u16(OFFSET_MAXV + idx*2)
                self.prob_val[ch][step] = safe_u8(0x0640 + idx)
                self.freq[ch][step]     = safe_f32(OFFSET_FREQ + idx*4)
                self.quan[ch][step]     = safe_u8(0x07C0 + idx)   # LIKELY (default=12)
                self.aux1[ch][step]     = safe_u8(0x0A00 + idx)   # LIKELY (AUX1, confirmed v1/v2/v3)

        # --- per-channel records (0x1B80) ---
        for ch in range(4):
            base = OFFSET_CH_RECORDS + ch * CH_RECORD_SIZE
            if base + CH_RECORD_SIZE <= len(d):
                self.bpm[ch]  = safe_u16(base + CH_BPM_IDX  * 2)
                self.ppqn[ch] = safe_u16(base + CH_PPQN_IDX * 2)
                self.velo[ch] = safe_u16(base + CH_VELO_IDX * 2)
                self.sh16[ch] = safe_u16(base + CH_SH16_IDX * 2)

    def _write_arrays(self, d: bytearray):
        for ch in range(4):
            for step in range(16):
                idx = self._slot(ch, step)
                d[0x0000 + idx] = self.loop[ch][step]      & 0xFF
                d[0x0040 + idx] = self.gate[ch][step]      & 0xFF
                d[0x0080 + idx] = self.leng[ch][step]      & 0xFF
                d[0x00C0 + idx] = self.aux2[ch][step]      & 0xFF
                d[0x0200 + idx] = self.dens[ch][step]      & 0xFF
                d[0x0340 + idx] = self.huma[ch][step]      & 0xFF
                struct.pack_into('<H', d, OFFSET_PHAS + idx*2,
                                 self.phas[ch][step] & 0xFFFF)
                d[0x0400 + idx] = self.cvsel[ch][step]     & 0xFF
                d[0x0440 + idx] = self.sync[ch][step]      & 0xFF
                d[0x0480 + idx] = self.mod_bus[ch][step]   & 0xFF
                d[0x0780 + idx] = self.s_h[ch][step]       & 0xFF
                struct.pack_into('<h', d, OFFSET_MINV + idx*2,
                                 max(-32768, min(32767, self.minv[ch][step])))
                struct.pack_into('<H', d, OFFSET_MAXV + idx*2, self.maxv[ch][step])
                d[0x0640 + idx] = self.prob_val[ch][step]  & 0xFF
                struct.pack_into('<f', d, OFFSET_FREQ + idx*4, self.freq[ch][step])
                d[0x07C0 + idx] = self.quan[ch][step]      & 0xFF
                d[0x0A00 + idx] = self.aux1[ch][step]      & 0xFF

        for ch in range(4):
            base = OFFSET_CH_RECORDS + ch * CH_RECORD_SIZE
            if base + CH_RECORD_SIZE <= len(d):
                struct.pack_into('<H', d, base + CH_BPM_IDX  * 2, self.bpm[ch])
                struct.pack_into('<H', d, base + CH_PPQN_IDX * 2, self.ppqn[ch])
                struct.pack_into('<H', d, base + CH_VELO_IDX * 2, self.velo[ch])
                struct.pack_into('<H', d, base + CH_SH16_IDX * 2, self.sh16[ch])

    def to_bytes(self) -> bytes:
        """Serialize back to binary. Preserves unknown/uncertain regions."""
        d = bytearray(self.raw)
        self._write_arrays(d)
        return bytes(d)

    def save(self, path: str):
        with open(path, 'wb') as f:
            f.write(self.to_bytes())

    def display(self, verbose: bool = False):
        sz = len(self.raw)
        fmt_note = {3860: 'v1 format', 6404: 'v2 format', 8196: 'v3 format'}.get(sz, f'unknown format')
        print(f"=== FLUX Preset ({sz} bytes, {fmt_note}) ===")
        print()
        for ch in range(4):
            ch_name = ['CH1(orange)', 'CH2(green)', 'CH3(blue)', 'CH4(red)'][ch]
            print(f"  ─── {ch_name} ───")
            print(f"    PPQN: {self.ppqn[ch]}   VELO: {self.velo[ch]}   SH16: {self.sh16[ch]}   (BPM in PREF)")
            print()

            hdr = f"    {'':8} " + " ".join(f"S{s+1:02d}" for s in range(16))
            print(hdr)

            def row(name, vals, fmt=None, mapper=None, width=3):
                cells = []
                for v in vals:
                    if mapper:
                        s = mapper(v)[:width]
                    elif fmt:
                        s = fmt % v
                    else:
                        s = str(v)
                    cells.append(f"{s:>{width}}")
                print(f"    {name:<8}  " + "  ".join(cells))

            row('DENS',     self.dens[ch])
            row('GATE%',    self.gate[ch])
            row('LENG',     self.leng[ch])
            row('LOOP',     self.loop[ch])
            row('PHAS°',    self.phas[ch])
            row('AUX1',     self.aux1[ch],  mapper=aux_name, width=5)
            row('AUX2',     self.aux2[ch],  mapper=aux_name, width=5)
            row('MOD',      self.mod_bus[ch], mapper=mod_bus_name)
            row('PROB',     self.prob_val[ch])
            row('MINV_V',   [f"{v/1000:.1f}" for v in self.minv[ch]])
            row('MAXV_V',   [f"{v/1000:.0f}V" for v in self.maxv[ch]])
            row('QUAN',     self.quan[ch])
            if any(v != 0 for v in self.huma[ch]):
                row('HUMA',     self.huma[ch])
            if verbose:
                row('FREQ',  [f"{v:.2f}" for v in self.freq[ch]])
                row('CVSEL', self.cvsel[ch])
                row('SYNC',  self.sync[ch])
                row('S+H',   self.s_h[ch])
            print()

    def get_step(self, ch: int, step: int) -> dict:
        """Return all known parameters for a given channel+step."""
        return {
            'LOOP':     (self.loop[ch][step],                   'LIKELY'),
            'DENS':     (self.dens[ch][step],                   'CONFIRMED'),
            'GATE%':    (self.gate[ch][step],                   'LIKELY'),    # 0-99, default=10
            'LENG':     (self.leng[ch][step],                   'CONFIRMED'),
            'PHAS_deg': (self.phas[ch][step],                   'CONFIRMED'),
            'AUX1':     (aux_name(self.aux1[ch][step]),         'LIKELY'),    # 0x0A00
            'AUX2':     (aux_name(self.aux2[ch][step]),         'LIKELY'),    # 0x00C0
            'MOD_BUS':  (mod_bus_name(self.mod_bus[ch][step]),  'CONFIRMED'),
            'PROB_VAL': (self.prob_val[ch][step],               'LIKELY'),
            'MINV_mV':  (self.minv[ch][step],                   'LIKELY'),
            'MAXV_mV':  (self.maxv[ch][step],                   'CONFIRMED'),
            'HUMA':     (self.huma[ch][step],                   'LIKELY'),    # 0-127
            'QUAN':     (self.quan[ch][step],                   'LIKELY'),    # default=12
            'CVSEL':    (self.cvsel[ch][step],                  'UNCERTAIN'),
            'SYNC':     (self.sync[ch][step],                   'UNCERTAIN'),
            'S+H':      (self.s_h[ch][step],                    'UNCERTAIN'),
            'FREQ_Hz':  (round(self.freq[ch][step], 4),         'CONFIRMED'),
            # COMP (-99..+99 signed), DIFF (always 0): offsets unlocated
            # MASK, MSK>: likely in 0x0100-0x01FF as bitmasks, structure unclear
        }


# ---------------------------------------------------------------------------
# Diff tool — for community reverse-engineering
# ---------------------------------------------------------------------------

def diff_presets(path_a: str, path_b: str):
    """
    Show byte-level differences between two preset files.
    Use this to identify parameter offsets by changing one setting
    between saves and running: python3 flux_editor.py diff A.TXT B.TXT
    """
    with open(path_a, 'rb') as f: a = f.read()
    with open(path_b, 'rb') as f: b = f.read()

    if len(a) != len(b):
        print(f"NOTE: files differ in size ({len(a)} vs {len(b)} bytes)")

    diff_count = 0
    i = 0
    max_len = max(len(a), len(b))

    # Collect all differing bytes
    diffs = []
    while i < max_len:
        av = a[i] if i < len(a) else None
        bv = b[i] if i < len(b) else None
        if av != bv:
            diffs.append(i)
        i += 1

    if not diffs:
        print("Files are identical.")
        return

    # Group into runs
    print(f"Found {len(diffs)} differing byte(s):\n")
    print(f"  {'Offset':>8}  {'Old':>5}  {'New':>5}  {'Old(hex)':>8}  {'New(hex)':>8}  Notes")
    print(f"  {'------':>8}  {'---':>5}  {'---':>5}  {'--------':>8}  {'--------':>8}  -----")
    for off in diffs:
        av = a[off] if off < len(a) else '---'
        bv = b[off] if off < len(b) else '---'
        note = _offset_note(off)
        av_hex = f"0x{av:02X}" if isinstance(av, int) else str(av)
        bv_hex = f"0x{bv:02X}" if isinstance(bv, int) else str(bv)
        print(f"  0x{off:06X}  {str(av):>5}  {str(bv):>5}  {av_hex:>8}  {bv_hex:>8}  {note}")

    print()
    print("Hint: if you changed one parameter, the offsets above are its storage location.")
    print("Please share this output at the community forum to help map the format!")


def _offset_note(off: int) -> str:
    """Return a human-readable note about what lives at this offset, if known."""
    # Check step array regions
    for array_off, (name, cert) in STEP_ARRAYS_U8.items():
        if array_off <= off < array_off + 64:
            ch   = (off - array_off) // 16
            step = (off - array_off) % 16
            return f"{name} [ch{ch+1} step{step+1}] ({cert})"

    if 0x0380 <= off < 0x0400:
        idx = (off - 0x0380) // 2
        ch, step = idx // 16, idx % 16
        return f"PHAS_deg [ch{ch+1} step{step+1}] (CONFIRMED uint16)"

    if 0x0500 <= off < 0x0580:
        idx = (off - 0x0500) // 2
        ch, step = idx // 16, idx % 16
        return f"MINV_mV [ch{ch+1} step{step+1}] (LIKELY int16)"

    if 0x0580 <= off < 0x0600:
        idx = (off - 0x0580) // 2
        ch, step = idx // 16, idx % 16
        return f"MAXV_mV [ch{ch+1} step{step+1}] (CONFIRMED)"

    if 0x0680 <= off < 0x0780:
        idx = (off - 0x0680) // 4
        ch, step = idx // 16, idx % 16
        return f"FREQ_Hz [ch{ch+1} step{step+1}] (CONFIRMED)"

    if 0x0800 <= off < 0x1B80:
        return f"Evolve/Macro modulation (UNCERTAIN — needs mapping)"

    for ch in range(4):
        base = OFFSET_CH_RECORDS + ch * CH_RECORD_SIZE
        if base <= off < base + CH_RECORD_SIZE:
            rel = off - base
            if rel == CH_BPM_IDX  * 2: return f"BPM ch{ch+1} (CONFIRMED)"
            if rel == CH_BPM_IDX  * 2 + 1: return f"BPM ch{ch+1} high byte (CONFIRMED)"
            if rel == CH_PPQN_IDX * 2: return f"PPQN ch{ch+1} (CONFIRMED)"
            if rel == CH_VELO_IDX * 2: return f"VELO ch{ch+1} (CONFIRMED)"
            if rel == CH_SH16_IDX * 2: return f"SH16 ch{ch+1} (CONFIRMED)"
            if 0x14 <= rel < 0x18: return f"RNG seed ch{ch+1} (per-channel UUID)"
            if 0x54 <= rel < 0x60: return f"UUID bytes ch{ch+1}"
            return f"per-channel record ch{ch+1} +0x{rel:02X} (UNCERTAIN)"

    if 0x1D80 <= off <= 0x2003:
        return "end section (UNCERTAIN — ON/OFF gen / macro state)"

    return "unknown"


# ---------------------------------------------------------------------------
# Hex dump utility
# ---------------------------------------------------------------------------

def hexdump(data: bytes, start: int = 0, length: int = 256, width: int = 16):
    for i in range(0, length, width):
        off = start + i
        if off >= len(data): break
        chunk = data[off:off+width]
        hex_str = ' '.join(f'{b:02X}' for b in chunk)
        asc_str = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
        print(f"  {off:06X}:  {hex_str:<{width*3}}  {asc_str}")


# ---------------------------------------------------------------------------
# CLI interface
# ---------------------------------------------------------------------------

USAGE = """
FLUX Community Preset Editor  (reverse-engineered v1.07 format)

Usage:
  python3 flux_editor.py show   <file.TXT>           Show all decoded parameters
  python3 flux_editor.py pref   <PREF*.TXT>          Show persistent config file
  python3 flux_editor.py step   <file.TXT> <ch> <s>  Show single step (ch=1-4, s=1-16)
  python3 flux_editor.py diff   <A.TXT> <B.TXT>      Diff two files (byte-level)
  python3 flux_editor.py set    <file.TXT> <param> <ch> <step> <value> [out.TXT]
  python3 flux_editor.py hex    <file.TXT> [offset] [length]  Hexdump region
  python3 flux_editor.py map                          Print parameter offset map

Editable parameters (confirmed/likely):
  dens       Trigger density 0–64           uint8  offset 0x0000
  aux1       AUX1 mode index (see list)     uint8  offset 0x0040
  leng       Step length in 16ths 1–16      uint8  offset 0x0080
  curv       TM curve type index            uint8  offset 0x00C0
  mod_bus    Mod bus bitmask YEL=1,GRY=2,PUR=4  uint8  offset 0x0480
  prob_val   Probability % 0–100            uint8  offset 0x0640
  aux2       AUX2 mode index (see list)     uint8  offset 0x07C0
  maxv       Max CV voltage mV 0–8000       uint16 offset 0x0580
  freq       LFO frequency Hz               float  offset 0x0680
  bpm        BPM (per channel record)       uint16
"""

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
    # 'aux1': offset unlocated
    # 'aux2': offset unlocated
    # 'comp': offset unlocated (-99..+99, signed)
    # 'diff': offset unlocated (always 0)
    # 'mask': offset unlocated (bitmask, 0x0100-0x01FF region)
    # 'msk_gt': offset unlocated
    # 'val': offset unlocated
    # 'atk': offset unlocated (default=0)
    # 'rel': offset unlocated (default=100, possibly same block as prob_val)
    # 'acur': offset unlocated (float, default=0.00)
    # 'rcur': offset unlocated (float, default=0.00)
    # 'scal': offset unlocated (default=Maj)
}


def cmd_show(path):
    if path.upper().startswith('PREF') or 'PREF' in os.path.basename(path).upper():
        p = FluxPrefs.from_file(path)
        p.display()
    else:
        p = FluxPreset.from_file(path)
        p.display(verbose=True)


def cmd_pref(path):
    p = FluxPrefs.from_file(path)
    p.display()


def cmd_step(path, ch_s, step_s):
    ch   = int(ch_s)   - 1
    step = int(step_s) - 1
    p = FluxPreset.from_file(path)
    print(f"=== CH{ch+1} STEP{step+1} ===")
    params = p.get_step(ch, step)
    for name, (val, cert) in params.items():
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
    arr = getattr(p, attr)
    arr[ch][step] = val
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
    print("  ... (see AUX_MODES list in source for full table)")


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
