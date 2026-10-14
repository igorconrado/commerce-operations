import { spawn } from "node:child_process";
const test = process.argv.includes("--test");
process.env.DATABASE_URL ??= `postgresql://commerce:local-synthetic-only@127.0.0.1:${test ? 55441 : 55440}/${test ? "commerce_test" : "commerce"}`;
process.env.SEED_PASSWORD ??= "Synthetic-Test-Password";
const args = process.argv.slice(2).filter((a) => a !== "--test");
if (!args.length) throw new Error("Provide a command");
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
