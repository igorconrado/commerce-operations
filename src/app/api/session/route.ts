import { randomBytes } from "node:crypto";
import { z } from "zod";
import { pool } from "../../../server/db";
import {
  hashPassword,
  tokenHash,
  trustedOrigin,
  verifyPassword,
} from "../../../server/identity";
const credentials = z
  .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
  .strict();
const dummyHash = hashPassword(randomBytes(32).toString("hex"));
export async function POST(request: Request) {
  if (!trustedOrigin(request))
    return Response.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const text = await request.text();
  if (Buffer.byteLength(text) > 2048)
    return new Response(null, { status: 413 });
  let body;
  try {
    body = credentials.safeParse(JSON.parse(text));
  } catch {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  if (!body.success)
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  const budget = await pool.query(
    `INSERT INTO login_budgets(subject_hash) VALUES($1)
    ON CONFLICT(subject_hash) DO UPDATE SET
      attempts=CASE WHEN login_budgets.started_at < now()-interval '15 minutes' THEN 1 ELSE login_budgets.attempts+1 END,
      started_at=CASE WHEN login_budgets.started_at < now()-interval '15 minutes' THEN now() ELSE login_budgets.started_at END
    RETURNING attempts`,
    [tokenHash(body.data.email.toLowerCase())],
  );
  if (budget.rows[0].attempts > 20)
    return Response.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": "900" } },
    );
  const { rows } = await pool.query(
    "SELECT id,password_hash FROM users WHERE email=$1 AND active",
    [body.data.email.toLowerCase()],
  );
  const valid = verifyPassword(
    body.data.password,
    rows[0]?.password_hash ?? dummyHash,
  );
  if (!rows[0] || !valid)
    return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '2 hours')",
    [tokenHash(token), rows[0].id],
  );
  return Response.json(
    { ok: true },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
      },
    },
  );
}
export async function DELETE(request: Request) {
  if (!trustedOrigin(request)) return new Response(null, { status: 403 });
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("session="))
    ?.slice(8);
  if (token)
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      tokenHash(token),
    ]);
  return Response.json(
    { ok: true },
    {
      headers: {
        "set-cookie": "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        "cache-control": "no-store",
      },
    },
  );
}
