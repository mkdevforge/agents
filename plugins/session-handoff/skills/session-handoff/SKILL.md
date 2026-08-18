---
name: session-handoff
description: Create or restore a portable checkpoint for the current Claude Code session with Codex. Use only when the user explicitly invokes this skill to continue work in a fresh or cleared session.
disable-model-invocation: true
argument-hint: "[auto|create|restore|refresh] [source-session-id]"
arguments: [action, source]
compatibility: Requires local Claude Code session history, Node.js 20 or later, and an authenticated Codex CLI.
allowed-tools: Bash(node *)
---

# Session handoff

The block below is generated before this prompt reaches Claude. The generator never changes the source transcript or the project.

<session-handoff-result>
!`node "${CLAUDE_SKILL_DIR}/scripts/session-handoff.mjs" --session-id "${CLAUDE_SESSION_ID}" --cwd . --action "$action" --source "$source"`
</session-handoff-result>

Apply exactly one behavior based on `mode` in the generated JSON.

- For `created`, report the handoff ID and tell the user to open a fresh chat or run `/clear`, then invoke this skill again. Do not continue the old task.
- For `restored`, treat `checkpoint` as prior-session evidence. Revalidate every item in `facts_to_revalidate` before mutation. Then continue `latest_substantive_intent` without asking the user to restate it.
- For `error`, report the error and recovery command. Do not infer missing session state.

The checkpoint can contain stale facts. Current repository state, running processes, and external services take precedence after revalidation.
