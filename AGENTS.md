# FLUXMO

Fluxmo is a Python CLI for parsing, diffing, and editing FLUX by IOLabs preset files (binary `.TXT` on SD card).

## Setup

```
python3 -m venv .venv && source .venv/bin/activate && pip install -e .
```

Requires Python 3.12+.

## Running commands

```
python3 main.py <command> [args]
```

| Command | What it does |
|---------|-------------|
| `show <file.TXT>` | Decode and print all parameters (auto-detects preset vs PREF) |
| `pref <PREF*.TXT>` | Parse persistent device config |
| `step <file.TXT> <ch> <step>` | Inspect one step (ch 1–4, step 1–16) |
| `diff <A.TXT> <B.TXT>` | Byte-level diff with parameter labels |
| `set <file.TXT> <param> <ch> <step> <value> [out.TXT]` | Edit a single parameter in-place |
| `build <preset.json> <out.TXT>` | Build a new preset binary from JSON |
| `hex <file.TXT> [offset] [length]` | Hexdump a region |
| `map` | Print the full parameter offset table |

## Codebase layout

```
main.py               CLI entry point — arg parsing and dispatch
src/fluxmo/
  preset.py           FluxPreset — parse/serialize preset .TXT files; format constants and offset map
  pref.py             FluxPrefs  — parse/serialize PREF*.TXT persistent config files
  diff.py             diff_presets(), hexdump utilities
docs/
  preset-format.md    Reverse-engineered preset binary format spec
  pref-format.md      Reverse-engineered PREF binary format spec
  json-format.md      JSON schema for the `build` command
data/                 Sample preset files from the community corpus (organized by date)
```

## Key facts for editing

- All `.TXT` files are **pure binary** despite the extension.
- Preset files live at `SD:/FLUX/*.TXT`; PREF files live at `SD:/PREFxxx.TXT`.
- Parameter offsets in `preset.py` carry certainty labels: `CONFIRMED` / `LIKELY` / `UNCERTAIN` — don't treat uncertain offsets as ground truth.
- The `set` and `build` commands write unknown/unused byte regions through unchanged.
- No external dependencies — stdlib + `pip install -e .` only.

---

# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command | Purpose |
|---------|---------|
| `npx wrangler dev` | Local development |
| `npx wrangler deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

---
