"""
Diff and hexdump utilities for FLUX preset files.

Use diff to identify unknown parameter offsets by changing one setting
on the device, saving, and comparing the before/after files.
"""

from .preset import (
    STEP_ARRAYS_U8, OFFSET_PHAS, OFFSET_MINV, OFFSET_MAXV, OFFSET_FREQ,
    OFFSET_CH_RECORDS, CH_RECORD_SIZE, CH_BPM_IDX, CH_CURV_IDX,
    CH_VELO_IDX, CH_SH16_IDX, OFFSET_AUX1_CANDIDATE, OFFSET_AUX2_CANDIDATE,
)


def diff_presets(path_a: str, path_b: str):
    """
    Show byte-level differences between two preset files.

    Change exactly one parameter on the device, save the preset, then run:
      python3 main.py diff OLD.TXT NEW.TXT

    The differing offsets map directly to the changed parameter's storage location.
    """
    with open(path_a, 'rb') as f: a = f.read()
    with open(path_b, 'rb') as f: b = f.read()

    if len(a) != len(b):
        print(f"NOTE: files differ in size ({len(a)} vs {len(b)} bytes)")

    max_len = max(len(a), len(b))
    diffs = [i for i in range(max_len)
             if (a[i] if i < len(a) else None) != (b[i] if i < len(b) else None)]

    if not diffs:
        print("Files are identical.")
        return

    print(f"Found {len(diffs)} differing byte(s):\n")
    print(f"  {'Offset':>8}  {'Old':>5}  {'New':>5}  {'Old(hex)':>8}  {'New(hex)':>8}  Notes")
    print(f"  {'------':>8}  {'---':>5}  {'---':>5}  {'--------':>8}  {'--------':>8}  -----")
    for off in diffs:
        av = a[off] if off < len(a) else '---'
        bv = b[off] if off < len(b) else '---'
        note = _offset_note(off)
        av_hex = f"0x{av:02X}" if isinstance(av, int) else str(av)
        bv_hex = f"0x{bv:02X}" if isinstance(bv, int) else str(bv)
        print(f"  0x{off:06X}  {str(av):>5}  {str(bv):>5}  {av_hex:>8}  {bv_hex:>8}  {note}")

    print()
    print("Hint: if you changed one parameter, the offsets above are its storage location.")
    print("Please share this output at the community forum to help map the format!")


def _offset_note(off: int) -> str:
    """Return a human-readable note about what lives at this offset, if known."""
    if OFFSET_AUX1_CANDIDATE <= off < OFFSET_AUX1_CANDIDATE + 64:
        ch, step = _late_aux_position(off - OFFSET_AUX1_CANDIDATE)
        return f"AUX1 [ch{ch+1} step{step+1}] (UNCERTAIN late-file array)"

    if OFFSET_AUX2_CANDIDATE <= off < OFFSET_AUX2_CANDIDATE + 64:
        ch, step = _late_aux_position(off - OFFSET_AUX2_CANDIDATE)
        return f"AUX2 [ch{ch+1} step{step+1}] (UNCERTAIN late-file array)"

    for array_off, (name, cert) in STEP_ARRAYS_U8.items():
        if array_off <= off < array_off + 64:
            idx = off - array_off
            step = idx // 4
            ch = idx % 4
            return f"{name} [ch{ch+1} step{step+1}] ({cert})"

    if 0x0380 <= off < 0x0400:
        idx = (off - 0x0380) // 2
        step, ch = idx // 4, idx % 4
        return f"PHAS_deg [ch{ch+1} step{step+1}] (CONFIRMED uint16)"

    if 0x0500 <= off < 0x0580:
        idx = (off - 0x0500) // 2
        step, ch = idx // 4, idx % 4
        return f"MINV_mV [ch{ch+1} step{step+1}] (LIKELY int16)"

    if 0x0580 <= off < 0x0600:
        idx = (off - 0x0580) // 2
        step, ch = idx // 4, idx % 4
        return f"MAXV_mV [ch{ch+1} step{step+1}] (CONFIRMED)"

    if 0x0680 <= off < 0x0780:
        idx = (off - 0x0680) // 4
        step, ch = idx // 4, idx % 4
        return f"FREQ_Hz [ch{ch+1} step{step+1}] (CONFIRMED)"

    if 0x0800 <= off < 0x1B80:
        return "Evolve/Macro modulation (UNCERTAIN — needs mapping)"

    for ch in range(4):
        base = OFFSET_CH_RECORDS + ch * CH_RECORD_SIZE
        if base <= off < base + CH_RECORD_SIZE:
            rel = off - base
            if rel == CH_BPM_IDX  * 2:     return f"BPM ch{ch+1} (CONFIRMED)"
            if rel == CH_BPM_IDX  * 2 + 1: return f"BPM ch{ch+1} high byte (CONFIRMED)"
            if rel == CH_CURV_IDX * 2:     return f"record u16[{CH_CURV_IDX}] ch{ch+1} (UNCERTAIN)"
            if rel == CH_VELO_IDX * 2:     return f"VELO ch{ch+1} (CONFIRMED)"
            if rel == CH_SH16_IDX * 2:     return f"SH16 ch{ch+1} (CONFIRMED)"
            if 0x14 <= rel < 0x18:         return f"RNG seed ch{ch+1} (per-channel UUID)"
            if 0x54 <= rel < 0x60:         return f"UUID bytes ch{ch+1}"
            return f"per-channel record ch{ch+1} +0x{rel:02X} (UNCERTAIN)"

    if 0x1D80 <= off <= 0x2003:
        return "end section (UNCERTAIN — ON/OFF gen / macro state)"

    return "unknown"


def _late_aux_position(idx: int) -> tuple[int, int]:
    linear = (idx + 4) % 64
    ch = linear // 16
    step = linear % 16
    return ch, step


def hexdump(data: bytes, start: int = 0, length: int = 256, width: int = 16):
    """Print a hex dump of `data` starting at `start` for `length` bytes."""
    for i in range(0, length, width):
        off = start + i
        if off >= len(data): break
        chunk = data[off:off+width]
        hex_str = ' '.join(f'{b:02X}' for b in chunk)
        asc_str = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
        print(f"  {off:06X}:  {hex_str:<{width*3}}  {asc_str}")
