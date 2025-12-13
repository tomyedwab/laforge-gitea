#!/bin/bash

set -euo pipefail

# Copy config files with fixed permissions
mkdir -p ~/.claude
cp ~/.claude-laforge/.claude.json ~/
chmod 600 ~/.claude.json
cp ~/.claude-laforge/.credentials.json ~/.claude/
chmod 600 ~/.claude/.credentials.json

mkdir -p .claude
cp /bin/.claude/settings.local.json .claude/

# Determine prompt based on agent mode
if [ "$AGENT_MODE" = "critique" ]; then
    PROMPT="Review the current PR implementation. Focus on:
- Code quality and best practices
- Potential bugs or edge cases
- Performance considerations
- Architectural decisions
- Suggestions for improvement

Provide detailed feedback and make any improvements you think are necessary."
else
    PROMPT="Work on the current PR."
fi

claude --model $MODELNAME --output-format stream-json --verbose -p "$PROMPT" | node .gitea/workflows/format-claude-output.js

# Check if there are changes outside of the .pr directory
if git diff --quiet HEAD -- ':!.pr'; then
    echo "No changes outside .pr directory, skipping commit message generation"
else
    # Check if .pr/commit.md file exists. If it doesn't, create it.
    if [ ! -f .pr/commit.md ]; then
        claude --model $MODELNAME --output-format stream-json --verbose -c -p "Write a commit message to .pr/commit.md" | node .gitea/workflows/format-claude-output.js
    fi
fi

rm .claude/settings.local.json
