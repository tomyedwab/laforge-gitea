/**
 * Agent Command Parser for Laforge PR Workflow
 *
 * This script parses PR comments to detect agent selection commands:
 * - `/agent <name>` - Sets the primary agent for all subsequent runs
 * - `/critique <name>` - Triggers one-time review run without changing primary agent
 *
 * The script:
 * 1. Fetches the latest PR comment
 * 2. Parses for agent commands
 * 3. Validates agent names against registry
 * 4. Updates or reads `.pr/agent-config.json` for state management
 * 5. Outputs environment variables for the workflow to consume
 *
 * Required environment variables:
 * - GITEA_TOKEN: API token for authentication
 * - GITEA_API_URL: Base URL for the Gitea API
 * - GITEA_REPO_OWNER: Repository owner
 * - GITEA_REPO_NAME: Repository name
 * - PR_INDEX: Pull request number
 */

const http = require("http");
const fs = require("fs");

// Agent registry: maps short names to full model IDs
const AGENT_REGISTRY = {
  sonnet: "claude-sonnet-4-5-20250929",
  opus: "claude-opus-4-5-20251101",
  haiku: "claude-haiku-4-5-20251001",
};

const DEFAULT_AGENT = "sonnet";

// Path to agent config file (state management)
const AGENT_CONFIG_PATH = ".pr/agent-config.json";

async function fetchGiteaAPI(path) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITEA_TOKEN;
    const baseUrl = process.env.GITEA_API_URL;

    const url = new URL(baseUrl);
    const fullPath = url.pathname + path;

    console.log(`Fetching ${baseUrl}${path}...`);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: fullPath,
      method: "GET",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve(JSON.parse(data)));
    });

    req.on("error", reject);
    req.end();
  });
}

function readAgentConfig() {
  try {
    if (fs.existsSync(AGENT_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(AGENT_CONFIG_PATH, "utf8"));
      return config;
    }
  } catch (error) {
    console.log(`Error reading agent config: ${error.message}`);
  }

  // Return default config if file doesn't exist or can't be read
  return {
    primary_agent: DEFAULT_AGENT,
    last_updated: new Date().toISOString(),
    updated_by: "system",
  };
}

function writeAgentConfig(config) {
  try {
    fs.writeFileSync(AGENT_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`Updated agent config: ${config.primary_agent}`);
  } catch (error) {
    console.log(`Error writing agent config: ${error.message}`);
  }
}

function parseAgentCommand(commentBody) {
  // Match /agent <name> or /critique <name> commands
  // Commands can appear anywhere in the comment
  const agentMatch = commentBody.match(/\/agent\s+(\w+)/);
  const critiqueMatch = commentBody.match(/\/critique\s+(\w+)/);

  if (critiqueMatch) {
    return {
      type: "critique",
      agent: critiqueMatch[1],
    };
  }

  if (agentMatch) {
    return {
      type: "agent",
      agent: agentMatch[1],
    };
  }

  return null;
}

function setOutput(name, value) {
  // GitHub Actions compatible output format
  console.log(`::set-output name=${name}::${value}`);

  // Also set as environment variable for subsequent steps
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT || "/dev/null",
    `${name}=${value}\n`,
  );
}

async function main() {
  const owner = process.env.GITEA_REPO_OWNER;
  const fullRepo = process.env.GITEA_REPO_NAME;
  const repo = fullRepo.split("/").pop();
  const prIndex = process.env.PR_INDEX;

  console.log(`Parsing agent command for PR #${prIndex}...`);

  // Read current agent config
  const config = readAgentConfig();
  console.log(`Current primary agent: ${config.primary_agent}`);

  // Default output values (use current primary agent)
  let agentMode = "primary";
  let agentName = config.primary_agent;
  let modelId = AGENT_REGISTRY[agentName] || AGENT_REGISTRY[DEFAULT_AGENT];

  try {
    // Fetch the latest comments to check for agent commands
    const comments = await fetchGiteaAPI(
      `/repos/${owner}/${repo}/issues/${prIndex}/comments`,
    );

    // Process comments in reverse order (newest first) to find the latest command
    for (let i = comments.length - 1; i >= 0; i--) {
      const comment = comments[i];
      const command = parseAgentCommand(comment.body);

      if (command) {
        console.log(`Found command: /${command.type} ${command.agent}`);

        // Validate agent name
        if (!AGENT_REGISTRY[command.agent]) {
          const validAgents = Object.keys(AGENT_REGISTRY).join(", ");
          console.log(
            `ERROR: Invalid agent name '${command.agent}'. Valid options: ${validAgents}`,
          );

          // Set outputs to use default agent and continue
          agentName = config.primary_agent;
          modelId = AGENT_REGISTRY[agentName];
          break;
        }

        // Set agent based on command type
        agentName = command.agent;
        modelId = AGENT_REGISTRY[agentName];

        if (command.type === "agent") {
          // Update config for primary agent switch
          agentMode = "primary";
          config.primary_agent = agentName;
          config.last_updated = new Date().toISOString();
          config.updated_by = comment.user.login;
          writeAgentConfig(config);
        } else if (command.type === "critique") {
          // One-time critique mode (don't update config)
          agentMode = "critique";
        }

        break; // Use the most recent command
      }
    }
  } catch (error) {
    console.log(`Error fetching comments: ${error.message}`);
    console.log("Using current primary agent from config");
  }

  // Set outputs for workflow
  console.log(`Agent mode: ${agentMode}`);
  console.log(`Agent name: ${agentName}`);
  console.log(`Model ID: ${modelId}`);

  setOutput("agent_mode", agentMode);
  setOutput("agent_name", agentName);
  setOutput("model_id", modelId);
}

main().catch((error) => {
  console.error("Fatal error:", error);

  // Fall back to default agent on error
  const defaultModelId = AGENT_REGISTRY[DEFAULT_AGENT];
  setOutput("agent_mode", "primary");
  setOutput("agent_name", DEFAULT_AGENT);
  setOutput("model_id", defaultModelId);

  process.exit(0); // Exit successfully to allow workflow to continue with defaults
});
