"""
FluxPrefs — parser for FLUX PREF*.TXT persistent configuration files.

Format versions (bytes 2–3):
  01 05 → firmware ~1.05 (20 bytes)
  01 06 → firmware ~1.06 (20 bytes)
  03 03 → firmware 1.06N+ (44–262 bytes)

Certainty levels:
  CONFIRMED  — verified against known defaults
  LIKELY     — strongly inferred from corpus / value matches
  UNCERTAIN  — structural guess, needs hardware validation
"""

import struct


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
                self.velo[ch]      = struct.unpack_from('<H', d, base + 0)[0]
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
