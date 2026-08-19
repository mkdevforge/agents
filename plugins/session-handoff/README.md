# session-handoff

`session-handoff` creates a portable checkpoint from a local Claude Code transcript. Codex reads the transcript and Luna produces the checkpoint. A second invocation in a fresh session injects that checkpoint into Fable.

## Workflow

Run the skill in the established session.

```text
/session-handoff
```

Open a fresh Claude Code chat or run `/clear`. Run the same skill again.

The first invocation creates a pending checkpoint. The second invocation detects the fresh session, restores the checkpoint, revalidates volatile state, and continues the substantive task.

## Selection

The default `auto` action creates a checkpoint when the current transcript has conversation history. It restores the latest checkpoint for the current working directory when the current session is fresh.

Explicit actions are available for recovery.

```text
/session-handoff create
/session-handoff restore
/session-handoff refresh
```

Pass a source session ID after `restore` to recover a specific older checkpoint when needed.

```text
/session-handoff restore <source-session-id>
```

`refresh` regenerates a checkpoint for the source session. The generator reuses an existing checkpoint for repeated `create` calls.

## Models

Direct synthesis uses `gpt-5.6-luna` with `xhigh` effort. The generator measures the imported Codex thread. When the thread exceeds 72 percent of the model context window, it uses Codex native compaction and renders the portable checkpoint with `gpt-5.6-terra` at `max` effort.

Set these environment variables to override the defaults:

- `SESSION_HANDOFF_DIRECT_MODEL`
- `SESSION_HANDOFF_DIRECT_EFFORT`
- `SESSION_HANDOFF_DIRECT_TOKEN_LIMIT`
- `SESSION_HANDOFF_COMPACT_RENDER_MODEL`
- `SESSION_HANDOFF_COMPACT_RENDER_EFFORT`
- `AGENT_HANDOFF_HOME`
- `CLAUDE_PROJECTS_DIR`

## Safety

The plugin does not use hooks. It does not edit Claude JSONL transcripts. It stores checkpoints outside the project and uses atomic writes. Source selection requires the same normalized working directory. A fresh session without a pending checkpoint fails closed.
