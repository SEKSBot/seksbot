# Contributing to seksbot

## Quick Links

- **GitHub:** https://github.com/SEKSBot/seksbot
- **Upstream:** https://github.com/openclaw/openclaw (we sync regularly)

## Maintainers

- **Peter Kwangjun Suk** — Founder
  - GitHub: [@stcredzero](https://github.com/stcredzero)

## How to Contribute

1. **Bugs & small fixes** → Open a PR!
2. **New features / architecture** → Start a GitHub Discussion or open an issue first
3. **SEKS-specific work** (broker, seksh, skills revamp) → Check open issues tagged `seks`

## Before You PR

- Test locally with your seksbot instance
- Run tests: `pnpm build && pnpm check && pnpm test`
- Keep PRs focused (one thing per PR)
- Describe what & why

## Control UI Decorators

The Control UI uses Lit with **legacy** decorators (current Rollup parsing does not support
`accessor` fields required for standard decorators). When adding reactive fields, keep the
legacy style:

```ts
@state() foo = "bar";
@property({ type: Number }) count = 0;
```

The root `tsconfig.json` is configured for legacy decorators (`experimentalDecorators: true`)
with `useDefineForClassFields: false`. Avoid flipping these unless you are also updating the UI
build tooling to support standard decorators.

## AI-Assisted PRs Welcome

Built with AI tools? Great — just mark it in the PR description and note the degree of testing.

## Current Focus

- **SEKS Broker** — zero-knowledge secret injection for agents
- **seksh** — Nushell fork with broker integration
- **Skills revamp** — structured, broker-integrated skill format
- **Upstream sync** — tracking OpenClaw for runtime improvements

## Fork Note

seksbot is a hard fork of [OpenClaw](https://github.com/openclaw/openclaw). Contributions to the SEKS layer (broker, seksh, skills) live here. For core runtime issues that affect upstream too, consider contributing to OpenClaw directly.
