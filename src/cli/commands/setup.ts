import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { PersistenceManager, AnsibleRunner, testSSHConnection } from "@/core/index.ts";
import type { ProfileComponents } from "@/types/index.ts";
import { success, error, info, warn, header, step } from "@/utils/index.ts";

/**
 * Create setup command
 */
export function createSetupCommand(pm: PersistenceManager): Command {
  const setup = new Command("setup")
    .description("Provision a server with Ansible");

  // Main setup command
  setup
    .argument("[server]", "Server name to provision")
    .option("-p, --profile <profile>", "Profile to use")
    .option("--dry-run", "Run in check mode (no changes)")
    .option("-t, --tags <tags>", "Comma-separated tags to run")
    .option("--skip-tags <tags>", "Comma-separated tags to skip")
    .option("-v, --verbose", "Verbose output")
    .option("--all", "Apply to all servers")
    .action(async (serverName, options) => {
      // Initialize if needed
      if (!pm.serverExists(serverName || "")) {
        if (!serverName) {
          // Interactive mode - select server
          const servers = pm.listServers();
          if (servers.length === 0) {
            error("No servers configured");
            info("Run 'vps-setup server add <name>' first");
            process.exit(1);
          }

          const selected = await p.select({
            message: "Select server",
            options: servers.map((s) => ({ value: s, label: s })),
          });

          if (p.isCancel(selected)) {
            info("Cancelled");
            return;
          }

          serverName = selected as string;
        }
      }

      if (options.all) {
        // Provision all servers
        await provisionAllServers(pm, options);
        return;
      }

      const server = pm.getServer(serverName);
      if (!server) {
        error(`Server "${serverName}" not found`);
        process.exit(1);
      }

      // Get or select profile
      let profileName = options.profile;
      if (!profileName) {
        const profiles = pm.listProfiles();
        if (profiles.length === 0) {
          error("No profiles configured");
          process.exit(1);
        }

        const config = pm.getConfig();
        const defaultProfile = config.defaultProfile || profiles[0];

        const selectedProfile = await p.select({
          message: "Select profile",
          options: profiles.map((pr) => ({
            value: pr,
            label: pr,
            hint: pr === defaultProfile ? "(default)" : undefined,
          })),
          initialValue: defaultProfile,
        });

        if (p.isCancel(selectedProfile)) {
          info("Cancelled");
          return;
        }

        profileName = selectedProfile as string;
      }

      const profile = pm.getProfile(profileName);
      if (!profile) {
        error(`Profile "${profileName}" not found`);
        process.exit(1);
      }

      // Confirm components
      if (!options.tags) {
        const confirmed = await confirmComponents(profile.components);
        if (!confirmed) {
          info("Cancelled");
          return;
        }
      }

      // Run provisioning
      await provisionServer(pm, serverName, profileName, options);
    });

  return setup;
}

/**
 * Confirm components with user
 */
async function confirmComponents(components: ProfileComponents): Promise<boolean> {
  const enabledComponents = Object.entries(components)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);

  if (enabledComponents.length === 0) {
    error("No components selected");
    return false;
  }

  console.log();
  console.log(chalk.bold("Components to install:"));
  for (const comp of enabledComponents) {
    console.log(`  ${chalk.green("✓")} ${comp}`);
  }
  console.log();

  return p.confirm({
    message: "Proceed with provisioning?",
    initialValue: true,
  });
}

/**
 * Provision a single server
 */
async function provisionServer(
  pm: PersistenceManager,
  serverName: string,
  profileName: string,
  options: { dryRun?: boolean; verbose?: boolean; tags?: string; skipTags?: string }
): Promise<void> {
  const server = pm.getServer(serverName);
  const profile = pm.getProfile(profileName);

  if (!server || !profile) {
    error("Server or profile not found");
    process.exit(1);
  }

  header(`Provisioning: ${serverName}`);

  // Check Ansible
  const ansibleInstalled = await AnsibleRunner.checkAnsibleInstalled();
  if (!ansibleInstalled) {
    error("ansible-playbook not found in PATH");
    info("Install Ansible: pip install ansible");
    process.exit(1);
  }

  // Get config
  const config = pm.getConfig();

  // Create runner
  const runner = new AnsibleRunner(config.ansiblePath);

  // Check playbook exists
  if (!runner.checkAnsiblePath()) {
    error(`Playbook not found at ${config.ansiblePath}/playbooks/provision.yml`);
    info("Check the ansiblePath configuration");
    process.exit(1);
  }

  // Test SSH connection first
  const spinner = p.spinner();
  spinner.start("Testing SSH connection...");

  const testResult = await testSSHConnection(server);

  if (!testResult.success) {
    spinner.stop("SSH connection failed");
    error(testResult.error || "Unknown error");
    process.exit(1);
  }

  spinner.stop(`SSH OK (${testResult.os} ${testResult.version})`);

  // Parse tags
  const tags = options.tags ? options.tags.split(",").map((t: string) => t.trim()) : undefined;
  const skipTags = options.skipTags ? options.skipTags.split(",").map((t: string) => t.trim()) : undefined;

  // Run ansible
  console.log();
  if (options.dryRun) {
    warn("Running in DRY-RUN mode (no changes will be made)");
  }

  const runSpinner = p.spinner();
  runSpinner.start("Running ansible-playbook...");

  const startTime = Date.now();

  try {
    const result = await runner.run(server, profile, {
      tags,
      skipTags,
      check: options.dryRun,
      verbose: options.verbose,
    });

    const duration = Math.round((Date.now() - startTime) / 1000);

    if (result.success) {
      runSpinner.stop("Provisioning complete");

      console.log();
      console.log(chalk.green("  ✓ Success!"));
      console.log(`  Changed: ${result.changed} tasks`);
      console.log(`  Duration: ${formatDuration(duration)}`);
      console.log();

      // Update server lastProvisioned (skip for dry-run)
      if (!options.dryRun) {
        pm.saveServer({
          ...server,
          lastProvisioned: new Date().toISOString(),
        });
      }

      // Save history
      pm.appendHistory(serverName, {
        timestamp: new Date().toISOString(),
        server: serverName,
        profile: profileName,
        status: options.dryRun ? "dry-run" : "success",
        duration,
        changes: result.changed,
      });

      success(`Log saved: ~/.config/vps-setup/history/${serverName}.log`);
    } else {
      runSpinner.stop("Provisioning failed");

      console.log();
      console.log(chalk.red("  ✗ Failed!"));
      console.log(`  Failed tasks: ${result.failed}`);
      console.log(`  Unreachable: ${result.unreachable}`);
      console.log();

      if (result.error) {
        error(result.error);
      }

      // Save history
      pm.appendHistory(serverName, {
        timestamp: new Date().toISOString(),
        server: serverName,
        profile: profileName,
        status: "failed",
        duration,
        changes: result.changed,
        output: result.output.slice(0, 10000), // Truncate
      });

      process.exit(1);
    }
  } catch (err) {
    runSpinner.stop("Error");
    error(`Provisioning error: ${err}`);
    process.exit(1);
  }
}

/**
 * Provision all servers
 */
async function provisionAllServers(
  pm: PersistenceManager,
  options: { dryRun?: boolean; verbose?: boolean; tags?: string; skipTags?: string; profile?: string }
): Promise<void> {
  const servers = pm.listServers();

  if (servers.length === 0) {
    error("No servers configured");
    process.exit(1);
  }

  if (!options.profile) {
    error("--profile is required when using --all");
    process.exit(1);
  }

  const profile = pm.getProfile(options.profile);
  if (!profile) {
    error(`Profile "${options.profile}" not found`);
    process.exit(1);
  }

  header(`Provisioning ${servers.length} servers`);

  const results: { server: string; success: boolean; duration: number }[] = [];

  for (let i = 0; i < servers.length; i++) {
    const serverName = servers[i];
    step(i + 1, servers.length, `Provisioning ${serverName}...`);

    try {
      const server = pm.getServer(serverName);
      if (!server) continue;

      const config = pm.getConfig();
      const runner = new AnsibleRunner(config.ansiblePath);

      const startTime = Date.now();
      const result = await runner.run(server, profile, {
        tags: options.tags?.split(",").map((t: string) => t.trim()),
        skipTags: options.skipTags?.split(",").map((t: string) => t.trim()),
        check: options.dryRun,
        verbose: options.verbose,
      });

      results.push({
        server: serverName,
        success: result.success,
        duration: Math.round((Date.now() - startTime) / 1000),
      });

      // Update server
      if (result.success) {
        pm.saveServer({
          ...server,
          lastProvisioned: new Date().toISOString(),
        });
      }

      // Save history
      pm.appendHistory(serverName, {
        timestamp: new Date().toISOString(),
        server: serverName,
        profile: options.profile,
        status: result.success ? "success" : "failed",
        duration: results[results.length - 1].duration,
        changes: result.changed,
      });
    } catch (err) {
      results.push({
        server: serverName,
        success: false,
        duration: 0,
      });
    }
  }

  // Summary
  console.log();
  header("Summary");

  for (const r of results) {
    const icon = r.success ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${icon} ${r.server} (${formatDuration(r.duration)})`);
  }

  const successCount = results.filter((r) => r.success).length;
  console.log();
  console.log(`  Total: ${successCount}/${results.length} succeeded`);
}

/**
 * Format duration in seconds to human readable
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export { provisionServer };
