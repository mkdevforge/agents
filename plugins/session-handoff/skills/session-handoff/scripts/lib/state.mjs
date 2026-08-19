import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizePath } from "./transcripts.mjs";

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function handoffRoot(env = process.env) {
  return path.resolve(env.AGENT_HANDOFF_HOME || path.join(os.homedir(), ".agent-handoffs", "session-handoff"));
}

export function projectDirectory(cwd, root = handoffRoot()) {
  return path.join(root, sha256(normalizePath(cwd)).slice(0, 16));
}

export function readLatest(cwd, root = handoffRoot()) {
  const latestPath = path.join(projectDirectory(cwd, root), "latest.json");
  if (!fs.existsSync(latestPath)) {
    return null;
  }
  const manifest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  const checkpointPath = path.resolve(path.dirname(latestPath), manifest.checkpointFile);
  if (!fs.existsSync(checkpointPath)) {
    throw new Error(`Pending handoff checkpoint is missing: ${checkpointPath}`);
  }
  return {
    manifest,
    checkpoint: JSON.parse(fs.readFileSync(checkpointPath, "utf8")),
    latestPath,
    checkpointPath
  };
}

export function readHandoffBySource(cwd, sourceSessionId, root = handoffRoot()) {
  const projectDir = projectDirectory(cwd, root);
  const handoffsDir = path.join(projectDir, "handoffs");
  if (!fs.existsSync(handoffsDir)) {
    return null;
  }

  const candidates = fs.readdirSync(handoffsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = path.join(handoffsDir, entry.name, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        return [];
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      return manifest.sourceSessionId === sourceSessionId ? [{ manifest, manifestPath }] : [];
    })
    .sort((left, right) => Date.parse(right.manifest.createdAt) - Date.parse(left.manifest.createdAt));

  if (candidates.length === 0) {
    return null;
  }

  const { manifest, manifestPath } = candidates[0];
  const checkpointPath = path.resolve(projectDir, manifest.checkpointFile);
  if (!fs.existsSync(checkpointPath)) {
    throw new Error(`Handoff checkpoint is missing: ${checkpointPath}`);
  }
  return {
    manifest,
    checkpoint: JSON.parse(fs.readFileSync(checkpointPath, "utf8")),
    latestPath: path.join(projectDir, "latest.json"),
    checkpointPath,
    manifestPath
  };
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

export function writeHandoff(cwd, source, generated, root = handoffRoot()) {
  const projectDir = projectDirectory(cwd, root);
  const handoffId = `${source.sessionId}-${source.contentSha256.slice(0, 12)}`;
  const handoffDir = path.join(projectDir, "handoffs", handoffId);
  const checkpointPath = path.join(handoffDir, "checkpoint.json");
  const manifestPath = path.join(handoffDir, "manifest.json");
  const checkpoint = {
    schema_version: 1,
    source: {
      session_id: source.sessionId,
      transcript_path: source.path,
      content_sha256: source.contentSha256,
      cwd,
      title: source.title ?? null
    },
    synthesis: generated.synthesis,
    checkpoint: generated.checkpoint
  };
  const manifest = {
    schemaVersion: 1,
    handoffId,
    sourceSessionId: source.sessionId,
    sourceTranscript: source.path,
    sourceContentSha256: source.contentSha256,
    projectCwd: cwd,
    createdAt: new Date().toISOString(),
    checkpointFile: path.relative(projectDir, checkpointPath),
    synthesis: generated.synthesis
  };
  writeJsonAtomic(checkpointPath, checkpoint);
  writeJsonAtomic(manifestPath, manifest);
  writeJsonAtomic(path.join(projectDir, "latest.json"), manifest);
  return { checkpoint, manifest, checkpointPath, manifestPath };
}
