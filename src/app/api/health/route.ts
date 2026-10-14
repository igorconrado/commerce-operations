import { pool } from "../../../server/db";
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return Response.json(
      { status: "ready" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
