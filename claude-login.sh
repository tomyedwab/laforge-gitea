#!/bin/bash

docker run -it -v laforge-2_claude-config:/root/.claude-laforge:rw laforge-2:latest /bin/claude-login.sh
