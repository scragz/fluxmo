# FLUX PREF File Format

**Applies to:** `PREFxxx.TXT` at the SD card root
**Analysis based on:** firmware v1.05–v1.08

The PREF file stores persistent device configuration and is rewritten on every change. Despite the `.TXT` extension, the file is pure binary.

| Version | Firmware  | Size   | Added |
|---------|-----------|--------|-------|
| 1.5     | ~v1.05    | 20 B   | Baseline config |
| 1.6     | ~v1.06    | 20 B   | MIDI clock modes |
| 3.3     | v1.06N+   | 44 B   | VELO/AUX1/AUX2 per channel |
| 3.3     | v1.07     | 46 B   | Boot preset index + auto-load-on-startup feature |
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

| Offset | Size | Type    | Field             | Certainty | Notes |
|--------|------|---------|-------------------|-----------|-------|
| 20–43  | 24   | —       | velo/aux1_vel/aux2_vel × 4ch | CONFIRMED | 3×uint16 per channel: main MIDI velo, AUX1 velo, AUX2 velo |
| 44–45  | 2    | uint16  | boot_preset_index | CONFIRMED | FAT directory position index of preset to load on boot (see below) |
| 46+    | 216  | —       | (extended data)   | UNCERTAIN | Added v1.08, mostly zeros. Writing 8-byte ASCII name here does NOT affect boot loading. |

---

## Boot Preset Mechanism

Added in firmware v1.07 ("auto-load preset on startup").

**Bytes 44–45** store a little-endian uint16 FAT directory index — not BPM. The device scans the `FLUX/` directory and loads whichever file occupies that position in the FAT directory order (1-indexed).

| Value    | Behavior |
|----------|----------|
| `00 00`  | Factory defaults (no preset loaded) — blank card state |
| `01 00`  | Load first file in FLUX/ by FAT directory order |
| `13 00`  | Load 19th file in FLUX/ by FAT directory order |

**FAT directory order** is determined by when files were created/written on the card, not alphabetically. Adding or removing files from `FLUX/` shifts subsequent indices.

To reliably boot to a specific preset, put it as the only file (or first file) in `FLUX/` and set bytes 44–45 to `01 00`.

**Evidence:** Hardware testing showed loading behavior changed predictably as files were added/removed from `FLUX/`, matching the index stored at bytes 44–45. Blank-card PREF has `00 00`. Device PREF with 31 corpus presets on card had `13 00` = 19, matching the ~19th/20th file in directory order.

> **Previous incorrect label:** bytes 44–45 were labeled `bpm_stored` (BPM − 95 encoding). This is wrong — BPM is stored in each preset's channel records (CH_BPM_IDX), not in the PREF file.

---

## Notes

- `sh16` values at bytes 16–19 (`02 02 02 02` for defaults) are SH16 per-channel values, confirmed not a checksum.
- The extended block added in v1.08 (offset 46+, up to 262 bytes total) is mostly zeros and its structure is not decoded. Writing preset filenames or other data there has no observed effect on boot behavior.
- BPM is stored per-channel in the preset file (uint16 at ch_record+0x78), not in the PREF file.
