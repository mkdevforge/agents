#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateCodexCheckpoint } from "./lib/codex-checkpoint.mjs";
import { handoffRoot, readHandoffBySource, readLatest, writeHandoff } from "./lib/state.mjs";
import { claudeProjectsRoot, findTranscript, inspectTranscript, normalizePath } from "./lib/transcripts.mjs";

function parseArgs(argv) {
  const options = { action: "auto", source: null, sessionId: null, cwd: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--action") {
      options.action = argv[++index] || "auto";
    } else if (argument === "--source") {
      options.source = argv[++index] || null;
    } else if (argument === "--session-id") {
      options.sessionId = argv[++index] || null;
    } else if (argument === "--cwd") {
      options.cwd = argv[++index] || process.cwd();
    } else if (argument === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  options.action = options.action.toLowerCase();
  if (!new Set(["auto", "create", "restore", "refresh"]).has(options.action)) {
    throw new Error(`Unsupported action "${options.action}". Use auto, create, restore, or refresh.`);
  }
  options.cwd = path.resolve(options.cwd);
  return options;
}

function contentHash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sourceFromTranscript(transcript, cwd) {
  const inspected = inspectTranscript(transcript);
  if (!inspected.meaningful) {
    throw new Error("The selected Claude session does not contain enough conversation history to hand off.");
  }
  if (inspected.cwd && normalizePath(inspected.cwd) !== normalizePath(cwd)) {
    throw new Error(`The selected session belongs to ${inspected.cwd}, not ${cwd}.`);
  }
  return {
    ...inspected,
    cwd,
    contentSha256: contentHash(transcript)
  };
}

function createdResult(saved, cached = false) {
  return {
    mode: "created",
    handoff_id: saved.manifest.handoffId,
    cached,
    source_session_id: saved.manifest.sourceSessionId,
    checkpoint_path: saved.checkpointPath,
    synthesis: saved.manifest.synthesis,
    next: "Open a fresh Claude Code chat or run /clear, then invoke /session-handoff again."
  };
}

function restoredResult(pending) {
  return {
    mode: "restored",
    handoff_id: pending.manifest.handoffId,
    source: pending.checkpoint.source,
    synthesis: pending.checkpoint.synthesis,
    checkpoint: pending.checkpoint.checkpoint
  };
}

export async function runHandoff(options, dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const projectsRoot = dependencies.projectsRoot ?? claudeProjectsRoot(env);
  const stateRoot = dependencies.stateRoot ?? handoffRoot(env);
  const generate = dependencies.generateCheckpoint ?? generateCodexCheckpoint;
  const currentTranscript = findTranscript(options.sessionId, projectsRoot);
  let pending = readLatest(options.cwd, stateRoot);

  if (options.action === "restore") {
    if (options.source) {
      pending = readHandoffBySource(options.cwd, options.source, stateRoot);
    }
    if (!pending) {
      const qualifier = options.source ? ` for source session ${options.source}` : "";
      throw new Error(`No pending handoff exists${qualifier} for this working directory.`);
    }
    return restoredResult(pending);
  }

  const selectedSessionId = options.source ?? options.sessionId;
  const selectedTranscript = options.source
    ? findTranscript(options.source, projectsRoot)
    : currentTranscript;
  const currentInspection = currentTranscript ? inspectTranscript(currentTranscript) : null;

  if (options.action === "auto" && !currentInspection?.meaningful) {
    if (!pending) {
      throw new Error("This is a fresh session, but no pending handoff exists for this working directory.");
    }
    if (pending.manifest.sourceSessionId === options.sessionId) {
      throw new Error("The current session is also the pending source, but it has no restorable conversation history.");
    }
    return restoredResult(pending);
  }

  if (!selectedTranscript) {
    throw new Error(`Could not find Claude transcript ${selectedSessionId ?? "for the current session"}.`);
  }

  const source = sourceFromTranscript(selectedTranscript, options.cwd);
  if (
    options.action !== "refresh" &&
    pending?.manifest.sourceSessionId === selectedSessionId &&
    pending.manifest.sourceContentSha256 === source.contentSha256
  ) {
    return createdResult(pending, true);
  }

  const generated = await generate(source, { env });
  const saved = writeHandoff(options.cwd, source, generated, stateRoot);
  return createdResult(saved, false);
}

function errorResult(error) {
  return {
    mode: "error",
    error: error.message,
    recovery: "Resume the source session and invoke /session-handoff create, or restore a known pending handoff with /session-handoff restore."
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    const result = await runHandoff(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(errorResult(error), null, 2)}\n`);
  }
}

function realPath(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

const isEntryPoint = process.argv[1] && realPath(fileURLToPath(import.meta.url)) === realPath(process.argv[1]);
if (isEntryPoint) {
  await main();
}
