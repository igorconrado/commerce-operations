import { pool, transaction } from "../src/server/db";
import { hashPassword } from "../src/server/identity";
export const fixtures = {
  alpha: "10000000-0000-4000-8000-000000000001",
  beta: "10000000-0000-4000-8000-000000000002",
  operator: "20000000-0000-4000-8000-000000000001",
  viewer: "20000000-0000-4000-8000-000000000002",
  other: "20000000-0000-4000-8000-000000000003",
  variant: "30000000-0000-4000-8000-000000000001",
  otherVariant: "30000000-0000-4000-8000-000000000002",
};
export async function seed() {
  if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 12)
    throw new Error("Set SEED_PASSWORD with at least 12 characters");
  const hash = hashPassword(process.env.SEED_PASSWORD);
  await transaction(async (client) => {
    await client.query(
      "INSERT INTO organizations VALUES($1,'Aurora Supply'),($2,'Cedro Goods') ON CONFLICT DO NOTHING",
      [fixtures.alpha, fixtures.beta],
    );
    for (const [id, org, email, role] of [
      [fixtures.operator, fixtures.alpha, "operator@aurora.test", "operator"],
      [fixtures.viewer, fixtures.alpha, "viewer@aurora.test", "viewer"],
      [fixtures.other, fixtures.beta, "operator@cedro.test", "operator"],
    ]) {
      await client.query(
        "INSERT INTO users(id,organization_id,email,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [id, org, email, hash, role],
      );
    }
    await client.query(
      "INSERT INTO products(id,organization_id,name) VALUES($1,$2,'Luminária de mesa'),($3,$4,'Caderno pontilhado') ON CONFLICT DO NOTHING",
      [fixtures.variant, fixtures.alpha, fixtures.otherVariant, fixtures.beta],
    );
    await client.query(
      "INSERT INTO customers(id,organization_id,name) VALUES($1,$1,'Cliente demonstrativo Aurora'),($2,$2,'Cliente demonstrativo Cedro') ON CONFLICT DO NOTHING",
      [fixtures.alpha, fixtures.beta],
    );
    await client.query(
      `INSERT INTO variants(id,organization_id,sku,name,price_cents,available,product_id) VALUES
      ($1,$2,'LMP-01','Luminária de mesa · areia',18900,10,$1),($3,$4,'CAD-01','Caderno pontilhado · musgo',4900,10,$3) ON CONFLICT DO NOTHING`,
      [fixtures.variant, fixtures.alpha, fixtures.otherVariant, fixtures.beta],
    );
  });
}
if (process.argv[1]?.endsWith("seed.ts")) {
  await seed();
  await pool.end();
}
