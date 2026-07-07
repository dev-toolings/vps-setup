#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import { PersistenceManager } from "@/core/index.ts";
import {
  createServerCommands,
  createProfileCommands,
  createSetupCommand,
  createHistoryCommand,
  createConfigCommand,
  createInitCommand,
  createUninstallCommand,
  createRebuildCommand,
} from "@/cli/commands/index.ts";
import { runInteractiveMenu } from "@/cli/menu/interactive.ts";
import { setLogLevel, info } from "@/utils/index.ts";

const VERSION = "1.4.0";

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name("vps-setup")
    .description("CLI for VPS provisioning with Ansible")
    .version(VERSION)
    .option("-d, --debug", "Enable debug logging")
    .option("-c, --config-dir <path>", "Custom config directory")
    .hook("preAction", (thisCommand) => {
      const options = thisCommand.opts();

      // Set log level
      if (options.debug) {
        setLogLevel("debug");
      }

      // Set custom config dir
      if (options.configDir) {
        pm.setConfigDir(options.configDir);
      }
    });

  // Get config directory
  const configDir = process.env.VPS_SETUP_CONFIG_DIR || undefined;

  // Create persistence manager
  const pm = new PersistenceManager(configDir);

  // Register commands
  program.addCommand(createInitCommand(pm));
  program.addCommand(createServerCommands(pm));
  program.addCommand(createProfileCommands(pm));
  program.addCommand(createSetupCommand(pm));
  program.addCommand(createHistoryCommand(pm));
  program.addCommand(createConfigCommand(pm));
  program.addCommand(createRebuildCommand(pm));
  program.addCommand(createUninstallCommand());

  // Add status command (quick status check)
  program
    .command("status <server>")
    .description("Check server status (SSH + services)")
    .action(async (serverName) => {
      const server = pm.getServer(serverName);

      if (!server) {
        console.log(chalk.red(`Server "${serverName}" not found`));
        process.exit(1);
      }

      console.log();
      console.log(chalk.bold(`Server: ${serverName}`));
      console.log(`  Host: ${server.host}`);
      console.log(`  User: ${server.user}`);
      console.log(`  Port: ${server.port || 22}`);
      console.log();

      // Check SSH connection (quick)
      const { testSSHConnection } = await import("@/core/ssh.ts");
      const result = await testSSHConnection(server);

      if (result.success) {
        console.log(chalk.green("  ✓ SSH: Connected"));
        console.log(`    OS: ${result.os} ${result.version}`);
        console.log(`    Latency: ${result.duration}ms`);
      } else {
        console.log(chalk.red("  ✗ SSH: Failed"));
        console.log(`    Error: ${result.error}`);
      }

      console.log();

      if (server.lastProvisioned) {
        const lastRun = new Date(server.lastProvisioned);
        console.log(`  Last provisioned: ${lastRun.toLocaleString()}`);
      } else {
        console.log(chalk.gray("  Never provisioned"));
      }

      console.log();
    });

  // Interactive mode (no command)
  program.action(async () => {
    // Check if any args were passed
    if (process.argv.length > 2) {
      program.outputHelp();
      return;
    }

    // Run interactive menu
    await runInteractiveMenu(pm);
  });

  // Parse and execute
  await program.parseAsync();
}

// Run main
main().catch((err) => {
  console.error(chalk.red("Error:"), err.message);
  process.exit(1);
});
