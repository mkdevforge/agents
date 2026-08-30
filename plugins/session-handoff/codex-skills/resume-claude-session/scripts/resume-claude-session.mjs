#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateCodexCheckpoint } from "../../../skills/session-handoff/scripts/lib/codex-checkpoint.mjs";
import {
  handoffRoot,
  readHandoffBySource,
  writeHandoff
} from "../../../skills/session-handoff/scripts/lib/state.mjs";
import {
  claudeProjectsRoot,
  inspectTranscript,
  walkJsonl
} from "../../../skills/session-handoff/scripts/lib/transcripts.mjs";

const GENERIC_QUERY_WORDS = new Set([
  "a", "about", "an", "and", "at", "chat", "claude", "code", "conversation",
  "did", "find", "for", "from", "had", "have", "i", "in", "into", "is",
  "issue", "it", "latest", "look", "looked", "looking", "of", "on", "resume",
  "session", "task", "that", "the", "this", "to", "was", "we", "were", "where",
  "with", "work", "worked"
]);

function parseArgs(argv) {
  const options = { selector: "latest" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--selector") {
      options.selector = argv[++index]?.trim() || "latest";
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function contentHash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function messageText(message) {
  if (typeof message?.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message?.content)) {
    return "";
  }
  return message.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function searchableText(file) {
  const sections = { user: [], assistant: [] };
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type === "user" && record.message?.role === "user") {
      sections.user.push(messageText(record.message));
    } else if (record.type === "assistant" && record.message?.role === "assistant") {
      sections.assistant.push(messageText(record.message));
    }
  }
  return {
    user: sections.user.join("\n").toLowerCase(),
    assistant: sections.assistant.join("\n").toLowerCase()
  };
}

function isSubagentTranscript(file) {
  return file.split(path.sep).some((segment) => segment.toLowerCase() === "subagents");
}

function transcriptCandidates(projectsRoot) {
  return walkJsonl(projectsRoot)
    .filter((file) => !isSubagentTranscript(file))
    .map((file) => {
      const inspected = inspectTranscript(file);
      return {
        ...inspected,
        modifiedAtMs: fs.statSync(file).mtimeMs
      };
    })
    .filter((candidate) => candidate.meaningful)
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
}

function queryTerms(selector) {
  return [...new Set(
    selector
      .toLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}._/-]*/gu)
      ?.filter((term) => term.length > 1 && !GENERIC_QUERY_WORDS.has(term)) ?? []
  )];
}

function candidateLabel(candidate) {
  const timestamp = new Date(candidate.modifiedAtMs).toISOString();
  return `${candidate.sessionId} (${timestamp}, ${candidate.title ?? candidate.cwd ?? "untitled"})`;
}

function scoreCandidate(candidate, terms) {
  const text = searchableText(candidate.path);
  const title = (candidate.title ?? "").toLowerCase();
  const matched = [];
  let score = 0;
  for (const term of terms) {
    let termScore = 0;
    if (title.includes(term)) {
      termScore += 8;
    }
    if (text.user.includes(term)) {
      termScore += 4;
    }
    if (text.assistant.includes(term)) {
      termScore += 1;
    }
    if (termScore > 0) {
      matched.push(term);
      score += termScore;
    }
  }
  return { candidate, matched, score };
}

export function selectClaudeTranscript(selector = "latest", projectsRoot = claudeProjectsRoot()) {
  const candidates = transcriptCandidates(projectsRoot);
  if (candidates.length === 0) {
    throw new Error(`No meaningful top-level Claude sessions exist under ${projectsRoot}.`);
  }

  const normalizedSelector = selector.trim().toLowerCase();
  if (!normalizedSelector || normalizedSelector === "latest") {
    return candidates[0];
  }

  const exactSession = candidates.find(
    (candidate) => candidate.sessionId.toLowerCase() === normalizedSelector
  );
  if (exactSession) {
    return exactSession;
  }

  const terms = queryTerms(normalizedSelector);
  if (terms.length === 0) {
    throw new Error("The Claude session description contains no searchable terms. Use `latest` or add a specific topic, identifier, or title.");
  }

  const ranked = candidates
    .map((candidate) => scoreCandidate(candidate, terms))
    .filter((result) => result.matched.length > 0)
    .sort((left, right) =>
      right.score - left.score ||
      right.matched.length - left.matched.length ||
      right.candidate.modifiedAtMs - left.candidate.modifiedAtMs
    );
  const best = ranked[0];
  if (!best || best.matched.length / terms.length < 0.5) {
    const recent = candidates.slice(0, 5).map(candidateLabel).join("; ");
    throw new Error(`The description did not match a Claude session confidently. Recent sessions: ${recent}`);
  }

  const runnerUp = ranked[1];
  if (
    runnerUp &&
    runnerUp.matched.length === best.matched.length &&
    runnerUp.score >= best.score * 0.9
  ) {
    throw new Error(
      `The description is ambiguous between ${candidateLabel(best.candidate)} and ${candidateLabel(runnerUp.candidate)}. Add a more specific topic or session ID.`
    );
  }
  return best.candidate;
}

function sourceFromCandidate(candidate) {
  if (!candidate.cwd) {
    throw new Error(`Claude session ${candidate.sessionId} does not record a working directory.`);
  }
  return {
    ...candidate,
    contentSha256: contentHash(candidate.path)
  };
}

function restoredResult(source, generated, cached) {
  return {
    mode: "restored",
    cached,
    source: {
      session_id: source.sessionId,
      transcript_path: source.path,
      content_sha256: source.contentSha256,
      cwd: source.cwd,
      title: source.title ?? null,
      modified_at: new Date(source.modifiedAtMs).toISOString()
    },
    synthesis: generated.synthesis,
    checkpoint: generated.checkpoint
  };
}

export async function runResume(options, dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const projectsRoot = dependencies.projectsRoot ?? claudeProjectsRoot(env);
  const stateRoot = dependencies.stateRoot ?? handoffRoot(env);
  const generate = dependencies.generateCheckpoint ?? generateCodexCheckpoint;
  const selected = selectClaudeTranscript(options.selector, projectsRoot);
  const source = sourceFromCandidate(selected);
  const cached = readHandoffBySource(source.cwd, source.sessionId, stateRoot);
  if (cached?.manifest.sourceContentSha256 === source.contentSha256) {
    return restoredResult(source, cached.checkpoint, true);
  }

  const synthesisEnv = {
    ...env,
    SESSION_HANDOFF_DIRECT_EFFORT: env.SESSION_HANDOFF_DIRECT_EFFORT || "max"
  };
  const generated = await generate(source, { env: synthesisEnv });
  writeHandoff(source.cwd, source, generated, stateRoot);
  return restoredResult(source, generated, false);
}

function errorResult(error) {
  return {
    mode: "error",
    error: error.message,
    recovery: "Invoke $resume-claude-session again with `latest`, a more specific description, or an exact Claude session ID."
  };
}

async function main() {
  try {
    const result = await runResume(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(errorResult(error), null, 2)}\n`);
    process.exitCode = 1;
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
