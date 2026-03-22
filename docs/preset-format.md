# FLUX Preset File Format

**Applies to:** `FLUX/*.TXT` files on the SD card
**Format versions:** v1 (3860 B), v2 (6404 B), v3 (8196 B)
**Analysis based on:** firmware v1.07–v1.08, corpus of 87 preset files

| Version | Firmware  | Size    | Notes |
|---------|-----------|---------|-------|
| v1      | ~v1.05    | 3860 B  | Earliest format |
| v2      | ~v1.06–07 | 6404 B  | Expanded |
| v3      | v1.08+    | 8196 B  | Current; all analysis below is v3 unless noted |

---

## Structure

The sequencer has **4 channels × 16 steps = 64 step slots**.

All per-step parameters use a flat array of 64 values:
```
slot = channel_index * 16 + step_index   (both 0-indexed)
```
Slot 0 = CH1/S1, slot 1 = CH1/S2, ..., slot 16 = CH2/S1, etc.

### Section Map

| Range           | Size  | Description |
|-----------------|-------|-------------|
| 0x0000–0x07FF   | 2048B | Per-step parameter arrays, Section A (RHYTHMS page params) |
| 0x0800–0x1B7F   | 4992B | Per-step Section B (AUX1, LFO page params) + Evolve data; 178 bytes required non-zero |
| 0x1B80–0x1D7F   | 512B  | Per-channel configuration records (4 × 128 bytes); several sentinel fields required non-zero |
| 0x1D80–0x2003   | 644B  | Trailing data; must be populated (constant block). Device rejects file if zeros. |

---

## Section A: Per-Step Arrays, 0x0000–0x07FF

Each entry covers all 64 step slots. Unless noted, each is 64 bytes (1 byte/slot).

**RHYTHMS page parameters:**

| Offset        | Bytes/slot | Type      | Param   | Default | Certainty | Notes |
|---------------|-----------|-----------|---------|---------|-----------|-------|
| 0x0000        | 1         | uint8     | LOOP    | 1       | LIKELY    | Loop length per step (1–16). Rarely changed. |
| 0x0040        | 1         | uint8     | GATE    | 10      | LIKELY    | Trigger length % (0–99). Values 10–90 in corpus. |
| 0x0080        | 1         | uint8     | LENG    | 1       | CONFIRMED | Step length in 16ths (0–8 stored, 1=1/16). |
| 0x00C0        | 1         | uint8     | AUX2    | 1 (ON)  | LIKELY    | AUX output 2 mode index (see AUX Mode Table). v1/v2 show full variation; v3 corpus all=1=ON. |
| 0x0100–0x01FF | —         | —         | MASK?   | 0       | UNCERTAIN | 256 bytes with sparse bitmask-like values (0x33, 0x40, 0xC0). Candidates: MASK + MSK> as uint8 bitmasks. |
| 0x0200        | 1         | uint8     | DENS    | 1       | CONFIRMED | Trigger density (0–64 gates per step). |
| 0x0240        | 1         | uint8     | (unk)   | 0       | UNCERTAIN | Sparse: value 50 at specific steps in 1 preset (MAC0204). COMP candidate? |
| 0x0280–0x033F | —         | —         | (unk)   | 0       | UNCERTAIN | Three all-zero 64-byte blocks across all 87 files. Candidates: COMP (−99..+99 signed), DIFF (always 0 per user). CURV is now confirmed at channel record index 19 — not here. |
| 0x0340        | 1         | uint8     | HUMA    | 0       | LIKELY    | Humanize amount (0–127). Values 20–100 seen in corpus. |
| 0x0380–0x03FF | 2         | uint16 LE | PHAS    | 0       | CONFIRMED | Phase shift in degrees (0–360). 128 bytes = 64 × uint16. |
| 0x0400        | 1         | uint8     | CVSEL   | 0       | UNCERTAIN | LFO CV source selector (0–9 range seen). |
| 0x0440        | 1         | uint8     | SYNC    | 0       | UNCERTAIN | LFO sync mode (0–4 range seen). |
| 0x0480        | 1         | uint8     | MOD     | 3       | CONFIRMED | Modulation bus bitmask: YEL=1, GRY=2, PUR=4, OFF=0. Default=Y+G=3. |
| 0x04C0        | 1         | uint8     | (unk)   | 0       | UNCERTAIN | All-zero in all 87 files. Candidate: ATK (default=0) or S+H. |
| 0x0500–0x057F | 2         | int16 LE  | MINV    | 0       | LIKELY    | Min CV voltage in millivolts (signed). 128 bytes = 64 × int16. |
| 0x0580–0x05FF | 2         | uint16 LE | MAXV    | 8000    | CONFIRMED | Max CV voltage in millivolts. 128 bytes = 64 × uint16. |
| 0x0600–0x063F | —         | —         | (unk)   | 0       | UNCERTAIN | All-zero. Candidate: ATK, ACUR, RCUR (all default=0). |
| 0x0640        | 1         | uint8     | PROB    | 100     | LIKELY    | Probability % (0–100). REL also defaults to 100; corpus can't distinguish. |
| 0x0680–0x077F | 4         | float32 LE | FREQ   | 1.0     | CONFIRMED | LFO frequency in Hz. 256 bytes = 64 × float32. |
| 0x0780        | 1         | uint8     | S+H     | 0       | UNCERTAIN | Sample & Hold (0=OFF, 1=ON). Binary values only. |
| 0x07C0        | 1         | uint8     | QUAN    | 12      | LIKELY    | Quantizer semitones (12=chromatic). Previously mislabeled AUX2. AUX2 is at 0x00C0. |

**Still unlocated from RHYTHMS/LFO pages:**

| Parameter | Range      | Notes |
|-----------|------------|-------|
| AUX1      | 0–119      | Found at 0x0A00 (Section B, see below) |
| COMP      | −99..+99   | Signed, used occasionally. Zero in all 87 corpus files. |
| DIFF      | 0          | Always zero per user. |
| CURV      | enumerated | **Confirmed** at channel record index 19 (+0x26). Default=4. Display values: 1, 2.0–2.5, 3.0–3.5…8.0, then NN variants. See channel record table above. |
| MASK      | bitmask    | Likely in 0x0100–0x01FF region. |
| MSK>      | (unknown)  | Mask shift parameter. |
| VAL       | (unknown)  | Shown on RHYTHMS page, meaning unclear. |
| ATK       | 0–?        | Envelope attack. Default=0. |
| REL       | 0–?        | Envelope release. Default=100 (or at 0x0640 shared with PROB). |
| ACUR      | 0.00       | Attack curve. Float, default=0. |
| RCUR      | 0.00       | Release curve. Float, default=0. |
| SCAL      | 0–23       | Quantizer scale (Maj=11 in UI). |

---

## Section B: Per-Step Arrays, 0x0800+

A second set of per-step parameters begins at 0x0800. Structure less mapped than Section A.

| Offset        | Bytes/slot | Type   | Param | Default     | Certainty | Notes |
|---------------|-----------|--------|-------|-------------|-----------|-------|
| 0x0800–0x09FF | —         | —      | (unk) | mostly 0/1  | UNCERTAIN | 8 × 64-byte blocks. Sparse 0/1 values. Function unknown. |
| 0x0A00        | 1         | uint8  | AUX1  | 1 (ON)      | LIKELY    | AUX output 1 mode index. v1/v2/v3 all show AUX mode indices (DEL3, TL1, 1st, etc.) per step. |
| 0x0A40–?      | —         | —      | (unk) | 0/1         | UNCERTAIN | Mostly binary. AUX2 is NOT here — it's at 0x00C0 in Section A. |
| 0x0C00–0x1B7F | —         | —      | Evolve LFO + Macro Pots | — | UNCERTAIN | Partially decoded. See Evolve notes below. |

**Evolve LFO observations:**
- 0x0EA0–0x0EDF: 64 bytes all = 200 (0xC8). Unknown param.
- 0x0EE0: specific uint16 values. Unknown.
- 0x0FB0 region: 16-byte groups of 0x02. Possibly SH16 per step.
- Full Evolve structure (85 params × 4 channels) not yet decoded.

**Required non-zero bytes in Section B:**

178 bytes in Section B are constant across all 31 corpus presets and must be present for the firmware to load the file without hanging. They are scattered through the LFO/Macro region. Key clusters:

| Range           | Value | Count | Notes |
|-----------------|-------|-------|-------|
| 0x0A7C–0x0AEB   | 0x01  | 16    | Sparse groups of 4 in 0x0A00 block |
| 0x0B0C–0x0BBF   | 0x01  | 20    | Sparse groups of 4 across 0x0B00 block |
| 0x0C5C–0x0C9B   | 0x01  | 16    | Sparse groups of 4 in 0x0C00 block |
| 0x0C48          | 0xF0  | 1     | |
| 0x0DFC          | 0x02  | 1     | |
| 0x0EA0–0x0EDF   | 0xC8  | 64    | 200 (possibly Evolve pot default) |
| 0x0EE0–0x0EEE   | various | 6   | 0x2B, 0x1D, 0x02 |
| 0x0FB1–0x0FF3   | 0x02  | 63    | Dense block, some gaps |
| 0x18B4–0x18BA   | 0x01  | 4     | Sparse |
| 0x1B7C–0x1B7E   | 0xC8  | 2     | |

These are encoded as `SECTION_B_REQUIRED` in `src/fluxmo/preset.py` and applied in `_default_raw()`. Any preset built by the script will have them correctly initialized.

---

## Section 3: Per-Channel Records, 0x1B80

4 records × 128 bytes, one per channel.

**Confirmed fields (as uint16 LE index within each 128-byte record):**

| uint16 idx | Byte offset | Field        | Default | Certainty | Notes |
|-----------|------------|--------------|---------|-----------|-------|
| 0         | +0x00      | (required)   | 1       | CONFIRMED | Must be 1. Device hangs on boot if 0. |
| 1         | +0x02      | (required)   | 1       | CONFIRMED | Must be 1. Device hangs on boot if 0. |
| 2         | +0x04      | (required)   | 1       | CONFIRMED | Must be 1. Device hangs on boot if 0. |
| 3         | +0x06      | (unknown)    | 8       | UNCERTAIN | Constant across all corpus presets. |
| 4         | +0x08      | (unknown)    | 10      | UNCERTAIN | Constant. |
| 5         | +0x0A      | (unknown)    | 99      | UNCERTAIN | Constant. |
| 6         | +0x0C      | (required)   | 1       | CONFIRMED | Must be 1. Device hangs on boot if 0. |
| 7         | +0x0E      | (unknown)    | 64      | UNCERTAIN | Constant. |
| 8         | +0x10      | (required)   | 1       | CONFIRMED | Must be 1. Device hangs on boot if 0. |
| 9         | +0x12      | (unknown)    | 58      | UNCERTAIN | Constant. |
| 12        | +0x18      | (unknown)    | 0xFF9C (−100 i16) | UNCERTAIN | Constant. |
| 13        | +0x1A      | (unknown)    | 100     | UNCERTAIN | Constant. |
| 15        | +0x1E      | (unknown)    | 45      | UNCERTAIN | Constant. |
| 16        | +0x20      | (unknown)    | 0xFF9C (−100 i16) | UNCERTAIN | Constant. |
| 17        | +0x22      | (unknown)    | 99      | UNCERTAIN | Constant. |
| 18        | +0x24      | (required)   | 1       | CONFIRMED | Must be 1. Device hangs on boot if 0. |
| 19        | +0x26      | CURV         | 4       | CONFIRMED | Curve selector. Enumerated display values: 1, 2.0–2.5, 3.0–3.5…8.0, then NN variants. |
| 21        | +0x2A      | VELO         | 127     | CONFIRMED | |
| 23        | +0x2E      | (unknown)    | 17      | UNCERTAIN | Constant. |
| 25        | +0x32      | (unknown)    | 64      | UNCERTAIN | Constant. |
| 27        | +0x36      | (unknown)    | 182     | UNCERTAIN | Constant. |
| 29        | +0x3A      | (unknown)    | 182     | UNCERTAIN | Constant. |
| 31        | +0x3E      | (unknown)    | 5       | UNCERTAIN | Constant. |
| 33        | +0x42      | (required)   | 1       | UNCERTAIN | Constant across all corpus presets. |
| 35        | +0x46      | (unknown)    | 8000    | UNCERTAIN | Constant. |
| 37        | +0x4A      | (unknown)    | 8000    | UNCERTAIN | Constant. |
| 39        | +0x4E      | (unknown)    | 100     | UNCERTAIN | Constant. |
| 41        | +0x52      | (unknown)    | 100     | UNCERTAIN | Constant. |
| 49        | +0x62      | SH16         | 2       | CONFIRMED | |
| 51        | +0x66      | (unknown)    | 24      | UNCERTAIN | Constant. |
| 53        | +0x6A      | (unknown)    | 24      | UNCERTAIN | Constant. |
| 55        | +0x6E      | (unknown)    | 304     | UNCERTAIN | Constant (0x0130 LE). |
| 57        | +0x72      | (unknown)    | 304     | UNCERTAIN | Constant. |
| 59        | +0x76      | (unknown)    | 304     | UNCERTAIN | Constant. |
| 60        | +0x78      | BPM          | 120     | LIKELY    | |
| 61        | +0x7A      | (unknown)    | 360     | UNCERTAIN | Constant (0x0168 LE). |
| 62        | +0x7C      | (unknown)    | 200     | UNCERTAIN | Constant. |
| 63        | +0x7E      | (unknown)    | 200     | UNCERTAIN | Constant. |

**Random/unique fields:**

| Byte offset | Size | Field        | Notes |
|------------|------|--------------|-------|
| +0x14      | 4    | RNG seed     | 4 random bytes, regenerated on each save. |
| +0x54      | 12   | Channel UUID | 12 random bytes, regenerated on each save. |

> **Firmware hang warning:** Indices 0, 1, 2, 6, 8, 18 in each channel record must be `01 00`. The device boots to a hung state (blank screen, unresponsive) if any of these are zero. This affects all 4 channel records. Manually-authored presets that omit these fields will cause a hang even if the rest of the file is valid.

---

## AUX Mode Index Table

AUX1 and AUX2 each store one of these indices per step (uint8, 0-indexed):

| Index | Name    | Index   | Name         |
|-------|---------|---------|--------------|
| 0     | OFF     | 14–29   | TL1–TL16     |
| 1     | ON      | 30      | & (AND)      |
| 2     | START   | 31      | !& (NAND)    |
| 3     | SOS     | 32      | \|\| (OR)    |
| 4     | 1st     | 33      | !\|\| (NOR)  |
| 5     | Last    | 34      | x\|\| (XOR)  |
| 6     | DEL1    | 35–41   | CV>1V–CV>7V  |
| 7     | DEL2    | 42–48   | CV<1V–CV<7V  |
| 8–13  | DEL3–DEL8 | 49–96 | PPQ1–PPQ48  |
| 97–112 | /1–/16 | 113+   | (extended)   |

---

## File Integrity Notes

- **No checksum or CRC** identified. Files load as-is.
- **Trailing section (0x1D80–0x2003, 644 bytes)** must be present and populated. Device rejects files where this region is all zeros, or loads factory defaults instead. The section terminates with `01 00 00 00` at 0x2000. All 644 bytes are constant across 30/31 corpus presets and are treated as a required initialization block. See `REFERENCE_TRAILING` in `src/fluxmo/preset.py`.
- **Section B (0x0800–0x1B7F)** contains 178 bytes that must be non-zero for the firmware to accept the file. See `SECTION_B_REQUIRED` in `src/fluxmo/preset.py`.
- **Channel record sentinel fields** (uint16 indices 0, 1, 2, 6, 8, 18 in each of the 4 channel records) must equal `01 00`. Zero in any of these causes a firmware hang on boot.
- **Channel UUID** (12 bytes at +0x54 in each channel record) is random on each save, likely used for diff detection or RNG seeding. Preserve when editing.
- **Building presets:** Always use the build script (`FluxPreset.from_json_file()`). Manually constructing a preset binary from scratch requires getting all three of the above constraints right; the build script handles all of them via `_default_raw()`.
