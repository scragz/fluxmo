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


if __name__ == '__main__':
    unittest.main()
