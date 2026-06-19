"""
Injects project docs into context when specific skills fire.
To add a new skill->doc mapping, add an entry to SKILL_DOCS below.
"""
import json, os, sys

# Map skill name -> path relative to CLAUDE_PROJECT_DIR
SKILL_DOCS = {
    "writing-plans": "docs/testing.md",
}

data = json.load(sys.stdin)
skill = data.get("tool_input", {}).get("skill")
doc_path = SKILL_DOCS.get(skill)

if not doc_path:
    sys.exit(0)

project_dir = os.environ.get("CLAUDE_PROJECT_DIR", ".")
full_path = os.path.join(project_dir, doc_path)

try:
    with open(full_path) as f:
        content = f.read()
except FileNotFoundError:
    sys.exit(0)

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "additionalContext": f"[Injected for /{skill} skill] {doc_path}:\n\n{content}",
    }
}))
