import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { execa } from "execa";
import { AnsibleRunner, PersistenceManager, testSSHConnection } from "@/core/index.ts";
import type { Profile, Server } from "@/types/index.ts";
import { success, error, info, header, parseYaml, toYaml } from "@/utils/index.ts";

function createTemporaryServer(host: string, user: string, port?: number, sshKey?: string): Server {
  return {
    name: "rebuild-target",
    host,
    user,
    port,
    sshKey,
    os: "auto",
    createdAt: new Date().toISOString(),
  };
}

function buildBundleProfile(profile: Profile): Profile {
  return {
    ...profile,
    overrides: {
      target_mode: "vps",
      stack_mode: profile.overrides?.stack_mode || (profile.components.docker ? "docker" : "bare_metal"),
      database: {
        postgresql_version: "latest",
        docker_cidrs: ["172.17.0.0/16"],
        apps: [],
      },
      users: {
        deploy_user: "deploy",
        app_users: [],
      },
      rebuild: {
        vault_file: "vault.yml",
      },
      ...profile.overrides,
    },
  };
}

export function createRebuildCommand(pm: PersistenceManager): Command {
  const rebuild = new Command("rebuild")
    .description("Export and replay rebuildable VPS configuration");

  rebuild
    .command("export <dir>")
    .description("Export an Ansible rebuild bundle")
    .option("-p, --profile <profile>", "Profile to export", "vps-docker")
    .action((dir, options) => {
      const profile = pm.getProfile(options.profile);
      if (!profile) {
        error(`Profile "${options.profile}" not found`);
        process.exit(1);
      }

      const outDir = resolve(dir);
      const ansibleDir = join(outDir, "ansible");
      const inventoryDir = join(ansibleDir, "inventory");
      const groupVarsDir = join(inventoryDir, "group_vars", "all");

      mkdirSync(groupVarsDir, { recursive: true });

      const bundleProfile = buildBundleProfile(profile);
      writeFileSync(join(outDir, "profile.yml"), toYaml(bundleProfile), "utf-8");
      writeFileSync(
        join(inventoryDir, "hosts.yml"),
        toYaml({
          all: {
            hosts: {
              target: {
                ansible_host: "REPLACE_WITH_VPS_IP",
                ansible_user: "root",
              },
            },
          },
        }),
        "utf-8"
      );
      const bundleVars = {
        vps_components: bundleProfile.components,
        runtime_user: bundleProfile.runtimeUser,
        deploy_user: "deploy",
        app_group: "deploy",
        app_users: [],
        postgresql_version: "latest",
        postgresql_docker_cidrs: ["172.17.0.0/16"],
        postgresql_apps: [],
        redis_enabled: true,
        ...bundleProfile.overrides,
      };

      writeFileSync(
        join(groupVarsDir, "vps_setup.yml"),
        toYaml(bundleVars),
        "utf-8"
      );
      writeFileSync(
        join(outDir, "vault.yml"),
        "# Encrypt with: ansible-vault encrypt vault.yml\npostgresql_apps: []\napp_users: []\n",
        "utf-8"
      );
      writeFileSync(
        join(outDir, "README.md"),
        [
          "# vps-setup rebuild bundle",
          "",
          "1. Edit `ansible/inventory/hosts.yml` with the new VPS IP.",
          "2. Encrypt secrets with `ansible-vault encrypt vault.yml`.",
          "3. Run `vps-setup rebuild apply . --host <ip> --user root`.",
          "",
        ].join("\n"),
        "utf-8"
      );

      success(`Rebuild bundle exported to ${outDir}`);
    });

  rebuild
    .command("apply <dir>")
    .description("Apply a rebuild bundle to an existing VPS")
    .requiredOption("--host <host>", "Target VPS host/IP")
    .option("--user <user>", "SSH user", "root")
    .option("--port <port>", "SSH port", (value) => parseInt(value, 10), 22)
    .option("--ssh-key <path>", "SSH private key path")
    .option("--dry-run", "Run Ansible check mode")
    .action(async (dir, options) => {
      const config = pm.getConfig();
      const runner = new AnsibleRunner(config.ansiblePath);
      const server = createTemporaryServer(options.host, options.user, options.port, options.sshKey);

      if (!runner.checkAnsiblePath()) {
        error(`Playbook not found at ${config.ansiblePath}/playbooks/site.yml`);
        process.exit(1);
      }

      const ssh = await testSSHConnection(server);
      if (!ssh.success) {
        error(`SSH failed: ${ssh.error || "unknown error"}`);
        process.exit(1);
      }

      const profilePath = join(resolve(dir), "profile.yml");
      if (!existsSync(profilePath)) {
        error(`Missing rebuild profile: ${profilePath}`);
        process.exit(1);
      }

      const profile = parseYaml<Profile>(readFileSync(profilePath, "utf-8"));
      if (!profile) {
        error(`Invalid rebuild profile: ${profilePath}`);
        process.exit(1);
      }

      const result = await runner.run(
        server,
        buildBundleProfile(profile),
        {
          check: options.dryRun,
        }
      );

      if (!result.success) {
        error(result.error || "Rebuild failed");
        process.exit(1);
      }

      success(`Rebuild applied to ${options.host}`);
    });

  rebuild
    .command("doctor <server>")
    .description("Check SSH, Docker, PostgreSQL, Redis, and firewall state")
    .action(async (serverName) => {
      const server = pm.getServer(serverName);
      if (!server) {
        error(`Server "${serverName}" not found`);
        process.exit(1);
      }

      header(`Doctor: ${serverName}`);
      const ssh = await testSSHConnection(server);
      if (!ssh.success) {
        error(`SSH failed: ${ssh.error || "unknown error"}`);
        process.exit(1);
      }
      success(`SSH OK (${ssh.os} ${ssh.version})`);

      const baseArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"];
      if (server.port) baseArgs.push("-p", String(server.port));
      if (server.sshKey) baseArgs.push("-i", server.sshKey);
      baseArgs.push(`${server.user}@${server.host}`);

      const checks = [
        ["Docker", "command -v docker >/dev/null && docker --version"],
        ["PostgreSQL", "systemctl is-active postgresql && ss -ltn | grep ':5432'"],
        ["Redis", "systemctl is-active redis-server || systemctl is-active redis"],
        ["UFW", "command -v ufw >/dev/null && ufw status"],
      ];

      for (const [label, command] of checks) {
        try {
          const result = await execa("ssh", [...baseArgs, command], { timeout: 30000 });
          console.log(chalk.green(`  ✓ ${label}`));
          if (result.stdout) {
            console.log(chalk.gray(result.stdout.split("\n").slice(0, 3).join("\n")));
          }
        } catch {
          console.log(chalk.red(`  ✗ ${label}`));
        }
      }

      info("PostgreSQL should not expose 5432 publicly; verify externally from a non-trusted network before production use.");
    });

  return rebuild;
}
