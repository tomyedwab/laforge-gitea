#!/bin/bash

docker run -it -v laforge-2_claude-config:/home/laforge/.claude-laforge:rw laforge-2:latest /bin/claude-login.sh
