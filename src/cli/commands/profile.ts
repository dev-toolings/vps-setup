import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { PersistenceManager } from "@/core/index.ts";
import type { Profile, ProfileComponents, ProfileInput } from "@/types/index.ts";
import { DEFAULT_COMPONENTS } from "@/types/index.ts";
import { success, error, info, warn, header } from "@/utils/index.ts";

/**
 * Create profile commands
 */
export function createProfileCommands(pm: PersistenceManager): Command {
  const profile = new Command("profile")
    .description("Manage provisioning profiles");

  // profile create
  profile
    .command("create <name>")
    .description("Create a new profile")
    .option("-d, --description <desc>", "Profile description")
    .option("--docker", "Enable Docker")
    .option("--php-fpm", "Enable PHP-FPM")
    .option("--caddy", "Enable Caddy")
    .option("--nodejs", "Enable Node.js")
    .option("--nvm", "Enable NVM")
    .option("--bun", "Enable Bun")
    .option("--security", "Enable security hardening")
    .option("--users", "Enable Linux users and permissions")
    .option("--database", "Enable system-wide PostgreSQL/Redis")
    .option("--swarm", "Enable Docker Swarm (single-node manager)")
    .option("--rebuild", "Enable rebuild/export metadata")
    .option("--runtime-user <user>", "Runtime user for services")
    .action(async (name, options) => {
      header(`Create Profile: ${name}`);

      // Check if profile already exists
      if (pm.profileExists(name)) {
        error(`Profile "${name}" already exists`);
        process.exit(1);
      }

      let profileData: ProfileInput;

      // Check if any component flags were provided
      const hasFlags = options.docker || options.phpFpm || options.caddy ||
        options.nodejs || options.nvm || options.bun || options.security ||
        options.users || options.database || options.swarm || options.rebuild;

      if (hasFlags && options.runtimeUser) {
        // Non-interactive mode
        profileData = {
          name,
          description: options.description,
          components: {
            docker: options.docker || false,
            php_fpm: options.phpFpm || false,
            caddy: options.caddy || false,
            nodejs: options.nodejs || false,
            nvm: options.nvm || false,
            bun: options.bun || false,
            security: options.security || false,
            users: options.users || false,
            database: options.database || false,
            swarm: options.swarm || false,
            rebuild: options.rebuild || false,
          },
          runtimeUser: options.runtimeUser,
        };
      } else {
        // Interactive mode
        const result = await p.group(
          {
            description: () =>
              p.text({
                message: "Description (optional)",
                placeholder: "Production server with Docker and Node.js",
              }),
            components: () =>
              p.multiselect({
                message: "Select components",
                options: [
                  { value: "docker", label: "Docker + Docker Compose", hint: "Container runtime" },
                  { value: "php_fpm", label: "PHP-FPM", hint: "PHP FastCGI Process Manager" },
                  { value: "caddy", label: "Caddy", hint: "Modern web server" },
                  { value: "nodejs", label: "Node.js (system-wide)", hint: "JavaScript runtime" },
                  { value: "nvm", label: "NVM", hint: "Node Version Manager" },
                  { value: "bun", label: "Bun", hint: "Fast JavaScript runtime" },
                  { value: "security", label: "Security Hardening", hint: "UFW, Fail2ban, SSH" },
                  { value: "users", label: "Users + Permissions", hint: "deploy user and app users" },
                  { value: "database", label: "PostgreSQL + Redis", hint: "System-wide database services" },
                  { value: "swarm", label: "Docker Swarm", hint: "Single-node manager + deterministic networking" },
                  { value: "rebuild", label: "Rebuild Metadata", hint: "Exportable restore configuration" },
                ],
                initialValues: [] as string[],
                required: true,
              }),
            runtimeUser: () =>
              p.text({
                message: "Runtime user for services",
                placeholder: "root",
                initialValue: "root",
                validate: (value) => {
                  if (!value) return "Runtime user is required";
                  return undefined;
                },
              }),
          },
          {
            onCancel: () => {
              p.cancel("Operation cancelled");
              process.exit(0);
            },
          }
        );

        const selectedComponents = result.components as string[];
        const components: ProfileComponents = {
          docker: selectedComponents.includes("docker"),
          php_fpm: selectedComponents.includes("php_fpm"),
          caddy: selectedComponents.includes("caddy"),
          nodejs: selectedComponents.includes("nodejs"),
          nvm: selectedComponents.includes("nvm"),
          bun: selectedComponents.includes("bun"),
          security: selectedComponents.includes("security"),
          users: selectedComponents.includes("users"),
          database: selectedComponents.includes("database"),
          swarm: selectedComponents.includes("swarm"),
          rebuild: selectedComponents.includes("rebuild"),
        };

        profileData = {
          name,
          description: result.description || undefined,
          components,
          runtimeUser: result.runtimeUser,
        };
      }

      // Validate at least one component is enabled
      if (!Object.values(profileData.components).some((v) => v)) {
        error("At least one component must be enabled");
        process.exit(1);
      }

      try {
        pm.saveProfile(profileData as Profile);
        success(`Profile "${name}" created`);
      } catch (err) {
        error(`Failed to create profile: ${err}`);
        process.exit(1);
      }

      p.outro(chalk.green("Done!"));
    });

  // profile list
  profile
    .command("list")
    .alias("ls")
    .description("List all profiles")
    .option("-j, --json", "Output as JSON")
    .action((options) => {
      const profiles = pm.getAllProfiles();

      if (profiles.length === 0) {
        info("No profiles configured");
        info("Run 'vps-setup profile create <name>' to create a profile");
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(profiles, null, 2));
        return;
      }

      header("Profiles");

      for (const prof of profiles) {
        const enabledComponents = Object.entries(prof.components)
          .filter(([, enabled]) => enabled)
          .map(([name]) => chalk.cyan(name));

        console.log(`  ${chalk.bold(prof.name)}`);
        if (prof.description) {
          console.log(`    ${chalk.gray(prof.description)}`);
        }
        console.log(`    Components: ${enabledComponents.join(", ")}`);
        console.log(`    Runtime user: ${chalk.gray(prof.runtimeUser)}`);
        console.log();
      }
    });

  // profile show
  profile
    .command("show <name>")
    .description("Show profile details")
    .option("-j, --json", "Output as JSON")
    .action((name, options) => {
      const prof = pm.getProfile(name);

      if (!prof) {
        error(`Profile "${name}" not found`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(prof, null, 2));
        return;
      }

      header(`Profile: ${name}`);

      if (prof.description) {
        console.log(`  ${chalk.bold("Description:")}\t${prof.description}`);
        console.log();
      }

      console.log(`  ${chalk.bold("Components:")}`);
      const componentLabels: Record<keyof ProfileComponents, string> = {
        docker: "Docker + Docker Compose",
        php_fpm: "PHP-FPM",
        caddy: "Caddy",
        nodejs: "Node.js (system-wide)",
        nvm: "NVM",
        bun: "Bun",
        security: "Security Hardening",
        users: "Users + Permissions",
        database: "PostgreSQL + Redis",
        swarm: "Docker Swarm",
        rebuild: "Rebuild Metadata",
      };

      for (const [key, label] of Object.entries(componentLabels)) {
        const enabled = prof.components[key as keyof ProfileComponents];
        const icon = enabled ? chalk.green("✓") : chalk.gray("○");
        console.log(`    ${icon} ${label}`);
      }

      console.log();
      console.log(`  ${chalk.bold("Runtime User:")}\t${prof.runtimeUser}`);

      if (prof.overrides && Object.keys(prof.overrides).length > 0) {
        console.log(`  ${chalk.bold("Overrides:")}`);
        for (const [key, value] of Object.entries(prof.overrides)) {
          console.log(`    ${key}: ${JSON.stringify(value)}`);
        }
      }

      console.log();
    });

  // profile edit
  profile
    .command("edit <name>")
    .description("Edit profile configuration")
    .action(async (name) => {
      const prof = pm.getProfile(name);

      if (!prof) {
        error(`Profile "${name}" not found`);
        process.exit(1);
      }

      header(`Edit Profile: ${name}`);

      const result = await p.group(
        {
          description: () =>
            p.text({
              message: "Description",
              initialValue: prof.description || "",
            }),
          components: () =>
            p.multiselect({
              message: "Select components",
              options: [
                { value: "docker", label: "Docker + Docker Compose" },
                { value: "php_fpm", label: "PHP-FPM" },
                { value: "caddy", label: "Caddy" },
                { value: "nodejs", label: "Node.js (system-wide)" },
                { value: "nvm", label: "NVM" },
                { value: "bun", label: "Bun" },
                { value: "security", label: "Security Hardening" },
                { value: "users", label: "Users + Permissions" },
                { value: "database", label: "PostgreSQL + Redis" },
                { value: "swarm", label: "Docker Swarm" },
                { value: "rebuild", label: "Rebuild Metadata" },
              ],
              initialValues: Object.entries(prof.components)
                .filter(([, enabled]) => enabled)
                .map(([key]) => key) as string[],
              required: true,
            }),
          runtimeUser: () =>
            p.text({
              message: "Runtime user for services",
              initialValue: prof.runtimeUser,
              validate: (value) => {
                if (!value) return "Runtime user is required";
                return undefined;
              },
            }),
        },
        {
          onCancel: () => {
            p.cancel("Operation cancelled");
            process.exit(0);
          },
        }
      );

      const selectedComponents = result.components as string[];
      const components: ProfileComponents = {
        docker: selectedComponents.includes("docker"),
        php_fpm: selectedComponents.includes("php_fpm"),
        caddy: selectedComponents.includes("caddy"),
        nodejs: selectedComponents.includes("nodejs"),
        nvm: selectedComponents.includes("nvm"),
        bun: selectedComponents.includes("bun"),
        security: selectedComponents.includes("security"),
        users: selectedComponents.includes("users"),
        database: selectedComponents.includes("database"),
        swarm: selectedComponents.includes("swarm"),
        rebuild: selectedComponents.includes("rebuild"),
      };

      // Validate at least one component is enabled
      if (!Object.values(components).some((v) => v)) {
        error("At least one component must be enabled");
        process.exit(1);
      }

      const updated: Profile = {
        ...prof,
        description: result.description || undefined,
        components,
        runtimeUser: result.runtimeUser,
      };

      try {
        pm.saveProfile(updated);
        success(`Profile "${name}" updated`);
      } catch (err) {
        error(`Failed to update profile: ${err}`);
        process.exit(1);
      }

      p.outro(chalk.green("Done!"));
    });

  // profile delete
  profile
    .command("delete <name>")
    .alias("rm")
    .description("Delete a profile")
    .option("-f, --force", "Skip confirmation")
    .action(async (name, options) => {
      const prof = pm.getProfile(name);

      if (!prof) {
        error(`Profile "${name}" not found`);
        process.exit(1);
      }

      if (!options.force) {
        const shouldDelete = await p.confirm({
          message: `Delete profile "${name}"?`,
          initialValue: false,
        });

        if (!shouldDelete) {
          info("Cancelled");
          return;
        }
      }

      const deleted = pm.deleteProfile(name);

      if (deleted) {
        success(`Profile "${name}" deleted`);
      } else {
        error(`Failed to delete profile "${name}"`);
        process.exit(1);
      }
    });

  // profile duplicate
  profile
    .command("duplicate <source> <target>")
    .alias("cp")
    .description("Duplicate a profile")
    .action((source, target) => {
      if (pm.profileExists(target)) {
        error(`Profile "${target}" already exists`);
        process.exit(1);
      }

      try {
        const duplicate = pm.duplicateProfile(source, target);
        success(`Profile "${source}" duplicated to "${target}"`);
      } catch (err) {
        error(`Failed to duplicate profile: ${err}`);
        process.exit(1);
      }
    });

  return profile;
}
