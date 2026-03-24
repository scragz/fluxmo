"""
FluxPreset — parser for FLUX/*.TXT preset files (~8196 bytes).

The sequencer has 4 channels × 16 steps = 64 step slots.
Step addressing: slot = step * 4 + channel  (both 0-indexed)

Data is stored in parallel arrays (not interleaved per step):
  Section 0x0000–0x07FF: Per-step parameter arrays (uint8 or uint16/float32)
  Section 0x0800–0x1B7F: Evolve LFO + Macro Pot modulation data (partially decoded)
  Section 0x1B80–0x1D7F: Per-channel configuration records (4 × 128 bytes)
  Section 0x1D80–0x2003: Additional state data (partially decoded)

Certainty levels:
  CONFIRMED  — verified against known defaults
  LIKELY     — strongly inferred from corpus / value matches
  UNCERTAIN  — structural guess, needs hardware validation
"""

import json
import secrets
import struct
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# AUX Mode index table (from manual p.21, "AUX modes in order of appearance")
# ---------------------------------------------------------------------------
AUX_MODES = (
    [
        "OFF",
        "ON",
        "START",
        "SOS",
        "1st",
        "Last",
        "DEL1",
        "DEL2",
        "DEL3",
        "DEL4",
        "DEL5",
        "DEL6",
        "DEL7",
        "DEL8",
        "TL1",
        "TL2",
        "TL3",
        "TL4",
        "TL5",
        "TL6",
        "TL7",
        "TL8",
        "TL9",
        "TL10",
        "TL11",
        "TL12",
        "TL13",
        "TL14",
        "TL15",
        "TL16",
        "& (AND)",
        "!& (NAND)",
        "|| (OR)",
        "!|| (NOR)",
        "x|| (XOR)",
        "CV>1V",
        "CV>2V",
        "CV>3V",
        "CV>4V",
        "CV>5V",
        "CV>6V",
        "CV>7V",
        "CV<1V",
        "CV<2V",
        "CV<3V",
        "CV<4V",
        "CV<5V",
        "CV<6V",
        "CV<7V",
    ]
    + [f"PPQ{i}" for i in range(1, 49)]
    + [f"/{i}" for i in range(1, 17)]
)


def aux_name(idx: int) -> str:
    if 0 <= idx < len(AUX_MODES):
        return AUX_MODES[idx]
    return f"UNKNOWN({idx})"


# ---------------------------------------------------------------------------
# MOD bus bitmask (YELLOW=bit0, GREY=bit1, PURPLE=bit2)
# ---------------------------------------------------------------------------
def mod_bus_name(val: int) -> str:
    if val == 0:
        return "OFF"
    names = []
    if val & 0x01:
        names.append("Y")
    if val & 0x02:
        names.append("G")
    if val & 0x04:
        names.append("P")
    return "+".join(names)


def mod_bus_full(val: int) -> str:
    if val == 0:
        return "OFF"
    names = []
    if val & 0x01:
        names.append("YEL")
    if val & 0x02:
        names.append("GRY")
    if val & 0x04:
        names.append("PUR")
    return "+".join(names)


CHANNEL_COUNT = 4
STEPS_PER_CHANNEL = 16
CURVE_LABELS = (
    ["1"]
    + [f"{major}.{minor}" for major in range(2, 9) for minor in range(0, 6)]
    + [f"NL{major}.{minor}" for major in range(2, 5) for minor in range(0, 5)]
)


def curve_name(idx: int) -> str:
    if 0 <= idx < len(CURVE_LABELS):
        return CURVE_LABELS[idx]
    return f"UNKNOWN({idx})"


@dataclass(frozen=True)
class ParamSpec:
    attr: str
    value_type: str
    certainty: str
    default: int | float
    minimum: int | float | None = None
    maximum: int | float | None = None
    display_name: str | None = None
    aliases: tuple[str, ...] = ()


# ---------------------------------------------------------------------------
# FLUX Preset file layout constants
# ---------------------------------------------------------------------------

# Per-step parameter arrays: each is 64 bytes (4ch × 16 steps).
# Step index = step * 4 + channel (0-indexed).
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
    0x0000: ("LOOP", "LIKELY"),  # Loop length per step (1–16). Default=1.
    0x0040: ("GATE", "LIKELY"),  # Gate/trigger length (0–99%). Default=10.
    0x0080: (
        "LENG",
        "CONFIRMED",
    ),  # Step length in 16ths. Default=1; corpus includes values up to 32.
    0x00C0: (
        "CURV",
        "CONFIRMED",
    ),  # Curve enum, step-major. 0x01=1, 0x02=2.0, 0x03=2.1. 0x00 decodes invalid on device.
    # 0x0100–0x01FF: VAL — see OFFSET_VAL below (float32 LE, 256 bytes = 64 × f32, step-major).
    #   Default=0.0. Confirmed: MAC0204 CH2 step4 shows "6.00" on display → f32=6.0 at 0x0134.
    0x0200: ("DENS", "CONFIRMED"),  # Trigger density (0–64 gates/step). Default=1.
    # 0x0240: COMP primary byte — CONFIRMED channel-major (ch*16+step), s8. See OFFSET_COMP_LO.
    # 0x0280: COMP companion/mirror — CONFIRMED channel-major. Must equal COMP_LO. See OFFSET_COMP_COMPANION.
    #         Device writes the same COMP value to both 0x0240 and 0x0280. Leaving 0x0280 zero while
    #         0x0240 is non-zero causes 4-digit overflow on the device display.
    # 0x02C0: COMP hi byte — CONFIRMED channel-major. 0x00 for COMP in range -99..+99. See OFFSET_COMP_HI.
    #         Writing non-zero causes 4-digit COMP overflow on device display.
    # 0x0300: unknown (all-zero in DEFAULT and corpus).
    0x0340: ("HUMA", "LIKELY"),  # Humanize (0–127). Default=0.
    # 0x0380–0x03FF: PHAS — see OFFSET_PHAS below (uint16 LE, 128 bytes)
    0x0400: ("CVSEL", "UNCERTAIN"),  # LFO CV source select (0–9 enum). Default=0.
    0x0440: ("SYNC", "UNCERTAIN"),  # LFO sync mode (0–4). Default=0.
    0x0480: (
        "MOD_BUS",
        "CONFIRMED",
    ),  # Modulation bus bitmask (YEL=1,GRY=2,PUR=4). Default=3.
    # 0x04C0: all zero. Candidate: ATK(0), DIFF(0), S+H(0).
    # 0x0500–0x057F: MINV — see OFFSET_MINV (int16 LE mV, 128 bytes)
    # 0x0580–0x05FF: MAXV — see OFFSET_MAXV (uint16 LE mV, 128 bytes)
    # 0x0600–0x063F: all zero. Candidate: ATK(0), ACUR(0.00 as f32).
    0x0640: ("PROB_V", "LIKELY"),  # Probability 0–100 OR REL 0–100 (both default=100)
    # 0x0680–0x077F: FREQ — see OFFSET_FREQ (float32 LE, 256 bytes)
    0x0780: ("S_H", "UNCERTAIN"),  # Sample & Hold — binary (0=OFF, 1=ON).
    0x07C0: ("QUAN", "LIKELY"),  # Quantizer semitones (0–12). Default=12 (chromatic).
}

# VAL: Per-step value (float32 LE, 0.0 default). 256 bytes = 64 × float32, step-major.
OFFSET_VAL = 0x0100  # CONFIRMED — f32. MAC0204 CH2 step4 = 6.0 ("6.00" on display).

# COMP: Curve compression (bipolar, -99..+99). Three 64-byte blocks, all channel-major (ch*16+step).
OFFSET_COMP_LO = (
    0x0240  # CONFIRMED — primary value byte (s8). Stores the full value for range -99..+99.
)
OFFSET_COMP_COMPANION = (
    0x0280  # CONFIRMED mirror — device writes identical COMP value here alongside OFFSET_COMP_LO.
    #          Must be populated; leaving it zero while COMP_LO is non-zero causes 4-digit overflow
    #          display on device. Previously labelled "unknown companion block".
)
OFFSET_COMP_HI = 0x02C0  # CONFIRMED — high byte. 0x00 for values in -99..+99; non-zero causes overflow display.

# PHAS: Phase shift in degrees, stored as uint16 LE (0–360°). 128 bytes = 64 × uint16, step-major.
OFFSET_PHAS = 0x0380  # CONFIRMED

# MINV: CV output minimum voltage, stored as int16 LE mV. 128 bytes = 64 × int16.
OFFSET_MINV = 0x0500  # LIKELY — int16 mV.

# MAXV: CV output max voltage, stored as uint16 mV (0–8000)
OFFSET_MAXV = 0x0580  # CONFIRMED — 64 × uint16 LE

# FREQ: CV LFO frequency in Hz, stored as float32
OFFSET_FREQ = 0x0680  # CONFIRMED — 64 × float32 LE

# Candidate late-file AUX arrays observed in device-saved presets.
# Current working slot formula is a channel-major 64-slot array rotated left by
# 4 bytes. That satisfies the observed corpus facts:
# - data/2024-09-15/MAC0204_.TXT: position 44 (0x2C) = CH4 step1
# - data/2024-09-15/MAC0202_.TXT: positions 44..59 form a full 16-step run
# This remains provisional, but parse+write round-trips preserve raw bytes.
OFFSET_AUX1_CANDIDATE = 0x1900
OFFSET_AUX2_CANDIDATE = 0x1940

# Loop sequence control bytes (per channel, not per step).
# Hardware correlates these with the displayed loop range:
#   0x0A00..0x0A03 = loop end (1..16)
#   0x0A04..0x0A07 = loop start (1..16, usually 1)
OFFSET_LOOP_END = 0x0A00
OFFSET_LOOP_START = 0x0A04
LOOP_CONTROL_DEFAULT = bytes.fromhex(
    "01 01 01 01 01 01 01 01 "
    "00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 "
    "01 01 01 01 00 00 00 00"
)

# Per-channel record offsets (4 records × 128 bytes, starting at 0x1B80)
OFFSET_CH_RECORDS = 0x1B80
CH_RECORD_SIZE = 0x80  # 128 bytes

# Within each 128-byte per-channel record (uint16 LE indices):
# NOTE: u16[19] was previously mislabeled as CURV. Manual review confirms CURV is a
# per-step rhythm parameter, not a per-channel record field. The word at index 19 is
# still parsed as a raw value for inspection, but the builder must not expose or write it.
CH_CURV_IDX = 19
CH_VELO_IDX = 21  # CONFIRMED: VELO=127 matches
CH_SH16_IDX = 49  # CONFIRMED: SH16=2 matches
CH_BPM_IDX = 60  # LIKELY: value matches PREF BPM
CH_RNG_SEED_BYTE = 0x14
CH_RNG2_BYTE = 0x54  # CONFIRMED: 12-byte UUID at byte offset 0x54

CHANNEL_RECORD_DEFAULTS_U16 = {
    # u16[0..2,6,8,18,33] = 1: required by firmware (device hangs if these are 0)
    0: 1,
    1: 1,
    2: 1,
    3: 8,
    4: 10,
    5: 99,
    6: 1,
    7: 64,
    8: 1,
    9: 58,
    12: 0xFF9C,  # -100 as int16 (constant across all device presets)
    13: 100,
    15: 45,
    16: 0xFF9C,  # -100 as int16
    17: 99,
    18: 1,
    19: 4,
    23: 17,
    25: 64,
    27: 182,
    29: 182,
    31: 5,
    33: 1,
    35: 8000,
    37: 8000,
    39: 100,
    41: 100,
    51: 24,
    53: 24,
    55: 0x0130,  # 304
    57: 0x0130,  # 304
    59: 0x0130,  # 304
    61: 0x0168,  # 360
    62: 200,
    63: 200,
}

# Required/default bytes in section B (0x0800–0x1B7F, LFO/Macro modulation data).
# These bytes are needed for the builder baseline to match real device-saved defaults.
# Excludes bytes written by _write_arrays() and random seed regions.
# Extracted from data/2024-09-15/ corpus.
SECTION_B_REQUIRED = {
    # 0x0A00–0x0AFF
    0x0A7C: 0x01,
    0x0A7D: 0x01,
    0x0A7E: 0x01,
    0x0A7F: 0x01,
    0x0AC0: 0x01,
    0x0AC1: 0x01,
    0x0AC2: 0x01,
    0x0AC3: 0x01,
    0x0AD4: 0x01,
    0x0AD5: 0x01,
    0x0AD6: 0x01,
    0x0AD7: 0x01,
    0x0AE8: 0x01,
    0x0AE9: 0x01,
    0x0AEA: 0x01,
    0x0AEB: 0x01,
    # 0x0B00–0x0BFF
    0x0B0C: 0x01,
    0x0B0D: 0x01,
    0x0B0E: 0x01,
    0x0B0F: 0x01,
    0x0B50: 0x01,
    0x0B51: 0x01,
    0x0B52: 0x01,
    0x0B53: 0x01,
    0x0B94: 0x01,
    0x0B95: 0x01,
    0x0B96: 0x01,
    0x0B97: 0x01,
    0x0BA8: 0x01,
    0x0BA9: 0x01,
    0x0BAA: 0x01,
    0x0BAB: 0x01,
    0x0BBC: 0x01,
    0x0BBD: 0x01,
    0x0BBE: 0x01,
    0x0BBF: 0x01,
    # 0x0C00–0x0CFF
    0x0C48: 0xF0,
    0x0C5C: 0x01,
    0x0C5D: 0x01,
    0x0C5E: 0x01,
    0x0C5F: 0x01,
    0x0C70: 0x01,
    0x0C71: 0x01,
    0x0C72: 0x01,
    0x0C73: 0x01,
    0x0C84: 0x01,
    0x0C85: 0x01,
    0x0C86: 0x01,
    0x0C87: 0x01,
    0x0C98: 0x01,
    0x0C99: 0x01,
    0x0C9A: 0x01,
    0x0C9B: 0x01,
    # 0x0D00–0x0DFF
    0x0DFC: 0x02,
    # 0x0E00–0x0EFF
    0x0EA0: 0xC8,
    0x0EA1: 0xC8,
    0x0EA2: 0xC8,
    0x0EA3: 0xC8,
    0x0EA4: 0xC8,
    0x0EA5: 0xC8,
    0x0EA6: 0xC8,
    0x0EA7: 0xC8,
    0x0EA8: 0xC8,
    0x0EA9: 0xC8,
    0x0EAA: 0xC8,
    0x0EAB: 0xC8,
    0x0EAC: 0xC8,
    0x0EAD: 0xC8,
    0x0EAE: 0xC8,
    0x0EAF: 0xC8,
    0x0EB0: 0xC8,
    0x0EB1: 0xC8,
    0x0EB2: 0xC8,
    0x0EB3: 0xC8,
    0x0EB4: 0xC8,
    0x0EB5: 0xC8,
    0x0EB6: 0xC8,
    0x0EB7: 0xC8,
    0x0EB8: 0xC8,
    0x0EB9: 0xC8,
    0x0EBA: 0xC8,
    0x0EBB: 0xC8,
    0x0EBC: 0xC8,
    0x0EBD: 0xC8,
    0x0EBE: 0xC8,
    0x0EBF: 0xC8,
    0x0EC0: 0xC8,
    0x0EC1: 0xC8,
    0x0EC2: 0xC8,
    0x0EC3: 0xC8,
    0x0EC4: 0xC8,
    0x0EC5: 0xC8,
    0x0EC6: 0xC8,
    0x0EC7: 0xC8,
    0x0EC8: 0xC8,
    0x0EC9: 0xC8,
    0x0ECA: 0xC8,
    0x0ECB: 0xC8,
    0x0ECC: 0xC8,
    0x0ECD: 0xC8,
    0x0ECE: 0xC8,
    0x0ECF: 0xC8,
    0x0ED0: 0xC8,
    0x0ED1: 0xC8,
    0x0ED2: 0xC8,
    0x0ED3: 0xC8,
    0x0ED4: 0xC8,
    0x0ED5: 0xC8,
    0x0ED6: 0xC8,
    0x0ED7: 0xC8,
    0x0ED8: 0xC8,
    0x0ED9: 0xC8,
    0x0EDA: 0xC8,
    0x0EDB: 0xC8,
    0x0EDC: 0xC8,
    0x0EDD: 0xC8,
    0x0EDE: 0xC8,
    0x0EDF: 0xC8,
    0x0EE0: 0x2B,
    0x0EE2: 0x1D,
    0x0EE8: 0x02,
    0x0EEA: 0x02,
    0x0EEC: 0x02,
    0x0EEE: 0x02,
    # 0x0F00–0x0FFF
    0x0FB1: 0x02,
    0x0FB2: 0x02,
    0x0FB3: 0x02,
    0x0FB4: 0x02,
    0x0FB5: 0x02,
    0x0FB6: 0x02,
    0x0FB7: 0x02,
    0x0FB8: 0x02,
    0x0FB9: 0x02,
    0x0FBA: 0x02,
    0x0FBB: 0x02,
    0x0FBC: 0x02,
    0x0FBD: 0x02,
    0x0FBE: 0x02,
    0x0FBF: 0x02,
    0x0FC0: 0x02,
    0x0FC2: 0x02,
    0x0FC3: 0x02,
    0x0FC4: 0x02,
    0x0FC5: 0x02,
    0x0FC6: 0x02,
    0x0FC7: 0x02,
    0x0FC8: 0x02,
    0x0FC9: 0x02,
    0x0FCA: 0x02,
    0x0FCB: 0x02,
    0x0FCC: 0x02,
    0x0FCD: 0x02,
    0x0FCE: 0x02,
    0x0FCF: 0x02,
    0x0FD0: 0x02,
    0x0FD1: 0x02,
    0x0FD3: 0x02,
    0x0FD4: 0x02,
    0x0FD5: 0x02,
    0x0FD6: 0x02,
    0x0FD7: 0x02,
    0x0FD8: 0x02,
    0x0FD9: 0x02,
    0x0FDA: 0x02,
    0x0FDB: 0x02,
    0x0FDC: 0x02,
    0x0FDD: 0x02,
    0x0FDE: 0x02,
    0x0FDF: 0x02,
    0x0FE0: 0x02,
    0x0FE1: 0x02,
    0x0FE2: 0x02,
    0x0FE4: 0x02,
    0x0FE5: 0x02,
    0x0FE6: 0x02,
    0x0FE7: 0x02,
    0x0FE8: 0x02,
    0x0FE9: 0x02,
    0x0FEA: 0x02,
    0x0FEB: 0x02,
    0x0FEC: 0x02,
    0x0FED: 0x02,
    0x0FEE: 0x02,
    0x0FEF: 0x02,
    0x0FF0: 0x02,
    0x0FF1: 0x02,
    0x0FF2: 0x02,
    0x0FF3: 0x02,
    # 0x1800–0x18FF
    0x18B4: 0x01,
    0x18B6: 0x01,
    0x18B8: 0x01,
    0x18BA: 0x01,
    # 0x1B00–0x1BFF
    0x1B7C: 0xC8,
    0x1B7E: 0xC8,
}

# Trailing section 0x1D80–0x2003 (644 bytes).
# Identical in all device-saved presets. Required for firmware to accept the file.
# Extracted from corpus data/2024-09-15/MAC0201_.TXT.
REFERENCE_TRAILING = (
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1D80
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1D90
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1DA0
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1DB0
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1DC0
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x2d\x00"  # 1DD0
    b"\x02\x00\x02\x00\x00\x00\x01\x00\x01\x00\x10\x00\x00\x00\x10\x00"  # 1DE0
    b"\x00\x00\x08\x00\x00\x00\x2d\x00\x02\x00\x02\x00\x00\x00\x01\x00"  # 1DF0
    b"\x01\x00\x10\x00\x00\x00\x10\x00\x00\x00\x08\x00\x00\x00\x2d\x00"  # 1E00
    b"\x02\x00\x02\x00\x00\x00\x01\x00\x01\x00\x10\x00\x00\x00\x10\x00"  # 1E10
    b"\x00\x00\x08\x00\x00\x00\x2d\x00\x02\x00\x02\x00\x00\x00\x01\x00"  # 1E20
    b"\x01\x00\x10\x00\x00\x00\x10\x00\x00\x00\x08\x00\x00\x00\xa0\xc1"  # 1E30
    b"\x00\x00\xa0\x41\x00\x00\xa0\xc1\x00\x00\xa0\x41\x00\x00\xa0\xc1"  # 1E40
    b"\x00\x00\xa0\x41\x0a\xd7\x23\x3c\x00\x00\xa0\x41\x00\x00\xa0\xc1"  # 1E50
    b"\x00\x00\xa0\x41\x00\x00\xa0\xc1\x00\x00\xa0\x41\x00\x00\xa0\xc1"  # 1E60
    b"\x00\x00\xa0\x41\x0a\xd7\x23\x3c\x00\x00\xa0\x41\x00\x00\xa0\xc1"  # 1E70
    b"\x00\x00\xa0\x41\x00\x00\xa0\xc1\x00\x00\xa0\x41\x00\x00\xa0\xc1"  # 1E80
    b"\x00\x00\xa0\x41\x0a\xd7\x23\x3c\x00\x00\xa0\x41\x00\x00\xa0\xc1"  # 1E90
    b"\x00\x00\xa0\x41\x00\x00\xa0\xc1\x00\x00\xa0\x41\x00\x00\xa0\xc1"  # 1EA0
    b"\x00\x00\xa0\x41\x0a\xd7\x23\x3c\x00\x00\xa0\x41\x01\x01\x01\x01"  # 1EB0
    b"\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01"  # 1EC0
    b"\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01"  # 1ED0
    b"\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01"  # 1EE0
    b"\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00"  # 1EF0
    b"\x01\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00\x01\x00"  # 1F00
    b"\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\x00"  # 1F10
    b"\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00"  # 1F20
    b"\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1F30
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1F40
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1F50
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1F60
    b"\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1F70
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00"  # 1F80
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\x00"  # 1F90
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1FA0
    b"\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1FB0
    b"\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1FC0
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00"  # 1FD0
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\x00"  # 1FE0
    b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # 1FF0
    b"\x01\x00\x00\x00"  # 2000
)

STEP_PARAM_SPECS = {
    "loop": ParamSpec("loop", "u8", "LIKELY", 1, 1, 16, "LOOP"),
    "gate": ParamSpec("gate", "u8", "LIKELY", 10, 0, 99, "GATE%", ("gate%",)),
    "dens": ParamSpec("dens", "u8", "CONFIRMED", 1, 1, 64, "DENS"),
    "curv": ParamSpec(
        "tm_curv", "u8", "CONFIRMED", 0, 0, len(CURVE_LABELS) - 1, "CURV", ("curve",)
    ),
    "leng": ParamSpec("leng", "u8", "CONFIRMED", 1, 1, 32, "LENG", ("length",)),
    "aux1": ParamSpec("aux1", "u8", "UNCERTAIN", 0, 0, len(AUX_MODES) - 1, "AUX1"),
    "aux2": ParamSpec("aux2", "u8", "UNCERTAIN", 0, 0, len(AUX_MODES) - 1, "AUX2"),
    "huma": ParamSpec("huma", "u8", "LIKELY", 0, 0, 127, "HUMA"),
    "val": ParamSpec("val", "f32", "CONFIRMED", 0.0, None, None, "VAL"),
    "comp": ParamSpec("comp", "i8", "CONFIRMED", 0, -99, 99, "COMP%", ("comp%",)),
    "phas": ParamSpec("phas", "u16", "CONFIRMED", 0, 0, 360, "PHAS_deg", ("phas_deg",)),
    "cvsel": ParamSpec("cvsel", "u8", "UNCERTAIN", 0, 0, 9, "CVSEL"),
    "sync": ParamSpec("sync", "u8", "UNCERTAIN", 0, 0, 4, "SYNC"),
    "mod_bus": ParamSpec(
        "mod_bus", "u8", "CONFIRMED", 3, 0, 7, "MOD_BUS", ("mod", "modbus")
    ),
    "s_h": ParamSpec(
        "s_h",
        "u8",
        "UNCERTAIN",
        0,
        0,
        1,
        "S+H",
        ("s+h", "sample_hold", "sample_and_hold"),
    ),
    "prob_val": ParamSpec(
        "prob_val", "u8", "LIKELY", 100, 0, 100, "PROB_VAL", ("prob",)
    ),
    "minv": ParamSpec(
        "minv", "i16", "LIKELY", 0, -32768, 32767, "MINV_mV", ("minv_mv",)
    ),
    "maxv": ParamSpec(
        "maxv", "u16", "CONFIRMED", 8000, 0, 8000, "MAXV_mV", ("maxv_mv",)
    ),
    "quan": ParamSpec("quan", "u8", "LIKELY", 12, 0, 12, "QUAN"),
    "freq": ParamSpec(
        "freq", "f32", "CONFIRMED", 1.0, 0.0, None, "FREQ_Hz", ("freq_hz",)
    ),
}

CHANNEL_PARAM_SPECS = {
    "bpm": ParamSpec("bpm", "u16", "LIKELY", 120, 0, 65535, "BPM"),
    "velo": ParamSpec("velo", "u16", "CONFIRMED", 127, 0, 127, "VELO"),
    "sh16": ParamSpec("sh16", "u16", "CONFIRMED", 2, 0, 65535, "SH16"),
}


def _build_alias_map(specs: dict[str, ParamSpec]) -> dict[str, str]:
    aliases = {}
    for name, spec in specs.items():
        aliases[name] = name
        for alias in spec.aliases:
            aliases[alias] = name
    return aliases


STEP_PARAM_ALIASES = _build_alias_map(STEP_PARAM_SPECS)
CHANNEL_PARAM_ALIASES = _build_alias_map(CHANNEL_PARAM_SPECS)


def _normalize_key(key: str) -> str:
    return key.strip().lower().replace(" ", "_").replace("-", "_")


def _has_explicit_field(values, aliases: dict[str, str], canonical: str) -> bool:
    if not isinstance(values, dict):
        return False

    for raw_key in values:
        if (
            isinstance(raw_key, str)
            and aliases.get(_normalize_key(raw_key)) == canonical
        ):
            return True
    return False


def _parse_aux_mode(value):
    if isinstance(value, str):
        lookup = _normalize_key(value)
        for idx, name in enumerate(AUX_MODES):
            if _normalize_key(name) == lookup:
                return idx
        raise ValueError(f"unknown AUX mode '{value}'")
    return value


def _parse_mod_bus(value):
    if not isinstance(value, str):
        return value

    lookup = _normalize_key(value)
    if lookup in {"off", "none", "0"}:
        return 0

    parts = lookup.replace(",", "+").split("+")
    mapping = {
        "y": 0x01,
        "yel": 0x01,
        "yellow": 0x01,
        "g": 0x02,
        "gry": 0x02,
        "gray": 0x02,
        "grey": 0x02,
        "p": 0x04,
        "pur": 0x04,
        "purple": 0x04,
    }
    total = 0
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if part not in mapping:
            raise ValueError(f"unknown mod bus component '{part}'")
        total |= mapping[part]
    return total


def _parse_curve(value):
    if isinstance(value, bool):
        return value

    lookup = {label.upper(): idx for idx, label in enumerate(CURVE_LABELS)}

    if isinstance(value, str):
        raw = value.strip().upper()
        if raw in {"1", "1.0"}:
            return 0
        if raw.isdigit():
            n = int(raw)
            if 2 <= n <= 8:
                raw = f"{n}.0"
        if raw in lookup:
            return lookup[raw]
        raise ValueError(f"unknown CURV label '{value}'")

    if isinstance(value, int):
        if value == 1:
            return 0
        if 2 <= value <= 8:
            return lookup[f"{value}.0"]
        raise ValueError(f"unknown CURV numeric value '{value}'")

    if isinstance(value, float):
        rounded = round(value, 1)
        if abs(value - rounded) > 1e-9:
            raise ValueError(f"unknown CURV numeric value '{value}'")
        return _parse_curve(f"{rounded:.1f}")

    return value


# ---------------------------------------------------------------------------
# FluxPreset
# ---------------------------------------------------------------------------


class FluxPreset:
    """
    Parses FLUX/*.TXT preset files (~8196 bytes).

    The file contains 64 step slots (4 channels × 16 steps).
    Step addressing: slot = step * 4 + channel  (both 0-indexed)
    """

    EXPECTED_SIZE = 8196

    def __init__(self):
        self.raw = self._default_raw()
        # per-step arrays, shape [4 channels][16 steps]
        self.loop = [
            [STEP_PARAM_SPECS["loop"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.loop_start = [STEP_PARAM_SPECS["loop"].default] * CHANNEL_COUNT
        self.loop_end = [STEP_PARAM_SPECS["loop"].default] * CHANNEL_COUNT
        self.gate = [
            [STEP_PARAM_SPECS["gate"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.leng = [
            [STEP_PARAM_SPECS["leng"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.aux1 = [
            [STEP_PARAM_SPECS["aux1"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.aux2 = [
            [STEP_PARAM_SPECS["aux2"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.dens = [
            [STEP_PARAM_SPECS["dens"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.tm_curv = [
            [STEP_PARAM_SPECS["curv"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.val = [
            [STEP_PARAM_SPECS["val"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.comp = [
            [STEP_PARAM_SPECS["comp"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.huma = [
            [STEP_PARAM_SPECS["huma"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.phas = [
            [STEP_PARAM_SPECS["phas"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.cvsel = [
            [STEP_PARAM_SPECS["cvsel"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.sync = [
            [STEP_PARAM_SPECS["sync"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.mod_bus = [
            [STEP_PARAM_SPECS["mod_bus"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.s_h = [
            [STEP_PARAM_SPECS["s_h"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.minv = [
            [STEP_PARAM_SPECS["minv"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.maxv = [
            [STEP_PARAM_SPECS["maxv"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.prob_val = [
            [STEP_PARAM_SPECS["prob_val"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.freq = [
            [STEP_PARAM_SPECS["freq"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        self.quan = [
            [STEP_PARAM_SPECS["quan"].default] * STEPS_PER_CHANNEL
            for _ in range(CHANNEL_COUNT)
        ]
        # per-channel (from channel records at 0x1B80)
        self.bpm = [CHANNEL_PARAM_SPECS["bpm"].default] * CHANNEL_COUNT
        self.curv = [4] * CHANNEL_COUNT
        self.velo = [CHANNEL_PARAM_SPECS["velo"].default] * CHANNEL_COUNT
        self.sh16 = [CHANNEL_PARAM_SPECS["sh16"].default] * CHANNEL_COUNT

    @classmethod
    def _default_raw(cls) -> bytearray:
        d = bytearray(cls.EXPECTED_SIZE)
        for ch in range(CHANNEL_COUNT):
            base = OFFSET_CH_RECORDS + ch * CH_RECORD_SIZE
            for idx, value in CHANNEL_RECORD_DEFAULTS_U16.items():
                struct.pack_into("<H", d, base + idx * 2, value)
            if ch == 3:
                # Device-saved v3 defaults keep CH4's final two words at zero.
                struct.pack_into("<H", d, base + 62 * 2, 0)
                struct.pack_into("<H", d, base + 63 * 2, 0)
            d[base + CH_RNG_SEED_BYTE : base + CH_RNG_SEED_BYTE + 4] = (
                secrets.token_bytes(4)
            )
            d[base + CH_RNG2_BYTE : base + CH_RNG2_BYTE + 12] = secrets.token_bytes(12)
        d[OFFSET_LOOP_END : OFFSET_LOOP_END + len(LOOP_CONTROL_DEFAULT)] = (
            LOOP_CONTROL_DEFAULT
        )
        # Device-saved defaults keep this 64-byte step-major selector block at 0x01.
        # Setting it to 0x00 makes the curve UI decode as an invalid PPQN64-like mode.
        d[0x00C0:0x0100] = bytes([0x01]) * 0x40
        for off, val in SECTION_B_REQUIRED.items():
            d[off] = val
        d[0x1D80 : 0x1D80 + len(REFERENCE_TRAILING)] = REFERENCE_TRAILING
        return d

    @classmethod
    def from_file(cls, path: str) -> "FluxPreset":
        p = cls()
        with open(path, "rb") as f:
            p.raw = bytearray(f.read())
        sz = len(p.raw)
        if sz != cls.EXPECTED_SIZE:
            raise ValueError(
                f"Unsupported preset size {sz} bytes. Only v3 ({cls.EXPECTED_SIZE} bytes) is supported."
            )
        p._parse()
        return p

    @classmethod
    def from_json_text(cls, text: str, source: str = "inline JSON") -> "FluxPreset":
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Invalid JSON in {source}: {exc.msg} at line {exc.lineno} column {exc.colno}"
            ) from exc
        return cls.from_dict(data)

    @classmethod
    def from_json_file(cls, path: str) -> "FluxPreset":
        with open(path, "r", encoding="utf-8") as f:
            return cls.from_json_text(f.read(), path)

    @classmethod
    def from_dict(cls, data: dict) -> "FluxPreset":
        if not isinstance(data, dict):
            raise ValueError("Preset JSON root must be an object.")

        allowed_top_level = {"channel_defaults", "step_defaults", "channels"}
        extra_keys = sorted(set(data) - allowed_top_level)
        if extra_keys:
            raise ValueError(f"Unknown top-level key(s): {', '.join(extra_keys)}")

        preset = cls()

        step_defaults_data = data.get("step_defaults")
        channel_defaults = preset._normalize_values(
            data.get("channel_defaults"),
            CHANNEL_PARAM_SPECS,
            CHANNEL_PARAM_ALIASES,
            "channel_defaults",
        )
        for ch in range(CHANNEL_COUNT):
            for key, value in channel_defaults.items():
                preset._set_channel_value(ch, key, value, f"channel_defaults.{key}")

        step_defaults = preset._normalize_values(
            step_defaults_data,
            STEP_PARAM_SPECS,
            STEP_PARAM_ALIASES,
            "step_defaults",
        )
        step_defaults_sets_loop = _has_explicit_field(
            step_defaults_data,
            STEP_PARAM_ALIASES,
            "loop",
        )
        for ch in range(CHANNEL_COUNT):
            for step in range(STEPS_PER_CHANNEL):
                for key, value in step_defaults.items():
                    preset._set_step_value(ch, step, key, value, f"step_defaults.{key}")

        channels = data.get("channels", [])
        if not isinstance(channels, list):
            raise ValueError("'channels' must be an array.")
        if len(channels) > CHANNEL_COUNT:
            raise ValueError(f"'channels' can contain at most {CHANNEL_COUNT} entries.")

        for ch, channel_data in enumerate(channels):
            if channel_data is None:
                continue
            if not isinstance(channel_data, dict):
                raise ValueError(f"channels[{ch}] must be an object.")

            channel_fields = {
                key: value for key, value in channel_data.items() if key != "steps"
            }
            for key, value in preset._normalize_values(
                channel_fields,
                CHANNEL_PARAM_SPECS,
                CHANNEL_PARAM_ALIASES,
                f"channels[{ch}]",
            ).items():
                preset._set_channel_value(ch, key, value, f"channels[{ch}].{key}")

            steps = channel_data.get("steps", [])
            if steps is None:
                continue
            if not isinstance(steps, list):
                raise ValueError(f"channels[{ch}].steps must be an array.")
            if len(steps) > STEPS_PER_CHANNEL:
                raise ValueError(
                    f"channels[{ch}].steps can contain at most {STEPS_PER_CHANNEL} entries."
                )

            explicit_loop_steps = set()
            for step, step_data in enumerate(steps):
                if step_data is None:
                    preset._reset_null_step(ch, step)
                    continue
                if not isinstance(step_data, dict):
                    raise ValueError(f"channels[{ch}].steps[{step}] must be an object.")
                if _has_explicit_field(step_data, STEP_PARAM_ALIASES, "loop"):
                    explicit_loop_steps.add(step)
                for key, value in preset._normalize_values(
                    step_data,
                    STEP_PARAM_SPECS,
                    STEP_PARAM_ALIASES,
                    f"channels[{ch}].steps[{step}]",
                ).items():
                    preset._set_step_value(
                        ch,
                        step,
                        key,
                        value,
                        f"channels[{ch}].steps[{step}].{key}",
                    )

            if steps and not step_defaults_sets_loop:
                inferred_loop = len(steps)
                for step in range(STEPS_PER_CHANNEL):
                    if step in explicit_loop_steps:
                        continue
                    preset.loop[ch][step] = inferred_loop

            preset.loop_start[ch] = STEP_PARAM_SPECS["loop"].default
            preset.loop_end[ch] = max(preset.loop[ch])

        return preset

    def _slot(self, ch: int, step: int) -> int:
        """Linear index for channel/step combo."""
        return step * CHANNEL_COUNT + ch

    def _late_aux_slot(self, ch: int, step: int) -> int:
        """Provisional slot mapping for late-file AUX arrays at 0x1900/0x1940."""
        return (ch * STEPS_PER_CHANNEL + step - CHANNEL_COUNT) % (
            CHANNEL_COUNT * STEPS_PER_CHANNEL
        )

    def _normalize_values(
        self,
        values,
        specs: dict[str, ParamSpec],
        aliases: dict[str, str],
        path: str,
    ) -> dict[str, int | float]:
        if values is None:
            return {}
        if not isinstance(values, dict):
            raise ValueError(f"{path} must be an object.")

        normalized = {}
        for raw_key, raw_value in values.items():
            if not isinstance(raw_key, str):
                raise ValueError(f"{path} contains a non-string key.")
            key = _normalize_key(raw_key)
            if key not in aliases:
                raise ValueError(f"{path}.{raw_key}: unknown field")
            canonical = aliases[key]
            spec = specs[canonical]
            normalized[canonical] = self._coerce_value(
                spec, raw_value, f"{path}.{raw_key}"
            )
        return normalized

    def _coerce_value(self, spec: ParamSpec, value, path: str) -> int | float:
        if spec.attr in {"aux1", "aux2"}:
            value = _parse_aux_mode(value)
        elif spec.attr == "tm_curv":
            value = _parse_curve(value)
        elif spec.attr == "mod_bus":
            value = _parse_mod_bus(value)
        elif spec.attr == "s_h" and isinstance(value, bool):
            value = int(value)

        if spec.value_type == "f32":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{path} must be a number.")
            coerced = float(value)
        else:
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError(f"{path} must be an integer.")
            coerced = value

        if spec.minimum is not None and coerced < spec.minimum:
            raise ValueError(f"{path} must be >= {spec.minimum}.")
        if spec.maximum is not None and coerced > spec.maximum:
            raise ValueError(f"{path} must be <= {spec.maximum}.")
        return coerced

    def _set_step_value(self, ch: int, step: int, key: str, value, path: str):
        spec = STEP_PARAM_SPECS[key]
        getattr(self, spec.attr)[ch][step] = value

    def _set_channel_value(self, ch: int, key: str, value, path: str):
        spec = CHANNEL_PARAM_SPECS[key]
        getattr(self, spec.attr)[ch] = value

    def _reset_null_step(self, ch: int, step: int):
        # A JSON null step means "default silent step", not "inherit step_defaults".
        for key, spec in STEP_PARAM_SPECS.items():
            getattr(self, spec.attr)[ch][step] = spec.default
        self.dens[ch][step] = 0

    def _parse(self):
        d = self.raw

        def safe_u8(off):
            return d[off] if off < len(d) else 0

        def safe_s8(off):
            return struct.unpack_from("<b", d, off)[0] if off < len(d) else 0

        def safe_u16(off):
            return struct.unpack_from("<H", d, off)[0] if off + 2 <= len(d) else 0

        def safe_s16(off):
            return struct.unpack_from("<h", d, off)[0] if off + 2 <= len(d) else 0

        def safe_f32(off):
            return struct.unpack_from("<f", d, off)[0] if off + 4 <= len(d) else 0.0

        def safe_curve(off):
            raw = safe_u8(off)
            return 0xFF if raw == 0 else raw - 1

        for ch in range(CHANNEL_COUNT):
            for step in range(STEPS_PER_CHANNEL):
                idx = self._slot(ch, step)
                aux_idx = self._late_aux_slot(ch, step)
                self.gate[ch][step] = safe_u8(0x0040 + idx)
                self.leng[ch][step] = safe_u8(0x0080 + idx)
                self.aux1[ch][step] = safe_u8(OFFSET_AUX1_CANDIDATE + aux_idx)
                self.aux2[ch][step] = safe_u8(OFFSET_AUX2_CANDIDATE + aux_idx)
                self.dens[ch][step] = safe_u8(0x0200 + idx)
                self.tm_curv[ch][step] = safe_curve(0x00C0 + idx)
                self.val[ch][step] = safe_f32(OFFSET_VAL + idx * 4)
                ch_idx = ch * STEPS_PER_CHANNEL + step  # channel-major
                self.comp[ch][step] = safe_s8(OFFSET_COMP_LO + ch_idx)
                self.huma[ch][step] = safe_u8(0x0340 + idx)
                self.phas[ch][step] = safe_u16(OFFSET_PHAS + idx * 2)
                self.cvsel[ch][step] = safe_u8(0x0400 + idx)
                self.sync[ch][step] = safe_u8(0x0440 + idx)
                self.mod_bus[ch][step] = safe_u8(0x0480 + idx)
                self.s_h[ch][step] = safe_u8(0x0780 + idx)
                self.minv[ch][step] = safe_s16(OFFSET_MINV + idx * 2)
                self.maxv[ch][step] = safe_u16(OFFSET_MAXV + idx * 2)
                self.prob_val[ch][step] = safe_u8(0x0640 + idx)
                self.freq[ch][step] = safe_f32(OFFSET_FREQ + idx * 4)
                self.quan[ch][step] = safe_u8(0x07C0 + idx)

        for ch in range(CHANNEL_COUNT):
            loop_end = safe_u8(OFFSET_LOOP_END + ch)
            loop_start = safe_u8(OFFSET_LOOP_START + ch)
            if not (1 <= loop_start <= loop_end <= 16):
                loop_start = 1
                loop_end = STEP_PARAM_SPECS["loop"].default
            self.loop_start[ch] = loop_start
            self.loop_end[ch] = loop_end
            for step in range(STEPS_PER_CHANNEL):
                self.loop[ch][step] = loop_end

        for ch in range(CHANNEL_COUNT):
            base = OFFSET_CH_RECORDS + ch * CH_RECORD_SIZE
            if base + CH_RECORD_SIZE <= len(d):
                self.bpm[ch] = safe_u16(base + CH_BPM_IDX * 2)
                self.curv[ch] = safe_u16(base + CH_CURV_IDX * 2)
                self.velo[ch] = safe_u16(base + CH_VELO_IDX * 2)
                self.sh16[ch] = safe_u16(base + CH_SH16_IDX * 2)

    def _write_arrays(self, d: bytearray):
        loop_end_by_channel = [max(self.loop[ch]) for ch in range(CHANNEL_COUNT)]
        for ch in range(CHANNEL_COUNT):
            for step in range(STEPS_PER_CHANNEL):
                idx = self._slot(ch, step)
                aux_idx = self._late_aux_slot(ch, step)
                d[0x0000 + idx] = 0x01  # legacy per-step mirror; firmware ignores, always 0x01
                d[0x0040 + idx] = self.gate[ch][step] & 0xFF
                d[0x0080 + idx] = self.leng[ch][step] & 0xFF
                d[OFFSET_AUX1_CANDIDATE + aux_idx] = self.aux1[ch][step] & 0xFF
                d[OFFSET_AUX2_CANDIDATE + aux_idx] = self.aux2[ch][step] & 0xFF
                d[0x0200 + idx] = self.dens[ch][step] & 0xFF
                d[0x00C0 + idx] = (self.tm_curv[ch][step] + 1) & 0xFF
                struct.pack_into(
                    "<f", d, OFFSET_VAL + idx * 4, float(self.val[ch][step])
                )
                ch_idx = ch * STEPS_PER_CHANNEL + step  # channel-major
                d[OFFSET_COMP_LO + ch_idx] = self.comp[ch][step] & 0xFF
                d[OFFSET_COMP_COMPANION + ch_idx] = self.comp[ch][step] & 0xFF  # mirror
                d[OFFSET_COMP_HI + ch_idx] = 0x00
                d[0x0340 + idx] = self.huma[ch][step] & 0xFF
                struct.pack_into(
                    "<H", d, OFFSET_PHAS + idx * 2, self.phas[ch][step] & 0xFFFF
                )
                d[0x0400 + idx] = self.cvsel[ch][step] & 0xFF
                d[0x0440 + idx] = self.sync[ch][step] & 0xFF
                d[0x0480 + idx] = self.mod_bus[ch][step] & 0xFF
                d[0x0780 + idx] = self.s_h[ch][step] & 0xFF
                struct.pack_into(
                    "<h",
                    d,
                    OFFSET_MINV + idx * 2,
                    max(-32768, min(32767, self.minv[ch][step])),
                )
                struct.pack_into("<H", d, OFFSET_MAXV + idx * 2, self.maxv[ch][step])
                d[0x0640 + idx] = self.prob_val[ch][step] & 0xFF
                struct.pack_into("<f", d, OFFSET_FREQ + idx * 4, self.freq[ch][step])
                d[0x07C0 + idx] = self.quan[ch][step] & 0xFF

        for ch in range(CHANNEL_COUNT):
            d[OFFSET_LOOP_END + ch] = loop_end_by_channel[ch] & 0xFF
            d[OFFSET_LOOP_START + ch] = self.loop_start[ch] & 0xFF

        for ch in range(CHANNEL_COUNT):
            base = OFFSET_CH_RECORDS + ch * CH_RECORD_SIZE
            if base + CH_RECORD_SIZE <= len(d):
                struct.pack_into("<H", d, base + CH_BPM_IDX * 2, self.bpm[ch])
                struct.pack_into("<H", d, base + CH_VELO_IDX * 2, self.velo[ch])
                struct.pack_into("<H", d, base + CH_SH16_IDX * 2, self.sh16[ch])

    def to_bytes(self) -> bytes:
        """Serialize back to binary. Preserves unknown/uncertain regions."""
        d = bytearray(self.raw)
        self._write_arrays(d)
        return bytes(d)

    def save(self, path: str):
        with open(path, "wb") as f:
            f.write(self.to_bytes())

    def display(self, verbose: bool = False):
        sz = len(self.raw)
        print(f"=== FLUX Preset ({sz} bytes, v3 format) ===")
        print()
        for ch in range(CHANNEL_COUNT):
            ch_name = ["CH1(orange)", "CH2(green)", "CH3(blue)", "CH4(red)"][ch]
            print(f"  ─── {ch_name} ───")
            print(
                f"    REC19?: {self.curv[ch]}   VELO: {self.velo[ch]}   SH16: {self.sh16[ch]}   (BPM/PPQN in PREF)"
            )
            print()

            hdr = f"    {'':8} " + " ".join(
                f"S{s + 1:02d}" for s in range(STEPS_PER_CHANNEL)
            )
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

            row("DENS", self.dens[ch])
            row("CURV", self.tm_curv[ch], mapper=curve_name, width=5)
            row("COMP%", self.comp[ch])
            if any(v != 0.0 for v in self.val[ch]):
                row("VAL", [f"{v:.2f}" for v in self.val[ch]])
            row("GATE%", self.gate[ch])
            row("LENG", self.leng[ch])
            row("LOOP", [self._loop_label(ch)] * STEPS_PER_CHANNEL, width=4)
            row("PHAS°", self.phas[ch])
            row("AUX1", self.aux1[ch], mapper=aux_name, width=5)
            row("AUX2", self.aux2[ch], mapper=aux_name, width=5)
            row("MOD", self.mod_bus[ch], mapper=mod_bus_name)
            row("PROB", self.prob_val[ch])
            row("MINV_V", [f"{v / 1000:.1f}" for v in self.minv[ch]])
            row("MAXV_V", [f"{v / 1000:.0f}V" for v in self.maxv[ch]])
            row("QUAN", self.quan[ch])
            if any(v != 0 for v in self.huma[ch]):
                row("HUMA", self.huma[ch])
            if verbose:
                row("FREQ", [f"{v:.2f}" for v in self.freq[ch]])
                row("CVSEL", self.cvsel[ch])
                row("SYNC", self.sync[ch])
                row("S+H", self.s_h[ch])
            print()

    def get_step(self, ch: int, step: int) -> dict:
        """Return all known parameters for a given channel+step."""
        return {
            "LOOP": (self._loop_label(ch), "CONFIRMED"),
            "DENS": (self.dens[ch][step], "CONFIRMED"),
            "CURV": (curve_name(self.tm_curv[ch][step]), "CONFIRMED"),
            "GATE%": (self.gate[ch][step], "LIKELY"),
            "LENG": (self.leng[ch][step], "CONFIRMED"),
            "PHAS_deg": (self.phas[ch][step], "CONFIRMED"),
            "AUX1": (aux_name(self.aux1[ch][step]), "UNCERTAIN"),
            "AUX2": (aux_name(self.aux2[ch][step]), "UNCERTAIN"),
            "MOD_BUS": (mod_bus_name(self.mod_bus[ch][step]), "CONFIRMED"),
            "PROB_VAL": (self.prob_val[ch][step], "LIKELY"),
            "MINV_mV": (self.minv[ch][step], "LIKELY"),
            "MAXV_mV": (self.maxv[ch][step], "CONFIRMED"),
            "HUMA": (self.huma[ch][step], "LIKELY"),
            "QUAN": (self.quan[ch][step], "LIKELY"),
            "CVSEL": (self.cvsel[ch][step], "UNCERTAIN"),
            "SYNC": (self.sync[ch][step], "UNCERTAIN"),
            "S+H": (self.s_h[ch][step], "UNCERTAIN"),
            "FREQ_Hz": (round(self.freq[ch][step], 4), "CONFIRMED"),
            "VAL": (round(self.val[ch][step], 4), "CONFIRMED"),
            "COMP%": (self.comp[ch][step], "CONFIRMED"),
            # MASK, MSK>: likely in 0x0100-0x01FF, structure unclear
        }

    def _loop_label(self, ch: int) -> str:
        start = self.loop_start[ch]
        end = self.loop_end[ch]
        return str(start) if start == end else f"{start}-{end}"


def build_preset_bytes(data: dict) -> bytes:
    """Build a preset binary from decoded JSON data without touching the filesystem."""
    return FluxPreset.from_dict(data).to_bytes()


def build_preset_bytes_from_json(text: str, source: str = "inline JSON") -> bytes:
    """Build a preset binary directly from a JSON string without touching the filesystem."""
    return FluxPreset.from_json_text(text, source).to_bytes()
