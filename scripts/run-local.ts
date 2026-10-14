import { spawn } from "node:child_process";
import { globSync } from "node:fs";
const test = process.argv.includes("--test");
process.env.DATABASE_URL ??= `postgresql://commerce:local-synthetic-only@127.0.0.1:${test ? 55441 : 55440}/${test ? "commerce_test" : "commerce"}`;
process.env.SEED_PASSWORD ??= "Synthetic-Test-Password";
const commandArgs = process.argv.slice(2);
const testFlag = commandArgs.indexOf("--test");
if (testFlag >= 0) commandArgs.splice(testFlag, 1);
const args = commandArgs.flatMap((a) => (a.includes("*") ? globSync(a) : [a]));
if (!args.length) throw new Error("Provide a command");
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
