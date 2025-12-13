# Gitea Actions Setup Instructions

This guide will help you complete the setup of Gitea Actions for this repository.

## Prerequisites

- Docker and Docker Compose installed
- Gitea instance running (via `docker-compose up -d`)
- Admin access to your Gitea instance at http://localhost:3010

## Step 1: Verify Gitea Actions is Enabled

Gitea Actions is enabled by default in version 1.21.0+. Since we're running Gitea 1.25.2, Actions should already be enabled.

To verify:
1. Log in to Gitea at http://localhost:3010
2. Go to Site Administration (top right menu)
3. Navigate to Configuration
4. Look for `[actions]` section and verify `ENABLED = true`

If Actions is not enabled, you'll need to edit `./gitea/gitea/conf/app.ini` and add:

```ini
[actions]
ENABLED = true
```

Then restart Gitea: `docker-compose restart server`

## Step 2: Create a Runner Registration Token

The runner needs a registration token to connect to your Gitea instance.

1. Log in to Gitea as an administrator
2. Navigate to: http://localhost:3010/-/admin/actions/runners
3. Click **"Create new Runner"** or **"Add Runner"**
4. Copy the registration token that appears (format: `D0gvfu2iHfUjNqCYVljVyRV14fISpJxxxxxxxxxx`)

## Step 3: Configure the Runner

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and replace `your_registration_token_here` with the token you copied:
   ```bash
   GITEA_RUNNER_TOKEN=D0gvfu2iHfUjNqCYVljVyRV14fISpJxxxxxxxxxx
   ```

## Step 4: Start the Runner

The runner configuration includes `runner-config.yaml` which ensures that job containers spawned by the runner are placed on the `gitea` Docker network. This is critical - without it, job containers cannot resolve the `gitea:3000` hostname and will fail to clone repositories.

Start the runner service:

```bash
docker-compose up -d gitea_runner
```

Check the runner logs to ensure it connected successfully:

```bash
docker logs -f gitea_runner
```

You should see messages indicating the runner registered successfully. If you need to restart the runner after making changes:

```bash
docker-compose restart gitea_runner
```

## Step 5: Verify Runner Registration

1. Go back to http://localhost:3010/-/admin/actions/runners
2. You should see your runner listed with a green "Idle" status
3. The runner name should be "docker-runner"

## Step 6: Enable Actions on Your Repository

Actions must be enabled per repository:

1. Navigate to your repository in Gitea
2. Click **Settings** (top right)
3. In the left sidebar, look for **Actions** or scroll down to find Actions settings
4. Check the box for **"Enable Repository Actions"**
5. Click **Save**

## Step 7: Set Up Laforge User and Token

The agent workflow requires a "laforge" user account and personal access token to post status updates and commit changes to pull requests.

### Create the Laforge User

1. In Gitea, create a new user account named "laforge":
   - Go to Site Administration → User Accounts
   - Click **Create User Account**
   - Username: `laforge`
   - Email: `laforge@tomyedwab.com` (or your domain)
   - Password: (choose a secure password)
   - Click **Create User Account**

2. Add the laforge user as a collaborator to your repository:
   - Go to your repository → Settings → Collaborators
   - Add `laforge` with **Write** permissions

### Create Personal Access Token

1. Log in as the `laforge` user
2. Go to Settings → Applications → Generate New Token
3. Token Name: `Agent Workflow Token`
4. Select scopes:
   - `repo` (Full control of repositories)
   - `write:repository` (Read and write access)
5. Click **Generate Token**
6. **Copy the token** - you won't be able to see it again

### Add Repository Secret

1. Log out of the laforge account and log back in as your admin user
2. Go to your repository → Settings → Secrets
3. Click **Add Secret**
4. Name: `LAFORGE_TOKEN`
5. Value: (paste the personal access token you copied)
6. Click **Add Secret**

This token allows the workflow to:
- Post status updates as the "laforge" user (instead of "gitea-actions[bot]")
- Commit and push changes to pull request branches

## Step 8: Configure External Base URL

The workflow sends notifications via NTFY with clickable links to PRs and workflow runs. These links need to use your externally accessible Gitea URL (not the internal Docker service name).

### Add Repository Variable

1. Go to your repository → Settings → Variables
2. Click **Add Variable**
3. Name: `EXTERNAL_BASE_URL`
4. Value: Your external Gitea URL (e.g., `https://gitea.example.com` or `http://localhost:3010`)
5. Click **Add Variable**

**Important:** Do not include a trailing slash in the URL.

This variable is **required** - the workflow will fail with a clear error message if it is not set.

## Step 9: Push the Workflow Files

The workflow files are already created in `.gitea/workflows/`. You need to commit and push them to your Gitea repository:

```bash
# Initialize git if not already done
git init

# Add Gitea as remote (replace with your actual Gitea repo URL)
git remote add origin http://localhost:3010/your-username/your-repo.git

# Add and commit the workflow files
git add .gitea/
git add .gitignore
git add .env.example
git add docker-compose.yml
git commit -m "Add Gitea Actions configuration"

# Push to main/master branch
git push -u origin main  # or 'master' depending on your default branch
```

## Step 10: Test with a Pull Request

1. Create a new branch:
   ```bash
   git checkout -b test-pr
   ```

2. Make a small change (add a file or modify something):
   ```bash
   echo "# Test" > test.md
   git add test.md
   git commit -m "Test PR workflow"
   git push origin test-pr
   ```

3. Go to your repository in Gitea and create a Pull Request from `test-pr` to `main`

4. Navigate to the **Actions** tab in your repository to see the workflow running

5. The workflow should execute automatically and you'll see the results

## Troubleshooting

### Runner Not Appearing

If the runner doesn't appear in the admin panel:

```bash
# Check runner logs
docker logs gitea_runner

# Restart the runner
docker-compose restart gitea_runner
```

### Workflow Not Triggering

- Verify Actions are enabled in repository settings
- Check that workflow files are in `.gitea/workflows/` (not `.github/workflows/`)
- Ensure the workflow file has `.yaml` or `.yml` extension
- Verify the PR is targeting a branch listed in the workflow (main or master)

### Runner Shows as Offline

- Check Docker socket is accessible: `ls -la /var/run/docker.sock`
- Verify the runner container can reach Gitea: `docker-compose logs gitea_runner`
- Ensure the `GITEA_INSTANCE_URL` uses the internal Docker network address (`http://gitea:3000`)

### Job Fails to Clone Repository

If the workflow triggers but fails during the checkout step with network errors:

1. **Check the network configuration**: Verify that `runner-config.yaml` exists and is mounted in the container
2. **Verify the network name**: The config uses `laforge-2_gitea` (based on directory name). Check the actual network name:
   ```bash
   docker network ls | grep gitea
   ```
   If your network has a different name, update `runner-config.yaml` to match
3. **Restart the runner** after any config changes:
   ```bash
   docker-compose restart gitea_runner
   ```
4. **Check job container network**: When a job runs, inspect which network it's on:
   ```bash
   docker ps  # Find the job container
   docker inspect <container_id> | grep NetworkMode
   ```
   It should show `laforge-2_gitea` (or your network name)

## Customizing the Workflow

The workflow in `.gitea/workflows/pr-checks.yaml` is a basic template. Customize it for your project:

### For Node.js Projects

```yaml
- name: Set up Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'

- name: Install dependencies
  run: npm install

- name: Run tests
  run: npm test

- name: Run linter
  run: npm run lint
```

### For Python Projects

```yaml
- name: Set up Python
  uses: actions/setup-python@v4
  with:
    python-version: '3.11'

- name: Install dependencies
  run: |
    pip install -r requirements.txt

- name: Run tests
  run: pytest
```

### For Go Projects

```yaml
- name: Set up Go
  uses: actions/setup-go@v4
  with:
    go-version: '1.21'

- name: Run tests
  run: go test ./...
```

## Next Steps

- Customize the workflow for your specific project needs
- Add status badges to your README
- Set up branch protection rules that require Actions to pass
- Consider adding more workflows for different events (push, tag, schedule)

## Additional Resources

- Full documentation: See `gitea-actions.md`
- Gitea Actions docs: https://docs.gitea.com/usage/actions/quickstart
- Act Runner docs: https://docs.gitea.com/usage/actions/act-runner
