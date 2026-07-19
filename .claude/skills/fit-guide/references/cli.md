# CLI Reference

## Conversational Agent

```sh
npx fit-guide "Tell me about X"            # One-shot positional prompt
echo "Tell me about X" | npx fit-guide     # Equivalent piped form
npx fit-guide                              # Interactive session
npx fit-guide --help                       # Show help
npx fit-guide --version                    # Print package version
npx fit-guide --init                       # Bootstrap .env + config/ + .claude/skills/ (idempotent re-runs)
npx fit-guide --login                      # OAuth PKCE login with Anthropic
npx fit-guide --logout                     # Clear stored credentials
npx fit-guide --resume                     # Resume previous conversation
npx fit-guide --status                     # Check system readiness
npx fit-guide --status --json              # Machine-readable status
```

Positional words are always prompt text, never commands — `npx fit-guide
status` sends the word "status" to the agent. Operational commands are
always flags (`--status`, `--login`).

The CLI is built on the Claude Agent SDK. It connects to the MCP endpoint for
tools and prompts, and streams the response.

### Supporting CLI Tools

```sh
npx fit-rag search "query text"              # Vector similarity search
npx fit-rc status                        # Service health
```
