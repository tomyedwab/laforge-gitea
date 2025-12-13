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
const https = require("https");
const fs = require("fs");
const path = require("path");

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

async function downloadAttachment(attachmentUrl, localPath) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITEA_TOKEN;
    const baseUrl = process.env.GITEA_API_URL;

    // Parse base URL to get the host info
    const apiUrl = new URL(baseUrl);

    // Construct full attachment URL
    // The attachmentUrl from comments is relative (e.g., /attachments/xxx)
    const fullUrl = `${apiUrl.protocol}//${apiUrl.hostname}:${apiUrl.port}${attachmentUrl}`;

    console.log(`Downloading attachment from ${fullUrl} to ${localPath}...`);

    const url = new URL(fullUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "GET",
      headers: {
        Authorization: `token ${token}`,
      },
    };

    const req = protocol.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download attachment: ${res.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(localPath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(localPath, () => {}); // Clean up partial file
        reject(err);
      });
    });

    req.on("error", reject);
    req.end();
  });
}

function extractAttachments(text) {
  // Match markdown image syntax: ![alt](url)
  const attachmentRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const attachments = [];
  let match;

  while ((match = attachmentRegex.exec(text)) !== null) {
    const altText = match[1];
    const url = match[2];

    // Check if this is an attachment URL (starts with /attachments/)
    if (url.startsWith('/attachments/')) {
      attachments.push({
        altText,
        url,
        filename: altText || path.basename(url),
      });
    }
  }

  return attachments;
}

async function processAttachments(text, attachmentsDir) {
  const attachments = extractAttachments(text);

  if (attachments.length === 0) {
    return text;
  }

  // Create attachments directory if it doesn't exist
  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }

  let processedText = text;

  for (const attachment of attachments) {
    try {
      const localPath = path.join(attachmentsDir, attachment.filename);
      await downloadAttachment(attachment.url, localPath);

      // Rewrite the markdown link to point to the local file
      const localUrl = `.pr/attachments/${attachment.filename}`;
      const oldLink = `![${attachment.altText}](${attachment.url})`;
      const newLink = `![${attachment.altText}](${localUrl})`;
      processedText = processedText.replace(oldLink, newLink);

      console.log(`Downloaded and relinked: ${attachment.filename}`);
    } catch (error) {
      console.error(`Failed to download attachment ${attachment.filename}: ${error.message}`);
    }
  }

  return processedText;
}

async function main() {
  const owner = process.env.GITEA_REPO_OWNER;
  const fullRepo = process.env.GITEA_REPO_NAME;
  const repo = fullRepo.split("/").pop(); // Extract just the repo name
  const prIndex = process.env.PR_INDEX;
  const apiBase = process.env.GITEA_API_URL;
  const attachmentsDir = ".pr/attachments";

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
  text += "**Branch:** ${pr.head.ref}\n";
  text += `**Created:** ${pr.created_at}\n\n`;

  // Process PR description for attachments
  const processedPrBody = await processAttachments(pr.body || "", attachmentsDir);
  text += `## PR Description\n${processedPrBody}\n\n`;

  text += `## Conversation Comments\n`;
  for (const c of comments) {
    const processedBody = await processAttachments(c.body, attachmentsDir);
    text += `\n**${c.user.login}** (${c.created_at}):\n${processedBody}\n`;
  }

  text += `\n## Reviews\n`;
  for (const r of reviewsWithComments) {
    text += `\n### ${r.user.login} - ${r.state} (${r.submitted_at})\n`;
    if (r.body) {
      const processedBody = await processAttachments(r.body, attachmentsDir);
      text += processedBody + "\n";
    }

    // Include review comments associated with this review
    if (r.comments && r.comments.length > 0) {
      text += `\n#### Review Comments:\n`;
      for (const c of r.comments) {
        text += `\n**${c.user.login}** on \`${c.path}\``;
        if (c.position || c.original_position) {
          text += ` (line ${c.position || c.original_position})`;
        }
        const processedBody = await processAttachments(c.body, attachmentsDir);
        text += `:\n${processedBody}\n`;
      }
    }
  }

  fs.writeFileSync(".pr/history.md", text);
}

main();
