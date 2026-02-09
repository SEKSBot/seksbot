---
summary: "CLI reference for `seksbot reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `seksbot reset`

Reset local config/state (keeps the CLI installed).

```bash
seksbot reset
seksbot reset --dry-run
seksbot reset --scope config+creds+sessions --yes --non-interactive
```
