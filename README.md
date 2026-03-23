# FLUXMO

Community tool for parsing, displaying, diffing, and editing FLUX by IOLabs preset files.

See [`docs/preset-format.md`](docs/preset-format.md) for the reverse-engineered preset binary format.
See [`docs/pref-format.md`](docs/pref-format.md) for the PREF (persistent config) binary format.
See [`docs/json-format.md`](docs/json-format.md) for the JSON format accepted by the preset builder.

---

## Setup

```
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Requires Python 3.12+.

---

## Usage

```
python3 main.py <command> [args]
```

### Commands

#### `show` — display all decoded parameters

```
python3 main.py show <file.TXT>
```

Auto-detects preset vs PREF file by filename. Prints all channels, steps, and
per-channel config. Verbose output includes LFO parameters.

#### `pref` — display persistent config file

```
python3 main.py pref <PREF*.TXT>
```

Parses the persistent device configuration saved at the SD card root. Shows
clock mode, button modes, shuffle depth, SH16 values, MIDI velocities, and BPM.

#### `step` — inspect a single step

```
python3 main.py step <file.TXT> <ch> <step>
```

- `ch`: channel number 1–4
- `step`: step number 1–16

Prints every known parameter for that step with its certainty level.

#### `diff` — byte-level diff between two preset files

```
python3 main.py diff <A.TXT> <B.TXT>
```

Shows every differing byte with its offset, old and new values (decimal + hex),
and a label if the offset is a known parameter. Use this to map unknown offsets:

1. Set exactly **one parameter** on the device
2. Save the preset to SD card
3. Run `diff OLD.TXT NEW.TXT`
4. The differing offset is the parameter's storage location

#### `set` — edit a single parameter

```
python3 main.py set <file.TXT> <param> <ch> <step> <value> [out.TXT]
```

If `out.TXT` is omitted, the input file is overwritten. Unknown/uncertain regions
are preserved byte-for-byte.

**Editable parameters:**

| Param     | Description                      | Type   | Offset  | Certainty |
|-----------|----------------------------------|--------|---------|-----------|
| `loop`    | Loop length 1–16                 | uint8  | 0x0000  | LIKELY    |
| `gate`    | Trigger length % 0–99            | uint8  | 0x0040  | LIKELY    |
| `leng`    | Step length in 16ths 1–16        | uint8  | 0x0080  | CONFIRMED |
| `curv`    | Curve enum                       | uint8  | 0x00C0  | CONFIRMED |
| `aux1`    | AUX1 mode index (experimental)   | uint8  | 0x1900  | UNCERTAIN |
| `aux2`    | AUX2 mode index (experimental)   | uint8  | 0x1940  | UNCERTAIN |
| `dens`    | Trigger density 0–64             | uint8  | 0x0200  | CONFIRMED |
| `val`     | TM value                         | float32| 0x0100  | CONFIRMED |
| `comp`    | Curve compression % -99..99      | int8   | 0x0240 / 0x02C0 | CONFIRMED |
| `huma`    | Humanize 0–127                   | uint8  | 0x0340  | LIKELY    |
| `phas`    | Phase shift degrees 0–360        | uint16 | 0x0380  | CONFIRMED |
| `mod_bus` | Mod bus bitmask YEL=1,GRY=2,PUR=4 | uint8 | 0x0480  | CONFIRMED |
| `prob_val`| Probability % 0–100             | uint8  | 0x0640  | LIKELY    |
| `quan`    | Quantizer semitones 0–12         | uint8  | 0x07C0  | LIKELY    |
| `minv`    | Min CV voltage mV (signed)       | int16  | 0x0500  | LIKELY    |
| `maxv`    | Max CV voltage mV 0–8000         | uint16 | 0x0580  | CONFIRMED |
| `freq`    | LFO frequency Hz                 | float  | 0x0680  | CONFIRMED |
| `cvsel`   | LFO CV source 0–9                | uint8  | 0x0400  | UNCERTAIN |
| `sync`    | LFO sync mode 0–4               | uint8  | 0x0440  | UNCERTAIN |
| `s_h`     | Sample & Hold 0/1                | uint8  | 0x0780  | UNCERTAIN |

`aux1` and `aux2` are now editable via the late-file AUX arrays at `0x1900`
and `0x1940`. The current working slot formula is channel-major order rotated
left by 4 bytes, based on corpus evidence including `MAC0204_.TXT` where
position `44` matches `CH4 step1`.

`val` is stored as a 64-entry step-major `float32` block at `0x0100`. `comp` is
stored channel-major using the signed low-byte block at `0x0240`; the matching
high-byte block at `0x02C0` stays `0x00` for normal `-99..99` values.

`curv` is now mapped as a confirmed step-major enum at `0x00C0`. Device probes
show `0x01 = 1`, `0x02 = 2.0`, and `0x03 = 2.1`.

Example:

```
python3 main.py set DEFAULT_.TXT dens 1 3 8 out.TXT
```

Sets trigger density to 8 on CH1, step 3, writing to `out.TXT`.

#### `probe-fill` — fill a candidate 64-byte block for device testing

```
python3 main.py probe-fill <file.TXT> <offsets> <value> [out.TXT]
```

Fills one or more 64-byte regions with one byte value. Offsets may be
comma-separated. This is useful for testing mirrored or paired candidate blocks
on the device.

Example:

```bash
python3 main.py probe-fill DEFAULT_.TXT 0x00C0 0x02 PROBE_CURV_ALL_2_0.TXT
python3 main.py probe-fill DEFAULT_.TXT 0x00C0 0x03 PROBE_CURV_ALL_2_1.TXT
```

#### `probe-set` — write one raw slot in a candidate 64-byte block

```
python3 main.py probe-set <file.TXT> <offsets> <layout> <ch> <step> <value> [out.TXT]
```

Layouts:

- `step`: `step*4 + ch`
- `channel`: `ch*16 + step`
- `lateaux`: rotated channel-major layout used by the late AUX arrays

Examples:

```bash
python3 main.py probe-set DEFAULT_.TXT 0x00C0 step 3 2 0x02 PROBE_CURV_S2C3_2_0.TXT
python3 main.py probe-set DEFAULT_.TXT 0x00C0 step 3 2 0x03 PROBE_CURV_S2C3_2_1.TXT
python3 main.py probe-set DEFAULT_.TXT 0x00C0 step 4 1 0x02 PROBE_CURV_CH4S1_2_0.TXT
```

#### `build` — create a new preset from JSON

```
python3 main.py build <preset.json> <out.TXT>
```

Builds a brand-new v3 preset binary from structured JSON. Missing channels and
steps are filled with defaults, and invalid JSON paths are rejected with a
specific validation error.

The full JSON schema, merge rules, aliases, and examples live in
[`docs/json-format.md`](docs/json-format.md).

#### `hex` — hexdump a region

```
python3 main.py hex <file.TXT> [offset] [length]
```

`offset` and `length` accept decimal or `0x`-prefixed hex. Defaults: offset=0, length=256.

#### `map` — print parameter offset map

```
python3 main.py map
```

Prints the full offset table for per-step arrays, per-channel records, and the
AUX mode index list.

---

## Project layout

```
main.py                      CLI entry point
docs/preset-format.md        Reverse-engineered FLUX/*.TXT binary format
docs/pref-format.md          Reverse-engineered PREF*.TXT binary format
docs/json-format.md          JSON input format for the preset builder
src/fluxmo/
  pref.py                    FluxPrefs — PREF*.TXT parser/serializer
  preset.py                  FluxPreset — preset .TXT parser/serializer + format constants
  diff.py                    diff_presets, hexdump utilities
```

---

## File types

```
SD card root/
  FLUX/             ← preset directory
    DEFAULT_.TXT    ← preset named "DEFAULT " (8-char padded)
    MYPATCH_.TXT    ← other presets
  PREFxxx.TXT       ← persistent device config (saved on each change)
```

Despite `.TXT` extension, all files are pure binary.

---

## Certainty levels

| Label     | Meaning |
|-----------|---------|
| CONFIRMED | Verified against hardware or manual defaults |
| LIKELY    | Strongly inferred from 87-file corpus analysis |
| UNCERTAIN | Structural guess, needs hardware validation |

---

*Reverse-engineered by the FLUX community, 2026. Contribute by diffing before/after saves.*
