# 🔄 Upstream OpenClaw Availability Report

## 154 commits behind upstream/main

**Date**: 2026-02-11  
**Status**: Automated sync **BLOCKED** by comprehensive seksbot rebrand  
**Strategy**: Manual selective integration required

---

## 🚨 Critical Security Fixes (High Priority)

**⚠️ MANUAL INTEGRATION REQUIRED**

- `cfd112952` - fix(gateway): default-deny missing connect scopes
- `27453f5a3` - fix(web-search): handle xAI Responses API format in Grok provider
- `88428260c` - fix(web_search): remove unsupported include param from Grok API calls
- `22458f57f` - fix: strip reasoning tags from messaging tool text to prevent <think> leakage
- `424d2dddf` - fix: prevent act:evaluate hangs from getting browser tool stuck/killed
- `45488e4ec` - fix: remap session JSONL chunk line numbers to original source positions

---

## 🐛 Bug Fixes (Medium Priority)

### Core System

- `e85bbe01f` - fix: report subagent timeout as 'timed out' instead of 'completed successfully'
- `4200782a5` - fix(heartbeat): honor heartbeat.model config for heartbeat turns
- `6d723c9f8` - fix(agents): honor heartbeat.model override instead of session model
- `93411b74a` - fix(cli): exit with non-zero code when configure/agents-add wizards are cancelled
- `4baa43384` - fix(media): guard local media reads + accept all path types in MEDIA directive
- `66ca5746c` - fix(config): avoid redacting maxTokens-like fields

### Channel-Specific

- `9e92fc8fa` - fix(discord): default standalone threads to public type
- `2aa957046` - fix(slack): detect control commands when message starts with @mention
- `620cf381f` - fix: don't lowercase Slack channel IDs
- `1074d13e4` - fix: preserve original filename for WhatsApp inbound documents

### Model Providers

- `50a60b8be` - fix: use configured base URL for Ollama model discovery
- `512b2053c` - fix(web_search): Fix invalid model name sent to Perplexity (✅ **ALREADY INTEGRATED**)

---

## ✨ New Features (Evaluate for SEKS)

### New Providers

- `a36b9be24` - Feat/litellm provider - Support for LiteLLM proxy
- `661279cbf` - feat: adding support for Together ai provider
- `33ee8bbf1` - feat: add zai/glm-4.6v image understanding support

### Core Features

- `d2c2f4185` - Heartbeat: inject cron-style current time into prompts
- `2b02e8a7a` - feat(gateway): stream thinking events and decouple tool events from verbose level
- `ca629296c` - feat(hooks): add agentId support to webhook mappings
- `851fcb261` - feat: Add --localTime option to logs command for local timezone display
- `ead3bb645` - discord: auto-create thread when sending to Forum/Media channels
- `47f6bb414` - Commands: add commands.allowFrom config

### Channel Enhancements

- `90f58333e` - feat: IRC — add first-class channel support
- `96c46ed61` - Fix matrix media attachments (thanks @williamtwomey)
- `49c60e906` - feat(matrix): add thread session isolation

---

## 📚 Documentation Updates (Low Priority)

All doc updates conflict with seksbot rebrand, but content may be valuable:

- `6758b6bfe` - docs(channels): modernize imessage docs page
- `2c6569a48` - docs(channels): modernize slack docs page
- `8c963dc5a` - docs(channels): modernize whatsapp docs page
- `6bee63864` - docs(channels): modernize discord docs page
- `3ed06c6f3` - docs: modernize gateway configuration page (Phase 1)
- `4625da476` - docs(skills): update mintlify skill to reference docs/
- `f093ea1ed` - chore: update AGENTS.md and add mintlify skill

---

## 🔧 Infrastructure & Dependencies

### CI/Build Improvements

- `31f616d45` - feat: `ClawDock` - shell docker helpers for OpenClaw development
- `4df252d89` - ci(docker): use registry cache for persistent layer storage
- `de8eb2b29` - feat(ci): code-size gates heavy jobs, re-enable --strict
- `dd25b96d0` - ci: split format/lint into tiered gates with shared setup action

### Dependency Updates

- `cc87c0ed7` - chore(deps): update dependencies, remove hono pinning
- `ce71c7326` - chore: add tsconfig.test.json for type-checking test files
- `ec55583bb` - fix: align extension tests and fetch typing for gate stability

---

## 🎯 Recommended Integration Strategy

### Phase 1: Critical Security (Do First)

1. **Gateway auth fixes** - Manual port of `cfd112952`
2. **Tool security** - Manual port of `22458f57f` (reasoning tag leakage)
3. **Media security** - Manual port of `4baa43384` (path validation)

### Phase 2: Core Bug Fixes

1. **Heartbeat model** fixes - `4200782a5` + `6d723c9f8`
2. **Session handling** - `e85bbe01f` (timeout reporting)
3. **Channel fixes** - Discord/Slack/WhatsApp improvements

### Phase 3: New Features (Evaluate)

1. **LiteLLM provider** - Worth adding to SEKS?
2. **Together.AI support** - Useful for SEKS broker?
3. **Gateway streaming** - Enhance real-time experience?

### Phase 4: Infrastructure (Nice to Have)

1. **Build improvements** - Code size gates, Docker caching
2. **Dependencies** - Update packages carefully
3. **Documentation** - Adapt content to seksbot branding

---

## 🚫 What NOT to Port

- **Skills-related commits** - We deprecated OpenClaw skills
- **Branding references** - Keep seksbot identity
- **CLI command changes** - May conflict with seksbot CLI
- **Config schema changes** - Conflicts with `seks.broker` section

---

## 📊 Summary Stats

- **🔴 Security Critical**: 6 commits
- **🟡 Bug Fixes**: 15+ commits
- **🟢 New Features**: 10+ commits
- **📝 Documentation**: 20+ commits
- **⚙️ Infrastructure**: 15+ commits
- **❌ Skippable**: 80+ commits (branding conflicts, deprecated features)

**Next Action**: Manual security audit + selective cherry-picking of high-value commits
