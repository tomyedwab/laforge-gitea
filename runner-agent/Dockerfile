FROM debian:bookworm-slim

# Install packages and clean up temporary files
RUN apt update && apt install -y curl zip sqlite3 curl git && apt clean && rm -rf /var/lib/apt/lists/*

# Install Node.js and Claude Code
ENV NVM_DIR="/root/.nvm"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
RUN bash -c ". /root/.nvm/nvm.sh && nvm install 22.21.1 && nvm alias default 22 && \
    nvm use default && npm install -g @anthropic-ai/claude-code"
ENV NODE_VERSION=22.21.1
ENV PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

RUN node -v && npm -v

# Install OpenCode
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH=/root/.opencode/bin:$PATH

COPY scripts/*.sh /bin/
COPY scripts/CLAUDE.md /bin/
ADD scripts/.claude /bin/.claude
ADD scripts/opencode.json /bin/opencode.json

WORKDIR /src
