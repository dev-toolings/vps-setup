import { Command } from "commander";
import chalk from "chalk";
import { execa } from "execa";
import { PersistenceManager, buildSSHArgs, testSSHConnection } from "@/core/index.ts";
import type { Server } from "@/types/index.ts";
import { error, info, header, newline } from "@/utils/index.ts";

/**
 * Read-only audit of the hardening controls this repository actually
 * provisions (UFW, sshd hardening, fail2ban, deploy user, pending security
 * upgrades).
 *
 * The module is split in two halves on purpose:
 * - collection (`collectAuditProbes`) talks to the remote server over SSH
 *   and only gathers raw command output, it never judges anything.
 * - evaluation (`evaluateAudit`, `summarizeAudit`) is pure: it takes the raw
 *   probe output and renders verdicts. This half is what audit.test.ts
 *   exercises without any SSH connection. It takes the current time as an
 *   explicit parameter (defaulting to `Date.now()`) instead of reading the
 *   clock itself, so cache-staleness checks stay deterministic under test.
 */

export type CheckStatus = "OK" | "FAIL" | "SKIP";

export interface CheckResult {
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface ProbeOutput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface PrivilegedProbeOutput extends ProbeOutput {
  /** true when neither the direct command nor `sudo -n` could run it */
  unavailable: boolean;
}

export interface AuditProbes {
  ufwStatus: PrivilegedProbeOutput;
  sshdConfigTest: PrivilegedProbeOutput;
  sshdParams: PrivilegedProbeOutput;
  fail2banService: ProbeOutput;
  fail2banJail: PrivilegedProbeOutput;
  userId: ProbeOutput;
  authorizedKeysSize: PrivilegedProbeOutput;
  sshDirPerms: PrivilegedProbeOutput;
  aptUpgrade: ProbeOutput;
  /** mtime (epoch seconds, from `stat -c %Y`) of /var/lib/apt/lists: tells us how stale the package index is. */
  aptListsMtime: ProbeOutput;
}

export interface AuditSummary {
  ok: number;
  fail: number;
  skip: number;
  exitCode: 0 | 1;
}

const LABELS = {
  ufw: "UFW est actif",
  sshdConfig: "Configuration OpenSSH valide",
  rootLogin: "Login root SSH refusé",
  passwordAuth: "Mots de passe SSH refusés",
  kbdInteractive: "Keyboard-interactive refusé",
  fail2ban: "fail2ban et le jail sshd sont actifs",
  userExists: (user: string) => `L'utilisateur ${user} existe`,
  sshKey: (user: string) => `Clé SSH installée pour ${user}`,
  // Scoped to security updates on purpose (Yoda's arbitration, 05-08-2026):
  // the `hardening` role only auto-applies the security pocket, by design,
  // to avoid taking the dpkg lock or rebooting a Docker/PostgreSQL host.
  // Non-security packages accumulate forever, so a check for "any pending
  // package" would FAIL permanently on the very profile it certifies — an
  // audit that never turns green trains its reader to ignore it. The label
  // says exactly what is measured, nothing more.
  pendingSecurityUpgrades: "Aucune mise à jour de sécurité en attente",
} as const;

// Below this age, we trust a "no pending security update" read from the
// local apt cache. Above it, `apt-get -s upgrade` is answering questions
// about a package index that may no longer reflect reality: a "0 pending"
// result at that point is not a measurement, it's a guess. Documented
// threshold per Yoda's request, not a value APT itself enforces.
const STALE_APT_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

const PROBE_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Collection (impure: talks to the remote host over SSH)
//
// The actual SSH call is isolated behind the `RemoteExec` type so tests can
// inject a scripted executor and drive exit codes without ever touching a
// network socket. `collectAuditProbes` and `runPrivileged` both accept an
// `exec` parameter that defaults to the real `sshExec`.
// ---------------------------------------------------------------------------

export type RemoteExec = (server: Server, command: string) => Promise<ProbeOutput>;

async function sshExec(server: Server, command: string): Promise<ProbeOutput> {
  try {
    const result = await execa("ssh", buildSSHArgs(server, command), {
      timeout: PROBE_TIMEOUT_MS,
      reject: false,
    });
    return {
      exitCode: result.exitCode ?? null,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (err) {
    return {
      exitCode: null,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Failure signatures that mean "this could not even be attempted": sudo
 * itself refusing to run (no rights, no cached credentials under -n) or
 * sudo itself not being installed. Any other non-zero exit, INCLUDING the
 * checked tool's own binary being absent, is a real, privilege-independent
 * failure: we asked a question and got an answer. A missing `ufw` on a
 * hardening target does not mean "could not check whether the firewall is
 * active", it means there is no firewall — that is itself the finding, so
 * it is a FAIL, not a SKIP (Yoda's arbitration, 05-08-2026, round 2: the
 * previous version SKIPped on rc 127 unconditionally, and an uninstalled
 * ufw or fail2ban-client silently exited 0).
 *
 * The two "tool absent" cases are told apart by WHAT is reported missing,
 * not by the mere presence of "command not found": when sudo itself can't
 * be found, the calling shell reports it as `sudo: command not found`; when
 * sudo runs fine and it is the CHECKED tool that's missing, sudo reports it
 * itself as `sudo: <tool>: command not found`, with the tool's name wedged
 * between `sudo:` and `command not found`. Only the first shape is a
 * privilege gap.
 *
 * This is a best-effort text match on the last attempted command (the
 * `sudo -n` one), not a guarantee: it only recognizes the wording
 * OpenSSH/sudo/bash/dash produce in practice on Debian/Ubuntu. A tool that
 * phrases a genuine privilege error differently would be misclassified as a
 * FAIL instead of a SKIP. Documented, not solved: perfectly distinguishing
 * "no privilege" from "ran and failed" for arbitrary commands would require
 * a per-tool exit-code contract this repository does not have. Separately,
 * `ufw`/`sshd` live in /usr/sbin, outside a non-root user's default PATH:
 * the classification only trusts the `sudo -n` attempt's error text
 * precisely because sudo's `secure_path` (Debian/Ubuntu default) includes
 * /usr/sbin, so "sudo: ufw: command not found" reliably means ufw is truly
 * absent rather than merely unreachable from a restricted PATH. A sudoers
 * configuration without `secure_path` could still produce a false FAIL
 * here; not solved, documented.
 */
const SUDO_ITSELF_REFUSED_PATTERNS = [/sudo:.*password is required/i, /sudo:.*is not allowed to/i, /sudo:.*no tty present/i];
const SUDO_ITSELF_MISSING_PATTERN = /sudo:\s*command not found/i;

export function looksLikePrivilegeFailure(result: ProbeOutput): boolean {
  const text = `${result.stderr}\n${result.stdout}`;

  if (SUDO_ITSELF_REFUSED_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }
  if (SUDO_ITSELF_MISSING_PATTERN.test(text)) {
    return true;
  }

  // Anything else — a bare rc 127, or sudo itself reporting that the
  // CHECKED tool is missing — is treated as a real, negative answer.
  return false;
}

/**
 * Runs a command that requires root. Tries it directly first (covers the
 * case where the SSH user already is root), then falls back to `sudo -n`
 * (non-interactive: never prompts, never hangs). The probe is marked
 * unavailable ONLY when the final failure looks like sudo itself being
 * unusable (see `looksLikePrivilegeFailure`); a command that ran under
 * sudo and returned a real error — invalid config, jail not configured,
 * or the checked tool's own binary being absent (no ufw = no firewall,
 * that's the answer, not a gap in the measurement) — stays a normal
 * failed probe, evaluated as FAIL by the caller. SKIP means "could not
 * check", never "checked and it's bad".
 */
export async function runPrivileged(server: Server, command: string, exec: RemoteExec = sshExec): Promise<PrivilegedProbeOutput> {
  const direct = await exec(server, command);
  if (direct.exitCode === 0) {
    return { ...direct, unavailable: false };
  }

  const viaSudo = await exec(server, `sudo -n ${command}`);
  if (viaSudo.exitCode === 0) {
    return { ...viaSudo, unavailable: false };
  }

  return { ...viaSudo, unavailable: looksLikePrivilegeFailure(viaSudo) };
}

export async function collectAuditProbes(server: Server, deployUser: string, exec: RemoteExec = sshExec): Promise<AuditProbes> {
  const home = `~${deployUser}`;

  // ufw status, sshd -t, and reading another user's ~/.ssh both require root
  // in practice (ufw refuses to run as non-root; the deploy user's home is
  // 0700 so nobody else can read into it). They go through runPrivileged.
  // Note: the file/dir path is passed as a COMMAND ARGUMENT, never through
  // shell input redirection (`< path`) — a redirection is opened by the
  // calling (unprivileged) shell before `sudo` ever runs, so it would still
  // fail even with a working sudo. Passing the path as an argument lets the
  // privileged process itself open the file.
  const ufwStatus = await runPrivileged(server, "ufw status", exec);
  const sshdConfigTest = await runPrivileged(server, "sshd -t", exec);
  const sshdParams = await runPrivileged(server, "sshd -T", exec);
  const fail2banService = await exec(server, "systemctl is-active fail2ban");
  const fail2banJail = await runPrivileged(server, "fail2ban-client status sshd", exec);
  const userId = await exec(server, `id ${deployUser}`);
  const authorizedKeysSize = await runPrivileged(server, `wc -c ${home}/.ssh/authorized_keys`, exec);
  const sshDirPerms = await runPrivileged(server, `stat -c %a ${home}/.ssh`, exec);
  const aptUpgrade = await exec(server, "apt-get -s upgrade");
  // World-readable directory, no root needed: a directory's own mtime moves
  // whenever `apt-get update` last touched its contents.
  const aptListsMtime = await exec(server, "stat -c %Y /var/lib/apt/lists");

  return {
    ufwStatus,
    sshdConfigTest,
    sshdParams,
    fail2banService,
    fail2banJail,
    userId,
    authorizedKeysSize,
    sshDirPerms,
    aptUpgrade,
    aptListsMtime,
  };
}

// ---------------------------------------------------------------------------
// Evaluation (pure: no SSH, no side effects, fully unit-testable)
// ---------------------------------------------------------------------------

function firstLine(text: string): string | undefined {
  const line = text.split("\n")[0]?.trim();
  return line ? line : undefined;
}

function extractSshdDirective(output: string, directive: string): string | undefined {
  const pattern = new RegExp(`^${directive}\\s+(\\S+)`, "im");
  return output.match(pattern)?.[1]?.toLowerCase();
}

function evaluateSshdDirective(
  probe: PrivilegedProbeOutput,
  directive: string,
  expected: string,
  label: string
): CheckResult {
  if (probe.unavailable) {
    return { label, status: "SKIP", detail: "sshd -T inaccessible sans privilèges root" };
  }
  const value = extractSshdDirective(probe.stdout, directive);
  if (value === undefined) {
    return { label, status: "FAIL", detail: `directive ${directive} absente de la sortie sshd -T` };
  }
  return {
    label,
    status: value === expected ? "OK" : "FAIL",
    detail: `${directive} ${value}`,
  };
}

function evaluateFail2ban(service: ProbeOutput, jail: PrivilegedProbeOutput): CheckResult {
  const label = LABELS.fail2ban;
  if (jail.unavailable) {
    return { label, status: "SKIP", detail: "fail2ban-client inaccessible sans privilèges root" };
  }
  const serviceActive = service.exitCode === 0 && service.stdout.trim() === "active";
  const jailResponds = jail.exitCode === 0;
  return {
    label,
    status: serviceActive && jailResponds ? "OK" : "FAIL",
    detail: serviceActive ? undefined : `service fail2ban: ${service.stdout.trim() || service.stderr.trim() || "inactive"}`,
  };
}

function evaluateUfwActive(probe: PrivilegedProbeOutput): CheckResult {
  const label = LABELS.ufw;
  if (probe.unavailable) {
    return { label, status: "SKIP", detail: "ufw status inaccessible sans privilèges root" };
  }
  const active = probe.exitCode === 0 && /^Status:\s*active/im.test(probe.stdout);
  return {
    label,
    status: active ? "OK" : "FAIL",
    detail: firstLine(probe.stdout) || probe.stderr.trim() || undefined,
  };
}

function evaluateSshdConfigValid(probe: PrivilegedProbeOutput): CheckResult {
  const label = LABELS.sshdConfig;
  if (probe.unavailable) {
    return { label, status: "SKIP", detail: "sshd -t inaccessible sans privilèges root" };
  }
  return {
    label,
    status: probe.exitCode === 0 ? "OK" : "FAIL",
    detail: probe.exitCode === 0 ? undefined : probe.stderr.trim() || probe.stdout.trim() || undefined,
  };
}

/**
 * Distinguishes three states instead of collapsing everything unavailable
 * into SKIP: if EITHER probe already proves non-compliance on its own
 * (key missing/empty, or wrong directory permissions), that is a definitive
 * FAIL regardless of whether the other probe could run. SKIP is reserved
 * for the case where neither probe can prove a failure and at least one of
 * them could not be read at all, so OK cannot be asserted either.
 */
function evaluateSshKey(keyProbe: PrivilegedProbeOutput, dirProbe: PrivilegedProbeOutput, deployUser: string): CheckResult {
  const label = LABELS.sshKey(deployUser);

  const keyAvailable = !keyProbe.unavailable;
  const sizeMatch = keyProbe.exitCode === 0 ? keyProbe.stdout.trim().match(/^(\d+)/) : null;
  const size = sizeMatch ? parseInt(sizeMatch[1], 10) : NaN;
  const keyOk = keyAvailable && keyProbe.exitCode === 0 && Number.isFinite(size) && size > 0;
  const keyBad = keyAvailable && !keyOk;

  const dirAvailable = !dirProbe.unavailable;
  const perms = dirProbe.exitCode === 0 ? dirProbe.stdout.trim() : undefined;
  const dirOk = dirAvailable && perms === "700";
  const dirBad = dirAvailable && !dirOk;

  if (keyBad || dirBad) {
    const reasons: string[] = [];
    if (keyBad) reasons.push("authorized_keys absent ou vide");
    if (dirBad) reasons.push(`permissions ~/.ssh: ${perms ?? "introuvable"}`);
    return { label, status: "FAIL", detail: reasons.join("; ") };
  }

  if (keyOk && dirOk) {
    return { label, status: "OK", detail: `${size} octets, permissions ${perms}` };
  }

  const missing: string[] = [];
  if (!keyAvailable) missing.push("authorized_keys illisible sans privilèges root");
  if (!dirAvailable) missing.push("permissions ~/.ssh illisibles sans privilèges root");
  return { label, status: "SKIP", detail: missing.join("; ") };
}

// Debian and Ubuntu both name their security pocket "<codename>-security"
// (bookworm-security, jammy-security, ...), which `apt-get -s upgrade`
// prints inside the ORIGIN field of each `Inst` line, i.e. inside the
// parentheses: `Inst <pkg> [<old>] (<new> <origin> [<arch>])`. This is the
// same convention the `hardening` role's unattended-upgrades template
// targets (`ansible/roles/hardening/templates/50unattended-upgrades.j2:9`),
// so the audit measures exactly what that role promises to keep current.
//
// The match is deliberately restricted to that parenthesized group, never
// the whole line: several real Debian/Ubuntu package NAMES contain
// "-security" (`debian-security-support`, `php-symfony-security-core`, ...)
// while being served from the ordinary pocket. Matching the full line
// flagged those as pending security updates and made `--strict` fail
// permanently on a host that had none, which is exactly the failure mode
// the security-only scope was introduced to avoid (Vador, round 2, P2-A).
function isSecurityUpgradeLine(line: string): boolean {
  const origin = line.match(/\(([^)]*)\)/)?.[1];
  return origin !== undefined && /-security\b/i.test(origin);
}

function evaluatePendingSecurityUpgrades(aptUpgrade: ProbeOutput, aptListsMtime: ProbeOutput, now: number): CheckResult {
  const label = LABELS.pendingSecurityUpgrades;

  const mtimeSeconds = aptListsMtime.exitCode === 0 ? parseInt(aptListsMtime.stdout.trim(), 10) : NaN;
  if (aptListsMtime.exitCode !== 0 || !Number.isFinite(mtimeSeconds)) {
    return { label, status: "SKIP", detail: "âge du cache apt (/var/lib/apt/lists) indéterminé" };
  }

  const ageMs = now - mtimeSeconds * 1000;
  if (ageMs > STALE_APT_CACHE_MS) {
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const thresholdDays = STALE_APT_CACHE_MS / (24 * 60 * 60 * 1000);
    return {
      label,
      status: "SKIP",
      detail: `cache apt vieux de ${ageDays} jour(s) (seuil ${thresholdDays} jours) : mesure non fiable`,
    };
  }

  if (aptUpgrade.exitCode !== 0) {
    return { label, status: "FAIL", detail: aptUpgrade.stderr.trim() || "apt-get -s upgrade a échoué" };
  }

  const pendingSecurity = (aptUpgrade.stdout.match(/^Inst\s.*$/gm) || []).filter(isSecurityUpgradeLine).length;
  return {
    label,
    status: pendingSecurity === 0 ? "OK" : "FAIL",
    detail: pendingSecurity === 0 ? undefined : `${pendingSecurity} mise(s) à jour de sécurité en attente`,
  };
}

export function evaluateAudit(probes: AuditProbes, deployUser: string, now: number = Date.now()): CheckResult[] {
  return [
    evaluateUfwActive(probes.ufwStatus),
    evaluateSshdConfigValid(probes.sshdConfigTest),
    evaluateSshdDirective(probes.sshdParams, "permitrootlogin", "no", LABELS.rootLogin),
    evaluateSshdDirective(probes.sshdParams, "passwordauthentication", "no", LABELS.passwordAuth),
    evaluateSshdDirective(probes.sshdParams, "kbdinteractiveauthentication", "no", LABELS.kbdInteractive),
    evaluateFail2ban(probes.fail2banService, probes.fail2banJail),
    {
      label: LABELS.userExists(deployUser),
      status: probes.userId.exitCode === 0 ? "OK" : "FAIL",
      detail: probes.userId.exitCode === 0 ? firstLine(probes.userId.stdout) : probes.userId.stderr.trim() || probes.userId.stdout.trim() || undefined,
    },
    evaluateSshKey(probes.authorizedKeysSize, probes.sshDirPerms, deployUser),
    evaluatePendingSecurityUpgrades(probes.aptUpgrade, probes.aptListsMtime, now),
  ];
}

export function summarizeAudit(results: CheckResult[], strict: boolean): AuditSummary {
  const ok = results.filter((r) => r.status === "OK").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  const hasFailure = fail > 0 || (strict && skip > 0);
  return { ok, fail, skip, exitCode: hasFailure ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// CLI wiring
// ---------------------------------------------------------------------------

function printResults(serverName: string, results: CheckResult[], summary: AuditSummary): void {
  header(`Audit: ${serverName}`);
  for (const result of results) {
    const line = `[${result.status}] ${result.label}`;
    if (result.status === "OK") {
      console.log(chalk.green(line));
    } else if (result.status === "FAIL") {
      console.log(chalk.red(line));
    } else {
      console.log(chalk.yellow(line));
    }
    if (result.detail) {
      console.log(chalk.gray(`    ${result.detail}`));
    }
  }
  newline();
  info(`${summary.ok} OK, ${summary.fail} FAIL, ${summary.skip} SKIP`);
}

export function createAuditCommand(pm: PersistenceManager): Command {
  const audit = new Command("audit")
    .description("Read-only audit of the hardening controls provisioned on a VPS (non-zero exit on failure)")
    .argument("<server>", "Server name to audit")
    .option("--deploy-user <name>", "Deploy account to check", "deploy")
    .option("--strict", "Treat SKIP results as failures")
    .option("--json", "Output results as JSON instead of formatted text")
    .action(async (serverName: string, options) => {
      const server = pm.getServer(serverName);
      if (!server) {
        error(`Server "${serverName}" not found`);
        process.exit(1);
      }

      const deployUser: string = options.deployUser;
      if (!/^[a-zA-Z0-9_-]+$/.test(deployUser)) {
        error(`Invalid --deploy-user value: "${deployUser}"`);
        process.exit(1);
      }

      const ssh = await testSSHConnection(server);
      if (!ssh.success) {
        error(`SSH failed: ${ssh.error || "unknown error"}`);
        process.exit(1);
      }

      const probes = await collectAuditProbes(server, deployUser);
      const results = evaluateAudit(probes, deployUser);
      const strict = Boolean(options.strict);
      const summary = summarizeAudit(results, strict);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              server: serverName,
              deployUser,
              strict,
              results,
              summary,
            },
            null,
            2
          )
        );
      } else {
        printResults(serverName, results, summary);
      }

      process.exit(summary.exitCode);
    });

  return audit;
}
