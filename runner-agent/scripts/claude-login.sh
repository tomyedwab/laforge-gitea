#!/bin/bash

set -euo pipefail

touch ~/.claude-laforge/

claude

cp ~/.claude.json ~/.claude-laforge/
cp ~/.claude/.credentials.json ~/.claude-laforge/
