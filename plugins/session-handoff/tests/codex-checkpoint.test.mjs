import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as codexCheckpoint from "../skills/session-handoff/scripts/lib/codex-checkpoint.mjs";

test("the import ledger resolves a thread when Claude appends during import", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-handoff-ledger-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source.jsonl");
  fs.writeFileSync(source, "before import\n");
  const importedAt = Date.now();
  fs.writeFileSync(
    path.join(root, "external_agent_session_imports.json"),
    `${JSON.stringify({
      records: [{
        source_path: source,
        content_sha256: "hash-recorded-before-claude-appended",
        imported_thread_id: "01a05459-b4a9-78f1-abf7-ff5ad1da2114",
        imported_at: Math.floor(importedAt / 1000)
      }]
    })}\n`
  );
  fs.appendFileSync(source, "Claude appended this after import\n");

  assert.equal(typeof codexCheckpoint.threadIdFromLedger, "function");
  assert.equal(
    codexCheckpoint.threadIdFromLedger(source, { CODEX_HOME: root }, importedAt - 1000),
    "01a05459-b4a9-78f1-abf7-ff5ad1da2114"
  );
});

test("a transcript import uses a stable unique snapshot", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-handoff-snapshot-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source.jsonl");
  fs.writeFileSync(source, "stable content\n");
  let snapshotPath;

  assert.equal(typeof codexCheckpoint.withTranscriptSnapshot, "function");
  await codexCheckpoint.withTranscriptSnapshot(source, async (snapshot) => {
    snapshotPath = snapshot;
    assert.notEqual(snapshot, source);
    assert.equal(path.dirname(snapshot), path.dirname(source));
    assert.match(path.basename(snapshot), /^[0-9a-f-]{36}\.jsonl$/i);
    assert.equal(fs.readFileSync(snapshot, "utf8"), "stable content\n");
    fs.appendFileSync(source, "late append\n");
    assert.equal(fs.readFileSync(snapshot, "utf8"), "stable content\n");
  });

  assert.equal(fs.existsSync(snapshotPath), false);
});

test("a transcript snapshot is removed when import fails", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-handoff-snapshot-error-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source.jsonl");
  fs.writeFileSync(source, "stable content\n");
  let snapshotPath;

  await assert.rejects(
    codexCheckpoint.withTranscriptSnapshot(source, async (snapshot) => {
      snapshotPath = snapshot;
      throw new Error("import failed");
    }),
    /import failed/
  );

  assert.equal(fs.existsSync(snapshotPath), false);
});
