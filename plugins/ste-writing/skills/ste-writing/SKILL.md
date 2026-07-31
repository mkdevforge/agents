---
name: ste-writing
description: Rewrite prose into ASD-STE100 Simplified Technical English to remove "AI slop". This includes docs, READMEs, commit messages, PR titles and descriptions, error messages, release notes, and comments — never code. Always use for drafting, editing, reviewing, or submitting commit messages and pull-request text, even when the user does not request STE. Also use when asked to make writing not sound like AI, make docs clear or plain, enforce a controlled writing style, or write technical documentation that reads human. Two modes — strict (procedures/safety) and STE-flavored (general prose).
---

# ste-writing

Write prose in ASD-STE100 Simplified Technical English. This applies to documentation, READMEs, commit messages, pull-request text, error messages, release notes, and comments. It does not apply to code, identifiers, or command syntax. It is not for marketing copy, essays, or anything that needs a voice — STE strips voice on purpose.

## Rules

WORDS
- Use one name for one thing. Do not call the same item by two different names.
- Use the short common word: start (not begin/commence/initiate), use (not utilize/leverage), help (not facilitate), make sure (not ensure), before (not prior to), after (not subsequent to), about (not regarding/concerning), get (not obtain/acquire), show (not demonstrate), also (not additionally/furthermore/moreover).
- Give each word one meaning. "fall" means to move down, not to decrease.
- No marketing adjectives: seamless, robust, powerful, cutting-edge, effortless, world-class, next-generation, revolutionary.
- American spelling.

VERBS
- Active voice. "the parser reads the file", not "the file is read by the parser".
- Use a verb for an action. "analyze the log", not "perform an analysis of the log".
- No stacked auxiliaries. Not "it is important to note that this may help to improve". Write "this improves X".
- No "-ing" main verb where a simple tense works.

SENTENCES
- One instruction per sentence. Max 20 words (instruction), max 25 (descriptive).
- No contractions. Use articles: a, an, the, this, these.

PUNCTUATION
- No semicolons. Write two sentences. (Note: the em dash is not banned by STE, only the semicolon is — add "no em dash" yourself if you want it gone.)

STRUCTURE
- One topic per paragraph, max six sentences. For steps, use a numbered vertical list, one action per item, imperative form. Put a condition before its command.

When the user requests prose only, write only the requested text. Do not add a preamble, summary, or closing remark.

## Modes

- **strict** — procedures, runbooks, safety text, error messages: apply every rule and both length caps.
- **STE-flavored** — general prose (READMEs, PR descriptions, docs): apply the sentence, paragraph, active-voice, and no-phrasal-verb discipline. Relax the ~900-word dictionary lockdown so the text keeps enough range to read naturally.

## Git text

Treat these rules as a gate. Do not create a commit or pull request until its prose passes the self-lint.

### Commit messages

- Always use this skill when you draft, edit, review, or submit a commit message.
- Use strict mode for the subject and body.
- Follow the repository's commit format. Preserve required prefixes, scopes, issue IDs, and literal values.
- Write the subject in the imperative form. State one action.
- Do not end the subject with a period.
- Use the body to explain the reason or behavior when the subject is not sufficient.
- Do not claim results, tests, or effects that the available evidence does not support.
- Run the self-lint before you run the commit command.

### Pull requests

- Always use this skill when you draft, edit, review, or submit a pull-request title or description.
- Use strict mode for the title. Use STE-flavored mode for the description.
- Use strict mode for procedures, test steps, safety text, and error text inside the description.
- Preserve the repository's pull-request template, headings, checkboxes, issue references, code, commands, and literal values.
- Describe only verified changes, tests, results, risks, and effects.
- Keep separate topics under separate headings when the template permits headings.
- Run the self-lint on the title and description before you create or update the pull request.

## Self-lint (run before returning text)

1. Any instruction over 20 words or descriptive sentence over 25 words? Split it.
2. Any semicolon? Replace with a period.
3. Any contraction? Expand it.
4. Any passive voice with a known actor? Make it active.
5. Any "-ing" main verb, nominalization ("perform an analysis"), or phrasal verb ("spin up")? Replace with a plain verb.
6. Same thing named two ways? Pick one name.
7. For a commit or pull request, did you lint all authored prose? Correct it before submission.

The mechanical rules remove the form of slop. Full STE also needs human judgment about technical nouns and sentence meaning. A checker cannot certify that judgment. This skill cannot make a hollow paragraph true.

Free official standard (do not paste it in full because it is copyrighted): https://asd-ste100.org
