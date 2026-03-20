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
| 0x0800–0x1B7F   | 5504B | Per-step Section B (AUX1, LFO page params) + Evolve data |
| 0x1B80–0x1D7F   | 512B  | Per-channel configuration records (4 × 128 bytes) |
| 0x1D80–0x2003   | 132B  | Additional state / trailing data |

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
| 0x0280–0x033F | —         | —         | (unk)   | 0       | UNCERTAIN | Three all-zero 64-byte blocks across all 87 files. Candidates for COMP (−99..+99 signed), DIFF (always 0 per user), CURV. |
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
| CURV      | (unknown)  | TM curve type. Possibly at 0x0280-0x033F (default=1, all-zero in corpus if default stored as 0?). |
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

---

## Section 3: Per-Channel Records, 0x1B80

4 records × 128 bytes, one per channel.

**Confirmed fields (as uint16 LE index within each 128-byte record):**

| uint16 idx | Byte offset | Field  | Default | Certainty |
|-----------|------------|--------|---------|-----------|
| 19        | +0x26      | PPQN   | 4       | CONFIRMED |
| 21        | +0x2A      | VELO   | 127     | CONFIRMED |
| 49        | +0x62      | SH16   | 2       | CONFIRMED |
| 60        | +0x78      | BPM    | 120     | LIKELY    |
| 10–11     | +0x14      | RNG seed | varies | CONFIRMED |
| 42–47     | +0x54      | Channel UUID | 12 random bytes | CONFIRMED |

**Uncertain fields (constant across all presets and all channels):**
```
[3]=8  [4]=10  [5]=99  [7]=64  [9]=58
[13]=100  [15]=45  [17]=99  [23]=17  [25]=64
[35]=8000  [37]=8000  [39]=100  [41]=100
```

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
- **Last 4 bytes** of preset (`01 00 00 00` at 0x2000) may be a format marker — do not modify.
- **Channel UUID** (12 bytes at +0x54 in each channel record) is random on each save, likely used for diff detection or RNG seeding. Preserve when editing.

---

## Known Field Relabels

These offsets were previously mislabeled; corpus analysis across 87 files identified the errors:

| Offset | Old Label | Correct Label | How Found |
|--------|-----------|---------------|-----------|
| 0x0000 | DENS      | LOOP          | Diff test showed it's always 1 (loop length) |
| 0x0040 | AUX1      | GATE          | User confirmed: gate default=10, values 10–90 are trigger % |
| 0x00C0 | CURV      | AUX2          | v1/v2 presets show DEL2/TL1/SOS per step here |
| 0x0200 | GATE/LOOP | DENS          | User confirmed: trigger density 0–64 |
| 0x0340 | COMP_UNK  | HUMA          | User: COMP is signed, this shows 0–100 (non-negative) |
| 0x07C0 | AUX2      | QUAN          | Constant=12 across 87 files; AUX2 should vary (it does, at 0x00C0) |
| 0x0A00 | (evolve)  | AUX1          | v1/v2/v3 all show AUX mode indices per step here |
