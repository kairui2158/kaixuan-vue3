#!/usr/bin/env python3
"""Claude Code hook: autosave on PreCompact / SessionEnd."""
from __future__ import annotations

import json
import sys


def main() -> int:
    raw = sys.stdin.read()
    event = "SessionEnd"
    try:
        payload = json.loads(raw) if raw.strip() else {}
        event = str(payload.get("hook_event_name") or event)
    except json.JSONDecodeError:
        pass

    reason = "precompact" if event == "PreCompact" else "session-end"
    try:
        from agent_checkpoint.autosave import autosave
        from agent_checkpoint.paths import find_project_root

        autosave(find_project_root(), reason=reason, tool="claude-code")
    except Exception as exc:
        print(f"acp autosave skipped: {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
