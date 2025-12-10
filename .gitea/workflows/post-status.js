/**
 * Post status from .pr/status.yaml (or fallback to .pr/status.md)
 *
 * This script reads .pr/status.yaml and:
 * - Posts the 'status' field as a PR comment
 * - Posts any 'file_comments' as line comments on specific files
 * - Unassigns laforge as assignee if 'unassign' is true
 *
 * Falls back to .pr/status.md for backwards compatibility.
 *
 * Required environment variables:
 * - GITEA_TOKEN: API token for authentication
 * - GITEA_API_URL: Base URL for the Gitea API
 * - GITEA_REPO_OWNER: Repository owner
 * - GITEA_REPO_NAME: Repository name
 * - PR_INDEX: Pull request number
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const yaml = require("js-yaml");

function makeApiRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITEA_TOKEN;
    const baseUrl = process.env.GITEA_API_URL;

    const url = new URL(baseUrl);
    const fullPath = url.pathname + path;

    console.log(`${method} ${baseUrl}${path}...`);

    const bodyStr = body ? JSON.stringify(body) : "";

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: fullPath,
      method: method,
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    };

    if (bodyStr) {
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }

    const protocol = url.protocol === "https:" ? https : http;
    const req = protocol.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : null);
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
    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

function postGiteaAPI(path, body) {
  return makeApiRequest(path, "POST", body);
}

function deleteGiteaAPI(path, body) {
  return makeApiRequest(path, "DELETE", body);
}

function patchGiteaAPI(path, body) {
  return makeApiRequest(path, "PATCH", body);
}

function getGiteaAPI(path) {
  return makeApiRequest(path, "GET", null);
}

async function main() {
  const yamlStatusFile = ".pr/status.yaml";
  const mdStatusFile = ".pr/status.md";

  const owner = process.env.GITEA_REPO_OWNER;
  const fullRepo = process.env.GITEA_REPO_NAME;
  const repo = fullRepo.split("/").pop(); // Extract just the repo name
  const prIndex = process.env.PR_INDEX;

  let statusData = null;
  let usingYaml = false;

  // Check for YAML file first (new format)
  if (fs.existsSync(yamlStatusFile)) {
    console.log("Found .pr/status.yaml, using structured format");
    const yamlContent = fs.readFileSync(yamlStatusFile, "utf8");
    try {
      statusData = yaml.load(yamlContent);
      // Ensure default values if not provided
      if (!statusData.file_comments) {
        statusData.file_comments = [];
      }
      if (!statusData.unassign) {
        statusData.unassign = false;
      }
      usingYaml = true;
    } catch (error) {
      console.error("Error parsing YAML:", error.message);
      throw error;
    }
  } else if (fs.existsSync(mdStatusFile)) {
    // Fallback to old markdown format
    console.log(
      "Found .pr/status.md (legacy format), consider migrating to status.yaml",
    );
    const mdContent = fs.readFileSync(mdStatusFile, "utf8");
    statusData = { status: mdContent, file_comments: [], unassign: false };
  } else {
    console.log("No status file found, skipping status post");
    return;
  }

  // Post status comment if present
  if (statusData.status) {
    await postGiteaAPI(`/repos/${owner}/${repo}/issues/${prIndex}/comments`, {
      body: statusData.status,
    });
    console.log("Status comment posted to PR");
  }

  // Post file comments if present
  if (statusData.file_comments && statusData.file_comments.length > 0) {
    console.log(
      `Processing ${statusData.file_comments.length} file comment(s)...`,
    );

    for (const fileComment of statusData.file_comments) {
      if (!fileComment.file || !fileComment.line || !fileComment.comment) {
        console.warn(
          "Skipping invalid file comment (missing file, line, or comment):",
          fileComment,
        );
        continue;
      }

      try {
        // Get the PR diff to find the correct position for the line comment
        const prData = await getGiteaAPI(
          `/repos/${owner}/${repo}/pulls/${prIndex}`,
        );
        const headSha = prData.head.sha;

        // Post as a review comment on the specific line
        // Note: Gitea uses 'new_position' for line numbers in the diff
        await postGiteaAPI(
          `/repos/${owner}/${repo}/pulls/${prIndex}/reviews`,
          {
            body: fileComment.comment,
            event: "COMMENT",
            comments: [
              {
                path: fileComment.file,
                body: fileComment.comment,
                new_position: parseInt(fileComment.line),
              },
            ],
          },
        );
        console.log(
          `Posted comment on ${fileComment.file}:${fileComment.line}`,
        );
      } catch (error) {
        console.error(
          `Failed to post comment on ${fileComment.file}:${fileComment.line}:`,
          error.message,
        );
        // Continue with other comments even if one fails
      }
    }
  }

  // Handle unassign if requested
  if (statusData.unassign) {
    try {
      await patchGiteaAPI(`/repos/${owner}/${repo}/issues/${prIndex}`, {
        assignees: [],
      });
      console.log("Unassigned laforge from PR");
    } catch (error) {
      console.error("Failed to unassign laforge:", error.message);
    }
  }

  console.log("Status processing completed successfully");
}

main().catch((error) => {
  console.error("Error posting status:", error);
  process.exit(1);
});
