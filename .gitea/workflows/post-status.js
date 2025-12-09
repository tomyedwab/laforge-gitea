/**
 * Post status.md as PR comment
 *
 * This script checks if .pr/status.md exists and posts its contents
 * as a comment on the pull request.
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

function postGiteaAPI(path, body) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITEA_TOKEN;
    const baseUrl = process.env.GITEA_API_URL;

    const url = new URL(baseUrl);
    const fullPath = url.pathname + path;

    console.log(`Posting to ${baseUrl}${path}...`);

    const bodyStr = JSON.stringify(body);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: fullPath,
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(
            new Error(
              `HTTP ${res.statusCode}: ${data}`,
            ),
          );
        }
      });
    });

    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

async function main() {
  const statusFile = ".pr/status.md";

  // Check if status.md exists
  if (!fs.existsSync(statusFile)) {
    console.log("No .pr/status.md file found, skipping status post");
    return;
  }

  const owner = process.env.GITEA_REPO_OWNER;
  const fullRepo = process.env.GITEA_REPO_NAME;
  const repo = fullRepo.split("/").pop(); // Extract just the repo name
  const prIndex = process.env.PR_INDEX;

  // Read the status file
  const statusContent = fs.readFileSync(statusFile, "utf8");

  // Post as a comment
  await postGiteaAPI(`/repos/${owner}/${repo}/issues/${prIndex}/comments`, {
    body: statusContent,
  });

  console.log("Status posted to PR successfully");
}

main().catch((error) => {
  console.error("Error posting status:", error);
  process.exit(1);
});
