import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  runResume,
  selectClaudeTranscript
} from "../codex-skills/resume-claude-session/scripts/resume-claude-session.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "resume-claude-session-test-"));
  const projectsRoot = path.join(root, "projects");
  const stateRoot = path.join(root, "state");
  fs.mkdirSync(path.join(projectsRoot, "project"), { recursive: true });
  return { root, projectsRoot, stateRoot };
}

function writeTranscript(projectsRoot, sessionId, options = {}) {
  const directory = options.subagent
    ? path.join(projectsRoot, "project", "parent", "subagents")
    : path.join(projectsRoot, "project");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${sessionId}.jsonl`);
  const cwd = options.cwd ?? path.join(projectsRoot, "repo");
  const records = [
    {
      type: "user",
      cwd,
      sessionId,
      message: { role: "user", content: [{ type: "text", text: options.user ?? "Implement the feature" }] }
    },
    {
      type: "assistant",
      cwd,
      sessionId,
      message: { role: "assistant", content: [{ type: "text", text: options.assistant ?? "I inspected the repository." }] }
    }
  ];
  if (options.title) {
    records.unshift({ type: "custom-title", customTitle: options.title });
  }
  fs.writeFileSync(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  const modifiedAt = new Date(options.modifiedAt ?? "2026-08-30T12:00:00Z");
  fs.utimesSync(file, modifiedAt, modifiedAt);
  return file;
}

test("latest selects the newest top-level Claude session and ignores subagents", (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "older", { modifiedAt: "2026-08-30T12:00:00Z" });
  writeTranscript(f.projectsRoot, "newer", { modifiedAt: "2026-08-30T13:00:00Z" });
  writeTranscript(f.projectsRoot, "subagent-newest", {
    modifiedAt: "2026-08-30T14:00:00Z",
    subagent: true
  });

  const selected = selectClaudeTranscript("latest", f.projectsRoot);

  assert.equal(selected.sessionId, "newer");
});

test("a natural-language selector matches transcript subject matter", (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "recovery", {
    title: "RDS recovery drill",
    user: "Restore the temporary database and validate cleanup."
  });
  writeTranscript(f.projectsRoot, "login", {
    title: "Kinde login screen",
    user: "Design the login continue with Kinde screen in another worktree."
  });

  const selected = selectClaudeTranscript(
    "the Claude session where we looked at the Kinde login screen",
    f.projectsRoot
  );

  assert.equal(selected.sessionId, "login");
});

test("an ambiguous description fails with candidate session IDs", (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "login-a", {
    title: "Login screen",
    user: "Review the login screen."
  });
  writeTranscript(f.projectsRoot, "login-b", {
    title: "Login screen",
    user: "Review the login screen."
  });

  assert.throws(
    () => selectClaudeTranscript("login screen", f.projectsRoot),
    (error) => /ambiguous/i.test(error.message) && /login-a/.test(error.message) && /login-b/.test(error.message)
  );
});

test("a description with no meaningful match fails instead of choosing by recency", (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  writeTranscript(f.projectsRoot, "recovery", {
    title: "RDS recovery drill",
    user: "Restore the temporary database and validate cleanup."
  });

  assert.throws(
    () => selectClaudeTranscript("wearable localization refresh", f.projectsRoot),
    /did not match/i
  );
});

test("resume returns the generated checkpoint without continuing the source task", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const cwd = path.join(f.root, "source-repo");
  writeTranscript(f.projectsRoot, "source", { cwd });
  const checkpoint = {
    last_literal_user_message: "continue",
    latest_substantive_intent: "Finish the feature",
    active_goal: "Finish the feature",
    current_state: { completed: [], in_progress: ["Implementation"], not_started: ["Tests"] },
    decisions: [],
    commitments: [],
    constraints: [],
    evidence: [],
    failed_approaches: [],
    unresolved_questions: [],
    next_actions: ["Inspect git status"],
    facts_to_revalidate: ["Current git status"]
  };
  let generatedSource;
  let generatedOptions;

  const result = await runResume(
    { selector: "latest" },
    {
      projectsRoot: f.projectsRoot,
      stateRoot: f.stateRoot,
      generateCheckpoint: async (source, options) => {
        generatedSource = source;
        generatedOptions = options;
        return { checkpoint, synthesis: { pipeline: "direct" } };
      }
    }
  );

  assert.equal(result.mode, "restored");
  assert.equal(result.source.session_id, "source");
  assert.equal(result.source.cwd, cwd);
  assert.equal(result.checkpoint, checkpoint);
  assert.equal(generatedSource.cwd, cwd);
  assert.equal(generatedOptions.env.SESSION_HANDOFF_DIRECT_EFFORT, "max");
});

test("the Codex skill is explicit-only and stops after loading context", () => {
  const skillRoot = path.resolve(
    import.meta.dirname,
    "..",
    "codex-skills",
    "resume-claude-session"
  );
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  const openai = fs.readFileSync(path.join(skillRoot, "agents", "openai.yaml"), "utf8");

  assert.match(openai, /allow_implicit_invocation:\s*false/);
  assert.match(skill, /confirm that the Claude session context is loaded, then stop/i);
  assert.match(skill, /Do not revalidate.*continue/i);
});
