import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from main import cmd_set
from src.fluxmo.preset import FluxPreset, curve_name


class BuildLoopInferenceTests(unittest.TestCase):
    def test_infers_loop_length_from_steps_array(self):
        preset = FluxPreset.from_dict({
            'channels': [
                {'steps': [{}, {}, {}, {}]},
            ],
        })

        self.assertEqual(preset.loop[0], [4] * 16)

    def test_step_defaults_loop_overrides_inference(self):
        preset = FluxPreset.from_dict({
            'step_defaults': {'loop': 6},
            'channels': [
                {'steps': [{}, {}, {}]},
            ],
        })

        self.assertEqual(preset.loop[0], [6] * 16)

    def test_explicit_step_loop_overrides_inference(self):
        preset = FluxPreset.from_dict({
            'channels': [
                {'steps': [{'loop': 7}, {}, {}]},
            ],
        })

        self.assertEqual(preset.loop[0][0], 7)
        self.assertEqual(preset.loop[0][1:], [3] * 15)

    def test_serializes_loop_control_bytes_at_0a00(self):
        preset = FluxPreset.from_dict({
            'channels': [
                {'steps': [{}] * 16},
                {'steps': [{}] * 8},
                {'steps': [{}] * 8},
                {'steps': [{}] * 4},
            ],
        })

        raw = preset.to_bytes()

        self.assertEqual(raw[0x0A00:0x0A04], bytes([16, 8, 8, 4]))
        self.assertEqual(raw[0x0A04:0x0A08], bytes([1, 1, 1, 1]))
        self.assertEqual(raw[0x0A08:0x0A38], bytes(0x30))
        self.assertEqual(raw[0x0A38:0x0A3C], bytes([1, 1, 1, 1]))

    def test_parses_loop_range_from_0a00_control_bytes(self):
        preset = FluxPreset()
        raw = bytearray(preset.to_bytes())
        raw[0x0A00:0x0A04] = bytes([4, 4, 8, 4])
        raw[0x0A04:0x0A08] = bytes([1, 1, 1, 1])

        parsed = FluxPreset()
        parsed.raw = raw
        parsed._parse()

        self.assertEqual(parsed.get_step(0, 0)['LOOP'][0], '1-4')
        self.assertEqual(parsed.get_step(2, 0)['LOOP'][0], '1-8')

    def test_aux1_serializes_to_provisional_late_aux_block(self):
        preset = FluxPreset.from_dict({
            'channels': [
                {},
                {},
                {'steps': [{}, {}, {}, {'aux1': 'SOS'}]},
                {'steps': [{'aux1': 'TL5'}]},
            ],
        })

        raw = preset.to_bytes()

        self.assertEqual(raw[0x1900 + 31], 3)
        self.assertEqual(raw[0x1900 + 44], 18)
        self.assertEqual(preset.get_step(2, 3)['AUX1'][0], 'SOS')
        self.assertEqual(preset.get_step(3, 0)['AUX1'][0], 'TL5')

    def test_channel_curv_is_rejected_until_remapped(self):
        with self.assertRaisesRegex(ValueError, 'unknown field'):
            FluxPreset.from_dict({
                'channel_defaults': {'curv': 4},
            })

    def test_leng_must_be_between_1_and_32(self):
        with self.assertRaisesRegex(ValueError, 'must be >= 1'):
            FluxPreset.from_dict({
                'step_defaults': {'leng': 0},
            })

        with self.assertRaisesRegex(ValueError, 'must be <= 32'):
            FluxPreset.from_dict({
                'step_defaults': {'leng': 33},
            })

        preset = FluxPreset.from_dict({
            'step_defaults': {'length': 32},
        })

        self.assertEqual(preset.leng[0][0], 32)

    def test_new_build_keeps_channel_record_u16_19_at_4(self):
        preset = FluxPreset.from_dict({'channels': []})
        raw = preset.to_bytes()

        self.assertEqual(raw[0x1BA6:0x1BA8], bytes([4, 0]))
        self.assertEqual(raw[0x1C26:0x1C28], bytes([4, 0]))
        self.assertEqual(raw[0x1CA6:0x1CA8], bytes([4, 0]))
        self.assertEqual(raw[0x1D26:0x1D28], bytes([4, 0]))

    def test_new_build_matches_device_default_baseline_for_known_unknowns(self):
        preset = FluxPreset.from_dict({'channels': []})
        raw = preset.to_bytes()

        self.assertEqual(raw[0x0EC0:0x0ED0], bytes([0xC8]) * 16)
        self.assertEqual(raw[0x1BFC:0x1C00], bytes([0xC8, 0x00, 0xC8, 0x00]))
        self.assertEqual(raw[0x1C7C:0x1C80], bytes([0xC8, 0x00, 0xC8, 0x00]))
        self.assertEqual(raw[0x1CFC:0x1D00], bytes([0xC8, 0x00, 0xC8, 0x00]))
        self.assertEqual(raw[0x1D7C:0x1D80], bytes([0x00, 0x00, 0x00, 0x00]))

    def test_step_arrays_are_serialized_step_major(self):
        preset = FluxPreset.from_dict({
            'step_defaults': {'dens': 0, 'leng': 7, 'prob_val': 88, 'huma': 40},
            'channels': [
                {'steps': [{'dens': 1, 'leng': 4}, None, {'dens': 2, 'leng': 6}]},
                {'steps': [None, {'dens': 3, 'leng': 8}]},
            ],
        })

        raw = preset.to_bytes()

        self.assertEqual(list(raw[0x0200:0x020C]), [1, 0, 0, 0, 0, 3, 0, 0, 2, 0, 0, 0])
        self.assertEqual(list(raw[0x0080:0x008C]), [4, 1, 7, 7, 1, 8, 7, 7, 6, 7, 7, 7])
        self.assertEqual(list(raw[0x0640:0x064C]), [88, 100, 88, 88, 100, 88, 88, 88, 88, 88, 88, 88])
        self.assertEqual(list(raw[0x0340:0x034C]), [40, 0, 40, 40, 0, 40, 40, 40, 40, 40, 40, 40])

    def test_null_steps_reset_to_default_silent_steps(self):
        preset = FluxPreset.from_dict({
            'step_defaults': {'dens': 0, 'leng': 9, 'prob_val': 88, 'huma': 40, 'maxv': 4500},
            'channels': [
                {'steps': [None]},
            ],
        })

        self.assertEqual(preset.dens[0][0], 0)
        self.assertEqual(preset.leng[0][0], 1)
        self.assertEqual(preset.prob_val[0][0], 100)
        self.assertEqual(preset.huma[0][0], 0)
        self.assertEqual(preset.maxv[0][0], 8000)

    def test_curve_labels_map_to_likely_curve_block(self):
        preset = FluxPreset.from_dict({
            'channels': [
                {'steps': [{'curv': '1'}, {'curv': 2.3}, {'curv': 'NL3.2'}]},
            ],
        })

        raw = preset.to_bytes()

        self.assertEqual(list(raw[0x0280:0x028C]), [0, 0, 0, 0, 4, 0, 0, 0, 50, 0, 0, 0])
        self.assertEqual(curve_name(0), '1')
        self.assertEqual(curve_name(4), '2.3')
        self.assertEqual(curve_name(50), 'NL3.2')
        self.assertEqual(curve_name(57), 'NL4.4')

    def test_probe_a_parses_as_nl32_curve(self):
        preset = FluxPreset.from_file('data/FLUX/PROBE_A_.TXT')

        self.assertEqual(preset.get_step(0, 0)['CURV'][0], 'NL3.2')
        self.assertEqual(preset.get_step(3, 15)['CURV'][0], 'NL3.2')

    def test_cli_set_curv_coerces_curve_labels_before_save(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = Path(tmpdir) / 'curve-set.TXT'
            with redirect_stdout(io.StringIO()):
                cmd_set('data/FLUX/PROBE_A_.TXT', 'curv', '1', '1', '2.3', str(out_path))

            preset = FluxPreset.from_file(str(out_path))

        self.assertEqual(preset.tm_curv[0][0], 4)
        self.assertEqual(preset.get_step(0, 0)['CURV'][0], '2.3')


if __name__ == '__main__':
    unittest.main()
