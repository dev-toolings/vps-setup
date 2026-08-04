/**
 * Profile components configuration
 */
export interface ProfileComponents {
  /** Install Docker + Docker Compose */
  docker: boolean;
  /** Install PHP-FPM */
  php_fpm: boolean;
  /** Install Caddy web server */
  caddy: boolean;
  /** Install Node.js (system-wide) */
  nodejs: boolean;
  /** Install NVM (Node Version Manager) */
  nvm: boolean;
  /** Install Bun runtime */
  bun: boolean;
  /** Apply security hardening */
  security: boolean;
  /** Configure Linux users and application permissions */
  users: boolean;
  /** Install and configure system-wide PostgreSQL/Redis */
  database: boolean;
  /** Initialize Docker Swarm (single-node manager) + deterministic networking */
  swarm: boolean;
  /** Enable rebuild/export metadata */
  rebuild: boolean;
  /** Join a Tailscale tailnet and prove connectivity before security closes public SSH */
  tailscale: boolean;
  /** Apply AppArmor + unattended security upgrades */
  hardening: boolean;
}

/**
 * Profile configuration
 */
export interface Profile {
  /** Unique profile name */
  name: string;
  /** Optional description */
  description?: string;
  /** Components to install */
  components: ProfileComponents;
  /** Runtime user for services */
  runtimeUser: string;
  /** Custom Ansible variable overrides */
  overrides?: Record<string, unknown>;
}

/**
 * Profile creation input
 */
export type ProfileInput = Omit<Profile, "overrides"> & {
  overrides?: Record<string, unknown>;
};

/**
 * Profile update input (partial)
 */
export type ProfileUpdate = Partial<Omit<Profile, "name">>;

/**
 * Default profile components (all disabled)
 */
export const DEFAULT_COMPONENTS: ProfileComponents = {
  docker: false,
  php_fpm: false,
  caddy: false,
  nodejs: false,
  nvm: false,
  bun: false,
  security: false,
  users: false,
  database: false,
  swarm: false,
  rebuild: false,
  tailscale: false,
  hardening: false,
};

/**
 * Full-stack profile components
 */
export const FULL_STACK_COMPONENTS: ProfileComponents = {
  docker: true,
  php_fpm: true,
  caddy: true,
  nodejs: true,
  nvm: false,
  bun: true,
  security: true,
  users: true,
  database: true,
  swarm: true,
  rebuild: true,
  tailscale: false,
  hardening: false,
};

/**
 * Minimal profile components (Docker + Security only)
 */
export const MINIMAL_COMPONENTS: ProfileComponents = {
  docker: true,
  php_fpm: false,
  caddy: false,
  nodejs: false,
  nvm: false,
  bun: false,
  security: true,
  users: true,
  database: true,
  swarm: false,
  rebuild: true,
  tailscale: false,
  hardening: false,
};

/**
 * Security-only profile components
 */
export const SECURITY_ONLY_COMPONENTS: ProfileComponents = {
  docker: false,
  php_fpm: false,
  caddy: false,
  nodejs: false,
  nvm: false,
  bun: false,
  security: true,
  users: true,
  database: false,
  swarm: false,
  rebuild: true,
  tailscale: false,
  hardening: false,
};

/**
 * Local Docker profile components (local development, no VPS hardening)
 */
export const LOCAL_DOCKER_COMPONENTS: ProfileComponents = {
  docker: true,
  php_fpm: false,
  caddy: true,
  nodejs: true,
  nvm: false,
  bun: true,
  security: false,
  users: false,
  database: false,
  swarm: false,
  rebuild: false,
  tailscale: false,
  hardening: false,
};

/**
 * VPS Docker profile components (Docker apps + system-wide DB)
 */
export const VPS_DOCKER_COMPONENTS: ProfileComponents = {
  docker: true,
  php_fpm: false,
  caddy: true,
  nodejs: true,
  nvm: false,
  bun: true,
  security: true,
  users: true,
  database: true,
  swarm: false,
  rebuild: true,
  tailscale: false,
  hardening: false,
};

/**
 * VPS full-Swarm profile: Caddy runs IN the swarm (Cloudflare edge), apps are
 * swarm stacks on the shared overlay. No host-level Caddy/PHP/Node — apps carry
 * their own runtime. System-wide PostgreSQL/Redis stay on the host.
 */
export const VPS_SWARM_COMPONENTS: ProfileComponents = {
  docker: true,
  php_fpm: false,
  caddy: false,
  nodejs: false,
  nvm: false,
  bun: false,
  security: true,
  users: true,
  database: true,
  swarm: true,
  rebuild: true,
  tailscale: false,
  hardening: false,
};

/**
 * VPS bare-metal profile components (system services + system-wide DB)
 */
export const VPS_BARE_METAL_COMPONENTS: ProfileComponents = {
  docker: false,
  php_fpm: true,
  caddy: true,
  nodejs: true,
  nvm: false,
  bun: true,
  security: true,
  users: true,
  database: true,
  swarm: false,
  rebuild: true,
  tailscale: false,
  hardening: false,
};

/**
 * VPS private profile components: no public TCP port at all, administration
 * only over Tailscale. security + tailscale + hardening are enabled; the
 * profile's overrides (see persistence.ts) set ssh_allow_users and
 * ufw_ssh_interface so the security role scopes SSH to the tailnet.
 */
export const VPS_PRIVATE_COMPONENTS: ProfileComponents = {
  docker: false,
  php_fpm: false,
  caddy: false,
  nodejs: false,
  nvm: false,
  bun: false,
  security: true,
  users: true,
  database: false,
  swarm: false,
  rebuild: true,
  tailscale: true,
  hardening: true,
};
