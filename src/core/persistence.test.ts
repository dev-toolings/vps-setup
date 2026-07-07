import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersistenceManager } from "./persistence.ts";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function createManager(): PersistenceManager {
  const dir = mkdtempSync(join(tmpdir(), "vps-setup-test-"));
  tempDirs.push(dir);
  const pm = new PersistenceManager(dir);
  pm.initialize();
  return pm;
}

describe("PersistenceManager", () => {
  test("rejects invalid config updates before writing", () => {
    const pm = createManager();

    expect(() => pm.updateConfig({ logLevel: "verbose" as never })).toThrow("Invalid config");
    expect(pm.getConfig().logLevel).toBe("info");
  });

  test("historyRetentionDays 0 disables read-time retention filtering", () => {
    const pm = createManager();
    pm.updateConfig({ historyRetentionDays: 0 });

    pm.appendHistory("prod", {
      timestamp: "2000-01-01T00:00:00.000Z",
      server: "prod",
      profile: "minimal",
      status: "success",
      duration: 1,
      changes: 0,
    });
    pm.appendHistory("prod", {
      timestamp: new Date().toISOString(),
      server: "prod",
      profile: "minimal",
      status: "success",
      duration: 1,
      changes: 0,
    });

    expect(pm.getHistory("prod")).toHaveLength(2);
  });
});
