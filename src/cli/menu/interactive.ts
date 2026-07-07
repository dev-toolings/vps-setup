import * as p from "@clack/prompts";
import chalk from "chalk";
import { PersistenceManager, AnsibleRunner, testSSHConnection } from "@/core/index.ts";
import type { Server, Profile, ProfileComponents } from "@/types/index.ts";
import { success, error, info, header } from "@/utils/index.ts";

/**
 * Run the interactive TUI menu
 */
export async function runInteractiveMenu(pm: PersistenceManager): Promise<void> {
  // Initialize if needed
  if (!pm.listServers().length && !pm.listProfiles().length) {
    const shouldInit = await p.confirm({
      message: "Configuration not found. Initialize now?",
      initialValue: true,
    });

    if (shouldInit) {
      pm.initialize();
      success("Configuration initialized");
    } else {
      process.exit(0);
    }
  }

  while (true) {
    // Show main menu
    const servers = pm.getAllServers();
    const profiles = pm.getAllProfiles();

    // Display header
    console.clear();
    printMenuHeader(servers.length, profiles.length);

    // Main menu action
    const action = await p.select({
      message: "What would you like to do?",
      options: [
        { value: "setup", label: "🚀 Setup server with profile" },
        { value: "server", label: "🖥️  Manage servers" },
        { value: "profile", label: "📋 Manage profiles" },
        { value: "history", label: "📜 View history" },
        { value: "settings", label: "⚙️  Settings" },
        { value: "exit", label: "👋 Exit" },
      ],
    });

    if (p.isCancel(action)) {
      break;
    }

    switch (action) {
      case "setup":
        await setupFlow(pm);
        break;
      case "server":
        await serverManagementFlow(pm);
        break;
      case "profile":
        await profileManagementFlow(pm);
        break;
      case "history":
        await historyFlow(pm);
        break;
      case "settings":
        await settingsFlow(pm);
        break;
      case "exit":
        console.log();
        p.outro(chalk.blue("Goodbye!"));
        return;
    }
  }
}

/**
 * Print menu header
 */
function printMenuHeader(serverCount: number, profileCount: number): void {
  console.log();
  console.log(chalk.cyan("╔═══════════════════════════════════════════════════════════════╗"));
  console.log(chalk.cyan("║") + chalk.bold("                    VPS Setup Manager                          ") + chalk.cyan("║"));
  console.log(chalk.cyan("╚═══════════════════════════════════════════════════════════════╝"));
  console.log();
  console.log(`  Servers: ${serverCount > 0 ? chalk.green(serverCount) : chalk.gray(0)} | Profiles: ${profileCount > 0 ? chalk.green(profileCount) : chalk.gray(0)}`);
  console.log();
}

/**
 * Setup flow - provision a server
 */
async function setupFlow(pm: PersistenceManager): Promise<void> {
  const servers = pm.listServers();

  if (servers.length === 0) {
    info("No servers configured. Add a server first.");
    await addServerFlow(pm);
    return;
  }

  // Select server
  const serverName = await p.select({
    message: "Select server",
    options: servers.map((s) => {
      const server = pm.getServer(s);
      return {
        value: s,
        label: s,
        hint: server ? `${server.user}@${server.host}` : undefined,
      };
    }),
  });

  if (p.isCancel(serverName)) return;

  const selectedServerName = serverName as string;
  const server = pm.getServer(selectedServerName);
  if (!server) {
    error("Server not found");
    return;
  }

  // Select profile
  const profiles = pm.listProfiles();
  const profileName = await p.select({
    message: "Select profile",
    options: profiles.map((p) => ({ value: p, label: p })),
  });

  if (p.isCancel(profileName)) return;

  const selectedProfileName = profileName as string;
  const profile = pm.getProfile(selectedProfileName);
  if (!profile) {
    error("Profile not found");
    return;
  }

  // Configure components
  const selectedComponents = await p.multiselect({
    message: "Select components (space to toggle)",
    options: [
      { value: "docker", label: "Docker + Docker Compose", selected: profile.components.docker },
      { value: "php_fpm", label: "PHP-FPM", selected: profile.components.php_fpm },
      { value: "caddy", label: "Caddy", selected: profile.components.caddy },
      { value: "nodejs", label: "Node.js (system-wide)", selected: profile.components.nodejs },
      { value: "nvm", label: "NVM", selected: profile.components.nvm },
      { value: "bun", label: "Bun", selected: profile.components.bun },
      { value: "security", label: "Security Hardening", selected: profile.components.security },
      { value: "users", label: "Users + Permissions", selected: profile.components.users },
      { value: "database", label: "PostgreSQL + Redis", selected: profile.components.database },
      { value: "rebuild", label: "Rebuild Metadata", selected: profile.components.rebuild },
    ],
  });

  if (p.isCancel(selectedComponents)) return;
  const selectedComponentNames = selectedComponents as string[];

  const components: ProfileComponents = {
    docker: selectedComponentNames.includes("docker"),
    php_fpm: selectedComponentNames.includes("php_fpm"),
    caddy: selectedComponentNames.includes("caddy"),
    nodejs: selectedComponentNames.includes("nodejs"),
    nvm: selectedComponentNames.includes("nvm"),
    bun: selectedComponentNames.includes("bun"),
    security: selectedComponentNames.includes("security"),
    users: selectedComponentNames.includes("users"),
    database: selectedComponentNames.includes("database"),
    rebuild: selectedComponentNames.includes("rebuild"),
  };

  // Show summary
  console.log();
  console.log(chalk.bold("Summary:"));
  console.log(`  Server: ${chalk.cyan(selectedServerName)} (${server.host})`);
  console.log(`  Profile: ${chalk.cyan(selectedProfileName)}`);
  console.log(`  Components: ${Object.entries(components)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ")}`);
  console.log();

  // Confirm
  const proceed = await p.confirm({
    message: "Proceed with provisioning?",
    initialValue: true,
  });

  if (!proceed || p.isCancel(proceed)) return;

  // Test connection
  const spinner = p.spinner();
  spinner.start("Testing SSH connection...");

  const testResult = await testSSHConnection(server);

  if (!testResult.success) {
    spinner.stop("SSH connection failed");
    error(testResult.error || "Unknown error");
    await p.confirm({ message: "Press Enter to continue..." });
    return;
  }

  spinner.stop("SSH OK");

  // Run provisioning
  const runSpinner = p.spinner();
  runSpinner.start("Running ansible-playbook...");
  const startTime = Date.now();

  const config = pm.getConfig();
  const runner = new AnsibleRunner(config.ansiblePath);

  // Update profile with selected components
  const customProfile: Profile = { ...profile, components };

  try {
    const result = await runner.run(server, customProfile);

    if (result.success) {
      runSpinner.stop("Provisioning complete!");
      success(`Changed: ${result.changed} tasks | Duration: ${result.duration}s`);

      // Update server
      pm.saveServer({ ...server, lastProvisioned: new Date().toISOString() });

      // Save history
      pm.appendHistory(selectedServerName, {
        timestamp: new Date().toISOString(),
        server: selectedServerName,
        profile: selectedProfileName,
        status: "success",
        duration: result.duration,
        changes: result.changed,
      });
    } else {
      runSpinner.stop("Provisioning failed");
      error(`Failed: ${result.failed} tasks`);
      pm.appendHistory(selectedServerName, {
        timestamp: new Date().toISOString(),
        server: selectedServerName,
        profile: selectedProfileName,
        status: "failed",
        duration: result.duration,
        changes: result.changed,
        output: result.output.slice(0, 10000),
      });
    }
  } catch (err) {
    runSpinner.stop("Error");
    error(`Error: ${err}`);
    pm.appendHistory(selectedServerName, {
      timestamp: new Date().toISOString(),
      server: selectedServerName,
      profile: selectedProfileName,
      status: "failed",
      duration: Math.round((Date.now() - startTime) / 1000),
      changes: 0,
      output: String(err).slice(0, 10000),
    });
  }

  await p.confirm({ message: "Press Enter to continue..." });
}

/**
 * Server management flow
 */
async function serverManagementFlow(pm: PersistenceManager): Promise<void> {
  const action = await p.select({
    message: "Server management",
    options: [
      { value: "list", label: "List servers" },
      { value: "add", label: "Add new server" },
      { value: "test", label: "Test connection" },
      { value: "delete", label: "Delete server" },
      { value: "back", label: "← Back" },
    ],
  });

  if (p.isCancel(action) || action === "back") return;

  switch (action) {
    case "list":
      const servers = pm.getAllServers();
      console.log();
      for (const s of servers) {
        console.log(`  ${s.name}: ${s.user}@${s.host}`);
      }
      await p.confirm({ message: "Press Enter to continue..." });
      break;
    case "add":
      await addServerFlow(pm);
      break;
    case "test":
      await testServerFlow(pm);
      break;
    case "delete":
      await deleteServerFlow(pm);
      break;
  }
}

/**
 * Add server flow
 */
async function addServerFlow(pm: PersistenceManager): Promise<void> {
  const result = await p.group(
    {
      name: () =>
        p.text({
          message: "Server name",
          placeholder: "prod-web",
          validate: (value) => {
            if (!value) return "Name is required";
            if (pm.serverExists(value)) return "Server already exists";
            return undefined;
          },
        }),
      host: () =>
        p.text({
          message: "Host (IP or hostname)",
          placeholder: "192.168.1.100",
          validate: (value) => (!value ? "Host is required" : undefined),
        }),
      user: () =>
        p.text({
          message: "SSH user",
          initialValue: "root",
        }),
      port: () =>
        p.text({
          message: "SSH port",
          initialValue: "22",
        }),
      sshKey: () =>
        p.text({
          message: "SSH key path (optional)",
          placeholder: "~/.ssh/id_rsa",
        }),
    },
    {
      onCancel: () => {
        p.cancel("Cancelled");
      },
    }
  );

  if (!result.name) return;

  const server: Server = {
    name: result.name,
    host: result.host,
    user: result.user,
    port: parseInt(result.port) || 22,
    sshKey: result.sshKey || undefined,
    os: "auto",
    tags: [],
    createdAt: new Date().toISOString(),
  };

  try {
    pm.saveServer(server);
    success(`Server "${server.name}" saved`);
  } catch (err) {
    error(`Failed to save: ${err}`);
  }

  await p.confirm({ message: "Press Enter to continue..." });
}

/**
 * Test server connection flow
 */
async function testServerFlow(pm: PersistenceManager): Promise<void> {
  const servers = pm.listServers();
  if (servers.length === 0) {
    info("No servers configured");
    return;
  }

  const serverName = await p.select({
    message: "Select server",
    options: servers.map((s) => ({ value: s, label: s })),
  });

  if (p.isCancel(serverName)) return;
  const selectedServerName = serverName as string;

  const server = pm.getServer(selectedServerName);
  if (!server) return;

  const spinner = p.spinner();
  spinner.start("Testing connection...");

  const result = await testSSHConnection(server);

  if (result.success) {
    spinner.stop("Connection successful!");
    console.log(`  OS: ${result.os} ${result.version}`);
    console.log(`  Latency: ${result.duration}ms`);
  } else {
    spinner.stop("Connection failed");
    error(result.error || "Unknown error");
  }

  await p.confirm({ message: "Press Enter to continue..." });
}

/**
 * Delete server flow
 */
async function deleteServerFlow(pm: PersistenceManager): Promise<void> {
  const servers = pm.listServers();
  if (servers.length === 0) {
    info("No servers configured");
    return;
  }

  const serverName = await p.select({
    message: "Select server to delete",
    options: servers.map((s) => ({ value: s, label: s })),
  });

  if (p.isCancel(serverName)) return;
  const selectedServerName = serverName as string;

  const confirm = await p.confirm({
    message: `Delete "${selectedServerName}"?`,
    initialValue: false,
  });

  if (!p.isCancel(confirm) && confirm) {
    pm.deleteServer(selectedServerName);
    success(`Server "${selectedServerName}" deleted`);
  }

  await p.confirm({ message: "Press Enter to continue..." });
}

/**
 * Profile management flow
 */
async function profileManagementFlow(pm: PersistenceManager): Promise<void> {
  const action = await p.select({
    message: "Profile management",
    options: [
      { value: "list", label: "List profiles" },
      { value: "create", label: "Create new profile" },
      { value: "duplicate", label: "Duplicate profile" },
      { value: "delete", label: "Delete profile" },
      { value: "back", label: "← Back" },
    ],
  });

  if (p.isCancel(action) || action === "back") return;

  switch (action) {
    case "list":
      const profiles = pm.getAllProfiles();
      console.log();
      for (const p of profiles) {
        const components = Object.entries(p.components)
          .filter(([, v]) => v)
          .map(([k]) => k);
        console.log(`  ${p.name}: ${components.join(", ")}`);
      }
      await p.confirm({ message: "Press Enter to continue..." });
      break;
    case "create":
      // Would need a similar flow to addServerFlow
      info("Use: vps-setup profile create <name>");
      await p.confirm({ message: "Press Enter to continue..." });
      break;
    case "duplicate":
      const allProfiles = pm.listProfiles();
      if (allProfiles.length === 0) {
        info("No profiles to duplicate");
        break;
      }
      const source = await p.select({
        message: "Source profile",
        options: allProfiles.map((p) => ({ value: p, label: p })),
      });
      if (p.isCancel(source)) break;
      const sourceName = source as string;

      const target = await p.text({
        message: "New profile name",
        validate: (value) => {
          if (!value) return "Name is required";
          if (pm.profileExists(value)) return "Profile already exists";
          return undefined;
        },
      });

      if (p.isCancel(target)) break;
      const targetName = target as string;

      try {
        pm.duplicateProfile(sourceName, targetName);
        success(`Profile "${sourceName}" duplicated to "${targetName}"`);
      } catch (err) {
        error(`Failed: ${err}`);
      }
      await p.confirm({ message: "Press Enter to continue..." });
      break;
    case "delete":
      const profilesToDelete = pm.listProfiles();
      if (profilesToDelete.length === 0) {
        info("No profiles to delete");
        break;
      }
      const toDelete = await p.select({
        message: "Select profile to delete",
        options: profilesToDelete.map((p) => ({ value: p, label: p })),
      });
      if (p.isCancel(toDelete)) break;
      const profileToDelete = toDelete as string;

      const confirmDelete = await p.confirm({
        message: `Delete "${profileToDelete}"?`,
        initialValue: false,
      });

      if (!p.isCancel(confirmDelete) && confirmDelete) {
        pm.deleteProfile(profileToDelete);
        success(`Profile "${profileToDelete}" deleted`);
      }
      await p.confirm({ message: "Press Enter to continue..." });
      break;
  }
}

/**
 * History flow
 */
async function historyFlow(pm: PersistenceManager): Promise<void> {
  const servers = pm.listServers();
  if (servers.length === 0) {
    info("No servers configured");
    return;
  }

  const serverName = await p.select({
    message: "Select server",
    options: servers.map((s) => ({ value: s, label: s })),
  });

  if (p.isCancel(serverName)) return;
  const selectedServerName = serverName as string;

  const history = pm.getHistory(selectedServerName, 5);

  if (history.length === 0) {
    info(`No history for "${selectedServerName}"`);
  } else {
    console.log();
    for (const entry of history) {
      const icon = entry.status === "success" ? "✓" : "✗";
      const color = entry.status === "success" ? chalk.green : chalk.red;
      console.log(`  ${color(icon)} ${entry.profile} - ${entry.status} (${entry.changes} changes)`);
    }
  }

  await p.confirm({ message: "Press Enter to continue..." });
}

/**
 * Settings flow
 */
async function settingsFlow(pm: PersistenceManager): Promise<void> {
  const config = pm.getConfig();

  console.log();
  console.log(chalk.bold("Current settings:"));
  console.log(`  Config directory: ${pm.getConfigDir()}`);
  console.log(`  Ansible path: ${config.ansiblePath}`);
  console.log(`  Default profile: ${config.defaultProfile || "none"}`);
  console.log();

  const action = await p.select({
    message: "Settings",
    options: [
      { value: "ansible", label: "Change Ansible path" },
      { value: "default", label: "Set default profile" },
      { value: "back", label: "← Back" },
    ],
  });

  if (p.isCancel(action) || action === "back") return;

  switch (action) {
    case "ansible":
      const ansiblePath = await p.text({
        message: "Ansible playbooks path",
        initialValue: config.ansiblePath,
      });
      if (!p.isCancel(ansiblePath)) {
        pm.updateConfig({ ansiblePath: ansiblePath as string });
        success("Ansible path updated");
      }
      break;
    case "default":
      const profiles = pm.listProfiles();
      const defaultProfile = await p.select({
        message: "Select default profile",
        options: profiles.map((p) => ({ value: p, label: p })),
      });
      if (!p.isCancel(defaultProfile)) {
        pm.updateConfig({ defaultProfile: defaultProfile as string });
        success("Default profile updated");
      }
      break;
  }

  await p.confirm({ message: "Press Enter to continue..." });
}
