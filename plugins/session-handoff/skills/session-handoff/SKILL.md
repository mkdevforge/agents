---
name: session-handoff
description: Create or restore a portable checkpoint for the current Claude Code session with Codex. Use only when the user explicitly invokes this skill to transfer work to a fresh or cleared session. Restoration loads context and stops until the user's next message.
disable-model-invocation: true
compatibility: Requires local Claude Code session history, Node.js 20 or later, and an authenticated Codex CLI.
allowed-tools: Bash(node *)
---

# Session handoff

The block below is generated before this prompt reaches Claude. The generator never changes the source transcript or the project.

<session-handoff-result>
!`node "${CLAUDE_SKILL_DIR}/scripts/session-handoff.mjs" --session-id "${CLAUDE_SESSION_ID}" --cwd .`
</session-handoff-result>

Apply exactly one behavior based on `mode` in the generated JSON.

- For `created`, tell the user to run `/clear`, then invoke `/session-handoff` again. Do not require or suggest a session ID. Do not continue the old task.
- For `restored`, confirm that the handoff state is loaded, then stop. Do not revalidate state, call tools, inspect files, mutate anything, or continue `latest_substantive_intent` during this invocation. Treat `checkpoint` as prior-session evidence on the user's next message, and revalidate `facts_to_revalidate` before any later mutation.
- For `error`, report the error. Tell the user to return to an established source session and invoke `/session-handoff`; do not ask for a session ID. Do not infer missing session state.

The checkpoint can contain stale facts. Current repository state, running processes, and external services take precedence after revalidation.
