import { describe, expect, test } from "bun:test";
import { parse } from "yaml";
import { AnsibleRunner } from "./ansible.ts";
import type { Profile } from "@/types/index.ts";

describe("AnsibleRunner", () => {
  test("generates nested vps_components variables", () => {
    const runner = new AnsibleRunner("/tmp/ansible");
    const profile: Profile = {
      name: "minimal",
      components: {
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
      },
      runtimeUser: "deploy",
      overrides: {
        database: {
          postgresql_version: "latest",
          docker_cidrs: ["172.17.0.0/16"],
          apps: [{ name: "api", db_name: "api_prod", db_user: "api_user" }],
          redis_enabled: true,
        },
        users: {
          deploy_user: "deploy",
          app_users: [{ name: "api", home: "/srv/apps/api" }],
        },
        rebuild: {
          vault_file: "vault.yml",
        },
      },
    };

    const config = parse(runner.generateProvisionConfig(profile));

    expect(config.vps_components).toEqual(profile.components);
    expect(config.runtime_user).toBe("deploy");
    expect(config.docker).toBeUndefined();
    expect(config.postgresql_version).toBe("latest");
    expect(config.postgresql_docker_cidrs).toEqual(["172.17.0.0/16"]);
    expect(config.postgresql_apps).toEqual([{ name: "api", db_name: "api_prod", db_user: "api_user" }]);
    expect(config.deploy_user).toBe("deploy");
    expect(config.app_users).toEqual([{ name: "api", home: "/srv/apps/api" }]);
    expect(config.rebuild_vault_file).toBe("vault.yml");
  });

  test("defaults to the site playbook", () => {
    const runner = new AnsibleRunner("/opt/vps-setup/ansible");
    const args = runner.buildCommand({
      host: "example.com",
      user: "root",
    });

    expect(args[0]).toBe("/opt/vps-setup/ansible/playbooks/site.yml");
  });

  test("supports local Ansible execution", () => {
    const runner = new AnsibleRunner("/opt/vps-setup/ansible");
    const args = runner.buildCommand({
      host: "localhost",
      user: "root",
      local: true,
    });

    expect(args).toContain("-c");
    expect(args).toContain("local");
    expect(args).toContain("localhost,");
    expect(args).not.toContain("-u");
  });
});
