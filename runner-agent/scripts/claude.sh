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

claude --model $MODELNAME --output-format stream-json --verbose -p "Work on the next task."

# Check if COMMIT.md file exists. If it doesn't, create it.
if [ ! -f COMMIT.md ]; then
    claude --model $MODELNAME --output-format stream-json --verbose -c -p "Write a commit message to COMMIT.md"
fi

rm .claude/settings.local.json
