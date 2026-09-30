import { BrowserContext, Page, expect, test } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "A interface é testada no Chromium; o determinismo roda nos três navegadores.");

const gen = (page: Page) => page.getByTestId("gen");

async function waitGeneration(page: Page, n: number, timeout = 60_000): Promise<void> {
  await expect.poll(async () => Number((await gen(page).textContent()) ?? "0"), { timeout }).toBeGreaterThanOrEqual(n);
}

async function fast(page: Page): Promise<void> {
  await page.getByRole("radio", { name: "20x" }).click();
}

async function context(browser: import("@playwright/test").Browser, options: Parameters<import("@playwright/test").Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"], ...options });
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

test("a simulação roda no Worker e avança sem erros no console", async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Fósforo" })).toBeVisible();
  await fast(page);
  await waitGeneration(page, 3);
  await expect(page.getByRole("img", { name: /Rede neural/ })).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("a 20x com o caos ligado a interface não trava (nenhuma tarefa longa no thread principal)", async ({ browser }) => {
  const ctx = await context(browser);
  await ctx.addInitScript(() => {
    (window as unknown as { __long: number[] }).__long = [];
    new PerformanceObserver((list) => list.getEntries().forEach((e) => (window as unknown as { __long: number[] }).__long.push(e.duration))).observe({ entryTypes: ["longtask"] });
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Modo caos/ }).click();
  await fast(page);
  await waitGeneration(page, 3, 90_000);
  // A interface segue respondendo enquanto o Worker trabalha: ajustar um controle é imediato.
  const t0 = Date.now();
  await page.getByLabel("Mutação de pesos").fill("0.5");
  expect(Date.now() - t0).toBeLessThan(1500);
  const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  const worst = Math.max(0, ...long);
  console.log(`[chaos 20x] tarefas longas: ${long.length}, pior: ${Math.round(worst)} ms`);
  expect(worst).toBeLessThan(250);
  await ctx.close();
});

test("com prefers-reduced-motion a simulação começa pausada e avança uma geração por vez", async ({ browser }) => {
  const ctx = await context(browser, { reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByText(/Você pediu menos animação/)).toBeVisible();
  await page.waitForTimeout(1500);
  expect(Number(await gen(page).textContent())).toBe(0);
  await page.getByRole("button", { name: "Avançar uma geração" }).click();
  await waitGeneration(page, 1, 10_000);
  await page.waitForTimeout(800);
  expect(Number(await gen(page).textContent())).toBe(1);
  await ctx.close();
});

test("fases 2 a 10 começam bloqueadas; a IA completar a fase 1 libera a 2; 'desbloquear tudo' libera todas", async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto("/");
  const reta = page.getByRole("button", { name: /Reta/ });
  await expect(reta).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: /Agulha/ })).toHaveAttribute("aria-disabled", "true");
  await fast(page);
  await expect(reta).not.toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
  await page.getByRole("button", { name: "Desbloquear tudo" }).click();
  await expect(page.getByRole("button", { name: /Agulha/ })).not.toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: /Agulha/ }).click();
  await expect(page.getByTestId("seed")).toHaveText("1");
  // O progresso persiste ao recarregar (localStorage).
  await page.reload();
  await expect(page.getByRole("button", { name: /Reta/ })).not.toHaveAttribute("aria-disabled", "true");
  await ctx.close();
});

test("sem localStorage a interface continua funcionando", async ({ browser }) => {
  const ctx = await context(browser);
  await ctx.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("bloqueado");
      },
    });
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await fast(page);
  await waitGeneration(page, 2);
  await expect(page.getByText(/não deixou guardar o progresso/)).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("link do cérebro em FASE EMBUTIDA: exporta, abre em outra aba e joga contra ele", async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto("/");
  await fast(page);
  await waitGeneration(page, 2);
  await page.getByRole("button", { name: "Copiar link", exact: true }).click();
  await expect(page.getByText(/Link copiado/)).toBeVisible();
  const url = await readClipboard(page);
  expect(url).toContain("#b=");

  const other = await ctx.newPage();
  await other.goto(url);
  await expect(other.getByText(/Cérebro carregado do link/)).toBeVisible();
  await expect(other.getByRole("heading", { name: /Cérebro importado · fase 1 \(Largada\)/ })).toBeVisible();
  await other.getByTestId("play-canvas").click();
  await other.waitForTimeout(6000);
  const cerebro = await other.getByText("Cérebro", { exact: true }).locator("xpath=following-sibling::span").first().textContent();
  console.log(`[link embutida] canos do cérebro após 6 s: ${cerebro}`);
  expect(Number(cerebro)).toBeGreaterThan(0);
  await ctx.close();
});

test("link inválido mostra mensagem clara e não quebra a página", async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#b=AAAA");
  await expect(page.getByRole("alert").filter({ hasText: /link|cérebro|curto/i }).first()).toBeVisible();
  await fast(page);
  await waitGeneration(page, 1);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("editor: valida ao vivo, bloqueia fase inviável e desfaz; link de cérebro em FASE CUSTOMIZADA", async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Editor de fases" }).click();
  await expect(page.getByRole("heading", { name: "Editor de fases" })).toBeVisible();

  const train = page.getByRole("button", { name: /Treinar a IA nesta fase/ });
  await expect(page.getByText(/Viável\./)).toBeVisible({ timeout: 15_000 });
  await expect(train).toBeEnabled();
  await expect(page.getByText(/folga -?\d+/).first()).toBeVisible();

  // Estreita o vão do cano 1 até o mínimo: a fase deixa de ser viável.
  await page.getByLabel("Abertura do vão").focus();
  await page.keyboard.press("Home");
  await expect(page.getByText(/Impossível|raspando/)).toBeVisible({ timeout: 15_000 });
  await expect(train).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled();

  // Desfazer volta a fase ao estado viável.
  await page.getByRole("button", { name: /Desfazer/ }).click();
  await expect(page.getByText(/Viável\./)).toBeVisible({ timeout: 15_000 });
  await expect(train).toBeEnabled();

  // Teclado: seta move o vão selecionado; Ctrl+Z desfaz.
  const ruler = page.getByTestId("editor-ruler");
  await ruler.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /Desfazer/ })).toBeEnabled();

  // Adiciona um cano e guarda; recarregar mantém a fase guardada.
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText(/7 de 60 canos/)).toBeVisible();
  await expect(page.getByText(/Viável\./)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(/guardada neste navegador/)).toBeVisible();

  // Treina a IA na fase própria e exporta o cérebro.
  await train.click();
  await expect(page.getByRole("button", { name: /Fase própria/ })).toBeVisible();
  await fast(page);
  await waitGeneration(page, 2);
  await page.getByRole("button", { name: "Copiar link", exact: true }).click();
  await expect(page.getByText(/Link copiado/)).toBeVisible();
  const url = await readClipboard(page);
  expect(url).toContain("#b=");

  const other = await ctx.newPage();
  await other.goto(url);
  await expect(other.getByText(/Cérebro carregado do link/)).toBeVisible();
  await expect(other.getByRole("heading", { name: /Cérebro importado · fase própria/ })).toBeVisible();
  await other.getByTestId("play-canvas").click();
  await other.waitForTimeout(5000);
  const cerebro = await other.getByText("Cérebro", { exact: true }).locator("xpath=following-sibling::span").first().textContent();
  console.log(`[link customizada] canos do cérebro após 5 s: ${cerebro}`);
  expect(Number(cerebro)).toBeGreaterThan(0);

  // A fase guardada sobrevive a um recarregamento.
  await page.reload();
  await page.getByRole("button", { name: "Editor de fases" }).click();
  await expect(page.getByText("Minha fase").first()).toBeVisible();
  await ctx.close();
});

test("link de fase (#f=) abre o editor com a fase validada; fase impossível é recusada", async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Editor de fases" }).click();
  await expect(page.getByText(/Viável\./)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Link$/ }).click();
  await expect(page.getByText(/Link da fase copiado/)).toBeVisible();
  const url = await readClipboard(page);
  expect(url).toContain("#f=");

  const other = await ctx.newPage();
  await other.goto(url);
  await expect(other.getByText(/Fase carregada do link e validada/)).toBeVisible();
  await expect(other.getByRole("heading", { name: "Editor de fases" })).toBeVisible();

  const bad = await ctx.newPage();
  await bad.goto("/#f=AAAAAAAAAAAA");
  await expect(bad.getByRole("alert").first()).toBeVisible();
  await ctx.close();
});

test("humano vs IA na mesma fase, com placar", async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto("/");
  await fast(page);
  await waitGeneration(page, 1);
  await page.getByRole("button", { name: /Jogar contra o melhor pássaro/ }).click();
  await expect(page.getByTestId("play-canvas")).toBeVisible();
  await page.keyboard.press("Space");
  await page.waitForTimeout(4000);
  await expect(page.getByText("canos na fase")).toBeVisible();
  await page.getByRole("button", { name: "Voltar à evolução" }).first().click();
  await expect(page.getByRole("button", { name: /Pausar|Continuar|Iniciar/ }).first()).toBeVisible();
  await ctx.close();
});

test("celular: seções em abas, navegação por teclado e sem rolagem horizontal", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/");
  const tablist = page.getByRole("tablist", { name: "Seções do laboratório" });
  await expect(tablist).toBeVisible();
  for (const name of ["Cérebro", "Gráficos", "Parâmetros", "Fases", "Jogo"]) {
    await tablist.getByRole("tab", { name }).click();
    await expect(tablist.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `rolagem horizontal na aba ${name}`).toBeLessThanOrEqual(1);
  }
  await tablist.getByRole("tab", { name: "Jogo" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tablist.getByRole("tab", { name: "Cérebro" })).toHaveAttribute("aria-selected", "true");
  await ctx.close();
});

test("run estagnada (seed 1333, fase 10): mostra o aviso e 'Tentar outra seed' recomeça", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto("/#seed=1333&fase=10&modo=fase");
  await expect(page.getByTestId("seed")).toHaveText("1333");
  await fast(page);
  const banner = page.getByText("Esta run estagnou. Tente outra seed.");
  await expect(banner).toBeVisible({ timeout: 200_000 });
  await page.getByRole("button", { name: "Tentar outra seed" }).click();
  await expect(page.getByTestId("seed")).not.toHaveText("1333");
  await expect(banner).toBeHidden();
  await ctx.close();
});

test("colar outro link de run na mesma aba (hashchange) reinicia a run", async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto("/#seed=11&fase=1&modo=fase");
  await expect(page.getByTestId("seed")).toHaveText("11");
  await page.evaluate(() => {
    window.location.hash = "#seed=22&fase=2&modo=fase";
  });
  await expect(page.getByTestId("seed")).toHaveText("22", { timeout: 10_000 });
  await ctx.close();
});

test("link de run com fase e gravidade incompatíveis não deixa a interface sem run nem travada", async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto("/#seed=5&fase=10&g=0.2");
  const rodando = page.getByTestId("seed").filter({ hasText: "5" });
  const recusou = page.getByText(/Nenhuma run ativa/);
  await expect(rodando.or(recusou)).toBeVisible({ timeout: 15_000 });
  // Em qualquer dos dois casos, escolher outra fase recupera a interface.
  await page.getByRole("button", { name: "Desbloquear tudo" }).click();
  await page.getByRole("button", { name: /Largada/ }).click();
  await expect(page.getByTestId("gen")).toBeVisible({ timeout: 15_000 });
  await ctx.close();
});
