#!/usr/bin/env node

/**
 * Claude Code Output Formatter
 *
 * Reads Claude Code JSON stream from stdin and outputs formatted markdown to stdout.
 * Based on the Go implementation in .pr/output_formatter.go
 */

const readline = require('readline');

// Format tool parameters compactly
function formatToolParams(input) {
  if (!input || Object.keys(input).length === 0) {
    return '';
  }

  // Common parameter names to extract (in order of preference)
  const keyParams = ['command', 'file_path', 'pattern', 'path', 'message', 'query', 'description'];

  for (const key of keyParams) {
    if (input[key] !== undefined) {
      let valStr = String(input[key]);
      // Truncate if too long
      if (valStr.length > 60) {
        valStr = valStr.substring(0, 57) + '...';
      }
      return valStr;
    }
  }

  // If no key params found, just show count
  return `${Object.keys(input).length} params`;
}

// State tracking
let sessionInfo = null;
let messageCount = 0;

// Create readline interface for streaming stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Process each line as it arrives
rl.on('line', (line) => {
  line = line.trim();
  if (!line) {
    return;
  }

  let msg;
  try {
    msg = JSON.parse(line);
  } catch (err) {
    // Not valid JSON, output as-is
    console.log(line);
    return;
  }

  // Process different message types
  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') {
        sessionInfo = msg;
        // Compact header
        console.log(`# Claude Code (${msg.model})`);
        console.log(`\`${msg.cwd}\` • Session: \`${msg.session_id}\``);
        console.log();
      }
      break;

    case 'assistant':
      messageCount++;
      if (msg.message) {
        try {
          const assistantMsg = typeof msg.message === 'string'
            ? JSON.parse(msg.message)
            : msg.message;

          // Process content items - more compact format
          if (assistantMsg.content && Array.isArray(assistantMsg.content)) {
            for (let i = 0; i < assistantMsg.content.length; i++) {
              const content = assistantMsg.content[i];
              const contentType = content.type;

              switch (contentType) {
                case 'text':
                  if (content.text) {
                    // Only add newline between items, not before first
                    if (i > 0) {
                      console.log();
                    }
                    console.log(content.text);
                  }
                  break;

                case 'tool_use':
                  const toolName = content.name;
                  const toolInput = content.input || {};

                  // Compact one-line format for tool use
                  if (i > 0) {
                    console.log();
                  }

                  // Format tool input compactly - extract key parameters
                  const paramStr = formatToolParams(toolInput);
                  if (paramStr) {
                    console.log(`> ${toolName} (${paramStr})`);
                  } else {
                    console.log(`> ${toolName}`);
                  }
                  break;
              }
            }
            console.log();
          }
        } catch (err) {
          // Failed to parse assistant message, skip
        }
      }
      break;

    case 'user':
      // User messages contain tool results - show them (with length limits)
      if (msg.message) {
        try {
          const userMsg = typeof msg.message === 'string'
            ? JSON.parse(msg.message)
            : msg.message;

          if (userMsg.content && Array.isArray(userMsg.content)) {
            for (const item of userMsg.content) {
              // Check if this is an error result
              if (item.is_error) {
                if (item.content) {
                  // Extract error message if it's wrapped in XML tags
                  let errorMsg = item.content;
                  const startTag = '<tool_use_error>';
                  const endTag = '</tool_use_error>';
                  const start = item.content.indexOf(startTag);
                  const end = item.content.indexOf(endTag);
                  if (start >= 0 && end > start) {
                    errorMsg = item.content.substring(start + startTag.length, end);
                  }
                  console.log(`⚠️  Tool error: ${errorMsg}`);
                  console.log();
                }
              } else if (item.content) {
                // Non-error result - show if not too long
                const lines = item.content.split('\n');
                if (lines.length <= 100) {
                  console.log('**Tool result:**');
                  console.log('```');
                  console.log(item.content);
                  console.log('```');
                  console.log();
                } else {
                  // Truncate long results
                  const firstLines = lines.slice(0, 50).join('\n');
                  const lastLines = lines.slice(-50).join('\n');
                  const truncatedCount = lines.length - 100;
                  const truncated = `${firstLines}\n\n... [${truncatedCount} lines truncated] ...\n\n${lastLines}`;
                  console.log(`**Tool result** _(truncated, ${lines.length} lines total)_:`);
                  console.log('```');
                  console.log(truncated);
                  console.log('```');
                  console.log();
                }
              }
            }
          }
        } catch (err) {
          // Failed to parse user message, skip
        }
      }
      break;

    case 'result':
      if (msg.subtype === 'success' || !msg.subtype) {
        // Compact summary on one or two lines
        const summaryParts = [];

        if (!msg.is_error) {
          summaryParts.push('✅ Success');
        } else {
          summaryParts.push('❌ Error');
        }

        if (msg.num_turns > 0) {
          summaryParts.push(`${msg.num_turns} turns`);
        }

        if (msg.duration_ms > 0) {
          summaryParts.push(`${(msg.duration_ms / 1000).toFixed(1)}s`);
        }

        if (msg.total_cost_usd > 0) {
          summaryParts.push(`$${msg.total_cost_usd.toFixed(4)}`);
        }

        console.log('---');
        console.log(summaryParts.join(' • '));

        // Show result text if present
        if (msg.result) {
          console.log();
          console.log(msg.result);
        }
      }
      break;
  }
});

rl.on('close', () => {
  // Stream ended
  process.exit(0);
});
