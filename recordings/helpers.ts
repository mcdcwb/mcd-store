// Helpers compartilhados pelos scripts de gravação dos vídeos de demonstração.
// Uso: node recordings/01-home.ts  (Node 24 executa TypeScript direto; ver "record:*" no package.json)
//
// Regras fixas:
// - Só grava contra o front LOCAL (http://localhost:5173) e o backend local por trás do proxy /api.
//   Não há variável para trocar a URL: nunca apontar para produção (Vercel/Render/Neon).
// - Contexto limpo: sem login, localStorage vazio.
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_URL = "http://localhost:5173";
export const VIEWPORT = { width: 1920, height: 1080 };
export const OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "output");
const RAW_DIR = join(OUTPUT_DIR, "raw");

// Ritmo padrão (ms). Ajuste aqui para deixar todos os vídeos mais lentos/rápidos.
// O navegador roda sem slowMo: todo o ritmo vem destas constantes e das pausas explícitas (pause()).
// Pausas maiores ficam nos roteiros, só onde há algo para ler (toast, requisitos, avisos).
export const PACE = {
  pauseMin: 400,          // pause() sem argumento: aleatório entre pauseMin e pauseMax
  pauseMax: 600,
  moveMinMs: 250,         // mouse: duração do movimento curto...
  moveMaxMs: 500,         // ...e do longo (cresce com a distância, com easing)
  moveFullDistancePx: 1000, // a partir desta distância o movimento dura moveMaxMs
  beforeClickMs: 120,     // parado sobre o alvo antes de clicar
  typeDelayMs: 45,        // atraso entre teclas no typeHuman
  scrollMinMs: 700,       // rolagem: duração da curta...
  scrollMaxMs: 1600,      // ...e da longa (cresce com a distância, com easing, como o mouse)
  scrollFullDistancePx: 1200, // a partir desta distância a rolagem dura scrollMaxMs
};
// Abertura dos vídeos que começam na home (open("/") com o corte padrão): parado no topo, com a
// página pronta (imagens visíveis e fontes carregadas), antes da primeira ação do roteiro.
export const HOME_INTRO = {
  holdMs: 2000,
  cursor: { x: 1640, y: 900 }, // fora da faixa do marquee (o hover a pausaria)
};

// ─── Pré-checagens ────────────────────────────────────────────────────────────

async function checkServers() {
  const front = await fetch(BASE_URL, { cache: "no-store" }).catch(() => null);
  if (!front || !front.ok)
    throw new Error(`O front não está no ar em ${BASE_URL}. Rode "npm run dev" na raiz do mcd-store e tente de novo.`);
  // O backend é verificado pelo mesmo caminho que o site usa (proxy /api do Vite).
  const api = await fetch(`${BASE_URL}/api/produtos`, { cache: "no-store" }).catch(() => null);
  const body = api?.ok ? await api.json().catch(() => null) : null;
  if (!Array.isArray(body))
    throw new Error(`O backend não respondeu em ${BASE_URL}/api/produtos (status ${api?.status ?? "sem resposta"}). Rode "npm run dev" em backend/ e confira o banco local.`);
  if (!body.length) console.warn("Aviso: o catálogo está vazio; o vídeo vai mostrar a loja sem produtos.");
}

function checkFfmpeg() {
  for (const tool of ["ffmpeg", "ffprobe"]) {
    if (spawnSync(tool, ["-version"], { stdio: "ignore" }).status !== 0)
      throw new Error(`"${tool}" não foi encontrado no PATH. Instale o FFmpeg antes de gravar.`);
  }
}

// ─── Cursor visível ──────────────────────────────────────────────────────────
// O vídeo do Playwright não mostra o cursor do sistema: injetamos uma seta que segue os
// eventos de mouse (page.mouse.move gera mousemove reais) e faz um "pulse" no clique.
// A última posição fica em sessionStorage para a seta reaparecer no lugar após recarregar a página.
const CURSOR_SCRIPT = `(() => {
  if (window.top !== window) return;
  const KEY = "__rec_cursor";
  const install = () => {
    if (document.getElementById("__rec-cursor")) return;
    const style = document.createElement("style");
    style.textContent = \`
      #__rec-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647;
        pointer-events: none; will-change: transform; transform: translate(-100px, -100px);
        filter: drop-shadow(0 1px 2px rgba(0,0,0,.45)); }
      #__rec-cursor svg { display: block; transform-origin: 3px 2px; transition: transform .12s ease-out; }
      #__rec-cursor.is-down svg { transform: scale(.86); }
      .__rec-pulse { position: fixed; z-index: 2147483646; pointer-events: none; width: 36px; height: 36px;
        margin: -18px 0 0 -18px; border-radius: 50%; border: 2px solid rgba(255,255,255,.95);
        background: rgba(255,255,255,.18); box-shadow: 0 0 0 1px rgba(0,0,0,.35);
        animation: __rec-pulse .45s ease-out forwards; }
      @keyframes __rec-pulse { from { transform: scale(.35); opacity: 1; } to { transform: scale(1.35); opacity: 0; } }\`;
    const cursor = document.createElement("div");
    cursor.id = "__rec-cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursor.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15 L18.5 15 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.append(style, cursor);
    const place = (x, y) => {
      cursor.style.transform = "translate(" + x + "px, " + y + "px)";
      try { sessionStorage.setItem(KEY, x + "," + y); } catch {}
    };
    try { const saved = sessionStorage.getItem(KEY); if (saved) { const [x, y] = saved.split(",").map(Number); place(x, y); } } catch {}
    addEventListener("mousemove", e => place(e.clientX, e.clientY), { capture: true, passive: true });
    addEventListener("mousedown", e => {
      cursor.classList.add("is-down");
      const ring = document.createElement("div");
      ring.className = "__rec-pulse";
      ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px";
      document.documentElement.append(ring);
      setTimeout(() => ring.remove(), 500);
    }, { capture: true, passive: true });
    addEventListener("mouseup", () => cursor.classList.remove("is-down"), { capture: true, passive: true });
  };
  if (document.documentElement) install(); else document.addEventListener("DOMContentLoaded", install, { once: true });
})();`;

// ─── Sessão de gravação ──────────────────────────────────────────────────────

export interface Recording {
  page: Page;
  context: BrowserContext;
  /**
   * Abre um caminho do front (ex.: "/").
   * trim "load" (padrão): espera a página carregar e corta tudo antes disso.
   * trim "paint": não espera nada; corta só os quadros em branco antes da página pintar
   * (para animações de entrada aparecerem desde o primeiro quadro).
   */
  open(path?: string, options?: { trim?: "load" | "paint"; cursorAt?: { x: number; y: number } }): Promise<void>;
  /** Fecha o contexto (salva o .webm), corta o início em branco e gera o .mp4. */
  finish(): Promise<string>;
}

let current: Page | null = null;
function currentPage() {
  if (!current) throw new Error("Nenhuma gravação ativa: chame startRecording() antes.");
  return current;
}

export async function startRecording(name: string): Promise<Recording> {
  if (!/^[\w-]+$/.test(name)) throw new Error(`Nome de vídeo inválido: ${name}`);
  await checkServers();
  checkFfmpeg();
  mkdirSync(RAW_DIR, { recursive: true });

  const browser: Browser = await chromium.launch();
  // newContext() já nasce limpo: sem cookies, sem localStorage, sem login.
  const context = await browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    recordVideo: { dir: RAW_DIR, size: VIEWPORT },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  current = page;
  const videoStartedAt = Date.now(); // o vídeo começa junto com a página
  let contentStartsAt: number | null = null;
  let readyShot: Buffer | null = null;
  let trimMode: "load" | "paint" = "load";

  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  return {
    page,
    context,
    async open(path = "/", options = {}) {
      if (!path.startsWith("/")) throw new Error(`Use um caminho relativo ao front (ex.: "/"), não ${path}`);
      const home = path === "/";
      const cursor = options.cursorAt ?? (home ? HOME_INTRO.cursor : { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 });
      mouseAt = { ...cursor };
      if (options.trim === "paint") {
        trimMode = "paint";
        await page.goto(BASE_URL + path, { waitUntil: "commit" });
        // Um mousemove real faz a seta aparecer já parada nessa posição; repetido quando o DOM
        // fica pronto, porque logo após o commit a seta ainda pode não estar instalada.
        for (const state of ["commit", "domcontentloaded"] as const) {
          if (state === "domcontentloaded") await page.waitForLoadState(state);
          await page.mouse.move(cursor.x - 1, cursor.y);
          await page.mouse.move(cursor.x, cursor.y);
        }
        return;
      }
      await page.goto(BASE_URL + path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      // Página "pronta": toda imagem visível na janela carregada (ex.: carrossel da home).
      await page.waitForFunction(() => [...document.images].filter(img => {
        const box = img.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
      }).every(img => img.complete && img.naturalWidth > 0), null, { timeout: 15000 })
        .catch(() => console.warn("Aviso: alguma imagem visível não terminou de carregar em 15 s."));
      // Na home, o cursor fica fora da faixa do marquee (o hover a pausaria).
      if (home) {
        const strip = await page.getByTestId("service-strip").boundingBox().catch(() => null);
        if (strip && cursor.y >= strip.y && cursor.y <= strip.y + strip.height) cursor.y = Math.min(VIEWPORT.height - 40, strip.y + strip.height + 120);
      }
      // Leva a seta para a posição inicial (sem rastro) para ela já aparecer no primeiro quadro.
      await page.mouse.move(cursor.x, cursor.y);
      mouseAt = { ...cursor };
      await page.waitForTimeout(150);
      // Foto do estado pronto: o corte do início procura no vídeo o primeiro quadro igual a ela.
      readyShot ??= await page.screenshot();
      contentStartsAt ??= Date.now();
      // Home: parada no topo antes da primeira ação do roteiro.
      if (home) await page.waitForTimeout(HOME_INTRO.holdMs);
    },
    async finish() {
      const video = page.video();
      await context.close(); // obrigatório para o Playwright gravar o .webm
      await browser.close();
      current = null;
      if (!video) throw new Error("O Playwright não gerou vídeo.");
      const webm = await video.path();
      // "load": o relógio do Node e o do vídeo não começam juntos; por isso o corte é achado nos quadros
      // (o primeiro igual à foto do estado pronto). A estimativa pelo relógio só vale como reserva.
      const estimate = Math.max(0, ((contentStartsAt ?? videoStartedAt) - videoStartedAt) / 1000);
      const trim = trimMode === "paint" ? firstPaintedFrame(webm)
        : readyShot ? readyFrame(webm, readyShot, name, estimate) : estimate;
      const mp4 = join(OUTPUT_DIR, `${name}.mp4`);
      rmSync(mp4, { force: true });
      execFileSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", webm,
        "-ss", trim.toFixed(3), // depois do -i: corte preciso no quadro
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", "-an",
        mp4,
      ], { stdio: "inherit" });
      const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString().trim());
      const sizeMb = statSync(mp4).size / 1024 / 1024;
      console.log(`\n✔ ${name}.mp4 pronto: ${duration.toFixed(1)} s (início cortado em ${trim.toFixed(2)} s), ${sizeMb.toFixed(1)} MB`);
      console.log(`  ${mp4}`);
      if (errors.length) console.warn(`  Aviso: ${errors.length} erro(s) de JavaScript durante a gravação:\n  - ${errors.join("\n  - ")}`);
      return mp4;
    },
  };
}

// Instante (s) do primeiro quadro diferente do quadro em branco inicial (brilho médio Y).
function firstPaintedFrame(video: string) {
  const out = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-t", "8", "-i", video,
    "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"], { maxBuffer: 16 * 1024 * 1024 }).toString();
  const frames: { t: number; y: number }[] = [];
  let t = 0;
  for (const line of out.split(/\r?\n/)) {
    const time = /pts_time:([\d.]+)/.exec(line); if (time) t = Number(time[1]);
    const yavg = /YAVG=([\d.]+)/.exec(line); if (yavg) frames.push({ t, y: Number(yavg[1]) });
  }
  if (!frames.length) return 0;
  // "Pintado" = já percorreu metade da maior mudança de brilho em relação ao quadro em branco.
  // Ignora o fundo cinza-claro que o navegador mostra antes do CSS do site carregar.
  const blank = frames[0].y;
  const biggest = Math.max(...frames.map(f => Math.abs(f.y - blank)));
  if (biggest < 8) return 0;
  const painted = frames.find(f => Math.abs(f.y - blank) >= biggest / 2);
  return painted ? painted.t : 0;
}

// Instante (s) do primeiro quadro igual à foto do estado pronto (corte "load"). Compara miniaturas em
// cinza (96x54): diferença média por pixel; aceita o primeiro quadro até 1,5 acima da menor diferença
// (marquee e cursor mudam alguns pixels). Assim o corte tira só branco/carregamento e nunca a página
// já pronta. Sem quadro parecido o bastante, usa a estimativa pelo relógio e avisa.
function readyFrame(video: string, shot: Buffer, name: string, estimate: number) {
  const W = 96, H = 54, FPS = 25, size = W * H;
  const thumbs = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args,
    "-vf", `${args.includes("-t") ? `fps=${FPS},` : ""}scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 64 * 1024 * 1024 });
  const shotPath = join(RAW_DIR, `${name}-pronto.png`);
  writeFileSync(shotPath, shot);
  const ref = thumbs(["-i", shotPath]);
  const frames = thumbs(["-t", (estimate + 6).toFixed(2), "-i", video]);
  const diffs: number[] = [];
  for (let i = 0; (i + 1) * size <= frames.length; i++) {
    let sum = 0;
    for (let k = 0; k < size; k++) sum += Math.abs(frames[i * size + k] - ref[k]);
    diffs.push(sum / size);
  }
  const best = Math.min(...diffs);
  if (!diffs.length || best > 12) {
    console.warn(`  Aviso: nenhum quadro igual à página pronta (menor diferença ${best.toFixed(1)}); corte pela estimativa ${estimate.toFixed(2)} s.`);
    return estimate;
  }
  const index = diffs.findIndex(d => d <= best + 1.5);
  const before = index > 0 ? diffs[index - 1].toFixed(1) : "—";
  console.log(`  Corte do início: ${(index / FPS).toFixed(2)} s (diferença para a página pronta: ${diffs[index].toFixed(1)}; quadro anterior: ${before}; estimativa pelo relógio: ${estimate.toFixed(2)} s)`);
  return index / FPS;
}

// ─── Ações "humanas" ─────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Pausa entre ações. Sem argumento: aleatória entre PACE.pauseMin e PACE.pauseMax. */
export function pause(ms?: number) {
  return sleep(ms ?? PACE.pauseMin + Math.random() * (PACE.pauseMax - PACE.pauseMin));
}

// Última posição do mouse (o Playwright não a informa): ponto de partida do próximo movimento.
let mouseAt = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Leva o mouse até (x, y) com duração proporcional à distância (PACE.moveMinMs → PACE.moveMaxMs) e
 * easing: acelera, fica rápido no meio e desacelera ao chegar. O tempo é medido no relógio real.
 */
export async function moveMouse(page: Page, x: number, y: number) {
  const from = { ...mouseAt };
  const distance = Math.hypot(x - from.x, y - from.y);
  const duration = PACE.moveMinMs + (PACE.moveMaxMs - PACE.moveMinMs) * Math.min(1, distance / PACE.moveFullDistancePx);
  const start = Date.now();
  for (let t = 0; distance >= 1 && t < 1;) {
    t = Math.min(1, (Date.now() - start) / duration);
    const k = easeInOut(t);
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
    if (t < 1) await sleep(16);
  }
  await page.mouse.move(x, y);
  mouseAt = { x, y };
}

/** Move o mouse até (x, y) e clica (ex.: fora de um modal, para fechá-lo). */
export async function clickAt(page: Page, x: number, y: number) {
  await moveMouse(page, x, y);
  await sleep(PACE.beforeClickMs);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
}

async function centerOf(locator: Locator) {
  await locator.waitFor({ state: "visible" });
  await smoothScrollTo(locator, { onlyIfNeeded: true });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Elemento sem posição na tela: ${locator}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Move o mouse até o centro do elemento (moveMouse), para PACE.beforeClickMs e clica. */
export async function moveAndClick(locator: Locator) {
  const { x, y } = await centerOf(locator);
  await clickAt(locator.page(), x, y);
}

/** Move o mouse até o elemento e fica parado `ms` milissegundos. */
export async function hover(locator: Locator, ms = 1000) {
  const { x, y } = await centerOf(locator);
  await moveMouse(locator.page(), x, y);
  await sleep(ms);
}

/** Clica no campo e digita com PACE.typeDelayMs entre teclas. */
export async function typeHuman(locator: Locator, text: string, delayMs = PACE.typeDelayMs) {
  await moveAndClick(locator);
  await sleep(200);
  await locator.pressSequentially(text, { delay: delayMs });
}

/**
 * Rola a página `px` pixels (negativo = para cima) dentro do navegador, com requestAnimationFrame
 * (uma posição nova por quadro) e easeInOutCubic: acelera, fica rápida no meio e desacelera ao chegar.
 * Duração proporcional à distância (PACE.scrollMinMs → PACE.scrollMaxMs). Só resolve quando a posição
 * final foi de fato atingida, para a ação seguinte não começar no meio do movimento.
 */
export async function smoothScroll(px: number, page: Page = currentPage()) {
  const duration = PACE.scrollMinMs + (PACE.scrollMaxMs - PACE.scrollMinMs) * Math.min(1, Math.abs(px) / PACE.scrollFullDistancePx);
  await page.evaluate(({ px, duration }) => new Promise<void>(done => {
    const root = document.documentElement;
    const from = window.scrollY;
    const max = root.scrollHeight - window.innerHeight;
    const to = Math.min(max, Math.max(0, from + px));
    if (Math.abs(to - from) < 1) return done();
    // O site usa scroll-behavior: smooth no html, que brigaria com a animação: desligado só durante ela.
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      window.scrollTo({ top: from + (to - from) * ease(t), behavior: "instant" });
      if (t < 1) return requestAnimationFrame(step);
      // Confirma a chegada (o navegador pode arredondar a posição) antes de liberar o roteiro.
      const settle = (tries: number) => {
        if (Math.abs(window.scrollY - to) <= 1 || tries <= 0) { root.style.scrollBehavior = previous; done(); }
        else { window.scrollTo({ top: to, behavior: "instant" }); requestAnimationFrame(() => settle(tries - 1)); }
      };
      settle(10);
    };
    requestAnimationFrame(step);
  }), { px, duration });
}

/**
 * Rola suavemente até o elemento: centralizado (padrão) ou com o topo em `top` px da tela
 * (use para deixar o elemento logo abaixo do cabeçalho fixo).
 */
export async function smoothScrollTo(locator: Locator, options: { onlyIfNeeded?: boolean; top?: number } = {}) {
  await locator.waitFor({ state: "visible" });
  const page = locator.page();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Elemento sem posição na tela: ${locator}`);
  const margin = 80;
  if (options.onlyIfNeeded && box.y >= margin && box.y + box.height <= VIEWPORT.height - margin) return;
  // Elemento preso à tela (toast, cabeçalho fixo, carrinho lateral): rolar a página não o move, só
  // tiraria o conteúdo do lugar. Para o ajuste automático (onlyIfNeeded), ele já está "à vista".
  if (options.onlyIfNeeded && await locator.evaluate(el => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const position = getComputedStyle(node).position;
      if (position === "fixed" || position === "sticky") return true;
    }
    return false;
  })) return;
  const delta = options.top !== undefined ? box.y - options.top : box.y + box.height / 2 - VIEWPORT.height / 2;
  if (Math.abs(delta) > 2) await smoothScroll(delta, page);
}
