/**
 * Gitea PR Fetcher for LLMs
 *
 * This script fetches pull request metadata, conversation comments, reviews,
 * and review comments from a Gitea repository and outputs them in a text format
 * (Markdown) suitable for consumption by Large Language Models.
 *
 * The script uses the Gitea API to fetch:
 * - PR metadata (title, author, description, etc.)
 * - Conversation comments (issue comments on the PR)
 * - Reviews (approve, request changes, comment)
 * - Review comments (inline code review comments)
 *
 * Output is written to pr.md
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

async function main() {
  const owner = process.env.GITEA_REPO_OWNER;
  const fullRepo = process.env.GITEA_REPO_NAME;
  const repo = fullRepo.split("/").pop(); // Extract just the repo name
  const prIndex = process.env.PR_INDEX;
  const apiBase = process.env.GITEA_API_URL;

  // Fetch PR data
  const pr = await fetchGiteaAPI(`/repos/${owner}/${repo}/pulls/${prIndex}`);
  const comments = await fetchGiteaAPI(
    `/repos/${owner}/${repo}/issues/${prIndex}/comments`,
  );
  const reviews = await fetchGiteaAPI(
    `/repos/${owner}/${repo}/pulls/${prIndex}/reviews`,
  );
  // Fetch review comments for each review
  const reviewsWithComments = await Promise.all(
    reviews.map(async (review) => {
      try {
        const comments = await fetchGiteaAPI(
          `/repos/${owner}/${repo}/pulls/${prIndex}/reviews/${review.id}/comments`,
        );
        return { ...review, comments: Array.isArray(comments) ? comments : [] };
      } catch (error) {
        console.log(
          `Could not fetch comments for review ${review.id}: ${error.message}`,
        );
        return { ...review, comments: [] };
      }
    }),
  );

  // Format as markdown
  let text = `# PR #${prIndex}: ${pr.title}\n\n`;
  text += `**Author:** ${pr.user.login}\n`;
  text += `**Created:** ${pr.created_at}\n\n`;
  text += `## PR Description\n${pr.body}\n\n`;

  text += `## Conversation Comments\n`;
  comments.forEach((c) => {
    text += `\n**${c.user.login}** (${c.created_at}):\n${c.body}\n`;
  });

  text += `\n## Reviews\n`;
  reviewsWithComments.forEach((r) => {
    text += `\n### ${r.user.login} - ${r.state} (${r.submitted_at})\n`;
    if (r.body) text += r.body + "\n";

    // Include review comments associated with this review
    if (r.comments && r.comments.length > 0) {
      text += `\n#### Review Comments:\n`;
      r.comments.forEach((c) => {
        text += `\n**${c.user.login}** on \`${c.path}\``;
        if (c.position || c.original_position) {
          text += ` (line ${c.position || c.original_position})`;
        }
        text += `:\n${c.body}\n`;
      });
    }
  });

  fs.writeFileSync("pr.md", text);
}

main();
