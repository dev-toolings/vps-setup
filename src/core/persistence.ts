import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Server, Profile, Config, HistoryEntry } from "@/types/index.ts";
import {
  DEFAULT_CONFIG,
  FULL_STACK_COMPONENTS,
  MINIMAL_COMPONENTS,
  SECURITY_ONLY_COMPONENTS,
} from "@/types/index.ts";
import { parseYaml, toYaml, debug, error } from "@/utils/index.ts";
import { parseServer, parseProfile, parseConfig } from "@/utils/index.ts";

/**
 * Default configuration directory
 */
export const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "vps-setup");

/**
 * Subdirectories
 */
const SUBDIRS = {
  servers: "servers",
  profiles: "profiles",
  history: "history",
} as const;

/**
 * Persistence Manager
 * Handles reading and writing configuration files
 */
export class PersistenceManager {
  private configDir: string;

  constructor(configDir: string = DEFAULT_CONFIG_DIR) {
    this.configDir = configDir;
  }

  /**
   * Get the configuration directory path
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Override the configuration directory (for --config-dir CLI flag)
   */
  setConfigDir(dir: string): void {
    this.configDir = dir;
  }

  /**
   * Initialize the configuration directory structure
   */
  initialize(): void {
    // Create main directory and subdirectories
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }

    for (const subdir of Object.values(SUBDIRS)) {
      const path = join(this.configDir, subdir);
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    }

    // Create default config if not exists
    const configPath = join(this.configDir, "config.yml");
    if (!existsSync(configPath)) {
      this.saveConfig(DEFAULT_CONFIG);
    }

    // Create default profiles if not exist
    this.createDefaultProfiles();
  }

  /**
   * Create default profiles
   */
  private createDefaultProfiles(): void {
    const defaultProfiles: Profile[] = [
      {
        name: "full-stack",
        description: "Full stack development server with Docker, PHP, Caddy, Node.js, Bun, and security hardening",
        components: FULL_STACK_COMPONENTS,
        runtimeUser: "root",
      },
      {
        name: "minimal",
        description: "Minimal setup with Docker and security hardening only",
        components: MINIMAL_COMPONENTS,
        runtimeUser: "root",
      },
      {
        name: "security-only",
        description: "Security hardening only - no additional software",
        components: SECURITY_ONLY_COMPONENTS,
        runtimeUser: "root",
      },
    ];

    for (const profile of defaultProfiles) {
      const profilePath = join(this.configDir, SUBDIRS.profiles, `${profile.name}.yml`);
      if (!existsSync(profilePath)) {
        this.saveProfile(profile);
      }
    }
  }

  // ==================== Config ====================

  /**
   * Get global configuration
   */
  getConfig(): Config {
    const configPath = join(this.configDir, "config.yml");
    if (!existsSync(configPath)) {
      return DEFAULT_CONFIG;
    }

    try {
      const content = readFileSync(configPath, "utf-8");
      const data = parseYaml<Config>(content);
      if (!data) {
        return DEFAULT_CONFIG;
      }

      const result = parseConfig(data);
      if (!result.success) {
        error("Invalid config file, using defaults");
        return DEFAULT_CONFIG;
      }

      return { ...DEFAULT_CONFIG, ...result.data };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Save global configuration
   */
  saveConfig(config: Config): void {
    const configPath = join(this.configDir, "config.yml");
    writeFileSync(configPath, toYaml(config), "utf-8");
  }

  /**
   * Update global configuration
   */
  updateConfig(updates: Partial<Config>): Config {
    const current = this.getConfig();
    const updated = { ...current, ...updates };
    this.saveConfig(updated);
    return updated;
  }

  // ==================== Servers ====================

  /**
   * Save a server configuration
   */
  saveServer(server: Server): void {
    // Validate
    const result = parseServer(server);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.message).join(", ");
      throw new Error(`Invalid server: ${issues}`);
    }

    const serverPath = join(this.configDir, SUBDIRS.servers, `${server.name}.yml`);

    writeFileSync(serverPath, toYaml(result.data), "utf-8");
    debug(`Saved server: ${server.name}`);
  }

  /**
   * Get a server by name
   */
  getServer(name: string): Server | null {
    const serverPath = join(this.configDir, SUBDIRS.servers, `${name}.yml`);
    if (!existsSync(serverPath)) {
      return null;
    }

    try {
      const content = readFileSync(serverPath, "utf-8");
      const data = parseYaml<Server>(content);
      if (!data) {
        return null;
      }

      const result = parseServer(data);
      if (!result.success) {
        debug(`Invalid server file: ${name}`);
        return null;
      }

      return result.data;
    } catch {
      return null;
    }
  }

  /**
   * List all server names
   */
  listServers(): string[] {
    const serversDir = join(this.configDir, SUBDIRS.servers);
    if (!existsSync(serversDir)) {
      return [];
    }

    try {
      return readdirSync(serversDir)
        .filter((f) => f.endsWith(".yml"))
        .map((f) => f.replace(/\.yml$/, ""));
    } catch {
      return [];
    }
  }

  /**
   * Get all servers
   */
  getAllServers(): Server[] {
    return this.listServers()
      .map((name) => this.getServer(name))
      .filter((s): s is Server => s !== null);
  }

  /**
   * Delete a server
   */
  deleteServer(name: string): boolean {
    const serverPath = join(this.configDir, SUBDIRS.servers, `${name}.yml`);
    if (!existsSync(serverPath)) {
      return false;
    }

    try {
      rmSync(serverPath);

      // Also delete history
      const historyPath = join(this.configDir, SUBDIRS.history, `${name}.log`);
      if (existsSync(historyPath)) {
        rmSync(historyPath);
      }

      debug(`Deleted server: ${name}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a server exists
   */
  serverExists(name: string): boolean {
    return existsSync(join(this.configDir, SUBDIRS.servers, `${name}.yml`));
  }

  // ==================== Profiles ====================

  /**
   * Save a profile configuration
   */
  saveProfile(profile: Profile): void {
    // Validate
    const result = parseProfile(profile);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.message).join(", ");
      throw new Error(`Invalid profile: ${issues}`);
    }

    const profilePath = join(this.configDir, SUBDIRS.profiles, `${profile.name}.yml`);
    writeFileSync(profilePath, toYaml(profile), "utf-8");
    debug(`Saved profile: ${profile.name}`);
  }

  /**
   * Get a profile by name
   */
  getProfile(name: string): Profile | null {
    const profilePath = join(this.configDir, SUBDIRS.profiles, `${name}.yml`);
    if (!existsSync(profilePath)) {
      return null;
    }

    try {
      const content = readFileSync(profilePath, "utf-8");
      const data = parseYaml<Profile>(content);
      if (!data) {
        return null;
      }

      const result = parseProfile(data);
      if (!result.success) {
        debug(`Invalid profile file: ${name}`);
        return null;
      }

      return result.data;
    } catch {
      return null;
    }
  }

  /**
   * List all profile names
   */
  listProfiles(): string[] {
    const profilesDir = join(this.configDir, SUBDIRS.profiles);
    if (!existsSync(profilesDir)) {
      return [];
    }

    try {
      return readdirSync(profilesDir)
        .filter((f) => f.endsWith(".yml"))
        .map((f) => f.replace(/\.yml$/, ""));
    } catch {
      return [];
    }
  }

  /**
   * Get all profiles
   */
  getAllProfiles(): Profile[] {
    return this.listProfiles()
      .map((name) => this.getProfile(name))
      .filter((p): p is Profile => p !== null);
  }

  /**
   * Delete a profile
   */
  deleteProfile(name: string): boolean {
    const profilePath = join(this.configDir, SUBDIRS.profiles, `${name}.yml`);
    if (!existsSync(profilePath)) {
      return false;
    }

    try {
      rmSync(profilePath);
      debug(`Deleted profile: ${name}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a profile exists
   */
  profileExists(name: string): boolean {
    return existsSync(join(this.configDir, SUBDIRS.profiles, `${name}.yml`));
  }

  /**
   * Duplicate a profile
   */
  duplicateProfile(sourceName: string, targetName: string): Profile {
    const source = this.getProfile(sourceName);
    if (!source) {
      throw new Error(`Profile "${sourceName}" not found`);
    }

    if (this.profileExists(targetName)) {
      throw new Error(`Profile "${targetName}" already exists`);
    }

    const duplicate: Profile = {
      ...source,
      name: targetName,
      description: `Copy of ${sourceName}`,
    };

    this.saveProfile(duplicate);
    return duplicate;
  }

  // ==================== History ====================

  /**
   * Append a history entry
   */
  appendHistory(serverName: string, entry: HistoryEntry): void {
    const historyPath = join(this.configDir, SUBDIRS.history, `${serverName}.log`);

    // Append JSON line
    const line = JSON.stringify(entry) + "\n";
    writeFileSync(historyPath, line, { flag: "a", encoding: "utf-8" });
    debug(`Appended history for: ${serverName}`);
  }

  /**
   * Get history for a server
   */
  getHistory(serverName: string, limit?: number): HistoryEntry[] {
    const historyPath = join(this.configDir, SUBDIRS.history, `${serverName}.log`);
    if (!existsSync(historyPath)) {
      return [];
    }

    try {
      const content = readFileSync(historyPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      let entries = lines
        .map((line) => {
          try {
            return JSON.parse(line) as HistoryEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is HistoryEntry => e !== null);

      // Enforce retention policy
      const config = this.getConfig();
      const retentionDays = config.historyRetentionDays || 30;
      const cutoff = Date.now() - retentionDays * 86400000;
      entries = entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);

      // Sort by timestamp descending
      entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (limit && limit > 0) {
        entries = entries.slice(0, limit);
      }

      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Clear history for a server
   */
  clearHistory(serverName: string): boolean {
    const historyPath = join(this.configDir, SUBDIRS.history, `${serverName}.log`);
    if (!existsSync(historyPath)) {
      return false;
    }

    try {
      rmSync(historyPath);
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const persistence = new PersistenceManager();
