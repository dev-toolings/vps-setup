import { describe, expect, test } from "bun:test";
import { collectAuditProbes, evaluateAudit, looksLikePrivilegeFailure, runPrivileged, summarizeAudit } from "./audit.ts";
import type { AuditProbes, PrivilegedProbeOutput, ProbeOutput, RemoteExec } from "./audit.ts";
import type { Server } from "@/types/index.ts";

function probe(stdout: string, exitCode: number | null = 0, stderr = ""): ProbeOutput {
  return { stdout, exitCode, stderr };
}

function privProbe(
  stdout: string,
  { exitCode = 0, stderr = "", unavailable = false }: Partial<Omit<PrivilegedProbeOutput, "stdout">> = {}
): PrivilegedProbeOutput {
  return { stdout, exitCode, stderr, unavailable };
}

/** Shorthand for a privileged probe that could not be run at all (no root, no working sudo -n). */
function unavailableProbe(): PrivilegedProbeOutput {
  return privProbe("", { exitCode: 1, stderr: "Permission denied", unavailable: true });
}

function fakeServer(): Server {
  return { name: "test", host: "test-host", user: "deploy", createdAt: new Date().toISOString() };
}

/** Returns each scripted result in order, then repeats the last one. Never touches SSH. */
function sequencedExec(...results: ProbeOutput[]): RemoteExec {
  let i = 0;
  return async () => {
    const result = results[Math.min(i, results.length - 1)];
    i += 1;
    return result;
  };
}

const ONE_DAY_SECONDS = 24 * 60 * 60;

/** `stat -c %Y` output for an apt cache last refreshed `daysAgo` days before real wall-clock time. */
function aptListsMtime(daysAgo: number): ProbeOutput {
  return probe(String(Math.floor(Date.now() / 1000) - daysAgo * ONE_DAY_SECONDS));
}

// Realistic `sshd -T` output: real OpenSSH dumps every effective directive,
// one per line, lowercase keyword, single space, lowercase value. Only a
// handful of lines matter to us; the rest is here to prove the regexes only
// match the intended directive and not a neighbour.
function sshdTOutput(overrides: Partial<Record<"permitrootlogin" | "passwordauthentication" | "kbdinteractiveauthentication", string>> = {}): string {
  const values = {
    permitrootlogin: "no",
    passwordauthentication: "no",
    kbdinteractiveauthentication: "no",
    ...overrides,
  };
  return [
    "port 22",
    "addressfamily any",
    "listenaddress 0.0.0.0:22",
    "usepam yes",
    `permitrootlogin ${values.permitrootlogin}`,
    `passwordauthentication ${values.passwordauthentication}`,
    "pubkeyauthentication yes",
    `kbdinteractiveauthentication ${values.kbdinteractiveauthentication}`,
    "x11forwarding no",
    "maxauthtries 6",
  ].join("\n");
}

function conformingProbes(): AuditProbes {
  return {
    ufwStatus: privProbe(
      ["Status: active", "", "To                         Action      From", "22/tcp                     ALLOW       Anywhere"].join("\n")
    ),
    sshdConfigTest: privProbe(""),
    sshdParams: privProbe(sshdTOutput()),
    fail2banService: probe("active"),
    fail2banJail: privProbe("Status for the jail: sshd\n|- Currently failed: 0\n|- Total failed: 0"),
    userId: probe("uid=1001(deploy) gid=1001(deploy) groups=1001(deploy),27(sudo)"),
    // Real `wc -c <path>` output includes the filename, not just the count.
    authorizedKeysSize: privProbe("421 /home/deploy/.ssh/authorized_keys"),
    sshDirPerms: privProbe("700"),
    aptUpgrade: probe(
      ["Reading package lists...", "Building dependency tree...", "Calculating upgrade...", "0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded."].join("\n")
    ),
    aptListsMtime: aptListsMtime(1),
  };
}

describe("evaluateAudit - all probes conforming", () => {
  test("produces no FAIL and a zero exit code", () => {
    const results = evaluateAudit(conformingProbes(), "deploy");
    const summary = summarizeAudit(results, false);

    expect(results.every((r) => r.status === "OK")).toBe(true);
    expect(summary.fail).toBe(0);
    expect(summary.skip).toBe(0);
    expect(summary.ok).toBe(9);
    expect(summary.exitCode).toBe(0);
  });
});

describe("evaluateAudit - one non-conforming probe", () => {
  test("flags only the affected check as FAIL and exits 1", () => {
    const probes = conformingProbes();
    probes.ufwStatus = privProbe("Status: inactive");

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, false);

    const ufwResult = results.find((r) => r.label === "UFW est actif");
    expect(ufwResult?.status).toBe("FAIL");
    expect(results.filter((r) => r.status === "FAIL")).toHaveLength(1);
    expect(summary.fail).toBe(1);
    expect(summary.exitCode).toBe(1);
  });
});

describe("evaluateAudit - probe unavailable due to missing privileges", () => {
  test("SKIPs the derived checks and exits 0 by default", () => {
    const probes = conformingProbes();
    probes.sshdParams = unavailableProbe();
    probes.fail2banJail = unavailableProbe();

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, false);

    const skipped = results.filter((r) => r.status === "SKIP");
    // permitrootlogin, passwordauthentication, kbdinteractiveauthentication, fail2ban
    expect(skipped).toHaveLength(4);
    expect(summary.fail).toBe(0);
    expect(summary.skip).toBe(4);
    expect(summary.exitCode).toBe(0);
  });

  test("--strict turns the same SKIPs into a non-zero exit code", () => {
    const probes = conformingProbes();
    probes.sshdParams = unavailableProbe();
    probes.fail2banJail = unavailableProbe();

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, true);

    expect(summary.fail).toBe(0);
    expect(summary.skip).toBe(4);
    expect(summary.exitCode).toBe(1);
  });
});

describe("parsing - realistic sshd -T output", () => {
  test("reads permitrootlogin/passwordauthentication/kbdinteractiveauthentication out of a full dump", () => {
    const probes = conformingProbes();
    probes.sshdParams = privProbe(sshdTOutput({ permitrootlogin: "yes" }));

    const results = evaluateAudit(probes, "deploy");

    expect(results.find((r) => r.label === "Login root SSH refusé")?.status).toBe("FAIL");
    expect(results.find((r) => r.label === "Mots de passe SSH refusés")?.status).toBe("OK");
    expect(results.find((r) => r.label === "Keyboard-interactive refusé")?.status).toBe("OK");
  });
});

describe("parsing - real ufw status output", () => {
  test("an active status passes and an inactive one fails", () => {
    const activeResults = evaluateAudit(conformingProbes(), "deploy");
    expect(activeResults.find((r) => r.label === "UFW est actif")?.status).toBe("OK");

    const probes = conformingProbes();
    probes.ufwStatus = privProbe("Status: inactive\n");
    const inactiveResults = evaluateAudit(probes, "deploy");
    expect(inactiveResults.find((r) => r.label === "UFW est actif")?.status).toBe("FAIL");
  });
});

// `ufw status` and `sshd -t` were only reachable as a non-root user by
// accident in the first version: a non-root audit account made them FAIL
// even on a perfectly compliant server. They now go through the same
// direct/sudo -n/unavailable path as `sshd -T` and fail2ban-client.
describe("evaluateAudit - ufw status and sshd -t require privileges", () => {
  test("unavailable probes SKIP instead of FAIL, exit 0 by default", () => {
    const probes = conformingProbes();
    probes.ufwStatus = unavailableProbe();
    probes.sshdConfigTest = unavailableProbe();

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, false);

    expect(results.find((r) => r.label === "UFW est actif")?.status).toBe("SKIP");
    expect(results.find((r) => r.label === "Configuration OpenSSH valide")?.status).toBe("SKIP");
    expect(summary.fail).toBe(0);
    expect(summary.skip).toBe(2);
    expect(summary.exitCode).toBe(0);
  });

  test("--strict turns the same SKIPs into a non-zero exit code", () => {
    const probes = conformingProbes();
    probes.ufwStatus = unavailableProbe();
    probes.sshdConfigTest = unavailableProbe();

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, true);

    expect(summary.exitCode).toBe(1);
  });

  test("available and compliant probes still report OK", () => {
    const results = evaluateAudit(conformingProbes(), "deploy");
    expect(results.find((r) => r.label === "UFW est actif")?.status).toBe("OK");
    expect(results.find((r) => r.label === "Configuration OpenSSH valide")?.status).toBe("OK");
  });
});

// The SSH-key check reads two probes (authorized_keys size, ~/.ssh perms).
// A missing privilege on ONE of them must not mask a definitive FAIL proven
// by the OTHER: only "neither probe can prove anything" should SKIP.
describe("evaluateAudit - ssh key check distinguishes FAIL from SKIP under partial privileges", () => {
  const label = "Clé SSH installée pour deploy";

  test("both probes unavailable: SKIP, exit 0 by default", () => {
    const probes = conformingProbes();
    probes.authorizedKeysSize = unavailableProbe();
    probes.sshDirPerms = unavailableProbe();

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, false);

    expect(results.find((r) => r.label === label)?.status).toBe("SKIP");
    expect(summary.fail).toBe(0);
    expect(summary.exitCode).toBe(0);
  });

  test("both probes unavailable, --strict: exit 1", () => {
    const probes = conformingProbes();
    probes.authorizedKeysSize = unavailableProbe();
    probes.sshDirPerms = unavailableProbe();

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, true);

    expect(summary.exitCode).toBe(1);
  });

  test("key probe proves an empty authorized_keys even if the perms probe is unavailable: FAIL, not SKIP", () => {
    const probes = conformingProbes();
    probes.authorizedKeysSize = privProbe("0 /home/deploy/.ssh/authorized_keys");
    probes.sshDirPerms = unavailableProbe();

    const results = evaluateAudit(probes, "deploy");

    expect(results.find((r) => r.label === label)?.status).toBe("FAIL");
  });

  test("perms probe proves wrong ~/.ssh mode even if the key probe is unavailable: FAIL, not SKIP", () => {
    const probes = conformingProbes();
    probes.authorizedKeysSize = unavailableProbe();
    probes.sshDirPerms = privProbe("755");

    const results = evaluateAudit(probes, "deploy");

    expect(results.find((r) => r.label === label)?.status).toBe("FAIL");
  });

  test("key probe compliant but perms probe unavailable: SKIP (cannot confirm OK)", () => {
    const probes = conformingProbes();
    probes.sshDirPerms = unavailableProbe();

    const results = evaluateAudit(probes, "deploy");

    expect(results.find((r) => r.label === label)?.status).toBe("SKIP");
  });

  test("perms probe compliant but key probe unavailable: SKIP (cannot confirm OK)", () => {
    const probes = conformingProbes();
    probes.authorizedKeysSize = unavailableProbe();

    const results = evaluateAudit(probes, "deploy");

    expect(results.find((r) => r.label === label)?.status).toBe("SKIP");
  });

  test("both probes available and compliant: OK", () => {
    const results = evaluateAudit(conformingProbes(), "deploy");
    expect(results.find((r) => r.label === label)?.status).toBe("OK");
  });
});

// Previously untested verdict logic, found by mutation testing (Vador,
// P1-4): a mutant that always returns OK for these checks, or ignores one
// of the two probes feeding a check, survived because no test exercised the
// non-conforming branch at all.
describe("evaluateAudit - previously untested verdicts (mutation-testing gaps)", () => {
  test("apt-get -s upgrade itself failing produces FAIL, not a false OK", () => {
    const probes = conformingProbes();
    probes.aptUpgrade = probe("", 100, "E: Could not open lock file");

    const results = evaluateAudit(probes, "deploy");
    expect(results.find((r) => r.label === "Aucune mise à jour de sécurité en attente")?.status).toBe("FAIL");
  });

  test("id failing (no such user) produces FAIL, not a false OK", () => {
    const probes = conformingProbes();
    probes.userId = probe("id: 'deploy': no such user", 1, "id: 'deploy': no such user");

    const results = evaluateAudit(probes, "deploy");
    expect(results.find((r) => r.label === "L'utilisateur deploy existe")?.status).toBe("FAIL");
  });

  test("fail2ban service inactive fails the check even if the jail probe responds", () => {
    const probes = conformingProbes();
    probes.fail2banService = probe("inactive");

    const results = evaluateAudit(probes, "deploy");
    expect(results.find((r) => r.label === "fail2ban et le jail sshd sont actifs")?.status).toBe("FAIL");
  });

  test("fail2ban jail not responding fails the check even if the service is active", () => {
    const probes = conformingProbes();
    probes.fail2banJail = privProbe("", { exitCode: 255, stderr: "Sorry but the jail 'sshd' does not exist" });

    const results = evaluateAudit(probes, "deploy");
    expect(results.find((r) => r.label === "fail2ban et le jail sshd sont actifs")?.status).toBe("FAIL");
  });
});

// Yoda's arbitration, 05-08-2026: the `hardening` role only auto-applies
// security updates by design, so a check for "any pending package" would
// FAIL permanently on the very profile it certifies. The check is scoped to
// the security pocket ("<codename>-security") and renamed to say so.
describe("evaluateAudit - pending upgrades check is scoped to security updates", () => {
  const label = "Aucune mise à jour de sécurité en attente";

  test("pending SECURITY upgrades produce FAIL", () => {
    const probes = conformingProbes();
    probes.aptUpgrade = probe(
      [
        "Reading package lists...",
        "Building dependency tree...",
        "Calculating upgrade...",
        "Inst openssh-server [1:8.9p1-3ubuntu0.6] (1:8.9p1-3ubuntu0.10 Ubuntu:22.04/jammy-security [amd64])",
        "Inst libssl3 [3.0.2-0ubuntu1.10] (3.0.2-0ubuntu1.15 Ubuntu:22.04/jammy-security [amd64])",
        "2 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
      ].join("\n")
    );

    const results = evaluateAudit(probes, "deploy");
    const result = results.find((r) => r.label === label);

    expect(result?.status).toBe("FAIL");
    expect(result?.detail).toContain("2");
  });

  test("pending NON-security upgrades do not fail the check: scope is security-only, by design", () => {
    const probes = conformingProbes();
    probes.aptUpgrade = probe(
      [
        "Reading package lists...",
        "Building dependency tree...",
        "Calculating upgrade...",
        "Inst neofetch [7.1.0-1] (7.1.0-2 Ubuntu:22.04/jammy-updates [amd64])",
        "1 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
      ].join("\n")
    );

    const results = evaluateAudit(probes, "deploy");
    expect(results.find((r) => r.label === label)?.status).toBe("OK");
  });

  // P2-A (Vador, round 2): the previous version matched "-security" against
  // the WHOLE `Inst` line, so a package whose NAME merely contains
  // "-security" was flagged as a pending security update even though its
  // update came from the ordinary pocket. Real, non-exotic packages hit
  // this: `debian-security-support` ships by default on Debian installs.
  // Only the parenthesized origin field must be tested, never the package
  // name to its left.
  test("a package NAME containing '-security', updated from the ordinary pocket, does not fail the check", () => {
    const probes = conformingProbes();
    probes.aptUpgrade = probe(
      [
        "Reading package lists...",
        "Building dependency tree...",
        "Calculating upgrade...",
        "Inst debian-security-support [13+2024] (13+2025 Ubuntu:26.04/plucky-updates [all])",
        "Inst php-symfony-security-core [5.4.21] (5.4.31 Ubuntu:26.04/plucky-updates [all])",
        "2 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
      ].join("\n")
    );

    const results = evaluateAudit(probes, "deploy");
    expect(results.find((r) => r.label === label)?.status).toBe("OK");
  });

  // Witness for the fix above: a genuine security update must still FAIL,
  // including on the Debian-flavoured origin format (`Debian-Security:12/
  // stable-security`), which differs from Ubuntu's `Ubuntu:22.04/jammy-security`.
  test("a genuine security update still fails the check (Debian origin format)", () => {
    const probes = conformingProbes();
    probes.aptUpgrade = probe(
      [
        "Reading package lists...",
        "Building dependency tree...",
        "Calculating upgrade...",
        "Inst libc-bin [2.36-9+deb12u7] (2.36-9+deb12u8 Debian-Security:12/stable-security [amd64])",
        "1 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
      ].join("\n")
    );

    const results = evaluateAudit(probes, "deploy");
    expect(results.find((r) => r.label === label)?.status).toBe("FAIL");
  });
});

// Yoda's arbitration, 05-08-2026 (point 3): `apt-get -s upgrade` reads a
// local cache that this command never refreshes (correct for a read-only
// audit), so a stale cache would render a false "[OK] no pending update".
// SKIP means "could not measure reliably", exactly like the privilege gaps
// in P1-3, and it blocks under --strict the same way.
describe("evaluateAudit - stale apt cache makes the check indeterminate, not falsely OK", () => {
  const label = "Aucune mise à jour de sécurité en attente";

  test("cache older than the 7-day threshold: SKIP, exit 0 by default", () => {
    const probes = conformingProbes();
    probes.aptListsMtime = aptListsMtime(10);

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, false);

    expect(results.find((r) => r.label === label)?.status).toBe("SKIP");
    expect(summary.fail).toBe(0);
    expect(summary.exitCode).toBe(0);
  });

  test("cache older than the threshold, --strict: exit 1", () => {
    const probes = conformingProbes();
    probes.aptListsMtime = aptListsMtime(10);

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, true);

    expect(summary.exitCode).toBe(1);
  });

  test("cache within the threshold still evaluates normally: OK when compliant", () => {
    const probes = conformingProbes();
    probes.aptListsMtime = aptListsMtime(1);

    const results = evaluateAudit(probes, "deploy");
    expect(results.find((r) => r.label === label)?.status).toBe("OK");
  });

  test("cache age probe itself unavailable (stat failed): SKIP, not a false OK", () => {
    const probes = conformingProbes();
    probes.aptListsMtime = probe("", 1, "stat: cannot stat '/var/lib/apt/lists': No such file or directory");

    const results = evaluateAudit(probes, "deploy");
    expect(results.find((r) => r.label === label)?.status).toBe("SKIP");
  });
});

// P1-3 (Vador): `runPrivileged` used to treat ANY non-zero exit after the
// sudo fallback as "unavailable", so a check that genuinely ran as root and
// found a real problem (invalid sshd_config, missing fail2ban jail) came
// back as SKIP instead of FAIL, exiting 0 on a broken server. These tests
// exercise `runPrivileged` itself with a scripted executor: no SSH involved.
describe("runPrivileged - collection layer, no SSH involved (injected exec)", () => {
  test("direct success: no sudo attempt needed, unavailable false", async () => {
    const exec = sequencedExec({ exitCode: 0, stdout: "ok", stderr: "" });
    const result = await runPrivileged(fakeServer(), "ufw status", exec);
    expect(result).toEqual({ exitCode: 0, stdout: "ok", stderr: "", unavailable: false });
  });

  test("direct fails, sudo -n succeeds: falls back and reports available", async () => {
    const calls: string[] = [];
    const exec: RemoteExec = async (_server, command) => {
      calls.push(command);
      return command.startsWith("sudo -n ")
        ? { exitCode: 0, stdout: "Status: active", stderr: "" }
        : { exitCode: 1, stdout: "", stderr: "Permission denied" };
    };

    const result = await runPrivileged(fakeServer(), "ufw status", exec);

    expect(result).toEqual({ exitCode: 0, stdout: "Status: active", stderr: "", unavailable: false });
    expect(calls).toEqual(["ufw status", "sudo -n ufw status"]);
  });

  test("both attempts fail with a sudo authorization error: unavailable true (SKIP)", async () => {
    const exec = sequencedExec(
      { exitCode: 1, stdout: "", stderr: "Permission denied" },
      { exitCode: 1, stdout: "", stderr: "sudo: a password is required" }
    );
    const result = await runPrivileged(fakeServer(), "sshd -T", exec);
    expect(result.unavailable).toBe(true);
  });

  // Yoda's round-2 arbitration: the CHECKED tool being genuinely absent is
  // itself the answer for a hardening control (no ufw = no firewall), not a
  // measurement we failed to take. Only sudo itself being unusable is.
  test("the checked tool's own binary does not exist (sudo ran fine): unavailable false (FAIL downstream, not SKIP)", async () => {
    const exec = sequencedExec(
      { exitCode: 127, stdout: "", stderr: "bash: ufw: command not found" },
      { exitCode: 127, stdout: "", stderr: "sudo: ufw: command not found" }
    );
    const result = await runPrivileged(fakeServer(), "ufw status", exec);
    expect(result.unavailable).toBe(false);
  });

  test("sudo itself is not installed: unavailable true (SKIP), even though the direct attempt also failed rc 127", async () => {
    const exec = sequencedExec(
      { exitCode: 1, stdout: "", stderr: "Permission denied" },
      { exitCode: 127, stdout: "", stderr: "bash: sudo: command not found" }
    );
    const result = await runPrivileged(fakeServer(), "ufw status", exec);
    expect(result.unavailable).toBe(true);
  });

  test("the privileged attempt runs and reports a real, non-privilege failure: unavailable false (FAIL downstream, not SKIP)", async () => {
    // This is the exact P1-3 regression: fail2ban-client running as root but
    // the sshd jail is not configured must not read as "could not check".
    const exec = sequencedExec(
      { exitCode: 1, stdout: "", stderr: "Permission denied" },
      { exitCode: 255, stdout: "", stderr: "Sorry but the jail 'sshd' does not exist" }
    );
    const result = await runPrivileged(fakeServer(), "fail2ban-client status sshd", exec);
    expect(result.unavailable).toBe(false);
    expect(result.exitCode).toBe(255);
  });
});

describe("looksLikePrivilegeFailure - pattern matching", () => {
  test("recognizes sudo's own refusal messages (no rights, needs a password, no tty): privilege failure", () => {
    expect(looksLikePrivilegeFailure({ exitCode: 1, stdout: "", stderr: "sudo: a password is required" })).toBe(true);
    expect(looksLikePrivilegeFailure({ exitCode: 1, stdout: "", stderr: "sudo: user deploy is not allowed to run sudo" })).toBe(true);
  });

  test("recognizes sudo itself being absent as a privilege failure", () => {
    expect(looksLikePrivilegeFailure({ exitCode: 127, stdout: "", stderr: "bash: sudo: command not found" })).toBe(true);
  });

  // Yoda's round-2 arbitration (P1-3 follow-up): a bare rc 127, or sudo
  // itself reporting that the CHECKED tool is missing (the tool's name sits
  // between "sudo:" and "command not found"), is NOT a privilege failure.
  // The tool being absent is the finding, not a gap in the measurement.
  test("does not flag the checked tool's own binary being absent, even at rc 127", () => {
    expect(looksLikePrivilegeFailure({ exitCode: 127, stdout: "", stderr: "sudo: ufw: command not found" })).toBe(false);
    expect(looksLikePrivilegeFailure({ exitCode: 127, stdout: "", stderr: "sudo: fail2ban-client: command not found" })).toBe(false);
    expect(looksLikePrivilegeFailure({ exitCode: 127, stdout: "", stderr: "bash: ufw: command not found" })).toBe(false);
  });

  test("does not flag a real tool error that merely has a non-zero exit code", () => {
    expect(looksLikePrivilegeFailure({ exitCode: 255, stdout: "", stderr: "Sorry but the jail 'sshd' does not exist" })).toBe(false);
    expect(
      looksLikePrivilegeFailure({ exitCode: 1, stdout: "", stderr: "/etc/ssh/sshd_config line 10: Bad configuration option: PermitRootLoginn" })
    ).toBe(false);
  });
});

// End-to-end proof that P1-3 is fixed: build the probe with the real
// `runPrivileged` (scripted exec, still no SSH) and feed it through
// `evaluateAudit`, checking the final verdict and exit code, not just the
// intermediate `unavailable` flag.
describe("evaluateAudit - P1-3 end-to-end: a check that ran and failed is FAIL, not a SKIP that exits 0", () => {
  test("invalid sshd_config: FAIL, exit 1", async () => {
    const exec = sequencedExec(
      { exitCode: 1, stdout: "", stderr: "/etc/ssh/sshd_config line 10: Bad configuration option: PermitRootLoginn" },
      { exitCode: 1, stdout: "", stderr: "/etc/ssh/sshd_config line 10: Bad configuration option: PermitRootLoginn" }
    );
    const sshdConfigTest = await runPrivileged(fakeServer(), "sshd -t", exec);
    const probes = { ...conformingProbes(), sshdConfigTest };

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, false);

    expect(results.find((r) => r.label === "Configuration OpenSSH valide")?.status).toBe("FAIL");
    expect(summary.exitCode).toBe(1);
  });

  test("fail2ban jail sshd missing: FAIL, exit 1 (not a SKIP that exits 0)", async () => {
    const exec = sequencedExec(
      { exitCode: 1, stdout: "", stderr: "Permission denied" },
      { exitCode: 255, stdout: "", stderr: "Sorry but the jail 'sshd' does not exist" }
    );
    const fail2banJail = await runPrivileged(fakeServer(), "fail2ban-client status sshd", exec);
    const probes = { ...conformingProbes(), fail2banJail };

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, false);

    expect(results.find((r) => r.label === "fail2ban et le jail sshd sont actifs")?.status).toBe("FAIL");
    expect(summary.exitCode).toBe(1);
  });

  // Yoda's round-2 arbitration: ufw genuinely not installed is not "could
  // not check", it IS the finding (no firewall). Flipped from SKIP to FAIL.
  test("ufw genuinely not installed: FAIL, exit 1 (round-2 arbitration, was SKIP/exit 0)", async () => {
    const exec = sequencedExec(
      { exitCode: 127, stdout: "", stderr: "bash: ufw: command not found" },
      { exitCode: 127, stdout: "", stderr: "sudo: ufw: command not found" }
    );
    const ufwStatus = await runPrivileged(fakeServer(), "ufw status", exec);
    const probes = { ...conformingProbes(), ufwStatus };

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, false);

    expect(results.find((r) => r.label === "UFW est actif")?.status).toBe("FAIL");
    expect(summary.exitCode).toBe(1);
  });

  // fail2ban-client absent mirrors the ufw case exactly, and is the other
  // concrete example Yoda called out: fail2ban not installed is a real
  // finding for "fail2ban et le jail sshd sont actifs", not an indeterminate.
  test("fail2ban-client genuinely not installed: FAIL, exit 1", async () => {
    const exec = sequencedExec(
      { exitCode: 1, stdout: "", stderr: "Permission denied" },
      { exitCode: 127, stdout: "", stderr: "sudo: fail2ban-client: command not found" }
    );
    const fail2banJail = await runPrivileged(fakeServer(), "fail2ban-client status sshd", exec);
    const probes = { ...conformingProbes(), fail2banJail };

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, false);

    expect(results.find((r) => r.label === "fail2ban et le jail sshd sont actifs")?.status).toBe("FAIL");
    expect(summary.exitCode).toBe(1);
  });

  // Contrast case, the other sense: sudo itself missing genuinely can't be
  // told apart from "maybe compliant, maybe not" — that stays SKIP.
  test("sudo itself not installed: still SKIP, exit 0 by default (the privilege gap that remains a privilege gap)", async () => {
    const exec = sequencedExec(
      { exitCode: 1, stdout: "", stderr: "Permission denied" },
      { exitCode: 127, stdout: "", stderr: "bash: sudo: command not found" }
    );
    const ufwStatus = await runPrivileged(fakeServer(), "ufw status", exec);
    const probes = { ...conformingProbes(), ufwStatus };

    const results = evaluateAudit(probes, "deploy");
    const summary = summarizeAudit(results, false);

    expect(results.find((r) => r.label === "UFW est actif")?.status).toBe("SKIP");
    expect(summary.exitCode).toBe(0);
  });
});

// P1-4 (Vador, mutant M10): the exact regression Yoda had the previous
// version fix (authorized_keys probe silently downgraded to a plain,
// non-escalating call) survived every test because collectAuditProbes was
// never exercised. This drives it through an injected exec and checks which
// probes actually retry through `sudo -n` and which never do.
describe("collectAuditProbes - wiring: which probes escalate privileges", () => {
  test("privileged probes retry via sudo -n; non-privileged probes never do", async () => {
    const exec: RemoteExec = async (_server, command) =>
      command.startsWith("sudo -n ")
        ? { exitCode: 0, stdout: "SUDO_OK", stderr: "" }
        : { exitCode: 1, stdout: "", stderr: "Permission denied" };

    const probes = await collectAuditProbes(fakeServer(), "deploy", exec);

    const privileged = ["ufwStatus", "sshdConfigTest", "sshdParams", "fail2banJail", "authorizedKeysSize", "sshDirPerms"] as const;
    for (const key of privileged) {
      expect(probes[key]).toEqual({ exitCode: 0, stdout: "SUDO_OK", stderr: "", unavailable: false });
    }

    const nonPrivileged = ["fail2banService", "userId", "aptUpgrade", "aptListsMtime"] as const;
    for (const key of nonPrivileged) {
      expect(probes[key]).toEqual({ exitCode: 1, stdout: "", stderr: "Permission denied" });
    }
  });
});
