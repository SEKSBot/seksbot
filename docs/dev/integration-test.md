# Integration Test: Discord Bot Smoke Test

## Overview

The integration test workflow (`integration-test.yml`) spins up a seksbot container, connects it to Discord, sends a test message, and verifies the bot responds.

## Required Secrets

Configure these in the repo's GitHub Settings → Secrets:

| Secret | Description |
|--------|-------------|
| `TEST_DISCORD_BOT_TOKEN` | Discord bot token for the test bot |
| `TEST_DISCORD_GUILD_ID` | Guild ID where tests run |
| `TEST_DISCORD_CHANNEL_ID` | Channel ID for test messages (e.g., `#integration-test`) |
| `TEST_DISCORD_ADMIN_ID` | Discord user ID allowed to interact with the bot |
| `SEKS_BROKER_URL` | SEKS broker URL (e.g., `https://seks-broker.stcredzero.workers.dev`) |
| `SEKS_AGENT_TOKEN` | Agent token for the test bot's broker access |

## Setup

### 1. Create a Test Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application (e.g., "seksbot-integration-test")
3. Bot → create bot, copy token → `TEST_DISCORD_BOT_TOKEN`
4. Enable "Message Content Intent" under Privileged Intents
5. Invite to your test guild with bot + message permissions

### 2. Create a Test Channel

Create `#integration-test` in your guild. Set `TEST_DISCORD_CHANNEL_ID` to its ID.

### 3. Configure SEKS Broker

Create a scoped agent token in the broker for the test bot with minimal capabilities (just `anthropic/messages.create` or equivalent).

## Running

### Manual trigger
```bash
gh workflow run integration-test.yml
```

### Automatic
Uncomment the `push` trigger in the workflow to run on every push to main.

## What It Tests

1. **Docker build** — Image builds successfully from source
2. **Gateway startup** — Health check endpoint responds within 60s
3. **Discord connection** — Bot connects to Discord and joins the guild
4. **Message handling** — Bot receives a message and generates a response
5. **End-to-end auth** — SEKS broker token works for model API access

## Future Enhancements

- **Hetzner VPS test** — Deploy to a real VPS, test full networking stack
- **Multi-channel test** — Test Telegram, Slack, etc.
- **Capability test** — Verify broker capability grants work (e.g., test bot can only call allowed APIs)
- **Latency assertions** — Response time SLA checks
