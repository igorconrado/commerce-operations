import { test, expect } from "@playwright/test";
import pg from "pg";
test("login, reserve, reload and role restriction reach the real database", async ({
  page,
}) => {
  const db = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://commerce:local-synthetic-only@127.0.0.1:55441/commerce_test",
  });
  try {
    await db.query("UPDATE variants SET available=10 WHERE sku='LMP-01'");
    await page.goto("/");
    await page
      .getByLabel("Senha", { exact: true })
      .fill("Synthetic-Test-Password");
    await page.getByRole("button", { name: "Entrar na operação" }).click();
    await expect(
      page.getByRole("heading", { name: "Catálogo de estoque" }),
    ).toBeVisible();
    await page.getByLabel("Quantidade", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Registrar reserva" }).click();
    await expect(page.getByText(/Reserva .* registrada/)).toBeVisible();
    await expect(page.locator(".stock-number strong")).toHaveText("8");
    await page.reload();
    await expect(page.locator(".stock-number strong")).toHaveText("8");
    expect(
      (await db.query("SELECT available FROM variants WHERE sku='LMP-01'"))
        .rows[0].available,
    ).toBe(8);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.tmp/${test.info().project.name}-operations.png`,
      fullPage: true,
    });
    const latest = page.locator("tbody tr").first();
    await latest.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(
      page.getByText("Reserva cancelada e estoque liberado."),
    ).toBeVisible();
    await expect(page.locator(".stock-number strong")).toHaveText("10");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await page.getByLabel("E-mail", { exact: true }).fill("viewer@aurora.test");
    await page
      .getByLabel("Senha", { exact: true })
      .fill("Synthetic-Test-Password");
    await page.getByRole("button", { name: "Entrar na operação" }).click();
    await expect(
      page.getByText("Seu acesso permite consultar pedidos e estoque."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Registrar reserva" }),
    ).toHaveCount(0);
  } finally {
    await db.end();
  }
});
test("keyboard login, network error and retry preserve the reservation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("Synthetic-Test-Password");
  await page.getByLabel("Senha", { exact: true }).press("Tab");
  await expect(
    page.getByRole("button", { name: "Entrar na operação" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Quantidade", { exact: true })).toBeVisible();
  await page.route("**/api/graphql", async (route) => {
    if (route.request().postData()?.includes("mutation Reserve"))
      await route.abort();
    else await route.continue();
  });
  await page.getByRole("button", { name: "Registrar reserva" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "mesma tentativa" }),
  ).toContainText("mesma tentativa");
  await expect(page.locator(".operation-feedback")).toBeFocused();
  await expect(
    page.getByRole("alert").filter({ hasText: "mesma tentativa" }),
  ).toBeInViewport();
  await page.unroute("**/api/graphql");
  await page
    .getByRole("button", { name: "Consultar tentativa anterior" })
    .click();
  await expect(page.getByText(/Reserva .* registrada/)).toBeVisible();
  await expect(page.locator(".operation-feedback")).toBeFocused();
  await expect(page.getByText(/Reserva .* registrada/)).toBeInViewport();
});
