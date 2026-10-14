import { test } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { transaction } from "../../src/server/db";

for (const fail of [false, true]) {
  test(`borrowed transaction client ${fail ? "rolls back" : "commits"} without releasing its session lock`, async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
      },
      release: () => {
        throw new Error("Borrowed client must remain owned by caller");
      },
    } as unknown as PoolClient;
    const operation = transaction(async (connection) => {
      assert.equal(connection, client);
      if (fail) throw new Error("injected failure");
      return "committed result";
    }, client);
    if (fail) await assert.rejects(operation, /injected failure/);
    else assert.equal(await operation, "committed result");
    assert.deepEqual(statements, ["BEGIN", fail ? "ROLLBACK" : "COMMIT"]);
  });
}
