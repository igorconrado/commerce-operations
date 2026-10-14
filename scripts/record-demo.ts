import { chromium } from "@playwright/test";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir(".tmp/demo", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: ".tmp/demo", size: { width: 1280, height: 900 } },
});
const page = await context.newPage();
try {
  await page.goto("http://127.0.0.1:3100");
  await page.waitForTimeout(1000);
  await page
    .getByLabel("Senha", { exact: true })
    .fill("Synthetic-Test-Password");
  await page.getByRole("button", { name: "Entrar na operação" }).click();
  await page.getByLabel("Quantidade", { exact: true }).fill("1");
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Registrar reserva" }).click();
  await page.getByText(/Reserva .* registrada/).waitFor();
  await page.waitForTimeout(1200);
  await page
    .getByRole("heading", { name: "Pedidos registrados" })
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await page.getByText("Reserva cancelada e estoque liberado.").waitFor();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByRole("heading", { name: "Catálogo de estoque" }).waitFor();
  await page.waitForTimeout(1200);
  await context.close();
  const video = await page.video()!.path();
  await copyFile(video, ".tmp/demo/commerce-flow.webm");
  console.info("Recorded .tmp/demo/commerce-flow.webm");
} finally {
  await browser.close();
}
