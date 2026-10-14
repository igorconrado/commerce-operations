import EmbeddedPostgres from "embedded-postgres";
import { mkdir } from "node:fs/promises";
const testMode = process.argv.includes("--test");
const directory = testMode ? ".tmp/postgres-test" : ".tmp/postgres";
await mkdir(directory, { recursive: true });
const db = new EmbeddedPostgres({
  databaseDir: directory,
  user: "commerce",
  password: "local-synthetic-only",
  port: testMode ? 55441 : 55440,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: console.error,
});
await db.initialise();
await db.start();
const name = testMode ? "commerce_test" : "commerce";
try {
  await db.createDatabase(name);
} catch (error) {
  if (!String(error).includes("already exists")) throw error;
}
console.info(
  `PostgreSQL ready on 127.0.0.1:${testMode ? 55441 : 55440}, database ${name}`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await db.stop();
    process.exit(0);
  });
await new Promise(() => {});
