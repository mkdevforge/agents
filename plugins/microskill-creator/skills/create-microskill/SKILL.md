---
name: create-microskill
description: Use when creating or revising a repo-local skill for one repeatable behavior.
---

# Create a microskill

Find the real repository root and the target project root. Keep them distinct. Read the applicable instructions, existing skills, and relevant code before writing.

Identify the scope first. In a monorepo, find the target project from workspace manifests, build files, and the requested paths. If the behavior is not repo-wide, name the project or stable path in the trigger. Do not silently apply one project's conventions to its siblings.

Reduce the skill to one trigger and one behavior. Narrow it if either needs more than one sentence.

Do not create a microskill when the content belongs in `AGENTS.md`, a script, a test, CI, or documentation. Update an existing skill only when it already owns the same behavior. Different microskills may share a trigger.

Use a short, action-oriented, kebab-case name. Treat the YAML `description` only as the trigger. Start it with `Use when` and do not summarize the body.

Write direct, repo-specific instructions. Add ordering, verification, or stop conditions only when they prevent a real failure. Remove introductions, motivation, generic advice, repeated documentation, and optional improvements.

Keep the body under 25 lines unless correctness requires more. Add supporting files only when instructions alone are insufficient.

Use the repository's existing skill location. If none exists, ask where repo-local skills belong before creating files. Validate the finished skill with the available skill validator.

Remove every sentence that does not change agent behavior.
