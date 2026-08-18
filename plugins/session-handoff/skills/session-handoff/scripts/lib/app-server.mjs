import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";

function executableCandidates(name) {
  if (process.platform !== "win32") {
    return [name];
  }
  return [`${name}.exe`, `${name}.cmd`, name];
}

function resolveExecutable(name, env = process.env) {
  if (env.CODEX_BINARY) {
    return env.CODEX_BINARY;
  }
  const directories = (env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const candidate of executableCandidates(name)) {
    for (const directory of directories) {
      const fullPath = path.join(directory.replace(/^"|"$/g, ""), candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return name;
}

function protocolError(message, data) {
  const error = new Error(message);
  error.data = data;
  error.rpcCode = data?.code;
  return error;
}

export class CodexAppServerClient {
  constructor(cwd, options = {}) {
    this.cwd = cwd;
    this.env = options.env ?? process.env;
    this.timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
    this.nextId = 1;
    this.pending = new Map();
    this.notifications = [];
    this.waiters = new Set();
    this.stderr = "";
    this.closed = false;
  }

  async start() {
    const executable = resolveExecutable("codex", this.env);
    this.process = spawn(executable, ["app-server"], {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    this.process.stdout.setEncoding("utf8");
    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.process.on("error", (error) => this.#failAll(error));
    this.process.on("exit", (code, signal) => {
      if (!this.closed && code !== 0) {
        this.#failAll(new Error(`codex app-server exited (${signal ?? code}). ${this.stderr.trim()}`.trim()));
      }
    });
    this.lines = readline.createInterface({ input: this.process.stdout });
    this.lines.on("line", (line) => this.#handleLine(line));
    await this.request("initialize", {
      clientInfo: { name: "session-handoff", title: "Session Handoff", version: "0.1.0" },
      capabilities: {
        experimentalApi: false,
        requestAttestation: false,
        optOutNotificationMethods: [
          "item/agentMessage/delta",
          "item/reasoning/summaryTextDelta",
          "item/reasoning/summaryPartAdded",
          "item/reasoning/textDelta"
        ]
      }
    });
    this.notify("initialized", {});
    return this;
  }

  request(method, params = {}) {
    if (this.closed || !this.process?.stdin) {
      throw new Error("codex app-server client is not running.");
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for codex app-server method ${method}.`));
      }, this.timeoutMs);
      this.pending.set(id, { method, resolve, reject, timeout });
      this.#send({ id, method, params });
    });
  }

  notify(method, params = {}) {
    if (!this.closed) {
      this.#send({ method, params });
    }
  }

  waitFor(predicate, options = {}) {
    const fromIndex = options.fromIndex ?? 0;
    const existing = this.notifications.slice(fromIndex).find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject };
      const timeout = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(options.timeoutMessage ?? "Timed out waiting for a codex app-server notification."));
      }, options.timeoutMs ?? this.timeoutMs);
      waiter.timeout = timeout;
      this.waiters.add(waiter);
    });
  }

  async close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.lines?.close();
    if (this.process?.stdin && !this.process.stdin.destroyed) {
      this.process.stdin.end();
    }
    await new Promise((resolve) => {
      if (!this.process || this.process.exitCode !== null) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        this.process.kill();
        resolve();
      }, 1500);
      this.process.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  #send(message) {
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleLine(line) {
    if (!line.trim()) {
      return;
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.#failAll(new Error(`Failed to parse codex app-server output: ${error.message}`));
      return;
    }
    if (message.id !== undefined && message.method) {
      this.#send({ id: message.id, error: { code: -32601, message: `Unsupported server request: ${message.method}` } });
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(protocolError(message.error.message ?? `${pending.method} failed.`, message.error));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }
    if (!message.method) {
      return;
    }
    this.notifications.push(message);
    for (const waiter of [...this.waiters]) {
      if (waiter.predicate(message)) {
        clearTimeout(waiter.timeout);
        this.waiters.delete(waiter);
        waiter.resolve(message);
      }
    }
  }

  #failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    this.waiters.clear();
  }
}
