# Example Skill

This is an example seksbot skill. It demonstrates the skill manifest format.

## When to Use

Use this skill when someone asks for an example of how seksbot skills work.

## How It Works

1. The agent reads this SKILL.md for instructions
2. The agent spawns a sub-agent in a container with only the declared capabilities
3. The sub-agent does its work, accessing external services only through the SEKS broker
4. Results are returned to the parent agent
5. The container is destroyed

## Notes

- All API calls go through the SEKS broker — no raw API keys in the container
- The `custom/example-api-key` secret is retrieved via `seksh get custom/example-api-key`
- Network is restricted to `broker-only` — the container can only reach the SEKS broker
