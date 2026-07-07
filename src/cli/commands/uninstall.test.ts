import { describe, expect, test } from "bun:test";
import { isSafeVpsSetupBinaryPath } from "./uninstall.ts";

describe("isSafeVpsSetupBinaryPath", () => {
  test("accepts vps-setup binaries", () => {
    expect(isSafeVpsSetupBinaryPath("/home/user/.local/bin/vps-setup")).toBe(true);
    expect(isSafeVpsSetupBinaryPath("/tmp/vps-setup-linux-x64")).toBe(true);
    expect(isSafeVpsSetupBinaryPath("C:\\Users\\user\\bin\\vps-setup.exe")).toBe(true);
  });

  test("rejects runtimes and unrelated binaries", () => {
    expect(isSafeVpsSetupBinaryPath("/home/user/.bun/bin/bun")).toBe(false);
    expect(isSafeVpsSetupBinaryPath("/usr/bin/node")).toBe(false);
    expect(isSafeVpsSetupBinaryPath("/tmp/other-tool")).toBe(false);
  });
});
