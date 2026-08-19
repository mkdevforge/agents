import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runHandoff } from "../skills/session-handoff/scripts/session-handoff.mjs";
import { normalizePath } from "../skills/session-handoff/scripts/lib/transcripts.mjs";

function checkpoint(intent = "Continue the active task") {
  return {
    last_literal_user_message: "continue",
    latest_substantive_intent: intent,
    active_goal: intent,
    current_state: { completed: ["Inspection"], in_progress: ["Implementation"], not_started: ["Verification"] },
    decisions: [{ decision: "Keep the current design", rationale: "It passed review" }],
    commitments: ["Run tests"],
    constraints: ["Do not discard user changes"],
    evidence: ["git status was inspected"],
    failed_approaches: [],
    unresolved_questions: [],
    next_actions: ["Revalidate the worktree"],
    facts_to_revalidate: ["Current git status"]
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-handoff-test-"));
  const projectsRoot = path.join(root, "projects");
  const stateRoot = path.join(root, "state");
  const cwd = path.join(root, "repo");
  fs.mkdirSync(path.join(projectsRoot, "project"), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  return { root, projectsRoot, stateRoot, cwd };
}

function writeTranscript(projectsRoot, sessionId, cwd, records = null) {
  const file = path.join(projectsRoot, "project", `${sessionId}.jsonl`);
  const content = records ?? [
    { type: "user", cwd, sessionId, message: { role: "user", content: [{ type: "text", text: "Implement the feature" }] } },
    { type: "assistant", cwd, sessionId, message: { role: "assistant", content: [{ type: "text", text: "I inspected the repository." }] } }
  ];
  fs.writeFileSync(file, `${content.map((record) => JSON.stringify(record)).join("\n")}\n`);
  return file;
}

function generator(counter) {
  return async () => {
    counter.count += 1;
    return {
      checkpoint: checkpoint(),
      synthesis: {
        pipeline: "direct",
        importedThreadId: "thread-1",
        importedTokens: 100,
        modelContextWindow: 1000,
        directModel: "gpt-5.6-luna",
        directEffort: "xhigh",
        renderModel: "gpt-5.6-luna",
        renderEffort: "xhigh"
      }
    };
  };
}

test("an established session creates a pending checkpoint", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "source-session", f.cwd);
  const calls = { count: 0 };
  const result = await runHandoff(
    { action: "auto", source: null, sessionId: "source-session", cwd: f.cwd },
    { projectsRoot: f.projectsRoot, stateRoot: f.stateRoot, generateCheckpoint: generator(calls) }
  );
  assert.equal(result.mode, "created");
  assert.equal(result.cached, false);
  assert.equal(calls.count, 1);
  assert.ok(fs.existsSync(result.checkpoint_path));
});

test("a fresh session restores the pending checkpoint", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "source-session", f.cwd);
  const calls = { count: 0 };
  const deps = { projectsRoot: f.projectsRoot, stateRoot: f.stateRoot, generateCheckpoint: generator(calls) };
  await runHandoff({ action: "auto", source: null, sessionId: "source-session", cwd: f.cwd }, deps);
  const result = await runHandoff({ action: "auto", source: null, sessionId: "fresh-session", cwd: f.cwd }, deps);
  assert.equal(result.mode, "restored");
  assert.equal(result.source.session_id, "source-session");
  assert.equal(result.checkpoint.latest_substantive_intent, "Continue the active task");
  assert.equal(calls.count, 1);
});

test("a session created by /clear ignores local-command bookkeeping and restores", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "source-session", f.cwd);
  writeTranscript(f.projectsRoot, "cleared-session", f.cwd, [
    { type: "mode", sessionId: "cleared-session" },
    {
      type: "user",
      cwd: f.cwd,
      sessionId: "cleared-session",
      message: {
        role: "user",
        content: "<local-command-caveat>Caveat: local command bookkeeping.</local-command-caveat>"
      }
    },
    {
      type: "user",
      cwd: f.cwd,
      sessionId: "cleared-session",
      message: {
        role: "user",
        content: "<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>"
      }
    },
    { type: "system", subtype: "local_command", cwd: f.cwd, sessionId: "cleared-session" }
  ]);
  const calls = { count: 0 };
  const deps = { projectsRoot: f.projectsRoot, stateRoot: f.stateRoot, generateCheckpoint: generator(calls) };
  await runHandoff({ action: "auto", source: null, sessionId: "source-session", cwd: f.cwd }, deps);
  const result = await runHandoff(
    { action: "auto", source: null, sessionId: "cleared-session", cwd: f.cwd },
    deps
  );
  assert.equal(result.mode, "restored");
  assert.equal(result.source.session_id, "source-session");
  assert.equal(calls.count, 1);
});

test("explicit restore selects an older handoff by source session", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "original-session", f.cwd);
  writeTranscript(f.projectsRoot, "newer-session", f.cwd);
  const calls = { count: 0 };
  const deps = { projectsRoot: f.projectsRoot, stateRoot: f.stateRoot, generateCheckpoint: generator(calls) };
  await runHandoff({ action: "create", source: null, sessionId: "original-session", cwd: f.cwd }, deps);
  await runHandoff({ action: "create", source: null, sessionId: "newer-session", cwd: f.cwd }, deps);
  const result = await runHandoff(
    { action: "restore", source: "original-session", sessionId: "fresh-session", cwd: f.cwd },
    deps
  );
  assert.equal(result.mode, "restored");
  assert.equal(result.source.session_id, "original-session");
});

test("repeating create in the source session reuses the checkpoint", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "source-session", f.cwd);
  const calls = { count: 0 };
  const deps = { projectsRoot: f.projectsRoot, stateRoot: f.stateRoot, generateCheckpoint: generator(calls) };
  await runHandoff({ action: "create", source: null, sessionId: "source-session", cwd: f.cwd }, deps);
  const result = await runHandoff({ action: "create", source: null, sessionId: "source-session", cwd: f.cwd }, deps);
  assert.equal(result.mode, "created");
  assert.equal(result.cached, true);
  assert.equal(calls.count, 1);
});

test("refresh replaces a cached checkpoint", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "source-session", f.cwd);
  const calls = { count: 0 };
  const deps = { projectsRoot: f.projectsRoot, stateRoot: f.stateRoot, generateCheckpoint: generator(calls) };
  await runHandoff({ action: "auto", source: null, sessionId: "source-session", cwd: f.cwd }, deps);
  await runHandoff({ action: "refresh", source: null, sessionId: "source-session", cwd: f.cwd }, deps);
  assert.equal(calls.count, 2);
});

test("new source-session history invalidates a cached checkpoint", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const transcript = writeTranscript(f.projectsRoot, "source-session", f.cwd);
  const calls = { count: 0 };
  const deps = { projectsRoot: f.projectsRoot, stateRoot: f.stateRoot, generateCheckpoint: generator(calls) };
  await runHandoff({ action: "auto", source: null, sessionId: "source-session", cwd: f.cwd }, deps);
  fs.appendFileSync(
    transcript,
    `${JSON.stringify({
      type: "user",
      cwd: f.cwd,
      sessionId: "source-session",
      message: { role: "user", content: [{ type: "text", text: "A new substantive request" }] }
    })}\n`
  );
  await runHandoff({ action: "auto", source: null, sessionId: "source-session", cwd: f.cwd }, deps);
  assert.equal(calls.count, 2);
});

test("restore fails closed without a pending handoff", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  await assert.rejects(
    runHandoff(
      { action: "restore", source: null, sessionId: "fresh-session", cwd: f.cwd },
      { projectsRoot: f.projectsRoot, stateRoot: f.stateRoot, generateCheckpoint: generator({ count: 0 }) }
    ),
    /No pending handoff/
  );
});

test("source sessions from a different working directory are rejected", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "source-session", path.join(f.root, "other"));
  await assert.rejects(
    runHandoff(
      { action: "create", source: null, sessionId: "source-session", cwd: f.cwd },
      { projectsRoot: f.projectsRoot, stateRoot: f.stateRoot, generateCheckpoint: generator({ count: 0 }) }
    ),
    /belongs to/
  );
});

test("Windows extended paths normalize to ordinary paths", () => {
  if (process.platform !== "win32") {
    return;
  }
  assert.equal(normalizePath("\\\\?\\C:\\Users\\Mikae\\repo"), normalizePath("C:\\Users\\Mikae\\repo"));
});

test("the CLI runs when the skill directory is reached through a junction", (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const sourceSkill = path.resolve(import.meta.dirname, "..", "skills", "session-handoff");
  const linkedSkill = path.join(f.root, "linked-skill");
  fs.symlinkSync(sourceSkill, linkedSkill, process.platform === "win32" ? "junction" : "dir");
  const result = spawnSync(
    process.execPath,
    [
      path.join(linkedSkill, "scripts", "session-handoff.mjs"),
      "--session-id", "fresh-session",
      "--cwd", f.cwd,
      "--action", "auto",
      "--source", ""
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CLAUDE_PROJECTS_DIR: f.projectsRoot,
        AGENT_HANDOFF_HOME: f.stateRoot
      }
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).mode, "error");
});
