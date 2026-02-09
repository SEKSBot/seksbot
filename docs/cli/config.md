---
summary: "CLI reference for `seksbot config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `seksbot config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `seksbot configure`).

## Examples

```bash
seksbot config get browser.executablePath
seksbot config set browser.executablePath "/usr/bin/google-chrome"
seksbot config set agents.defaults.heartbeat.every "2h"
seksbot config set agents.list[0].tools.exec.node "node-id-or-name"
seksbot config unset tools.web.search.apiKey
```

## Paths

Paths use dot or bracket notation:

```bash
seksbot config get agents.defaults.workspace
seksbot config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
seksbot config get agents.list
seksbot config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--json` to require JSON5 parsing.

```bash
seksbot config set agents.defaults.heartbeat.every "0m"
seksbot config set gateway.port 19001 --json
seksbot config set channels.whatsapp.groups '["*"]' --json
```

Restart the gateway after edits.
