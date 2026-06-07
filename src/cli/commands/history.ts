import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { PersistenceManager } from "@/core/index.ts";
import type { HistoryEntry } from "@/types/index.ts";
import { success, error, info, header } from "@/utils/index.ts";
import { formatDistanceToNow } from "date-fns";

/**
 * Create history command
 */
export function createHistoryCommand(pm: PersistenceManager): Command {
  const history = new Command("history")
    .description("View provisioning history");

  history
    .argument("[server]", "Server name")
    .option("-l, --last <n>", "Show last N entries", parseInt)
    .option("-j, --json", "Output as JSON")
    .option("--clear", "Clear history for server")
    .action(async (serverName, options) => {
      // If no server specified, show servers with history
      if (!serverName) {
        const servers = pm.listServers();
        if (servers.length === 0) {
          info("No servers configured");
          return;
        }

        const selected = await p.select({
          message: "Select server",
          options: servers.map((s) => ({ value: s, label: s })),
        });

        if (p.isCancel(selected)) {
          return;
        }

        serverName = selected as string;
      }

      // Clear history
      if (options.clear) {
        const shouldClear = await p.confirm({
          message: `Clear history for "${serverName}"?`,
          initialValue: false,
        });

        if (shouldClear) {
          const cleared = pm.clearHistory(serverName);
          if (cleared) {
            success(`History cleared for "${serverName}"`);
          } else {
            info("No history to clear");
          }
        }
        return;
      }

      // Get history
      const entries = pm.getHistory(serverName, options.last || 10);

      if (entries.length === 0) {
        info(`No history for "${serverName}"`);
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      header(`History: ${serverName}`);

      for (const entry of entries) {
        const statusIcon = getStatusIcon(entry.status);
        const timeAgo = formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true });

        console.log(`  ${statusIcon} ${chalk.bold(entry.profile)} - ${timeAgo}`);
        console.log(`    Status: ${chalk.gray(entry.status)} | Changes: ${entry.changes} | Duration: ${formatDuration(entry.duration)}`);
        console.log();
      }
    });

  return history;
}

/**
 * Get status icon
 */
function getStatusIcon(status: HistoryEntry["status"]): string {
  switch (status) {
    case "success":
      return chalk.green("✓");
    case "failed":
      return chalk.red("✗");
    case "dry-run":
      return chalk.yellow("○");
    default:
      return chalk.gray("·");
  }
}

/**
 * Format duration
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
