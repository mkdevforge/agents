# agents

This repository contains AI skills and tools from mkdevforge. The same plugin files support Codex and Claude Code.

## Plugins

| Plugin | Purpose |
| --- | --- |
| `ste-writing` | Control documentation, commit messages, and pull-request text with ASD-STE100 rules. |

## Install for Codex

Add this repository as a marketplace. Then install the plugin.

```powershell
codex plugin marketplace add mkdevforge/agents
codex plugin add ste-writing@mkdevforge-agents
```

Start a new task after installation. Invoke the skill with `$ste-writing`, or ask Codex to rewrite technical prose clearly.

## Install for Claude Code

Add this repository as a marketplace. Then install the plugin.

```powershell
claude plugin marketplace add mkdevforge/agents
claude plugin install ste-writing@mkdevforge-agents
```

Invoke the skill with `/ste-writing:ste-writing`, or ask Claude to rewrite technical prose clearly.

## Test a local checkout

Change to the repository directory. Add the current directory as the marketplace. Use the same install commands after that.

```powershell
Set-Location C:\path\to\agents
codex plugin marketplace add ./
claude plugin marketplace add ./
```

## Repository layout

```text
.agents/plugins/marketplace.json       Codex marketplace
.claude-plugin/marketplace.json        Claude Code marketplace
plugins/<plugin>/.codex-plugin/        Codex plugin manifest
plugins/<plugin>/.claude-plugin/       Claude Code plugin manifest
plugins/<plugin>/skills/<skill>/       Shared skill content
```
