import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { PersistenceManager } from "@/core/index.ts";
import { success, error, info, header } from "@/utils/index.ts";

/**
 * Create config command
 */
export function createConfigCommand(pm: PersistenceManager): Command {
  const config = new Command("config")
    .description("Manage global configuration");

  // config show
  config
    .command("show")
    .description("Show global configuration")
    .option("-j, --json", "Output as JSON")
    .action((options) => {
      const cfg = pm.getConfig();

      if (options.json) {
        console.log(JSON.stringify(cfg, null, 2));
        return;
      }

      header("Global Configuration");

      console.log(`  ${chalk.bold("Config Dir:")}\t${pm.getConfigDir()}`);
      console.log(`  ${chalk.bold("Version:")}\t\t${cfg.version}`);
      console.log(`  ${chalk.bold("Ansible Path:")}\t${cfg.ansiblePath}`);

      if (cfg.defaultProfile) {
        console.log(`  ${chalk.bold("Default Profile:")}\t${cfg.defaultProfile}`);
      }

      if (cfg.logLevel) {
        console.log(`  ${chalk.bold("Log Level:")}\t\t${cfg.logLevel}`);
      }

      if (cfg.historyRetentionDays !== undefined) {
        console.log(`  ${chalk.bold("History Retention:")}\t${cfg.historyRetentionDays} days`);
      }

      console.log();
    });

  // config set
  config
    .command("set <key> <value>")
    .description("Set a configuration value")
    .action((key, value) => {
      const validKeys = ["ansiblePath", "defaultProfile", "logLevel", "historyRetentionDays"];

      if (!validKeys.includes(key)) {
        error(`Invalid config key: ${key}`);
        info(`Valid keys: ${validKeys.join(", ")}`);
        process.exit(1);
      }

      // Parse value
      let parsedValue: unknown = value;

      if (key === "historyRetentionDays") {
        parsedValue = parseInt(value, 10);
        if (Number.isNaN(parsedValue)) {
          error("historyRetentionDays must be a number");
          process.exit(1);
        }
      }

      try {
        pm.updateConfig({ [key]: parsedValue });
        success(`Set ${key} = ${JSON.stringify(parsedValue)}`);
      } catch (err) {
        error(`Failed to update config: ${err}`);
        process.exit(1);
      }
    });

  return config;
}

/**
 * Create init command
 */
export function createInitCommand(pm: PersistenceManager): Command {
  return new Command("init")
    .description("Initialize VPS Setup configuration")
    .option("--config-dir <path>", "Custom config directory")
    .action((options) => {
      header("Initializing VPS Setup");

      try {
        pm.initialize();

        success("Created ~/.config/vps-setup/");
        success("Created default profiles (full-stack, minimal, security-only)");
        success("Configuration initialized");

        console.log();
        info("Next steps:");
        console.log("  1. Add a server: vps-setup server add <name>");
        console.log("  2. Create a profile: vps-setup profile create <name>");
        console.log("  3. Provision: vps-setup setup <server> --profile <profile>");
        console.log();

        p.outro(chalk.green("Ready to go!"));
      } catch (err) {
        error(`Initialization failed: ${err}`);
        process.exit(1);
      }
    });
}
