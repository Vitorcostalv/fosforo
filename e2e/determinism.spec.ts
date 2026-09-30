import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const golden = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "tests", "golden.json"), "utf8")) as Record<string, string>;

test("mesma seed, mesma evolução: hashes deste navegador batem com o golden do Node", async ({ page, browserName }) => {
  await page.goto("/selftest");
  const pre = page.getByTestId("hashes");
  await expect(pre).toHaveAttribute("data-ready", "1", { timeout: 90_000 });
  const actual = JSON.parse((await pre.textContent()) ?? "{}") as Record<string, string>;
  console.log(`[${browserName}]`, JSON.stringify(actual));
  expect(actual).toEqual(golden);
});
