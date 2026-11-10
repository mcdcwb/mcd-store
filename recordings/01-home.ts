// Vídeo 01-home — entrada da faixa, marquee e catálogo com filtros (~10 s).
// Rodar: npm run record:01   (front em http://localhost:5173 e backend local no ar)
import { startRecording, smoothScrollTo, pause, PACE } from "./helpers.ts";

const TIMING = {
  marqueeMs: 3000,   // marquee passando, com o cursor parado fora da faixa
  endMs: 1500,       // pausa final com a grade enquadrada
  scrollPxPerSecond: 500, // rolagem mais calma que o padrão neste vídeo
};
PACE.scrollPxPerSecond = TIMING.scrollPxPerSecond;

const rec = await startRecording("01-home");
const { page } = rec;
try {
  // 1. Abre já gravando; o corte remove só os quadros em branco antes da página pintar.
  //    A seta fica à direita, abaixo da faixa (fora dela, para o hover não pausar o marquee).
  await rec.open("/", { trim: "paint", cursorAt: { x: 1640, y: 760 } });

  // 2. Espera o charStagger terminar e o marquee começar a andar (o x da trilha muda).
  const track = page.getByTestId("service-strip-track");
  await track.waitFor({ state: "attached" });
  const trackX = () => track.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
  const parked = await (async () => {
    // Fim da entrada: o letreiro fica visível com a trilha parada na posição inicial.
    await page.waitForFunction(() => {
      const strip = document.querySelector('[data-testid="service-strip"]');
      return strip && getComputedStyle(strip.lastElementChild as Element).visibility === "visible"
        && !(document.querySelector('[data-testid="service-strip-track"]')?.lastElementChild?.classList.contains("invisible"));
    }, null, { timeout: 15000 });
    return trackX();
  })();
  await page.waitForFunction(([x]) => {
    const el = document.querySelector('[data-testid="service-strip-track"]');
    return !!el && Math.abs(new DOMMatrix(getComputedStyle(el).transform).m41 - x) > 0.5;
  }, [parked], { timeout: 10000, polling: "raf" });

  // 3. Marquee passando por 3 s.
  await pause(TIMING.marqueeMs);

  // 4. Rola até a seção "Todas as Peças", com os filtros e a grade logo abaixo do cabeçalho fixo.
  await page.locator(".store-catalog-grid").waitFor();
  const headerBottom = await page.locator("header").first().evaluate(el => el.getBoundingClientRect().bottom);
  await smoothScrollTo(page.getByRole("heading", { name: "Todas as Peças" }), { top: headerBottom + 32 });

  // 5. Pausa final.
  await pause(TIMING.endMs);
} finally {
  await rec.finish();
}
