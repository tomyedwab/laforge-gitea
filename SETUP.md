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

Start the runner service:

```bash
docker-compose up -d gitea_runner
```

Check the runner logs to ensure it connected successfully:

```bash
docker logs -f gitea_runner
```

You should see messages indicating the runner registered successfully.

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

## Step 7: Push the Workflow Files

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

## Step 8: Test with a Pull Request

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
