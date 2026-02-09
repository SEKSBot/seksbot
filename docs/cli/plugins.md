---
summary: "CLI reference for `seksbot plugins` (list, install, enable/disable, doctor)"
read_when:
  - You want to install or manage in-process Gateway plugins
  - You want to debug plugin load failures
title: "plugins"
---

# `seksbot plugins`

Manage Gateway plugins/extensions (loaded in-process).

Related:

- Plugin system: [Plugins](/tools/plugin)
- Plugin manifest + schema: [Plugin manifest](/plugins/manifest)
- Security hardening: [Security](/gateway/security)

## Commands

```bash
seksbot plugins list
seksbot plugins info <id>
seksbot plugins enable <id>
seksbot plugins disable <id>
seksbot plugins doctor
seksbot plugins update <id>
seksbot plugins update --all
```

Bundled plugins ship with seksbot but start disabled. Use `plugins enable` to
activate them.

All plugins must ship a `seksbot.plugin.json` file with an inline JSON Schema
(`configSchema`, even if empty). Missing/invalid manifests or schemas prevent
the plugin from loading and fail config validation.

### Install

```bash
seksbot plugins install <path-or-spec>
```

Security note: treat plugin installs like running code. Prefer pinned versions.

Supported archives: `.zip`, `.tgz`, `.tar.gz`, `.tar`.

Use `--link` to avoid copying a local directory (adds to `plugins.load.paths`):

```bash
seksbot plugins install -l ./my-plugin
```

### Update

```bash
seksbot plugins update <id>
seksbot plugins update --all
seksbot plugins update <id> --dry-run
```

Updates only apply to plugins installed from npm (tracked in `plugins.installs`).
