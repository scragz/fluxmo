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

import struct

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
CH_RNG2_BYTE = 0x54 # CONFIRMED: 12-byte UUID at byte offset 0x54


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
        self.raw = bytearray(self.EXPECTED_SIZE)
        # per-step arrays, shape [4 channels][16 steps]
        self.loop     = [[1]*16 for _ in range(4)]    # LIKELY (loop length, default=1)
        self.gate     = [[10]*16 for _ in range(4)]   # LIKELY (trigger length 0-99%, default=10)
        self.leng     = [[1]*16 for _ in range(4)]    # CONFIRMED
        self.aux2     = [[1]*16 for _ in range(4)]    # LIKELY (AUX2 mode index, default=1=ON)
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
        self.aux1     = [[1]*16 for _ in range(4)]    # LIKELY (AUX1 mode index, default=1=ON)
        # per-channel (from channel records at 0x1B80)
        self.bpm      = [120]*4   # LIKELY: mirrors PREF BPM
        self.ppqn     = [4]*4     # CONFIRMED
        self.velo     = [127]*4   # CONFIRMED
        self.sh16     = [2]*4     # CONFIRMED

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
        fmt_note = {3860: 'v1 format', 6404: 'v2 format', 8196: 'v3 format'}.get(sz, 'unknown format')
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
