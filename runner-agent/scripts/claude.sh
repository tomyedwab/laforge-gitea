#!/bin/bash

set -euo pipefail

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

if [[ "$MODELNAME" == "claude-"* ]]; then
    echo "Invoking Claude Code..."

    # Copy config files with fixed permissions
    mkdir -p ~/.claude
    cp ~/.claude-laforge/.claude.json ~/
    chmod 600 ~/.claude.json
    cp ~/.claude-laforge/.credentials.json ~/.claude/
    chmod 600 ~/.claude/.credentials.json

    mkdir -p .claude
    cp /bin/.claude/settings.local.json .claude/

    if [ -f CLAUDE.md ]; then
        mv CLAUDE.md .pr/CLAUDE-PROJECT.md
    fi
    mv /bin/CLAUDE.md ./CLAUDE.md

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

    rm .claude/settings.local.json || echo "Claude settings nowhere to be found"
    rm CLAUDE.md || echo "CLAUDE.md nowhere to be found"

    if [ -f .pr/CLAUDE-PROJECT.md ]; then
        mv .pr/CLAUDE-PROJECT.md CLAUDE.md
    fi
else
    echo "Invoking OpenCode..."
    mkdir -p ~/.config/opencode
    cat /bin/opencode.json |sed -r "s#%LMSTUDIO_HOST%#$LMSTUDIO_HOST#" > ~/.config/opencode/

    if [ -f AGENTS.md ]; then
        mv AGENTS.md .pr/AGENTS-PROJECT.md
    fi
    mv /bin/CLAUDE.md ./AGENTS.md

    opencode -m $MODELNAME run "$PROMPT"

    # Check if there are changes outside of the .pr directory
    if git diff --quiet HEAD -- ':!.pr'; then
        echo "No changes outside .pr directory, skipping commit message generation"
    else
        # Check if .pr/commit.md file exists. If it doesn't, create it.
        if [ ! -f .pr/commit.md ]; then
            opencode -m $MODELNAME run "Write a commit message to .pr/commit.md"
        fi
    fi

    rm ./AGENTS.md || echo "AGENTS.md nowhere to be found"
    if [ -f .pr/AGENTS-PROJECT.md ]; then
        mv .pr/AGENTS-PROJECT.md AGENTS.md
    fi
fi
