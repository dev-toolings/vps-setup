import { Command } from "commander";
import chalk from "chalk";
import * as prompts from "@clack/prompts";
import { existsSync, rmSync } from "fs";
import { resolve } from "path";

export function isSafeVpsSetupBinaryPath(binaryPath: string): boolean {
  const binaryName = binaryPath.split(/[\\/]/).pop()?.toLowerCase() || "";
  return /^vps-setup(?:-.+)?(?:\.exe)?$/.test(binaryName);
}

export function createUninstallCommand(): Command {
  return new Command("uninstall")
    .description("Uninstall vps-setup from this machine")
    .option("-y, --yes", "Skip confirmation prompts")
    .action(async (options) => {
      const binaryPath = process.execPath;
      const configDir =
        process.env.VPS_SETUP_CONFIG_DIR ||
        resolve(process.env.HOME || "~", ".config", "vps-setup");

      console.log();
      console.log(chalk.bold("Uninstalling vps-setup"));
      console.log();
      console.log(`  Binary:  ${binaryPath}`);
      console.log(`  Config:  ${configDir}`);
      console.log();

      if (!options.yes) {
        const confirm = await prompts.confirm({
          message: "Remove the vps-setup binary?",
        });

        if (prompts.isCancel(confirm) || !confirm) {
          console.log(chalk.gray("Cancelled."));
          return;
        }
      }

      if (!isSafeVpsSetupBinaryPath(binaryPath)) {
        console.log(
          chalk.yellow(
            `⚠ Refusing to remove ${binaryPath} because it does not look like a vps-setup binary`
          )
        );
      } else {
        try {
          rmSync(binaryPath, { force: true });
          console.log(chalk.green(`✓ Removed ${binaryPath}`));
        } catch {
          console.log(
            chalk.yellow(
              `⚠ Could not remove ${binaryPath} — remove it manually`
            )
          );
        }
      }

      // Ask about config
      if (existsSync(configDir)) {
        let removeConfig = options.yes;

        if (!removeConfig) {
          const confirm = await prompts.confirm({
            message:
              "Remove config and data (~/.config/vps-setup)? This deletes servers, profiles, and history.",
          });

          removeConfig = !prompts.isCancel(confirm) && confirm;
        }

        if (removeConfig) {
          rmSync(configDir, { recursive: true, force: true });
          console.log(chalk.green(`✓ Removed ${configDir}`));
        } else {
          console.log(chalk.gray(`Kept ${configDir}`));
        }
      }

      console.log();
      console.log(chalk.green("✓ vps-setup uninstalled"));
      console.log();
    });
}
