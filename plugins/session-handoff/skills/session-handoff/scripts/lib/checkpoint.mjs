export const CHECKPOINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "last_literal_user_message",
    "latest_substantive_intent",
    "active_goal",
    "current_state",
    "decisions",
    "commitments",
    "constraints",
    "evidence",
    "failed_approaches",
    "unresolved_questions",
    "next_actions",
    "facts_to_revalidate"
  ],
  properties: {
    last_literal_user_message: { type: ["string", "null"] },
    latest_substantive_intent: { type: "string", minLength: 1 },
    active_goal: { type: "string", minLength: 1 },
    current_state: {
      type: "object",
      additionalProperties: false,
      required: ["completed", "in_progress", "not_started"],
      properties: {
        completed: { type: "array", items: { type: "string" } },
        in_progress: { type: "array", items: { type: "string" } },
        not_started: { type: "array", items: { type: "string" } }
      }
    },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["decision", "rationale"],
        properties: {
          decision: { type: "string" },
          rationale: { type: "string" }
        }
      }
    },
    commitments: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    failed_approaches: { type: "array", items: { type: "string" } },
    unresolved_questions: { type: "array", items: { type: "string" } },
    next_actions: { type: "array", items: { type: "string" } },
    facts_to_revalidate: { type: "array", items: { type: "string" } }
  }
};

export const CHECKPOINT_PROMPT = `Create a portable continuation checkpoint from the imported Claude session. Keep the serialized JSON under 20,000 characters.

This request is a meta operation. Do not treat this checkpoint request as the source session's latest task. Do not call tools, modify files, or continue the work.

Distinguish these two concepts:
- last_literal_user_message: the final literal user message, including a short continuation or check-in message.
- latest_substantive_intent: the most recent actual objective. Ignore messages such as "continue", "keep going", status checks, and retry requests when identifying this intent.

Capture exact identifiers, paths, commands, measured values, acceptance criteria, incomplete work, decisions and their rationale, failed approaches, and promises made to the user. Separate completed, in-progress, and not-started work. Never turn an attempted or interrupted action into a completion claim.

List volatile facts that the restored agent must revalidate, including repository status, processes, generated artifacts, editor state, external tasks, and service availability. Return only JSON that satisfies the supplied schema.`;

export function validateCheckpoint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Codex returned a checkpoint that is not a JSON object.");
  }
  for (const field of CHECKPOINT_SCHEMA.required) {
    if (!(field in value)) {
      throw new Error(`Codex checkpoint is missing required field "${field}".`);
    }
  }
  if (!value.latest_substantive_intent?.trim() || !value.active_goal?.trim()) {
    throw new Error("Codex checkpoint is missing the active intent or goal.");
  }
  for (const field of [
    "decisions",
    "commitments",
    "constraints",
    "evidence",
    "failed_approaches",
    "unresolved_questions",
    "next_actions",
    "facts_to_revalidate"
  ]) {
    if (!Array.isArray(value[field])) {
      throw new Error(`Codex checkpoint field "${field}" must be an array.`);
    }
  }
  for (const field of ["completed", "in_progress", "not_started"]) {
    if (!Array.isArray(value.current_state?.[field])) {
      throw new Error(`Codex checkpoint current_state.${field} must be an array.`);
    }
  }
  if (JSON.stringify(value).length > 22_000) {
    throw new Error("Codex checkpoint exceeds the 22,000-character portability limit.");
  }
  return value;
}
