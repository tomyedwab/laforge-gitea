## Detailed Instructions for Setting Up Gitea Actions with Self-Hosted Docker Runner

Setting up automated actions in Gitea requires several steps: enabling Actions at the instance level, enabling them per repository, setting up a self-hosted runner in Docker, and creating workflow files that trigger on pull request events. Here is a comprehensive guide to accomplish this.

### Prerequisites

Before beginning, ensure you have the following:

- A self-hosted Gitea instance (version 1.19.0 or higher) running in Docker[1]
- Docker installed on both the Gitea host and where your runner will execute
- Access to Gitea with admin privileges for initial setup

### Step 1: Enable Gitea Actions at the Instance Level

By default, Gitea Actions is enabled in version 1.21.0 and later. If you're running an earlier version or need to verify it's enabled, modify your Gitea configuration:[1]

Edit your Gitea `app.ini` configuration file (typically located at `/etc/gitea/app.ini` or mounted in your Docker container) and add or verify this section:

```
[actions]
ENABLED=true
```

After updating, restart your Gitea container to apply the changes.

### Step 2: Create a Runner Registration Token

The runner needs a registration token to communicate with your Gitea instance. Registration tokens can be created at three levels:[2]

- **Instance level**: Admin settings page at `<your_gitea_url>/-/admin/actions/runners`
- **Organization level**: Organization settings at `<your_gitea_url>/<org>/settings/actions/runners`
- **Repository level**: Repository settings at `<your_gitea_url>/<owner>/<repo>/settings/actions/runners`

For a basic setup, create an instance-level runner:[2]

1. Log in as an administrator
2. Navigate to your Gitea instance's admin panel
3. Go to **Actions** → **Runners**
4. Click **Create New Runner**
5. Copy the registration token (format: `D0gvfu2iHfUjNqCYVljVyRV14fISpJxxxxxxxxxx`)

Keep this token secure—it's used to authenticate the runner to your Gitea instance.

### Step 3: Set Up the Self-Hosted Runner in Docker

The recommended approach is to run the runner in Docker alongside your Gitea instance using Docker Compose. This keeps everything isolated and easy to manage.[3]

Add the runner service to your existing `docker-compose.yml`:

```yaml
version: '3.8'

services:
  gitea:
    # Your existing Gitea configuration
    image: gitea/gitea:latest
    # ... rest of Gitea config

  gitea_runner:
    image: gitea/act_runner:latest
    container_name: gitea_runner
    networks:
      - gitea_network  # Use your existing Gitea network
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./runner_data:/data
    environment:
      - GITEA_INSTANCE_URL=http://gitea:3000
      - GITEA_RUNNER_REGISTRATION_TOKEN=<your_registration_token>
      - GITEA_RUNNER_NAME=my-runner
      - GITEA_RUNNER_LABELS=ubuntu-latest:docker://node:16-bullseye
    restart: always
    depends_on:
      - gitea
```

**Important considerations:**

- Replace `<your_registration_token>` with the token you generated in Step 2[2]
- The `GITEA_INSTANCE_URL` should be the internal Docker network address (e.g., `http://gitea:3000`), not the external URL
- The `/var/run/docker.sock` mount allows the runner to spawn job containers[2]
- `GITEA_RUNNER_LABELS` defines what environments the runner supports; adjust the image if needed[2]

Start the runner:

```bash
docker-compose up -d gitea_runner
```

Verify the runner is registered by checking your Gitea admin panel. You should see it listed under **Actions** → **Runners** with a green status indicator.

### Step 4: Enable Actions on Your Repository

Actions are disabled by default on each repository. To enable them:[1]

1. Navigate to your repository in Gitea
2. Go to **Settings** (top right)
3. Scroll down and check the box for **Enable Repository Actions**
4. Save the settings

### Step 5: Create Workflow Files for Pull Request Events

Workflows are defined in YAML files stored in the `.gitea/workflows/` directory at the root of your repository. Create this directory structure if it doesn't exist.

Here's a complete example workflow that triggers on pull request events:[4]

```yaml
name: Pull Request CI

on:
  pull_request:
    types: [opened, synchronize, reopened, edited]
    branches:
      - main
      - develop

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test

      - name: Run linter
        run: npm run lint
```

**Understanding the `on` trigger block:**[4]

- `pull_request`: The workflow triggers on pull request events
- `types`: Specifies which PR events trigger the workflow:
  - `opened`: When a PR is first created
  - `synchronize`: When new commits are pushed to the PR
  - `reopened`: When a closed PR is reopened
  - `edited`: When PR title or description is edited
- `branches`: Limits which branches the workflow triggers for (optional)

The default behavior without specifying `types` is to trigger on `opened`, `synchronize`, and `reopened`.[5]

### Step 6: Push the Workflow File

Create a pull request or commit the workflow file to your repository:

```bash
mkdir -p .gitea/workflows
cat > .gitea/workflows/pr-checks.yaml << 'EOF'
name: Pull Request CI

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Running tests..."
EOF

git add .gitea/workflows/pr-checks.yaml
git commit -m "Add PR workflow"
git push
```

When you push this, it will trigger the workflow. You can monitor execution in the **Actions** tab of your repository.

### Step 7: Advanced Workflow Customization for PR Events

For more sophisticated automation, you can add conditional logic:

```yaml
name: Advanced PR Checks

on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]

jobs:
  changes-detected:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.changes.outputs.backend }}
      frontend: ${{ steps.changes.outputs.frontend }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Detect changes
        id: changes
        run: |
          if git diff HEAD~1 --quiet -- backend/; then
            echo "backend=false" >> $GITHUB_OUTPUT
          else
            echo "backend=true" >> $GITHUB_OUTPUT
          fi

  test-backend:
    needs: changes-detected
    if: needs.changes-detected.outputs.backend == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm run test:backend

  label-based-action:
    if: github.event.action == 'labeled'
    runs-on: ubuntu-latest
    steps:
      - run: echo "PR labeled with ${{ github.event.label.name }}"
```

This example demonstrates dependency management between jobs and conditional execution based on changed files or labels.

### Troubleshooting

If workflows don't trigger, verify:

- The runner shows as "Idle" in the admin panel's **Actions** → **Runners** section[3]
- Repository Actions are enabled in **Settings**
- The workflow file is in `.gitea/workflows/` with a `.yaml` or `.yml` extension
- The runner logs show no errors: `docker logs gitea_runner`
- Your Gitea version is 1.19.0 or higher

For runner logs, execute:

```bash
docker logs gitea_runner
```

Common issues include the runner container failing to connect to the Gitea instance—verify the `GITEA_INSTANCE_URL` uses a correctly resolvable hostname or IP address reachable from the runner container.[2]

### Security Considerations

When using ephemeral runners (recommended for untrusted code), add this to your runner configuration:[2]

```yaml
services:
  gitea_runner:
    environment:
      - GITEA_RUNNER_EPHEMERAL=1
```

This creates a new runner for each job and destroys it afterward, preventing credential exposure. Ephemeral runners require `act_runner` version 0.2.12 or later.[2]

[1](https://docs.gitea.com/usage/actions/quickstart)
[2](https://docs.gitea.com/usage/actions/act-runner)
[3](https://paulelser.com/blog/gitea-actions)
[4](https://docs.gitea.com/usage/actions/faq)
[5](https://frontside.com/blog/2020-05-26-github-actions-pull_request/)
[6](https://docs.gitea.com/usage/pull-request)
[7](https://julius-roettgermann.de/post/hugo-cicd/)
[8](https://thehomelabber.com/guides/self-hosted-git-ci-cd-part-2/)
[9](https://stackoverflow.com/questions/55563266/automatic-pull-request-merge-in-gitea-upon-successful-jenkins-build)
[10](https://www.reddit.com/r/linux/comments/zqtkkx/gitea_is_working_on_a_builtin_cicd_tool_called/)
[11](https://docs.gitea.com/usage/actions/design)
[12](https://the-pi-guy.com/blog/gitea_cicd_pipeline_setup_with_github_actions/)
[13](https://docs.gitea.com/administration/config-cheat-sheet)
[14](https://forum.gitea.com/t/create-a-webhook-to-automate-pull-events-on-remote-server/1369)
[15](https://stackoverflow.com/questions/70964103/trigger-github-workflow-on-pull-request)
[16](https://www.updatecli.io/docs/plugins/actions/gitea/)
[17](https://gitlab-public.fz-juelich.de/m.risse/gitea/-/blob/v1.20.2/modules/actions/workflows.go)
[18](https://stackoverflow.com/questions/60710209/trigger-github-actions-only-when-pr-is-merged)
[19](https://www.youtube.com/watch?v=FyLzot01MCg)
[20](https://github.com/jesseduffield/lazygit/discussions/3442)
[21](https://fossies.org/linux/gitea/docs/content/usage/actions/quickstart.en-us.md)
[22](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
[23](https://blog.gitea.com/hacking-on-gitea-actions/)
[24](https://forum.gitea.com/t/getting-the-label-info-on-pull-request-labeled-workflow/9660)