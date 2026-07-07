import type { ProfileComponents } from "./profile.ts";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * History entry for provisioning runs
 */
export interface HistoryEntry {
  /** Timestamp (ISO string) */
  timestamp: string;
  /** Server name */
  server: string;
  /** Profile name used */
  profile: string;
  /** Run status */
  status: "success" | "failed" | "dry-run";
  /** Duration in seconds */
  duration: number;
  /** Number of changed tasks */
  changes: number;
  /** Raw output (truncated if too long) */
  output?: string;
}

/**
 * Global configuration
 */
export interface Config {
  /** Configuration version */
  version: string;
  /** Path to Ansible playbooks */
  ansiblePath: string;
  /** Default profile name */
  defaultProfile?: string;
  /** Log level: debug, info, warn, error */
  logLevel?: "debug" | "info" | "warn" | "error";
  /** Keep history entries for N days */
  historyRetentionDays?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Config = {
  version: "1.0.0",
  ansiblePath: join(homedir(), ".local", "share", "vps-setup", "ansible"),
  defaultProfile: "full-stack",
  logLevel: "info",
  historyRetentionDays: 30,
};

/**
 * Provisioning options for setup command
 */
export interface ProvisionOptions {
  /** Target server name */
  server: string;
  /** Profile to use */
  profile: string;
  /** Components override */
  components?: Partial<ProfileComponents>;
  /** Specific tags to run */
  tags?: string[];
  /** Tags to skip */
  skipTags?: string[];
  /** Dry-run mode (check mode) */
  dryRun?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Custom Ansible variables */
  extraVars?: Record<string, unknown>;
}

/**
 * Ansible run result
 */
export interface AnsibleResult {
  /** Whether the run succeeded */
  success: boolean;
  /** Number of ok tasks */
  ok: number;
  /** Number of changed tasks */
  changed: number;
  /** Number of unreachable hosts */
  unreachable: number;
  /** Number of failed tasks */
  failed: number;
  /** Duration in seconds */
  duration: number;
  /** Raw output */
  output: string;
  /** Error message if failed */
  error?: string;
}
