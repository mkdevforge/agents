import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodexAppServerClient } from "./app-server.mjs";
import { CHECKPOINT_PROMPT, CHECKPOINT_SCHEMA, validateCheckpoint } from "./checkpoint.mjs";
import { normalizePath } from "./transcripts.mjs";

const IMPORT_COMPLETED = "externalAgentConfig/import/completed";

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export async function withTranscriptSnapshot(sourcePath, operation) {
  const snapshotPath = path.join(path.dirname(sourcePath), `${crypto.randomUUID()}.jsonl`);
  fs.copyFileSync(sourcePath, snapshotPath);
  try {
    return await operation(snapshotPath);
  } finally {
    fs.rmSync(snapshotPath, { force: true });
  }
}

function migration(sourcePath, cwd) {
  return {
    source: "session-handoff",
    providerId: "claude-code",
    migrationItems: [
      {
        itemType: "SESSIONS",
        description: `Session handoff for ${path.basename(sourcePath)}`,
        cwd: null,
        details: {
          plugins: [],
          sessions: [{ path: sourcePath, cwd, title: null }],
          mcpServers: [],
          hooks: [],
          subagents: [],
          commands: []
        }
      }
    ]
  };
}

export function threadIdFromLedger(sourcePath, env = process.env, importedAfterMs = 0) {
  const codexHome = path.resolve(env.CODEX_HOME || path.join(os.homedir(), ".codex"));
  const ledgerPath = path.join(codexHome, "external_agent_session_imports.json");
  if (!fs.existsSync(ledgerPath)) {
    return null;
  }
  const records = JSON.parse(fs.readFileSync(ledgerPath, "utf8"))?.records ?? [];
  const sourceHash = hashFile(sourcePath);
  const normalizedSource = normalizePath(sourcePath);
  const matchingPath = records.filter((record) =>
    typeof record?.imported_thread_id === "string" &&
    normalizePath(record?.source_path ?? "") === normalizedSource);
  const exactHash = matchingPath
    .filter((record) => record?.content_sha256 === sourceHash)
    .at(-1);
  if (exactHash) {
    return exactHash.imported_thread_id;
  }
  const recentPathMatch = importedAfterMs > 0
    ? matchingPath
      .filter((record) => Number(record?.imported_at) * 1000 >= importedAfterMs - 2000)
      .at(-1)
    : null;
  return recentPathMatch?.imported_thread_id ?? null;
}

function importedThreadId(completion, sourcePath, env, importedAfterMs) {
  const target = completion?.params?.itemTypeResults
    ?.flatMap((result) => result.successes ?? [])
    .map((success) => success.target)
    .find((value) => typeof value === "string" && /^[0-9a-f-]{32,}$/i.test(value));
  return target ?? threadIdFromLedger(sourcePath, env, importedAfterMs);
}

async function importSession(client, sourcePath, cwd, env) {
  const importedAfterMs = Date.now();
  const before = client.notifications.length;
  const response = await client.request("externalAgentConfig/import", migration(sourcePath, cwd));
  const completion = await client.waitFor(
    (message) => message.method === IMPORT_COMPLETED && message.params?.importId === response.importId,
    { fromIndex: before, timeoutMessage: "Timed out while Codex imported the Claude session." }
  );
  const failures = completion.params?.itemTypeResults?.flatMap((result) => result.failures ?? []) ?? [];
  if (failures.length > 0) {
    throw new Error(`Codex could not import the Claude session: ${failures.map((item) => item.message).join("; ")}`);
  }
  const threadId = importedThreadId(completion, sourcePath, env, importedAfterMs);
  if (!threadId) {
    throw new Error("Codex completed the import but did not identify the imported thread.");
  }
  return threadId;
}

function latestTokenUsage(client, threadId, fromIndex = 0) {
  return client.notifications
    .slice(fromIndex)
    .filter((message) => message.method === "thread/tokenUsage/updated" && message.params?.threadId === threadId)
    .at(-1)?.params?.tokenUsage ?? null;
}

async function resumeForSynthesis(client, threadId, cwd, model) {
  const before = client.notifications.length;
  const response = await client.request("thread/resume", {
    threadId,
    cwd,
    model,
    approvalPolicy: "never",
    sandbox: "read-only"
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { response, tokenUsage: latestTokenUsage(client, threadId, before) };
}

function finalAgentMessage(turn, client, threadId, fromIndex) {
  const fromTurn = turn?.items
    ?.filter((item) => item.type === "agentMessage" && item.text?.trim())
    .at(-1)?.text;
  if (fromTurn) {
    return fromTurn;
  }
  return client.notifications
    .slice(fromIndex)
    .filter((message) =>
      message.method === "item/completed" &&
      message.params?.threadId === threadId &&
      message.params?.item?.type === "agentMessage")
    .at(-1)?.params?.item?.text ?? null;
}

async function runTurn(client, threadId, model, effort) {
  const before = client.notifications.length;
  const started = await client.request("turn/start", {
    threadId,
    input: [{ type: "text", text: CHECKPOINT_PROMPT, text_elements: [] }],
    model,
    effort,
    outputSchema: CHECKPOINT_SCHEMA
  });
  const turnId = started.turn?.id;
  const completed = await client.waitFor(
    (message) =>
      message.method === "turn/completed" &&
      message.params?.threadId === threadId &&
      (!turnId || message.params?.turn?.id === turnId),
    { fromIndex: before, timeoutMessage: "Timed out while Codex generated the handoff checkpoint." }
  );
  const turn = completed.params.turn;
  if (turn.status !== "completed") {
    const error = new Error(turn.error?.message ?? `Codex checkpoint turn ended with status ${turn.status}.`);
    error.codexError = turn.error;
    throw error;
  }
  const text = finalAgentMessage(turn, client, threadId, before);
  if (!text) {
    throw new Error("Codex completed without a checkpoint message.");
  }
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return validateCheckpoint(JSON.parse(normalized));
}

function isContextError(error) {
  const serialized = JSON.stringify(error?.codexError ?? error?.data ?? error?.message ?? error);
  return /contextWindowExceeded|context window|too many tokens/i.test(serialized);
}

async function compact(client, threadId) {
  const before = client.notifications.length;
  await client.request("thread/compact/start", { threadId });
  await client.waitFor(
    (message) => message.method === "thread/compacted" && message.params?.threadId === threadId,
    { fromIndex: before, timeoutMessage: "Timed out while Codex compacted the imported session." }
  );
}

function shouldCompact(tokenUsage, env) {
  if (!tokenUsage?.total) {
    return false;
  }
  const configured = Number(env.SESSION_HANDOFF_DIRECT_TOKEN_LIMIT || 0);
  const limit = configured > 0
    ? configured
    : tokenUsage.modelContextWindow
      ? Math.min(Math.floor(tokenUsage.modelContextWindow * 0.72), 700_000)
      : 700_000;
  return tokenUsage.total.totalTokens > limit;
}

export async function generateCodexCheckpoint(source, options = {}) {
  const env = options.env ?? process.env;
  const directModel = env.SESSION_HANDOFF_DIRECT_MODEL || "gpt-5.6-luna";
  const directEffort = env.SESSION_HANDOFF_DIRECT_EFFORT || "xhigh";
  const compactRenderModel = env.SESSION_HANDOFF_COMPACT_RENDER_MODEL || "gpt-5.6-terra";
  const compactRenderEffort = env.SESSION_HANDOFF_COMPACT_RENDER_EFFORT || "max";
  return withTranscriptSnapshot(source.path, async (snapshotPath) => {
    const client = await new CodexAppServerClient(source.cwd, { env }).start();
    try {
      const threadId = await importSession(client, snapshotPath, source.cwd, env);
      const { tokenUsage } = await resumeForSynthesis(client, threadId, source.cwd, directModel);
      let pipeline = "direct";
      let checkpoint;
      if (shouldCompact(tokenUsage, env)) {
        pipeline = "compact-render";
        await compact(client, threadId);
        checkpoint = await runTurn(client, threadId, compactRenderModel, compactRenderEffort);
      } else {
        try {
          checkpoint = await runTurn(client, threadId, directModel, directEffort);
        } catch (error) {
          if (!isContextError(error)) {
            throw error;
          }
          pipeline = "compact-render";
          await compact(client, threadId);
          checkpoint = await runTurn(client, threadId, compactRenderModel, compactRenderEffort);
        }
      }
      return {
        checkpoint,
        synthesis: {
          pipeline,
          importedThreadId: threadId,
          importedTokens: tokenUsage?.total?.totalTokens ?? null,
          modelContextWindow: tokenUsage?.modelContextWindow ?? null,
          directModel,
          directEffort,
          renderModel: pipeline === "direct" ? directModel : compactRenderModel,
          renderEffort: pipeline === "direct" ? directEffort : compactRenderEffort
        }
      };
    } finally {
      await client.close();
    }
  });
}
