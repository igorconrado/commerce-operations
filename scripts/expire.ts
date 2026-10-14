import { expireDue } from "../src/server/lifecycle";
import { pool } from "../src/server/db";
try {
  console.info(
    JSON.stringify({ event: "orders.expire", selected: await expireDue() }),
  );
} finally {
  await pool.end();
}
