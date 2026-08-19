import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function claudeProjectsRoot(env = process.env) {
  return path.resolve(env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), ".claude", "projects"));
}

export function normalizePath(value) {
  let normalized = path.resolve(value).replace(/^\\\\\?\\/, "");
  normalized = path.normalize(normalized).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function walkJsonl(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

export function findTranscript(sessionId, root = claudeProjectsRoot()) {
  if (!sessionId) {
    return null;
  }
  const expected = `${sessionId}.jsonl`.toLowerCase();
  return walkJsonl(root).find((file) => path.basename(file).toLowerCase() === expected) ?? null;
}

function textBlocks(message) {
  const content = message?.content;
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text);
}

function isLocalCommandBookkeeping(text) {
  const trimmed = text.trimStart();
  return trimmed.startsWith("<local-command-caveat>") || trimmed.startsWith("<command-name>");
}

export function inspectTranscript(file) {
  const result = {
    path: file,
    sessionId: path.basename(file, ".jsonl"),
    cwd: null,
    title: null,
    userTextMessages: 0,
    assistantTextMessages: 0,
    meaningful: false
  };
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof record.cwd === "string" && record.cwd) {
      result.cwd = record.cwd;
    }
    if (record.type === "custom-title") {
      result.title = record.customTitle ?? record.title ?? result.title;
    }
    if (record.type === "user" && record.message?.role === "user") {
      const texts = textBlocks(record.message).filter(
        (text) => text.trim() && !isLocalCommandBookkeeping(text)
      );
      result.userTextMessages += texts.length;
    }
    if (record.type === "assistant" && record.message?.role === "assistant") {
      const texts = textBlocks(record.message).filter((text) => text.trim());
      result.assistantTextMessages += texts.length;
    }
  }
  result.meaningful = result.assistantTextMessages > 0 || result.userTextMessages > 1;
  return result;
}
