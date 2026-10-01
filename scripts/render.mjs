// Gera as imagens do README (assets/*.png) recortando as seções do site
// (www.alexandremartins.dev) direto da página no ar.
//
// Tudo sai em 2x para ficar nítido em telas de alta densidade. Rode de novo
// sempre que o site mudar, para o README não ficar defasado.
//
// Requisitos: Chrome ou Chromium instalado (usado via playwright-core, sem
// baixar navegador; aponte CHROME_PATH para o executável se não for o Chrome
// padrão) e acesso à internet.
//
//   cd scripts && npm install && npm run render

import { chromium } from "playwright-core";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets");
const site = "https://www.alexandremartins.dev/";

// Cada recorte do site e o arquivo que ele vira em assets/. Quando há "tab",
// clica antes na aba de mesmo índice da seção de projetos. "pad" dá respiro a
// recortes que não são uma seção inteira e por isso não têm margem própria.
const shots = [
  { out: "hero", selector: "#inicio" },
  { out: "sobre", selector: "#sobre" },
  { out: "numeros", selector: "#sobre + section" },
  { out: "experiencia", selector: "#experiencia" },
  { out: "projetos-sites", selector: "#projetos", tab: 0 },
  { out: "projetos-saas", selector: "#projetos .site-shell > .grid", tab: 1, pad: true },
  { out: "projetos-github", selector: "#projetos .site-shell > .grid", tab: 2, pad: true },
  // Só a coluna de texto: o calendário de contribuições entra ao vivo no README.
  { out: "impacto", selector: "#impacto .grid > div:first-child", pad: true },
  { out: "clientes", selector: "#impacto + section" },
  { out: "contato", selector: "#contato" },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" },
);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(site, { waitUntil: "networkidle" });

// Cabeçalho fixo e botão flutuante de conversa ficariam por cima dos recortes.
await page.addStyleTag({
  content: `
    header, a.fixed { display: none !important; }
    .readme-pad { padding: 64px 72px !important; background: var(--background); }
  `,
});

// O site revela o conteúdo conforme a rolagem, então desce a página inteira
// antes de recortar qualquer coisa.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 300) {
    window.scrollTo(0, y);
    await new Promise((ok) => setTimeout(ok, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(1200);

for (const { out, selector, tab, pad } of shots) {
  if (tab !== undefined) {
    await page.locator("#projetos button").nth(tab).click();
    await page.waitForTimeout(800);
  }
  // Tira o mouse e o foco de cima dos cards para nenhum sair com estado de hover.
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur());
  const el = page.locator(selector).first();
  if (pad) await el.evaluate((node) => node.classList.add("readme-pad"));
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const raw = await el.screenshot({ animations: "disabled" });
  if (pad) await el.evaluate((node) => node.classList.remove("readme-pad"));

  // A captura crua passa de 1 MB por imagem. Paleta com dithering (libimagequant,
  // o mesmo do pngquant) derruba bastante sem criar faixas visíveis.
  const { size } = await sharp(raw)
    .png({ palette: true, quality: 92, dither: 1, effort: 10, compressionLevel: 9 })
    .toFile(join(outDir, `${out}.png`));
  console.log(`  assets/${out}.png  ${Math.round(size / 1024)} KB`);
}

await browser.close();
