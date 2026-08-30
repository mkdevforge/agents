---
name: resume-claude-session
description: Use when the user explicitly asks Codex to resume a local Claude Code session selected by recency, description, or session ID.
---

# Resume Claude session

Extract the selector from the invocation. Use `latest` when the user supplies no selector. Otherwise preserve their full description or exact session ID.

Run this from the skill directory:

```bash
node scripts/resume-claude-session.mjs --selector "<selector>"
```

The script reads local Claude transcripts, excludes subagent logs, fails on weak or ambiguous description matches, and uses Luna at max effort to create a portable checkpoint. It does not change the source transcript or project.

- For `restored`, treat `checkpoint` as prior-session context. Confirm that the Claude session context is loaded, then stop. Do not revalidate state, inspect project files, mutate anything, or continue the source task during this invocation.
- For `error`, report the error and recovery text. Do not guess which session the user meant.

On the user's next message, revalidate `facts_to_revalidate` before relying on volatile repository, process, artifact, or service state.
