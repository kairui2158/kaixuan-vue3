#!/usr/bin/env python3
"""Cursor hook: autosave Agent Checkpoint on session end / preCompact."""
from __future__ import annotations

import json
import sys


def main() -> int:
    raw = sys.stdin.read()
    event = "sessionEnd"
    try:
        payload = json.loads(raw) if raw.strip() else {}
        event = str(payload.get("hookEventName") or payload.get("event") or event)
    except json.JSONDecodeError:
        pass

    reason = "precompact" if "compact" in event.lower() else "session-end"
    try:
        from agent_checkpoint.autosave import autosave
        from agent_checkpoint.paths import find_project_root

        autosave(find_project_root(), reason=reason, tool="cursor")
    except Exception as exc:  # fail open
        print(f"acp autosave skipped: {exc}", file=sys.stderr)
    print("{}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
