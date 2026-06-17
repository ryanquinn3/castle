import json, sys

data = json.load(sys.stdin)
if data.get('agentType') != 'Explore':
    sys.exit(0)

ctx = (
    'Prefer rg (ripgrep) over grep or find for all file and text searches. '
    'rg is faster and respects .gitignore. '
    'Use: rg PATTERN src/ instead of grep -r PATTERN src/; '
    'rg -l PATTERN --type ts instead of find . -name "*.ts" | xargs grep PATTERN; '
    'rg -n SYMBOL instead of grep -rn SYMBOL.'
)
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'SubagentStart',
        'additionalContext': ctx,
    }
}))
