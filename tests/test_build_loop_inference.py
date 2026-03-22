import unittest

from src.fluxmo.preset import FluxPreset


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

    def test_aux1_is_rejected_until_remapped(self):
        with self.assertRaisesRegex(ValueError, 'unknown field'):
            FluxPreset.from_dict({
                'step_defaults': {'aux1': 'ON'},
            })

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

    def test_step_arrays_are_serialized_step_major(self):
        preset = FluxPreset.from_dict({
            'step_defaults': {'dens': 0, 'leng': 1},
            'channels': [
                {'steps': [{'dens': 1, 'leng': 4}, None, {'dens': 2, 'leng': 6}]},
                {'steps': [None, {'dens': 3, 'leng': 8}]},
            ],
        })

        raw = preset.to_bytes()

        self.assertEqual(list(raw[0x0200:0x020C]), [1, 0, 0, 0, 0, 3, 0, 0, 2, 0, 0, 0])
        self.assertEqual(list(raw[0x0080:0x008C]), [4, 1, 1, 1, 1, 8, 1, 1, 6, 1, 1, 1])


if __name__ == '__main__':
    unittest.main()
