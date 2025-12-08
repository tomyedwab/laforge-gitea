FROM debian:bookworm-slim

# Install packages and clean up temporary files
RUN apt update && apt install -y curl zip sqlite3 curl && apt clean && rm -rf /var/lib/apt/lists/*

# Create a non-root user and group
RUN adduser --disabled-password --gecos "" laforge
RUN mkdir -p /home/laforge/.config/opencode /home/laforge/.local/share/opencode /home/laforge/.claude-laforge /src /state
RUN chown -R laforge:laforge /home/laforge /state

# Switch to the non-root user
USER laforge
WORKDIR /home/laforge

# Install Node.js and Claude Code
ENV NVM_DIR="/home/laforge/.nvm"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
RUN bash -c ". /home/laforge/.nvm/nvm.sh && nvm install 22 && nvm alias default 22 && \
    nvm use default && npm install -g @anthropic-ai/claude-code"
ENV NODE_VERSION=22.21.1
ENV PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

RUN node -v && npm -v

COPY scripts/*.sh /bin/
ADD scripts/.claude /bin/.claude

WORKDIR /src
