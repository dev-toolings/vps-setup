import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import type { Server, Profile, AnsibleResult, ProfileComponents } from "@/types/index.ts";
import { debug, error, info } from "@/utils/index.ts";
import { toYaml } from "@/utils/index.ts";
import { buildSSHTunnelOptions } from "./ssh.ts";

/**
 * Ansible run options
 */
export interface AnsibleRunOptions {
  host: string;
  user: string;
  port?: number;
  sshKey?: string;
  tags?: string[];
  skipTags?: string[];
  check?: boolean;
  verbose?: boolean;
  configFile?: string;
  playbook?: string;
}

/**
 * Ansible Runner
 * Wrapper for ansible-playbook commands
 */
export class AnsibleRunner {
  private ansiblePath: string;

  constructor(ansiblePath: string) {
    this.ansiblePath = resolve(ansiblePath);
  }

  /**
   * Build ansible-playbook command arguments
   */
  buildCommand(options: AnsibleRunOptions): string[] {
    const args: string[] = [];

    // Playbook file
    const playbook = options.playbook || join(this.ansiblePath, "playbooks", "provision.yml");
    args.push(playbook);

    // Inventory (inline)
    args.push("-i", `${options.host},`);

    // User
    args.push("-u", options.user);

    // SSH options
    const sshOptions = buildSSHTunnelOptions({
      name: "",
      host: options.host,
      user: options.user,
      port: options.port,
      sshKey: options.sshKey,
      createdAt: "",
    });

    if (sshOptions.length > 0) {
      args.push("--ssh-common-args", sshOptions.join(" "));
    }

    // Tags
    if (options.tags && options.tags.length > 0) {
      args.push("--tags", options.tags.join(","));
    }

    // Skip tags
    if (options.skipTags && options.skipTags.length > 0) {
      args.push("--skip-tags", options.skipTags.join(","));
    }

    // Check mode (dry-run)
    if (options.check) {
      args.push("--check");
      args.push("--diff");
    }

    // Verbose
    if (options.verbose) {
      args.push("-v");
    }

    // Extra vars from config file
    if (options.configFile) {
      args.push("-e", `@${options.configFile}`);
    }

    return args;
  }

  /**
   * Generate provision_config.yml content
   */
  generateProvisionConfig(profile: Profile): string {
    const config: Record<string, unknown> = {
      ...profile.components,
      runtime_user: profile.runtimeUser,
    };

    // Add overrides
    if (profile.overrides) {
      for (const [key, value] of Object.entries(profile.overrides)) {
        config[key] = value;
      }
    }

    return toYaml(config);
  }

  /**
   * Generate tags from components
   */
  generateTags(components: ProfileComponents): string[] {
    return Object.entries(components)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
  }

  /**
   * Run ansible-playbook
   */
  async run(
    server: Server,
    profile: Profile,
    options: Partial<AnsibleRunOptions> = {}
  ): Promise<AnsibleResult> {
    const startTime = Date.now();

    // Create temp config file in a secure per-invocation directory
    const tempDir = mkdtempSync(join(tmpdir(), "vps-setup-"));
    chmodSync(tempDir, 0o700);

    const configFile = join(tempDir, `provision_${server.name}.yml`);
    const configContent = this.generateProvisionConfig(profile);

    try {
      writeFileSync(configFile, configContent, "utf-8");
      debug(`Generated config file: ${configFile}`);

      // Build command
      const tags = options.tags || this.generateTags(profile.components);

      const args = this.buildCommand({
        host: server.host,
        user: server.user,
        port: server.port,
        sshKey: server.sshKey,
        tags,
        skipTags: options.skipTags,
        check: options.check,
        verbose: options.verbose,
        configFile,
        playbook: options.playbook,
      });

      debug(`Running: ansible-playbook ${args.join(" ")}`);
      info(`Running ansible-playbook on ${server.host}...`);

      // Execute
      const result = await execa("ansible-playbook", args, {
        timeout: 600000, // 10 minutes timeout
      });

      const output = result.stdout || "";
      const parsed = this.parseOutput(output);

      return {
        ...parsed,
        duration: Date.now() - startTime,
        output,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error(`Ansible run failed: ${errorMessage}`);

      // Try to parse partial output
      const output = (err as { stdout?: string })?.stdout || "";
      const parsed = this.parseOutput(output);

      return {
        ...parsed,
        success: false,
        duration: Date.now() - startTime,
        output,
        error: errorMessage,
      };
    } finally {
      // Cleanup temp directory
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true });
      }
    }
  }

  /**
   * Parse ansible-playbook output
   */
  parseOutput(output: string): Omit<AnsibleResult, "duration" | "output" | "error"> {
    // Look for PLAY RECAP section
    const recapMatch = output.match(
      /PLAY RECAP\s*\*+\s*\n([\s\S]*?)(?:\n\n|$)/
    );

    if (!recapMatch) {
      return {
        success: false,
        ok: 0,
        changed: 0,
        unreachable: 0,
        failed: 0,
      };
    }

    const recap = recapMatch[1];

    // Parse values from recap
    const okMatch = recap.match(/ok=(\d+)/);
    const changedMatch = recap.match(/changed=(\d+)/);
    const unreachableMatch = recap.match(/unreachable=(\d+)/);
    const failedMatch = recap.match(/failed=(\d+)/);

    const ok = okMatch ? parseInt(okMatch[1], 10) : 0;
    const changed = changedMatch ? parseInt(changedMatch[1], 10) : 0;
    const unreachable = unreachableMatch ? parseInt(unreachableMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

    return {
      success: failed === 0 && unreachable === 0,
      ok,
      changed,
      unreachable,
      failed,
    };
  }

  /**
   * Check if ansible is installed
   */
  static async checkAnsibleInstalled(): Promise<boolean> {
    try {
      await execa("ansible-playbook", ["--version"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if ansible path exists
   */
  checkAnsiblePath(): boolean {
    return existsSync(join(this.ansiblePath, "playbooks", "provision.yml"));
  }
}
