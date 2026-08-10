---
name: agent-checkpoint
description: Save and resume AI coding work memory via the acp CLI. Use when the user asks to checkpoint, save progress, resume a session, or before context compression / switching tools.
---

# Agent Checkpoint

Use the `acp` CLI. Do not invent your own storage format.

## When to act

1. Before a complex / multi-file task: if `.agent-checkpoint/latest.json` exists, run `acp resume` and follow it.
2. User says save progress / checkpoint / 记一下 → run `acp checkpoint` with full fields.
3. Before context compression, clearing chat, starting a new session, or switching tools → checkpoint first.
4. After an important technical choice → include `--decision "choice|why|rejected"`.
5. Returning after days → `acp memory` then `acp resume`.

## Commands

```bash
acp init
acp checkpoint --tool claude-code --goal "..." --task "..." \
  --decision "choice|why|alt1,alt2" \
  --constraint "..." \
  --file path/to/file \
  --next "do X" \
  --active "a,b" --completed "c" --pending "d" \
  --memory-add "convention"
# later, only update what changed (inherits the rest):
acp checkpoint --task "..." --next "..."
acp resume
acp resume --copy
acp memory
acp list
acp config
```

## Rules

- Always prefer real CLI output over paraphrasing memory.
- Put rejected alternatives in the decision's third segment.
- Mark unknowns honestly; the CLI will emit `[MISSING]` when fields are empty.
