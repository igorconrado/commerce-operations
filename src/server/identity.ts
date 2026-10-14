import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { pool } from "./db";
import type { Principal } from "../domain/reservations";
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, digest] = hash.split(":");
  const expected = Buffer.from(digest, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function authenticate(
  request: Request,
): Promise<Principal | null> {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("session="))
    ?.slice(8);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await pool.query(
    `SELECT u.id,u.organization_id AS "organizationId",u.role
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`,
    [tokenHash(token)],
  );
  return rows[0] ?? null;
}
export function trustedOrigin(request: Request) {
  return (
    request.headers.get("origin") ===
    (process.env.APP_ORIGIN ?? "http://127.0.0.1:3100")
  );
}
