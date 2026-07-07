import { z } from "zod";

/**
 * Server validation schema
 */
export const ServerSchema = z.object({
  name: z
    .string()
    .min(1, "Server name is required")
    .max(64, "Server name must be 64 characters or less")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Server name can only contain letters, numbers, underscores, and hyphens"
    ),
  host: z.string().min(1, "Host is required").refine(validateHost, {
    message: "Invalid host (must be IP address or valid hostname)",
  }),
  user: z
    .string()
    .min(1, "User is required")
    .max(32, "User must be 32 characters or less")
    .regex(/^[a-zA-Z0-9._-]+$/, "User can only contain letters, numbers, dots, underscores, and hyphens"),
  port: z.number().int().min(1).max(65535).optional().default(22),
  os: z.enum(["debian", "ubuntu", "auto"]).optional().default("auto"),
  tags: z.array(z.string().max(50)).max(100).optional().default([]),
  sshKey: z.string().regex(/^[a-zA-Z0-9_.~\/@-]+$/, "SSH key path contains invalid characters").optional(),
  notes: z.string().max(1000).optional(),
  createdAt: z.string().datetime({ offset: true }).default(() => new Date().toISOString()),
  lastProvisioned: z.string().datetime().optional(),
});

/**
 * Profile components validation schema
 */
export const ProfileComponentsSchema = z.object({
  docker: z.boolean().default(false),
  php_fpm: z.boolean().default(false),
  caddy: z.boolean().default(false),
  nodejs: z.boolean().default(false),
  nvm: z.boolean().default(false),
  bun: z.boolean().default(false),
  security: z.boolean().default(false),
  users: z.boolean().default(false),
  database: z.boolean().default(false),
  rebuild: z.boolean().default(false),
});

/**
 * Profile validation schema
 */
export const ProfileSchema = z
  .object({
    name: z
      .string()
      .min(1, "Profile name is required")
      .max(64, "Profile name must be 64 characters or less")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Profile name can only contain letters, numbers, underscores, and hyphens"
      ),
    description: z.string().max(500).optional(),
    components: ProfileComponentsSchema,
    runtimeUser: z.string().min(1, "Runtime user is required"),
    overrides: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) => Object.values(data.components).some((v) => v === true),
    "At least one component must be enabled"
  );

/**
 * Config validation schema
 */
export const ConfigSchema = z.object({
  version: z.string(),
  ansiblePath: z.string(),
  defaultProfile: z.string().optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
  historyRetentionDays: z.number().int().min(0).max(365).optional(),
});

/**
 * Validate host (IP or hostname)
 */
export function validateHost(host: string): boolean {
  // IPv4 validation
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (ipv4Regex.test(host)) {
    return true;
  }

  // Hostname validation
  const hostnameRegex =
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/;
  if (hostnameRegex.test(host) && host.length <= 253) {
    return true;
  }

  return false;
}

/**
 * Validate server name
 */
export function validateServerName(name: string): boolean {
  return ServerSchema.shape.name.safeParse(name).success;
}

/**
 * Validate tags
 */
export function validateTags(tags: string[]): boolean {
  if (tags.length > 100) return false;
  return tags.every((tag) => tag.length > 0 && tag.length <= 50);
}

/**
 * Parse and validate server data
 */
export function parseServer(data: unknown) {
  return ServerSchema.safeParse(data);
}

/**
 * Parse and validate profile data
 */
export function parseProfile(data: unknown) {
  return ProfileSchema.safeParse(data);
}

/**
 * Parse and validate config data
 */
export function parseConfig(data: unknown) {
  return ConfigSchema.safeParse(data);
}
