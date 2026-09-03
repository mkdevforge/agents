# agents

This repository contains AI skills and tools from mkdevforge. Plugins support Codex and Claude Code where their host capabilities permit it.

## Plugins

| Plugin | Purpose |
| --- | --- |
| `ste-writing` | Control documentation, commit messages, and pull-request text with ASD-STE100 rules. |
| `session-handoff` | Continue Claude Code work in Claude or Codex through a Codex-generated checkpoint. |
| `microskill-creator` | Create focused repo-local skills for one repeatable behavior. |

## Install for Codex

Add this repository as a marketplace. Then install the plugin.

```powershell
codex plugin marketplace add mkdevforge/agents
codex plugin add ste-writing@mkdevforge-agents
```

Start a new task after installation. Invoke the skill with `$ste-writing`, or ask Codex to rewrite technical prose clearly.

To create a microskill instead, install its plugin and invoke the skill from the target repository:

```powershell
codex plugin add microskill-creator@mkdevforge-agents
```

```text
$create-microskill
```

## Install for Claude Code

Add this repository as a marketplace. Then install the plugin.

```powershell
claude plugin marketplace add mkdevforge/agents
claude plugin install ste-writing@mkdevforge-agents
```

Invoke the skill with `/ste-writing:ste-writing`, or ask Claude to rewrite technical prose clearly.

Install and invoke the microskill creator with:

```powershell
claude plugin install microskill-creator@mkdevforge-agents
```

```text
/microskill-creator:create-microskill
```

### Session handoff

The handoff skill requires Node.js 20 or later and an authenticated Codex CLI. Install the marketplace plugin to use its namespaced command.

```powershell
claude plugin install session-handoff@mkdevforge-agents
```

```text
/session-handoff:session-handoff
```

For the shorter `/session-handoff` command, link the repository skill into the personal Claude skills directory.

```powershell
.\scripts\install-session-handoff.ps1
```

Create a checkpoint in the established session. Open a fresh Claude Code chat or run `/clear`. Invoke the same command again to restore the state. The restored session confirms that it is ready and waits for the next user message.

```text
/session-handoff
```

The skill stores checkpoints under `~/.agent-handoffs/session-handoff`. It does not change the source transcript or the project.

### Resume Claude work in Codex

Install the repo-backed user skill, then start a new Codex task. The skill is explicit-only.

```bash
./scripts/install-resume-claude-session.sh
```

```text
$resume-claude-session latest
```

You can also select a session by topic or exact Claude session ID.

```text
$resume-claude-session the Claude session where we designed the Kinde login screen
```

The skill loads the checkpoint and stops. Send a new message when you want Codex to continue the work.

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
