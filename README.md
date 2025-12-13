LaForge
=======

**LaForge** is an AI-powered pull request assistant that integrates Claude AI with Gitea to provide automated code collaboration on self-hosted Git repositories.

## Overview

LaForge creates an intelligent agent that works alongside developers on pull requests, similar to GitHub Copilot Workspace but for self-hosted Gitea instances. When assigned to a PR, the LaForge agent can:

- Understand PR objectives and requirements
- Read and analyze code changes
- Propose implementation plans
- Write and modify code
- Respond to review comments
- Update documentation
- Create commit messages

## Key Features

- **Self-Hosted**: Complete control over your code and AI interactions
- **Gitea Integration**: Works seamlessly with Gitea Actions
- **Claude AI**: Powered by Anthropic's Claude Sonnet 4.5
- **Collaborative Workflow**: Agent asks for clarification and approval before implementing
- **Real-time Notifications**: NTFY integration for status updates
- **Docker-Based**: Easy deployment with Docker Compose

## Architecture

LaForge consists of four main components:

1. **Gitea Server** - Self-hosted Git service with Actions support
2. **Act Runner** - CI/CD runner that executes workflows
3. **LaForge Agent** - Custom Docker container with Claude AI integration
4. **NTFY** - Notification service for real-time updates

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Gitea     │────▶│  Act Runner  │────▶│   LaForge   │
│   Server    │     │              │     │    Agent    │
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │     NTFY     │
                    │ Notifications│
                    └──────────────┘
```

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- At least 4GB of available RAM
- Claude API access (for the agent)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd laforge-2
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your Gitea runner token
   ```

3. **Start the services:**
   ```bash
   docker-compose up -d
   ```

4. **Complete setup:**
   - Follow the detailed instructions in [SETUP.md](SETUP.md)
   - Configure Gitea Actions (see [gitea-actions.md](gitea-actions.md))

### First Time Setup

1. Access Gitea at http://localhost:3010
2. Create an admin account
3. Enable Gitea Actions in the admin panel
4. Create a runner registration token
5. Create a "laforge" user account
6. Generate a personal access token for the laforge user
7. Add the token as a repository secret (`LAFORGE_TOKEN`)

See [SETUP.md](SETUP.md) for complete step-by-step instructions.

## How It Works

### PR Workflow

1. **Create a Pull Request** in your Gitea repository
2. **Assign the "laforge" user** to the PR
3. **LaForge Agent activates** automatically via Gitea Actions
4. **Agent reads PR description** and comments to understand the task
5. **Agent creates a plan** and asks for approval (if needed)
6. **Agent implements changes** and commits them to the PR branch
7. **Agent posts status updates** as comments on the PR
8. **You receive notifications** via NTFY
9. **Review and iterate** by commenting on the PR

### Collaboration Model

LaForge is designed to **collaborate**, not replace developers:

- **Asks clarifying questions** when requirements are unclear
- **Proposes design documents** for review before implementation
- **Responds to feedback** and adjusts approach accordingly
- **Works within PR boundaries** - only modifies files related to the task
- **Documents changes** with clear commit messages

### The `.pr` Directory

During PR work, LaForge creates a `.pr/` directory containing:

- **`history.md`** - PR conversation history and comments
- **`plan.md`** - Task breakdown and progress tracking
- **`status.yaml`** - Status updates and file comments for PR author
- **`commit.md`** - Commit message for changes made

This directory is automatically excluded from merge and serves as the agent's working notes.

## Usage

### Assigning LaForge to a PR

Simply assign the `laforge` user to any pull request:

1. Open a pull request
2. Click "Assignees" in the sidebar
3. Select `laforge`
4. The agent workflow triggers automatically

### Providing Instructions

Write clear instructions in the PR description:

```markdown
## Task
Add user authentication to the login page

## Requirements
- Use JWT tokens
- Store tokens in localStorage
- Add logout functionality
- Include error handling
```

### Responding to Agent Questions

LaForge may ask questions via PR comments:

```yaml
status: |
  Before implementing, I need clarification on a few points:

file_comments:
  - file: src/api/users.ts
    line: 23
    comment: Should this endpoint require admin authentication or regular user auth?
```

Simply reply to these comments with your answers.

### Monitoring Progress

- **PR Comments**: Check the PR for agent status updates
- **NTFY Notifications**: Receive real-time alerts at http://localhost:3031
- **Workflow Logs**: View detailed logs in Gitea Actions tab

## Project Structure

```
laforge-2/
├── .gitea/
│   └── workflows/
│       ├── agent.yaml           # Main workflow definition
│       ├── fetch-pr.js          # PR data fetching
│       ├── post-status.js       # Status posting logic
│       └── format-claude-output.js
├── runner-agent/
│   ├── Dockerfile               # LaForge agent container
│   └── scripts/
│       └── claude.sh            # Agent execution script
├── docker-compose.yml           # Service orchestration
├── runner-config.yaml           # Runner configuration
├── SETUP.md                     # Detailed setup guide
├── gitea-actions.md             # Advanced Actions documentation
└── README.md                    # This file
```

## Configuration

### Environment Variables

Create a `.env` file with:

```bash
GITEA_RUNNER_TOKEN=your_registration_token_here
```

### Repository Secrets

Required secrets in Gitea:

- `LAFORGE_TOKEN` - Personal access token for the laforge user
- `GITEA_TOKEN` - General Gitea API token (optional)

### Repository Variables

Required variables in Gitea:

- `EXTERNAL_BASE_URL` - Your external Gitea URL (e.g., `https://gitea.example.com`). Used for clickable links in NTFY notifications. Do not include a trailing slash.

### Claude Configuration

The agent uses Claude Sonnet 4.5. Configuration is handled in the Docker container and workflow.

## Advanced Topics

### Customizing the Agent

Edit `.gitea/workflows/agent.yaml` to:

- Change which events trigger the agent
- Modify the Claude model used
- Adjust workflow steps

### Network Configuration

The runner uses a custom network configuration in `runner-config.yaml` to ensure job containers can reach Gitea. If you encounter network issues, verify the network name matches your Docker Compose setup.

### Notifications

NTFY runs at http://localhost:3031. Subscribe to the `laforge` topic to receive:

- Workflow completion notifications
- Error alerts
- PR status updates

## Troubleshooting

### Agent Not Running

1. Verify the `laforge` user is assigned to the PR
2. Check Gitea Actions are enabled for the repository
3. Review workflow logs in Gitea's Actions tab

### Runner Not Connected

```bash
# Check runner status
docker logs gitea_runner

# Restart runner
docker-compose restart gitea_runner
```

### Job Fails to Clone Repository

Ensure `runner-config.yaml` specifies the correct Docker network:

```bash
# Check your network name
docker network ls | grep gitea

# Update runner-config.yaml if needed
# Restart runner after changes
docker-compose restart gitea_runner
```

## Documentation

- **[SETUP.md](SETUP.md)** - Complete setup instructions
- **[gitea-actions.md](gitea-actions.md)** - Detailed Gitea Actions guide
- **[CLAUDE.md](CLAUDE.md)** - Instructions for the Claude agent

## Contributing

LaForge is a personal project but contributions are welcome. The agent workflow and integration patterns can be adapted for other use cases.

## License

[Specify your license here]

## Credits

Built with:
- [Gitea](https://gitea.io/) - Self-hosted Git service
- [Act Runner](https://gitea.com/gitea/act_runner) - Gitea Actions runner
- [Claude AI](https://www.anthropic.com/claude) - Anthropic's AI assistant
- [NTFY](https://ntfy.sh/) - Simple notification service
