---
summary: "CLI reference for `seksbot agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `seksbot agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
seksbot agents list
seksbot agents add work --workspace ~/.seksbot/workspace-work
seksbot agents set-identity --workspace ~/.seksbot/workspace --from-identity
seksbot agents set-identity --agent main --avatar avatars/seksbot.png
seksbot agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.seksbot/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
seksbot agents set-identity --workspace ~/.seksbot/workspace --from-identity
```

Override fields explicitly:

```bash
seksbot agents set-identity --agent main --name "seksbot" --emoji "🦞" --avatar avatars/seksbot.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "seksbot",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/seksbot.png",
        },
      },
    ],
  },
}
```
