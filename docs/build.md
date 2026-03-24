# FLUXMO Build Preset JSON Format

This document defines the JSON input accepted by:

```bash
python3 main.py build <preset.json> <out.TXT>
```

The command creates a new binary FLUX preset file from scratch. It does not need an
existing preset as a template.

The generated binary uses the current v3 preset size (`8196` bytes), writes all
known/default step and channel fields, seeds the per-channel random/UUID regions,
and preserves the expected trailing format marker.

## Design Goals

The JSON format is built around a few constraints:

- A FLUX preset always has exactly `4` channels.
- Each channel can define `0` to `16` step objects.
- Missing channels and missing steps are filled with defaults.
- A non-empty `channels[n].steps` array infers that channel's loop end from the array length unless `loop` was set explicitly.
- Loop start/end is stored per channel in the binary. The current JSON builder writes the common `1-N` form only; non-`1` loop starts are not yet exposed in JSON.
- Shared values can be factored into `channel_defaults` and `step_defaults` to avoid repetition.
- Only fields currently supported by the parser/serializer are accepted.
- Invalid keys, wrong types, or out-of-range values fail fast with a path-specific error.

## Top-Level Shape

The root JSON value must be an object.

Supported top-level keys:

- `channel_defaults`
- `step_defaults`
- `channels`

No other top-level keys are currently accepted.

### Minimal Example

This produces a fully valid preset using built-in defaults:

```json
{
  "channels": []
}
```

### Typical Example

```json
{
  "channel_defaults": {
    "bpm": 120,
    "velo": 110,
    "sh16": 2
  },
  "step_defaults": {
    "gate": 35,
    "leng": 1,
    "mod_bus": "Y+G",
    "aux2": "OFF",
    "minv": 0,
    "maxv": 5000,
    "freq": 1.0,
    "quan": 12
  },
  "channels": [
    {
      "steps": [
        { "dens": 8, "prob": 100 },
        { "dens": 4, "phas": 90 },
        { "dens": 2, "phas_deg": 180 }
      ]
    },
    {
      "velo": 127,
      "steps": [
        { "dens": 1, "mod": "P" },
        null,
        { "dens": 6, "mod_bus": "Y+P", "freq_hz": 0.5 }
      ]
    }
  ]
}
```

## Merge Rules

Preset creation happens in this order:

1. Start from built-in preset defaults.
2. Apply `channel_defaults` to all 4 channels.
3. Apply `step_defaults` to all 64 step slots.
4. Apply each channel object in `channels`.
5. Apply each step object in `channels[n].steps`.
6. If `channels[n].steps` is non-empty and `loop` was not provided via `step_defaults` or a step object, set that channel's loop end to `len(channels[n].steps)`.

Later values override earlier values.

That means:

- `step_defaults.gate` sets the gate for every step in every channel.
- `channels[1].velo` overrides only channel 2 velocity.
- `channels[1].steps[3].gate` overrides only channel 2, step 4.
- `channels[1].steps` with 8 entries implies loop range `1-8` for channel 2 unless `loop` was set explicitly.

## Arrays and Indexing

### `channels`

- Type: array
- Maximum length: `4`
- Index `0` = channel 1
- Index `1` = channel 2
- Index `2` = channel 3
- Index `3` = channel 4

If the array is shorter than 4, omitted channels keep defaults.

Each entry may be:

- an object
- `null` to skip that channel

### `channels[n].steps`

- Type: array
- Maximum length: `16`
- Index `0` = step 1
- Index `15` = step 16

If the array is shorter than 16, omitted steps keep defaults.

If the array is non-empty and no explicit `loop` was provided for that channel, the
builder infers the channel loop end from the array length. For example, an 8-entry
`steps` array produces loop range `1-8`.

Each entry may be:

- an object
- `null` to emit a default silent step

`null` step entries are serialized as default silent steps: all known per-step
fields are reset to their built-in defaults, then `dens` is forced to `0`. Note
that `dens: 0` written this way is intentional (silent step), but specifying
`dens: 0` explicitly in a non-null step object is a validation error — the
builder rejects it with `must be >= 1`.
This means `null` does not inherit `step_defaults`.

## Channel Fields

These fields are accepted in `channel_defaults` and in each channel object.

| Key | Type | Range | Default | Notes |
|-----|------|-------|---------|-------|
| `bpm` | integer | `0..65535` | `120` | Likely mirror of PREF BPM in the per-channel record. |
| `velo` | integer | `0..127` | `127` | Confirmed MIDI velocity. |
| `sh16` | integer | `0..65535` | `2` | Confirmed. |

## Step Fields

These fields are accepted in `step_defaults` and in each step object.

| Key | Type | Range | Default | Aliases | Notes |
|-----|------|-------|---------|---------|-------|
| `loop` | integer | `1..16` | `1` | — | Channel loop end. The builder writes loop range `1-loop`. If omitted, a non-empty `channels[n].steps` array infers the channel loop end from its entry count. |
| `gate` | integer | `0..99` | `10` | `gate%` | Trigger length percent. |
| `dens` | integer | `1..64` | `1` | — | Trigger density. **Minimum 1**; DENS=0 is undefined firmware behavior and causes display corruption. |
| `curv` | integer or string | `0..57` | `0` | `curve` | Confirmed curve enum at `0x00C0`, step-major. Accepts numeric indices or labels such as `1`, `2.0`, `2.1`, `NL3.2`. |
| `leng` | integer | `1..32` | `1` | `length` | Step length in 16ths. Manual text and corpus both show values above 8; `0` is treated as invalid by the builder. |
| `aux1` | integer or string | `0..112` | `0` | — | Experimental AUX1 mode index or mode name. Written to the late-file AUX block at `0x1900` using the current provisional slot formula. |
| `aux2` | integer or string | `0..112` | `0` | — | Experimental AUX2 mode index or mode name. Written to the late-file AUX block at `0x1940` using the current provisional slot formula. |
| `huma` | integer | `0..127` | `0` | — | Humanize amount. |
| `val` | number | any JSON number | `0.0` | — | Texture-matrix value. Stored as step-major `float32` at `0x0100`. |
| `comp` | integer | `-99..99` | `0` | `comp%` | Curve compression percent. Stored in the confirmed channel-major low/high byte pair at `0x0240` and `0x02C0`. |
| `phas` | integer | `0..360` | `0` | `phas_deg` | Phase in degrees. |
| `cvsel` | integer | `0..9` | `0` | — | Uncertain field. |
| `sync` | integer | `0..4` | `0` | — | Uncertain field. |
| `mod_bus` | integer or string | `0..7` | `3` | `mod`, `modbus` | Mod bus bitmask or symbolic form. |
| `s_h` | integer or boolean | `0..1` | `0` | `s+h`, `sample_hold`, `sample_and_hold` | Sample and hold. |
| `prob_val` | integer | `0..100` | `100` | `prob` | Probability / REL-shared field. |
| `minv` | integer | `-32768..32767` | `0` | `minv_mv` | Minimum voltage in mV. |
| `maxv` | integer | `0..8000` | `8000` | `maxv_mv` | Maximum voltage in mV. |
| `quan` | integer | `0..12` | `12` | — | Quantizer semitones. |
| `freq` | number | `>= 0` | `1.0` | `freq_hz` | LFO frequency in Hz. |

## Symbolic String Values

### `aux1`, `aux2`

These fields accept either:

- the raw numeric index, or
- the exact mode name from the AUX table

Examples:

- `"OFF"`
- `"ON"`
- `"START"`
- `"TL4"`
- `"PPQ12"`
- `"/8"`
- `"& (AND)"`
- `"!& (NAND)"`
- `"|| (OR)"`
- `"!|| (NOR)"`
- `"x|| (XOR)"`

Mode name matching is case-insensitive after normalizing spaces and hyphens.

### `curv`

This field accepts either:

- the raw numeric index, or
- the exact curve label

Examples:

- `"1"` → `0`
- `"2.0"` → `1`
- `"2.1"` → `2`
- `"NL3.2"` → `50`

### `mod_bus`

This field accepts either:

- the raw numeric bitmask, or
- a symbolic string

Supported components:

- `Y`, `YEL`, `YELLOW`
- `G`, `GRY`, `GRAY`, `GREY`
- `P`, `PUR`, `PURPLE`
- `OFF`

Examples:

- `"OFF"` → `0`
- `"Y"` → `1`
- `"G"` → `2`
- `"P"` → `4`
- `"Y+G"` → `3`
- `"Y+P"` → `5`
- `"G+P"` → `6`
- `"Y+G+P"` → `7`

### `s_h`

This field accepts:

- `0`
- `1`
- `false`
- `true`

Booleans are converted to `0` or `1`.

## Defaults

If you omit a field entirely, these built-in defaults are used:

### Per-channel defaults

| Field | Default |
|-------|---------|
| `bpm` | `120` |
| `velo` | `127` |
| `sh16` | `2` |

### Per-step defaults

| Field | Default |
|-------|---------|
| `loop` | `1` |
| `gate` | `10` |
| `dens` | `1` |
| `curv` | `0` (`1`) |
| `leng` | `1` |
| `aux1` | `0` (`OFF`) |
| `aux2` | `0` (`OFF`) |
| `huma` | `0` |
| `val` | `0.0` |
| `comp` | `0` |
| `phas` | `0` |
| `cvsel` | `0` |
| `sync` | `0` |
| `mod_bus` | `3` (`Y+G`) |
| `s_h` | `0` |
| `prob_val` | `100` |
| `minv` | `0` |
| `maxv` | `8000` |
| `quan` | `12` |
| `freq` | `1.0` |

## Validation Rules

The builder rejects:

- unknown top-level keys
- unknown channel keys
- unknown step keys
- non-object values where an object is required
- non-array values where an array is required
- more than 4 channels
- more than 16 steps in a channel
- wrong value types
- values outside the supported range

Errors include the JSON path where validation failed.

Example:

```text
Preset JSON error: channels[0].steps[2].gate must be <= 99.
```

## Sparse Authoring Pattern

The intended authoring style is sparse: define shared values once, then only list
the channels and steps that differ.

Example:

```json
{
  "channel_defaults": {
    "bpm": 100,
    "velo": 127
  },
  "step_defaults": {
    "gate": 40,
    "dens": 1,
    "aux2": "OFF"
  },
  "channels": [
    {
      "steps": [
        { "dens": 8 },
        { "dens": 4 },
        { "dens": 2 }
      ]
    }
  ]
}
```

This writes a complete preset, but the JSON only describes the deviations from the
global defaults.

## Fields Not Yet Supported

Only parameters already mapped in the binary parser are supported here.

Not yet accepted in JSON:

- `DIFF`
- `MASK`
- `MSK>`
- `ATK`
- `REL`
- `ACUR`
- `RCUR`
- `SCAL`
- Evolve / Macro Pot sections

`AUX1` and `AUX2` are accepted using the current late-file mappings at `0x1900`
and `0x1940`. `CURV` is accepted using the confirmed step-major enum block at
`0x00C0`. `VAL` is accepted at `0x0100` as step-major `float32`, and `COMP` is
accepted via the confirmed channel-major low/high byte pair at `0x0240` and
`0x02C0`.

When those offsets are decoded, they can be added to the builder format.

## Relationship to the Binary Format

For the underlying binary field map, see:

- [`format_map.md`](../format_map.md)

This JSON layer is intentionally smaller than the full preset file. It covers the
known, writable fields and leaves unknown binary regions under tool control.
