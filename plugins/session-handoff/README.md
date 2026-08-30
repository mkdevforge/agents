# session-handoff

`session-handoff` creates a portable checkpoint from a local Claude Code transcript. Codex reads the transcript and Luna produces the checkpoint. Claude can restore a pending checkpoint after `/clear`, and Codex can select and restore a Claude session directly.

## Workflow

Run the skill in the established session.

```text
/session-handoff
```

Open a fresh Claude Code chat or run `/clear`. Run the same skill again.

The first invocation creates a pending checkpoint. The second invocation detects the fresh session, restores the checkpoint, confirms that the state is loaded, and stops. The user's next message decides when work continues.

## Selection

The command has no arguments. It creates a checkpoint when the current transcript has conversation history and restores the latest checkpoint for the current working directory when the current session is fresh. Session IDs and handoff IDs are diagnostic output, not user input.

Repeated calls in the source session reuse its checkpoint when the transcript has not changed.

## Resume in Codex

Invoke the explicit-only Codex skill with `latest`, an exact Claude session ID, or a natural-language description.

```text
$resume-claude-session latest
$resume-claude-session the Claude session where we investigated the login issue
```

Natural-language selection searches top-level Claude sessions and excludes subagent logs. Weak or ambiguous matches fail and report candidates instead of guessing. The restored Codex task confirms that the checkpoint is loaded and stops until the user's next message.

## Models

Claude-to-Claude handoff synthesis uses `gpt-5.6-luna` with `xhigh` effort. Codex restore uses Luna at `max` effort. The generator measures the imported Codex thread. When the thread exceeds 72 percent of the model context window, it uses Codex native compaction and renders the portable checkpoint with `gpt-5.6-terra` at `max` effort.

Set these environment variables to override the defaults:

- `SESSION_HANDOFF_DIRECT_MODEL`
- `SESSION_HANDOFF_DIRECT_EFFORT`
- `SESSION_HANDOFF_DIRECT_TOKEN_LIMIT`
- `SESSION_HANDOFF_COMPACT_RENDER_MODEL`
- `SESSION_HANDOFF_COMPACT_RENDER_EFFORT`
- `AGENT_HANDOFF_HOME`
- `CLAUDE_PROJECTS_DIR`

## Safety

The plugin does not use hooks or edit the source transcript. During synthesis it creates a temporary UUID-named transcript copy beside the source so Codex can detect a fresh import, then removes the copy in `finally`. It stores checkpoints outside the project and uses atomic writes. Claude-to-Claude restoration requires the same normalized working directory. Codex description matching fails closed when the result is weak or ambiguous.
