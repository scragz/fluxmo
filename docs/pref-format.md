# FLUX PREF File Format

**Applies to:** `PREFxxx.TXT` at the SD card root
**Analysis based on:** firmware v1.05–v1.08

The PREF file stores persistent device configuration and is rewritten on every change. Despite the `.TXT` extension, the file is pure binary.

| Version | Firmware  | Size   | Added |
|---------|-----------|--------|-------|
| 1.5     | ~v1.05    | 20 B   | Baseline config |
| 1.6     | ~v1.06    | 20 B   | MIDI clock modes |
| 3.3     | v1.06N+   | 44 B   | VELO/AUX1/AUX2 per channel |
| 3.3     | v1.07     | 46 B   | BPM field |
| 3.3     | v1.08     | 262 B  | Extended block (unknown content) |

---

## Layout

Bytes 2–3 identify the format version.

| Offset | Size | Type   | Field           | Default | Certainty | Notes |
|--------|------|--------|-----------------|---------|-----------|-------|
| 0      | 1    | uint8  | status_byte     | 0xF0    | UNCERTAIN | Device state flags |
| 1      | 1    | uint8  | (unknown)       | 0x00    | UNCERTAIN | |
| 2      | 1    | uint8  | fmt_major       | —       | CONFIRMED | Format version major (1 or 3) |
| 3      | 1    | uint8  | fmt_minor       | —       | CONFIRMED | Format version minor (5, 6, or 3) |
| 4      | 1    | uint8  | (unknown)       | 0x00    | UNCERTAIN | |
| 5      | 1    | uint8  | clk_mode        | 0       | LIKELY    | 0=INT, 1=EXT, 2=EXTS, 3=MIDI, 4=BURST |
| 6      | 1    | uint8  | star_mode       | 0       | LIKELY    | * button: 0=MOM, 1=LAT |
| 7      | 1    | uint8  | all_mode        | 0       | LIKELY    | ALL button: 0=MOM, 1=LAT |
| 8–15   | 8    | 4×uint16 | shuf[ch1–ch4] | 0     | CONFIRMED | Shuffle depth per channel, degrees (0–360) |
| 16–19  | 4    | 4×uint8  | sh16[ch1–ch4] | 2     | CONFIRMED | SH16 value per channel |

**Format v3.3+ only (≥44 bytes):**

| Offset | Size | Type   | Field              | Certainty | Notes |
|--------|------|--------|--------------------|-----------|-------|
| 20–43  | 24   | —      | velo/aux1_vel/aux2_vel × 4ch | CONFIRMED | 3×uint16 per channel: main MIDI velo, AUX1 velo, AUX2 velo |
| 44–45  | 2    | uint16 | bpm_stored         | CONFIRMED | BPM − 95 (e.g. 120 BPM → stored as 25) |
| 46+    | —    | —      | (extended data)    | UNCERTAIN | Added v1.08, mostly zeros |

---

## Notes

- `sh16` values at bytes 16–19 (`02 02 02 02` for defaults) are SH16 per-channel values, confirmed not a checksum.
- `bpm_stored` uses an offset encoding: stored value = BPM − 95.
- The extended block added in v1.08 (offset 46+, up to 262 bytes total) is mostly zeros and its structure is not yet decoded.
