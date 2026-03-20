"""
FluxPreset — parser for FLUX/*.TXT preset files (~8196 bytes).

The sequencer has 4 channels × 16 steps = 64 step slots.
Step addressing: slot = channel * 16 + step  (both 0-indexed)

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


CHANNEL_COUNT = 4
STEPS_PER_CHANNEL = 16


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
    0x0040: ('GATE',     'LIKELY'),      # Gate/trigger length (0–99%). Default=10.
    0x0080: ('LENG',     'CONFIRMED'),   # Step length (0–8, displayed as N/16). Default=1.
    0x00C0: ('AUX2',     'LIKELY'),      # AUX output 2 mode index (see AUX_MODES). Default=1=ON.
    # 0x0100–0x01FF: 256 bytes, sparse [0, 51, 64, 192] — bitmask pattern.
    #   Candidates: MASK (8-bit bitmask per step), MSK> (mask shift).
    0x0200: ('DENS',     'CONFIRMED'),   # Trigger density (0–64 gates/step). Default=1.
    # 0x0240: values [0, 50] in 2 presets. Unknown — possible COMP or MSK>.
    # 0x0280–0x033F: all zero in all 87 presets. Candidates: COMP, DIFF, CURV.
    0x0340: ('HUMA',     'LIKELY'),      # Humanize (0–127). Default=0.
    # 0x0380–0x03FF: PHAS — see OFFSET_PHAS below (uint16 LE, 128 bytes)
    0x0400: ('CVSEL',    'UNCERTAIN'),   # LFO CV source select (0–9 enum). Default=0.
    0x0440: ('SYNC',     'UNCERTAIN'),   # LFO sync mode (0–4). Default=0.
    0x0480: ('MOD_BUS',  'CONFIRMED'),   # Modulation bus bitmask (YEL=1,GRY=2,PUR=4). Default=3.
    # 0x04C0: all zero. Candidate: ATK(0), DIFF(0), S+H(0).
    # 0x0500–0x057F: MINV — see OFFSET_MINV (int16 LE mV, 128 bytes)
    # 0x0580–0x05FF: MAXV — see OFFSET_MAXV (uint16 LE mV, 128 bytes)
    # 0x0600–0x063F: all zero. Candidate: ATK(0), ACUR(0.00 as f32).
    0x0640: ('PROB_V',   'LIKELY'),      # Probability 0–100 OR REL 0–100 (both default=100)
    # 0x0680–0x077F: FREQ — see OFFSET_FREQ (float32 LE, 256 bytes)
    0x0780: ('S_H',      'UNCERTAIN'),   # Sample & Hold — binary (0=OFF, 1=ON).
    0x07C0: ('QUAN',     'LIKELY'),      # Quantizer semitones (0–12). Default=12 (chromatic).
}

# PHAS: Phase shift in degrees, stored as uint16 LE (0–360°). 128 bytes = 64 × uint16.
OFFSET_PHAS = 0x0380   # CONFIRMED

# MINV: CV output minimum voltage, stored as int16 LE mV. 128 bytes = 64 × int16.
OFFSET_MINV = 0x0500   # LIKELY — int16 mV.

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
CH_BPM_IDX   = 60   # LIKELY: value matches PREF BPM
CH_RNG_SEED_BYTE = 0x14
CH_RNG2_BYTE = 0x54 # CONFIRMED: 12-byte UUID at byte offset 0x54

CHANNEL_RECORD_DEFAULTS_U16 = {
    3: 8,
    4: 10,
    5: 99,
    7: 64,
    9: 58,
    13: 100,
    15: 45,
    17: 99,
    23: 17,
    25: 64,
    35: 8000,
    37: 8000,
    39: 100,
    41: 100,
}

TRAILER_MARKER = b'\x01\x00\x00\x00'

STEP_PARAM_SPECS = {
    'loop': ParamSpec('loop', 'u8', 'LIKELY', 1, 1, 16, 'LOOP'),
    'gate': ParamSpec('gate', 'u8', 'LIKELY', 10, 0, 99, 'GATE%', ('gate%',)),
    'dens': ParamSpec('dens', 'u8', 'CONFIRMED', 1, 0, 64, 'DENS'),
    'leng': ParamSpec('leng', 'u8', 'CONFIRMED', 1, 0, 16, 'LENG'),
    'aux1': ParamSpec('aux1', 'u8', 'LIKELY', 1, 0, len(AUX_MODES) - 1, 'AUX1'),
    'aux2': ParamSpec('aux2', 'u8', 'LIKELY', 1, 0, len(AUX_MODES) - 1, 'AUX2'),
    'huma': ParamSpec('huma', 'u8', 'LIKELY', 0, 0, 127, 'HUMA'),
    'phas': ParamSpec('phas', 'u16', 'CONFIRMED', 0, 0, 360, 'PHAS_deg', ('phas_deg',)),
    'cvsel': ParamSpec('cvsel', 'u8', 'UNCERTAIN', 0, 0, 9, 'CVSEL'),
    'sync': ParamSpec('sync', 'u8', 'UNCERTAIN', 0, 0, 4, 'SYNC'),
    'mod_bus': ParamSpec('mod_bus', 'u8', 'CONFIRMED', 3, 0, 7, 'MOD_BUS', ('mod', 'modbus')),
    's_h': ParamSpec('s_h', 'u8', 'UNCERTAIN', 0, 0, 1, 'S+H', ('s+h', 'sample_hold', 'sample_and_hold')),
    'prob_val': ParamSpec('prob_val', 'u8', 'LIKELY', 100, 0, 100, 'PROB_VAL', ('prob',)),
    'minv': ParamSpec('minv', 'i16', 'LIKELY', 0, -32768, 32767, 'MINV_mV', ('minv_mv',)),
    'maxv': ParamSpec('maxv', 'u16', 'CONFIRMED', 8000, 0, 8000, 'MAXV_mV', ('maxv_mv',)),
    'quan': ParamSpec('quan', 'u8', 'LIKELY', 12, 0, 12, 'QUAN'),
    'freq': ParamSpec('freq', 'f32', 'CONFIRMED', 1.0, 0.0, None, 'FREQ_Hz', ('freq_hz',)),
}

CHANNEL_PARAM_SPECS = {
    'bpm': ParamSpec('bpm', 'u16', 'LIKELY', 120, 0, 65535, 'BPM'),
    'ppqn': ParamSpec('ppqn', 'u16', 'CONFIRMED', 4, 0, 65535, 'PPQN'),
    'velo': ParamSpec('velo', 'u16', 'CONFIRMED', 127, 0, 127, 'VELO'),
    'sh16': ParamSpec('sh16', 'u16', 'CONFIRMED', 2, 0, 65535, 'SH16'),
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
    return key.strip().lower().replace(' ', '_').replace('-', '_')


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
    if lookup in {'off', 'none', '0'}:
        return 0

    parts = lookup.replace(',', '+').split('+')
    mapping = {
        'y': 0x01,
        'yel': 0x01,
        'yellow': 0x01,
        'g': 0x02,
        'gry': 0x02,
        'gray': 0x02,
        'grey': 0x02,
        'p': 0x04,
        'pur': 0x04,
        'purple': 0x04,
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


# ---------------------------------------------------------------------------
# FluxPreset
# ---------------------------------------------------------------------------

class FluxPreset:
    """
    Parses FLUX/*.TXT preset files (~8196 bytes).

    The file contains 64 step slots (4 channels × 16 steps).
    Step addressing: slot = channel * 16 + step  (both 0-indexed)
    """

    EXPECTED_SIZE = 8196
    KNOWN_SIZES = {3860: 'v1', 6404: 'v2', 8196: 'v3'}

    def __init__(self):
        self.raw = self._default_raw()
        # per-step arrays, shape [4 channels][16 steps]
        self.loop     = [[STEP_PARAM_SPECS['loop'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.gate     = [[STEP_PARAM_SPECS['gate'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.leng     = [[STEP_PARAM_SPECS['leng'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.aux2     = [[STEP_PARAM_SPECS['aux2'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.dens     = [[STEP_PARAM_SPECS['dens'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.huma     = [[STEP_PARAM_SPECS['huma'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.phas     = [[STEP_PARAM_SPECS['phas'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.cvsel    = [[STEP_PARAM_SPECS['cvsel'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.sync     = [[STEP_PARAM_SPECS['sync'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.mod_bus  = [[STEP_PARAM_SPECS['mod_bus'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.s_h      = [[STEP_PARAM_SPECS['s_h'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.minv     = [[STEP_PARAM_SPECS['minv'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.maxv     = [[STEP_PARAM_SPECS['maxv'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.prob_val = [[STEP_PARAM_SPECS['prob_val'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.freq     = [[STEP_PARAM_SPECS['freq'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.quan     = [[STEP_PARAM_SPECS['quan'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        self.aux1     = [[STEP_PARAM_SPECS['aux1'].default] * STEPS_PER_CHANNEL for _ in range(CHANNEL_COUNT)]
        # per-channel (from channel records at 0x1B80)
        self.bpm      = [CHANNEL_PARAM_SPECS['bpm'].default] * CHANNEL_COUNT
        self.ppqn     = [CHANNEL_PARAM_SPECS['ppqn'].default] * CHANNEL_COUNT
        self.velo     = [CHANNEL_PARAM_SPECS['velo'].default] * CHANNEL_COUNT
        self.sh16     = [CHANNEL_PARAM_SPECS['sh16'].default] * CHANNEL_COUNT

    @classmethod
    def _default_raw(cls) -> bytearray:
        d = bytearray(cls.EXPECTED_SIZE)
        for ch in range(CHANNEL_COUNT):
            base = OFFSET_CH_RECORDS + ch * CH_RECORD_SIZE
            for idx, value in CHANNEL_RECORD_DEFAULTS_U16.items():
                struct.pack_into('<H', d, base + idx * 2, value)
            d[base + CH_RNG_SEED_BYTE:base + CH_RNG_SEED_BYTE + 4] = secrets.token_bytes(4)
            d[base + CH_RNG2_BYTE:base + CH_RNG2_BYTE + 12] = secrets.token_bytes(12)
        d[0x2000:0x2000 + len(TRAILER_MARKER)] = TRAILER_MARKER
        return d

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

    @classmethod
    def from_json_file(cls, path: str) -> 'FluxPreset':
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Invalid JSON in {path}: {exc.msg} at line {exc.lineno} column {exc.colno}"
            ) from exc
        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: dict) -> 'FluxPreset':
        if not isinstance(data, dict):
            raise ValueError("Preset JSON root must be an object.")

        allowed_top_level = {'channel_defaults', 'step_defaults', 'channels'}
        extra_keys = sorted(set(data) - allowed_top_level)
        if extra_keys:
            raise ValueError(f"Unknown top-level key(s): {', '.join(extra_keys)}")

        preset = cls()

        channel_defaults = preset._normalize_values(
            data.get('channel_defaults'),
            CHANNEL_PARAM_SPECS,
            CHANNEL_PARAM_ALIASES,
            'channel_defaults',
        )
        for ch in range(CHANNEL_COUNT):
            for key, value in channel_defaults.items():
                preset._set_channel_value(ch, key, value, f'channel_defaults.{key}')

        step_defaults = preset._normalize_values(
            data.get('step_defaults'),
            STEP_PARAM_SPECS,
            STEP_PARAM_ALIASES,
            'step_defaults',
        )
        for ch in range(CHANNEL_COUNT):
            for step in range(STEPS_PER_CHANNEL):
                for key, value in step_defaults.items():
                    preset._set_step_value(ch, step, key, value, f'step_defaults.{key}')

        channels = data.get('channels', [])
        if not isinstance(channels, list):
            raise ValueError("'channels' must be an array.")
        if len(channels) > CHANNEL_COUNT:
            raise ValueError(f"'channels' can contain at most {CHANNEL_COUNT} entries.")

        for ch, channel_data in enumerate(channels):
            if channel_data is None:
                continue
            if not isinstance(channel_data, dict):
                raise ValueError(f"channels[{ch}] must be an object.")

            channel_fields = {key: value for key, value in channel_data.items() if key != 'steps'}
            for key, value in preset._normalize_values(
                channel_fields,
                CHANNEL_PARAM_SPECS,
                CHANNEL_PARAM_ALIASES,
                f'channels[{ch}]',
            ).items():
                preset._set_channel_value(ch, key, value, f'channels[{ch}].{key}')

            steps = channel_data.get('steps', [])
            if steps is None:
                continue
            if not isinstance(steps, list):
                raise ValueError(f"channels[{ch}].steps must be an array.")
            if len(steps) > STEPS_PER_CHANNEL:
                raise ValueError(
                    f"channels[{ch}].steps can contain at most {STEPS_PER_CHANNEL} entries."
                )

            for step, step_data in enumerate(steps):
                if step_data is None:
                    continue
                if not isinstance(step_data, dict):
                    raise ValueError(f"channels[{ch}].steps[{step}] must be an object.")
                for key, value in preset._normalize_values(
                    step_data,
                    STEP_PARAM_SPECS,
                    STEP_PARAM_ALIASES,
                    f'channels[{ch}].steps[{step}]',
                ).items():
                    preset._set_step_value(
                        ch,
                        step,
                        key,
                        value,
                        f'channels[{ch}].steps[{step}].{key}',
                    )

        return preset

    def _slot(self, ch: int, step: int) -> int:
        """Linear index for channel/step combo."""
        return ch * STEPS_PER_CHANNEL + step

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
            normalized[canonical] = self._coerce_value(spec, raw_value, f'{path}.{raw_key}')
        return normalized

    def _coerce_value(self, spec: ParamSpec, value, path: str) -> int | float:
        if spec.attr in {'aux1', 'aux2'}:
            value = _parse_aux_mode(value)
        elif spec.attr == 'mod_bus':
            value = _parse_mod_bus(value)
        elif spec.attr == 's_h' and isinstance(value, bool):
            value = int(value)

        if spec.value_type == 'f32':
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
        getattr(self, spec.attr)[ch][step] = self._coerce_value(spec, value, path)

    def _set_channel_value(self, ch: int, key: str, value, path: str):
        spec = CHANNEL_PARAM_SPECS[key]
        getattr(self, spec.attr)[ch] = self._coerce_value(spec, value, path)

    def _parse(self):
        d = self.raw
        if len(d) < self.EXPECTED_SIZE:
            print(f"  NOTE: file is {len(d)} bytes (expected {self.EXPECTED_SIZE}). "
                  f"Older format — only parsing confirmed regions.")

        def safe_u8(off):  return d[off] if off < len(d) else 0
        def safe_u16(off): return struct.unpack_from('<H', d, off)[0] if off+2 <= len(d) else 0
        def safe_s16(off): return struct.unpack_from('<h', d, off)[0] if off+2 <= len(d) else 0
        def safe_f32(off): return struct.unpack_from('<f', d, off)[0] if off+4 <= len(d) else 0.0

        for ch in range(CHANNEL_COUNT):
            for step in range(STEPS_PER_CHANNEL):
                idx = self._slot(ch, step)
                self.loop[ch][step]     = safe_u8(0x0000 + idx)
                self.gate[ch][step]     = safe_u8(0x0040 + idx)
                self.leng[ch][step]     = safe_u8(0x0080 + idx)
                self.aux2[ch][step]     = safe_u8(0x00C0 + idx)
                self.dens[ch][step]     = safe_u8(0x0200 + idx)
                self.huma[ch][step]     = safe_u8(0x0340 + idx)
                self.phas[ch][step]     = safe_u16(OFFSET_PHAS + idx*2)
                self.cvsel[ch][step]    = safe_u8(0x0400 + idx)
                self.sync[ch][step]     = safe_u8(0x0440 + idx)
                self.mod_bus[ch][step]  = safe_u8(0x0480 + idx)
                self.s_h[ch][step]      = safe_u8(0x0780 + idx)
                self.minv[ch][step]     = safe_s16(OFFSET_MINV + idx*2)
                self.maxv[ch][step]     = safe_u16(OFFSET_MAXV + idx*2)
                self.prob_val[ch][step] = safe_u8(0x0640 + idx)
                self.freq[ch][step]     = safe_f32(OFFSET_FREQ + idx*4)
                self.quan[ch][step]     = safe_u8(0x07C0 + idx)
                self.aux1[ch][step]     = safe_u8(0x0A00 + idx)

        for ch in range(CHANNEL_COUNT):
            base = OFFSET_CH_RECORDS + ch * CH_RECORD_SIZE
            if base + CH_RECORD_SIZE <= len(d):
                self.bpm[ch]  = safe_u16(base + CH_BPM_IDX  * 2)
                self.ppqn[ch] = safe_u16(base + CH_PPQN_IDX * 2)
                self.velo[ch] = safe_u16(base + CH_VELO_IDX * 2)
                self.sh16[ch] = safe_u16(base + CH_SH16_IDX * 2)

    def _write_arrays(self, d: bytearray):
        for ch in range(CHANNEL_COUNT):
            for step in range(STEPS_PER_CHANNEL):
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

        for ch in range(CHANNEL_COUNT):
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
        fmt_note = {3860: 'v1 format', 6404: 'v2 format', 8196: 'v3 format'}.get(sz, 'unknown format')
        print(f"=== FLUX Preset ({sz} bytes, {fmt_note}) ===")
        print()
        for ch in range(CHANNEL_COUNT):
            ch_name = ['CH1(orange)', 'CH2(green)', 'CH3(blue)', 'CH4(red)'][ch]
            print(f"  ─── {ch_name} ───")
            print(f"    PPQN: {self.ppqn[ch]}   VELO: {self.velo[ch]}   SH16: {self.sh16[ch]}   (BPM in PREF)")
            print()

            hdr = f"    {'':8} " + " ".join(f"S{s+1:02d}" for s in range(STEPS_PER_CHANNEL))
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
            'GATE%':    (self.gate[ch][step],                   'LIKELY'),
            'LENG':     (self.leng[ch][step],                   'CONFIRMED'),
            'PHAS_deg': (self.phas[ch][step],                   'CONFIRMED'),
            'AUX1':     (aux_name(self.aux1[ch][step]),         'LIKELY'),
            'AUX2':     (aux_name(self.aux2[ch][step]),         'LIKELY'),
            'MOD_BUS':  (mod_bus_name(self.mod_bus[ch][step]),  'CONFIRMED'),
            'PROB_VAL': (self.prob_val[ch][step],               'LIKELY'),
            'MINV_mV':  (self.minv[ch][step],                   'LIKELY'),
            'MAXV_mV':  (self.maxv[ch][step],                   'CONFIRMED'),
            'HUMA':     (self.huma[ch][step],                   'LIKELY'),
            'QUAN':     (self.quan[ch][step],                   'LIKELY'),
            'CVSEL':    (self.cvsel[ch][step],                  'UNCERTAIN'),
            'SYNC':     (self.sync[ch][step],                   'UNCERTAIN'),
            'S+H':      (self.s_h[ch][step],                    'UNCERTAIN'),
            'FREQ_Hz':  (round(self.freq[ch][step], 4),         'CONFIRMED'),
            # COMP (-99..+99 signed), DIFF (always 0): offsets unlocated
            # MASK, MSK>: likely in 0x0100-0x01FF, structure unclear
        }
