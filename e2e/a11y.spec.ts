import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "axe roda no Chromium.");

async function scan(page: import("@playwright/test").Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} nó(s) ${v.nodes[0]?.target.join(" ")}`);
  console.log(`[axe ${label}] violações: ${summary.length ? "\n  " + summary.join("\n  ") : "nenhuma"}`);
  expect(results.violations, `${label}: ${summary.join("; ")}`).toEqual([]);
}

test("acessibilidade (WCAG 2.1 AA): laboratório no desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("radio", { name: "20x" }).click();
  await expect.poll(async () => Number(await page.getByTestId("gen").textContent())).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Pausar" }).click();
  await page.waitForTimeout(400); // deixa a transição de 80 ms do botão terminar antes de medir o contraste
  await scan(page, "laboratório");
});

test("acessibilidade (WCAG 2.1 AA): editor de fases", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Editor de fases" }).click();
  await expect(page.getByText(/Viável\./)).toBeVisible({ timeout: 15_000 });
  await scan(page, "editor");
});

test("acessibilidade (WCAG 2.1 AA): celular, aba Fases e Parâmetros", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const name of ["Parâmetros", "Fases", "Cérebro", "Gráficos"]) {
    await page.getByRole("tab", { name }).click();
    await scan(page, `celular ${name}`);
  }
});
