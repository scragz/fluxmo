# Example Presets

These example JSON files were written based on the reverse-engineered format docs, `flux-manual.pdf`, and the v3 preset corpus under `data/`.

- `basic.json`: straight 16-step starter groove with kick, snare/clap, hats, and a simple perc lane.
- `complex.json`: denser club pattern with shorter inferred loops, ratchets, phase offsets, and varied CV ranges.
- `test_loop.json`: focused loop-length example using 7-, 7-, 5-, and 4-step layers so the loop inference is audible.
- `cv_utility_patch.json`: demonstrates utility AUX clocks plus the currently numeric `cvsel`, `sync`, and `s_h` fields.

Notes:

- All examples use `step_defaults.dens = 0` so omitted steps stay silent. That makes the drum patterns explicit in JSON.
- The `cvsel` and `sync` enums are still only partially decoded in the codebase, so the dedicated CV example uses raw numeric values instead of symbolic names.
- AUX utility modes such as `START`, `PPQ12`, and `/4` are intentional here: they show how a preset can drive external resets or clocks while the main rhythm lanes stay musical.
