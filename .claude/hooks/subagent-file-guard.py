#!/usr/bin/env -S uv run --no-project --quiet --script
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""PreToolUse(Edit|Write) guard for subagents.

Blocks subagents from editing protected config files. The main agent (invoked
directly by the user) is unaffected.

Detection: Claude Code sets `agent_id` in the hook payload only when the hook
fires inside a subagent. No `agent_id` means the main agent — allow through.
"""

from __future__ import annotations

import json
import os
import sys

PROTECTED_FILES = {
    "knip.config.ts",
    "package.json",
    "vitest.config.ts",
}


def is_protected(file_path: str) -> bool:
    name = os.path.basename(file_path)
    return name in PROTECTED_FILES


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    if payload.get("tool_name") not in ("Edit", "Write"):
        return 0

    # Only apply to subagents — agent_id is absent in the main agent.
    if not payload.get("agent_id"):
        return 0

    file_path = (payload.get("tool_input") or {}).get("file_path", "")
    if not file_path or not is_protected(file_path):
        return 0

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                f"Subagents cannot edit {os.path.basename(file_path)}. "
                "Ask the user to make this change directly."
            ),
        }
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
