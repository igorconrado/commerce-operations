import { spawnSync } from "node:child_process";
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(command, ["audit", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
const report = JSON.parse(result.stdout);
if (report.error) throw new Error(report.error.summary);
const allowed = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const remaining = [];
for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
  for (const advisory of entry.via) {
    if (typeof advisory === "string") continue;
    if (name === "braces" && advisory.url === allowed) {
      console.warn(
        "KNOWN DEVELOPMENT RISK: braces stack exhaustion in fixed repository lint globs; no fixed release available. See docs/security.md.",
      );
    } else remaining.push({ name, ...advisory });
  }
}
if (remaining.length) {
  console.error(JSON.stringify(remaining, null, 2));
  process.exit(1);
}
if (result.status && !Object.keys(report.vulnerabilities ?? {}).length)
  process.exit(result.status);
