---
summary: "CLI reference for `seksbot logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `seksbot logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
seksbot logs
seksbot logs --follow
seksbot logs --json
seksbot logs --limit 500
seksbot logs --local-time
seksbot logs --follow --local-time
```

Use `--local-time` to render timestamps in your local timezone.
