// Gravação do fluxo de demonstração do CLIENTE da MCD Store.
// Roda SOMENTE contra http://localhost:5173. Não lê DATABASE_URL nem credenciais.
//
//   node record-demo.mjs                -> grava: Chromium em tela cheia (kiosk) + ffmpeg gdigrab
//   node record-demo.mjs --short-test   -> teste curto (~14 s, Home + filtros)
//   node record-demo.mjs --validate     -> valida o fluxo sem gravar (HEADLESS=1 para não ocupar a tela)
//
// Abortar no meio: Alt+F4 na janela da loja, ou Alt+Tab até o terminal e Ctrl+C.
// Nos dois casos o ffmpeg é finalizado (MP4 válido, marcado INCOMPLETO) e o navegador é fechado.

import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ─── RITMO: ajuste a velocidade do vídeo aqui (único lugar) ──────────────────
const PACE = {
  scale: 1,                  // multiplicador de TODAS as durações (1.5 = 50% mais lento, 0.7 = mais rápido)
  moveMs: [250, 420],        // duração do movimento do mouse até o elemento
  beforeClickMs: 110,        // pausa entre chegar no elemento e clicar
  afterActionMs: [450, 700], // pausa de leitura depois de cada ação importante
  afterSmallActionMs: 200,   // pausa depois de ações intermediárias (focar campo, abrir menu)
  keyMs: [25, 40],           // tempo por tecla ao digitar (nome, e-mail, senha, CEP, número)
  scrollStepPx: 90,          // pixels por "tique" de rolagem suave
  scrollTickMs: 16,          // intervalo entre tiques de rolagem
  filterSettleMs: 300,       // após clicar num filtro: scrollY precisa ficar parado por este tempo...
  filterSettleTimeoutMs: 3000, // ...com este limite máximo...
  afterFilterMs: 600,        // ...e depois pausa para o resultado ficar legível
  startMs: 1000,             // tela parada no início do vídeo
  carouselIntroMs: 700,      // passo 1: Home antes de ir ao carrossel
  carouselHoverMs: 400,      // passo 1: mouse sobre o carrossel
  carouselSlideMs: 250,      // passo 1: depois de cada "Próximo produto"
  carouselBeforeOpenMs: 400, // passo 1: antes de "VER MAIS"
  favoriteHoverMs: [400, 600], // hover no card e no marcador de favorito
  highlightMs: 2000,         // pausas maiores: carrinho após o login (10), checkout com endereço (12), carrinho após novo login (21)
  demoHoverMs: 3000,         // hover "Checkout desativado no modo de demonstração" (13)
  homeEndMs: 3000,           // Home com o carrossel no final (25)
  pageSettleMs: 250,         // após navegar: altura e rolagem paradas por este tempo
};

// ─── VÍDEO: resolução e nitidez (também via variáveis de ambiente) ───────────
// Renderização 1:1: VIEWPORT_W x VIEWPORT_H px CSS = pixels da tela = pixels do vídeo.
// Sem zoom, deviceScaleFactor sempre 1 (--force-device-scale-factor=1) e sem escala no ffmpeg.
//
// Métodos (CAPTURE_METHOD):
//   "gdigrab"    (padrão) Chromium em kiosk no monitor principal; o ffmpeg captura a tela (gdigrab).
//   "screencast" quadros do Chromium via CDP + ffmpeg (headless possível).
const num = (name, fallback) => (process.env[name] ? Number(process.env[name]) : fallback);
const VIDEO = {
  viewportW: num("VIEWPORT_W", 1920), // largura da página em px CSS = largura da captura
  viewportH: num("VIEWPORT_H", 1080), // altura da página em px CSS = altura da captura
  method: process.env.CAPTURE_METHOD ?? "gdigrab",
  screenX: num("SCREEN_X", 0),   // origem do monitor de captura (monitor principal = 0,0)
  screenY: num("SCREEN_Y", 0),
  jpegQuality: num("JPEG_QUALITY", 95),
  crf: num("CRF", 17),
  preset: process.env.PRESET ?? "slow",
  fps: 30,
  cursorPx: num("CURSOR_PX", 30), // diâmetro do cursor falso em px
};
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_BASE_URL = "http://localhost:5173";
const BASE_URL = (process.env.BASE_URL ?? ALLOWED_BASE_URL).replace(/\/+$/, "");
if (BASE_URL !== ALLOWED_BASE_URL) {
  console.error(`ERRO: este script só roda contra ${ALLOWED_BASE_URL}. URL recebida não permitida. Abortando.`);
  process.exit(1);
}

const VALIDATE = process.argv.includes("--validate");
const SHORT_TEST = process.argv.includes("--short-test");
const HEADLESS = process.env.HEADLESS === "1";
const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = join(HERE, "videos");
const USER = { name: "Teste McdStore", firstName: "Teste", email: "teste@mcdstore.com", password: "Teste123" };
const TIMEOUT = 15000;

// ─── Cursor falso (injetado em toda página / navegação) ──────────────────────
// --c = diâmetro do halo em px (página 1:1). Seta proporcional e clique discreto.
const CURSOR_SCRIPT = `(() => {
  if (window.__demoCursorInstalled) return; window.__demoCursorInstalled = true;
  const read = () => { try { return JSON.parse(sessionStorage.getItem("__demoCursorPos") || "null"); } catch { return null; } };
  let pos = read() || { x: ${Math.round(VIDEO.viewportW / 2)}, y: ${Math.round(VIDEO.viewportH / 2)} };
  const css = \`
    :root{--c:${VIDEO.cursorPx}px}
    #__demo-cursor{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647;will-change:transform}
    #__demo-cursor .halo{position:absolute;left:calc(var(--c) / -2);top:calc(var(--c) / -2);width:var(--c);height:var(--c);box-sizing:border-box;border-radius:50%;background:rgba(217,255,56,.22);border:2px solid rgba(217,255,56,.8);box-shadow:0 0 6px rgba(0,0,0,.35);transition:transform .12s ease}
    #__demo-cursor svg{position:absolute;left:-2px;top:-2px;width:calc(var(--c) * .8);height:calc(var(--c) * .8);filter:drop-shadow(0 1px 2px rgba(0,0,0,.55));transition:transform .12s ease;transform-origin:2px 2px}
    #__demo-cursor.down .halo{transform:scale(.8)} #__demo-cursor.down svg{transform:scale(.92)}
    .__demo-ripple{position:fixed;width:var(--c);height:var(--c);margin:calc(var(--c) / -2) 0 0 calc(var(--c) / -2);box-sizing:border-box;border-radius:50%;border:2px solid rgba(217,255,56,.75);background:rgba(217,255,56,.12);pointer-events:none;z-index:2147483646;animation:__demoRipple .45s ease-out forwards}
    @keyframes __demoRipple{from{transform:scale(.6);opacity:.9}to{transform:scale(1.8);opacity:0}}\`;
  const svg = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 2 L3 19 L7.6 14.8 L10.6 21.6 L13.6 20.3 L10.7 13.6 L17 13.4 Z" fill="#ffffff" stroke="#111111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  let el;
  const place = () => { if (el) el.style.transform = "translate(" + pos.x + "px," + pos.y + "px)"; };
  const install = () => {
    if (!document.documentElement) return;
    if (!document.getElementById("__demo-cursor-style")) {
      const style = document.createElement("style"); style.id = "__demo-cursor-style"; style.textContent = css;
      document.documentElement.appendChild(style);
    }
    if (!document.getElementById("__demo-cursor")) {
      el = document.createElement("div"); el.id = "__demo-cursor"; el.innerHTML = '<div class="halo"></div>' + svg;
      document.documentElement.appendChild(el); place();
    }
  };
  document.addEventListener("mousemove", e => {
    pos = { x: e.clientX, y: e.clientY }; place();
    try { sessionStorage.setItem("__demoCursorPos", JSON.stringify(pos)); } catch {}
  }, true);
  document.addEventListener("mousedown", e => {
    el && el.classList.add("down");
    const r = document.createElement("div"); r.className = "__demo-ripple";
    r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
    document.documentElement.appendChild(r); setTimeout(() => r.remove(), 500);
  }, true);
  document.addEventListener("mouseup", () => el && el.classList.remove("down"), true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
  setInterval(install, 300);
})();`;

// Navegação para outra página: quando o script marca window.__demoTopOnNav antes do clique, a página nova
// já nasce no topo (rolagem instantânea, ignorando o scroll-behavior: smooth do CSS), sem rolagem visível.
const NAV_TOP_SCRIPT = `(() => {
  for (const key of ["pushState", "replaceState"]) {
    const original = history[key];
    history[key] = function (...args) {
      const result = original.apply(this, args);
      if (window.__demoTopOnNav) { window.__demoTopOnNav = false; window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }
      return result;
    };
  }
})();`;

// ─── Estado e utilidades ─────────────────────────────────────────────────────
let page;
let t0 = Date.now();
let currentStep = 0;
const timeline = [];
const mouse = { x: 0, y: 0 }; // definido em main() conforme o viewport real

const rand = (min, max) => min + Math.random() * (max - min);
const ms = value => Math.round(value * PACE.scale);
const sleep = value => new Promise(resolve => setTimeout(resolve, value));
const pause = value => sleep(ms(value));
const readingPause = () => pause(rand(...PACE.afterActionMs));

function stamp() {
  const total = (Date.now() - t0) / 1000;
  const m = Math.floor(total / 60);
  const s = (total % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}
function log(text) {
  const line = `[${stamp()}] [passo ${currentStep}] ${text}`;
  console.log(line);
  timeline.push(line);
}

class StepError extends Error {}

let guardZoom = false; // em tela cheia: detecta zoom do navegador (Ctrl+roda/Ctrl+-) mudando o devicePixelRatio

async function step(number, title, fn) {
  currentStep = number;
  log(`── ${title}`);
  try {
    if (guardZoom) {
      const dpr = await page.evaluate(() => devicePixelRatio);
      if (Math.abs(dpr - 1) > 0.01) throw new Error(`o zoom do navegador mudou (devicePixelRatio=${dpr}); a gravação sairia com layout diferente`);
    }
    await fn();
  } catch (error) {
    const shot = join(VIDEO_DIR, `erro-passo-${number}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    console.error(`\n✖ FALHA no passo ${number} (${title})`);
    console.error(`  Erro: ${error.message.split("\n").slice(0, 6).join("\n  ")}`);
    console.error(`  Screenshot: ${shot}\n`);
    throw new StepError(`passo ${number}`);
  }
}

async function until(check, description, timeout = TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check().catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`Tempo esgotado esperando: ${description}`);
}

const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Garante que o elemento está visível na tela, rolando suavemente se preciso.
async function ensureInView(locator) {
  await locator.waitFor({ state: "visible", timeout: TIMEOUT });
  const inView = await locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    // Elementos em camadas fixas (Header, drawer, modal, toast) não estão sob o Header sticky.
    const fixedLayer = !!el.closest("header, .fixed, [data-sonner-toaster]");
    const minTop = fixedLayer ? 0 : (document.querySelector("header")?.getBoundingClientRect().bottom ?? 60) - 4;
    return r.top >= minTop && r.bottom <= window.innerHeight - 10 && r.left >= 0 && r.right <= window.innerWidth;
  });
  if (inView) return;
  await locator.evaluate(el => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  let last = null;
  await until(async () => {
    const box = await locator.boundingBox();
    const same = box && last && Math.abs(box.y - last.y) < 0.5;
    last = box;
    return same;
  }, "rolagem estabilizar", 5000);
  await pause(150);
}

async function targetPoint(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Elemento sem posição na tela");
  const jx = Math.min(4, box.width * 0.08), jy = Math.min(3, box.height * 0.08);
  return { x: box.x + box.width / 2 + rand(-jx, jx), y: box.y + box.height / 2 + rand(-jy, jy) };
}

// Move o mouse em curva suave até o centro do elemento.
async function moveTo(locator) {
  await ensureInView(locator);
  return moveToPoint(await targetPoint(locator));
}

// Move o mouse em curva suave até um ponto da tela.
async function moveToPoint(to) {
  const from = { ...mouse };
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const bend = rand(-0.18, 0.18) * dist;
  const nx = -dy / dist, ny = dx / dist;
  const c1 = { x: from.x + dx * 0.3 + nx * bend, y: from.y + dy * 0.3 + ny * bend };
  const c2 = { x: from.x + dx * 0.75 + nx * bend * 0.5, y: from.y + dy * 0.75 + ny * bend * 0.5 };
  const duration = ms(rand(...PACE.moveMs));
  const start = Date.now();
  for (;;) {
    const raw = Math.min(1, (Date.now() - start) / duration);
    const t = easeInOut(raw), u = 1 - t;
    const x = u ** 3 * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * to.x;
    const y = u ** 3 * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * to.y;
    await page.mouse.move(x, y);
    mouse.x = x; mouse.y = y;
    if (raw >= 1) break;
    await sleep(14);
  }
  return to;
}

// Confere que o ponto do clique realmente atinge o elemento (e não um toast/overlay por cima).
async function hits(locator, point) {
  return locator.evaluate((el, p) => {
    const hit = document.elementFromPoint(p.x, p.y);
    return !!hit && (hit === el || el.contains(hit) || (el.tagName === "LABEL" && el.control === hit));
  }, point);
}
// O que está cobrindo o ponto: retângulo e, se for um toast, onde clicar para fechá-lo
// (o "x" .store-toast-close; sem ele, o ícone do toast — clicar no toast também o fecha).
async function coverRectAt(point) {
  return page.evaluate(p => {
    const hit = document.elementFromPoint(p.x, p.y);
    const toast = hit && hit.closest("[data-sonner-toast]");
    const cover = toast || hit;
    if (!cover) return null;
    const r = cover.getBoundingClientRect();
    let close = null;
    if (toast) {
      const target = toast.querySelector(".store-toast-close, [data-close-button]") || toast.querySelector(".store-toast-icon") || toast;
      const c = target.getBoundingClientRect();
      close = { x: c.left + c.width / 2, y: c.top + c.height / 2 };
    }
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, close };
  }, point);
}
async function describeAt(point) {
  return page.evaluate(p => {
    const hit = document.elementFromPoint(p.x, p.y);
    return hit ? `<${hit.tagName.toLowerCase()} class="${hit.className}">${(hit.textContent || "").trim().slice(0, 60)}` : "nada";
  }, point);
}

// Espera a rolagem automática do app terminar: scrollY parado por filterSettleMs (limite filterSettleTimeoutMs).
async function waitScrollSettled() {
  const start = Date.now();
  let last = await page.evaluate(() => window.scrollY);
  let stableSince = Date.now();
  while (Date.now() - start < PACE.filterSettleTimeoutMs) {
    await sleep(50);
    const y = await page.evaluate(() => window.scrollY);
    if (y !== last) { last = y; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= PACE.filterSettleMs) return;
  }
}

// Página nova: garante o topo (instantâneo) e espera altura e rolagem ficarem paradas antes de interagir.
async function settlePage(label) {
  const snapshot = () => page.evaluate(() => {
    window.__demoTopOnNav = false;
    if (window.scrollY !== 0) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return `${window.scrollY}|${document.documentElement.scrollHeight}`;
  });
  const start = Date.now();
  let last = await snapshot(), stableSince = Date.now();
  while (Date.now() - start < 3000) {
    await sleep(50);
    const now = await snapshot();
    if (now !== last) { last = now; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= PACE.pageSettleMs) break;
  }
  log(`${label}: página no topo e estável`);
  await pause(PACE.afterSmallActionMs);
}

async function click(locator, label, { small = false, filter = false, nav = false } = {}) {
  log(`clicar em ${label}`);
  await locator.waitFor({ state: "visible", timeout: TIMEOUT });
  await until(() => locator.isEnabled(), `${label} ficar habilitado`);
  let point = await moveTo(locator);
  const start = Date.now();
  while (!(await hits(locator, point))) {
    if (Date.now() - start > 8000) throw new Error(`${label} está coberto por outro elemento: ${await describeAt(point)}`);
    const cover = await coverRectAt(point);
    if (cover?.close) {
      // Um toast cobre o alvo: fecha o toast clicando no "x" dele e segue.
      log(`fechar o aviso (toast) que cobre ${label}`);
      await moveToPoint(cover.close);
      await pause(PACE.beforeClickMs);
      await page.mouse.down();
      await sleep(70);
      await page.mouse.up();
    } else if (cover) {
      // Outro elemento cobre o alvo: tira o cursor de cima, espera liberar e volta ao alvo.
      log(`aguardar: ${label} está coberto; afastando o cursor`);
      const park = cover.left > 80
        ? { x: cover.left - 50, y: point.y }
        : { x: point.x, y: Math.min(VIDEO.viewportH - 20, cover.bottom + 50) };
      await moveToPoint(park);
    }
    await until(() => hits(locator, point), `${label} ficar livre`, Math.max(500, 8000 - (Date.now() - start))).catch(() => {});
    point = await moveTo(locator);
  }
  await pause(PACE.beforeClickMs);
  if (nav) await page.evaluate(() => { window.__demoTopOnNav = true; });
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  if (nav) return; // o passo espera a página nova e chama settlePage()
  if (filter) {
    await waitScrollSettled();
    await pause(PACE.afterFilterMs);
    return; // o próximo moveTo recalcula a posição do elemento seguinte já com a página parada
  }
  await (small ? pause(PACE.afterSmallActionMs) : readingPause());
}

async function hover(locator, label, holdMs) {
  log(`passar o mouse sobre ${label}`);
  await moveTo(locator);
  await pause(holdMs);
}

async function type(locator, text, label, { clear = false } = {}) {
  await click(locator, `campo ${label}`, { small: true });
  if (clear) {
    await page.keyboard.press("Control+A");
    await pause(100);
    await page.keyboard.press("Backspace");
    await pause(120);
  }
  log(`digitar "${label === "Senha" ? "••••••••" : text}" em ${label}`);
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(ms(rand(...PACE.keyMs)));
  }
  await pause(PACE.afterSmallActionMs);
}

// Rola a página gradualmente até o final.
async function scrollSuave() {
  log("rolar a página até o final");
  for (let i = 0; i < 400; i++) {
    const atBottom = await page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2);
    if (atBottom) break;
    await page.mouse.wheel(0, PACE.scrollStepPx);
    await sleep(ms(PACE.scrollTickMs));
  }
  await readingPause();
}

// ─── Seletores ───────────────────────────────────────────────────────────────
const header = () => page.locator("header");
const headerInicio = () => header().getByRole("button", { name: "Início", exact: true });
const cartButton = () => header().getByRole("button", { name: "Abrir carrinho" });
const profileButton = () => header().getByRole("button", { name: USER.firstName, exact: true });
const accountMenu = () => page.getByRole("navigation", { name: "Menu da conta" });
const aside = () => page.locator("aside");
const productCard = name => page.locator(".store-product-card").filter({ has: page.getByText(name, { exact: true }) });
const drawer = () => page.getByRole("heading", { name: "Seu Carrinho" }).locator("xpath=ancestor::div[contains(@class,'fixed')][1]");
const cartRow = name => drawer().locator(`xpath=.//p[normalize-space()="${name}"]/ancestor::div[.//button[@aria-label="Remover item"]][1]`);
const authForm = () => page.locator('form:has(input[aria-label="Senha"])');
const syncing = () => page.getByText("Sincronizando favoritos e carrinho...");

async function waitSynced() {
  await until(async () => !(await syncing().isVisible()), "sincronização de carrinho/favoritos", 20000);
}
async function waitCatalog() {
  await page.getByText(/\d+ (peça encontrada|peças encontradas)/).waitFor({ timeout: TIMEOUT });
}
// A Home já vem carregada antes de o ffmpeg começar (modo gdigrab); senão, abre agora.
async function openHome() {
  if (new URL(page.url()).href !== new URL(BASE_URL + "/").href) {
    log(`abrir ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  } else {
    log(`Home de ${BASE_URL} já aberta`);
  }
  await waitCatalog();
}
async function login() {
  const form = authForm();
  await form.waitFor({ timeout: TIMEOUT });
  await type(form.getByLabel("E-mail", { exact: true }), USER.email, "E-mail", { clear: true });
  await type(form.getByLabel("Senha", { exact: true }), USER.password, "Senha");
  await click(form.getByRole("button", { name: "Entrar", exact: true }), '"Entrar" (enviar login)');
  await form.waitFor({ state: "detached", timeout: TIMEOUT });
  await waitSynced();
}
// Abre o menu "Perfil". O app às vezes fecha o menu logo após abrir (re-render da sessão),
// então confirma que abriu; se não, registra e repete o MESMO clique (no máximo 2 tentativas).
async function openProfileMenu() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) { log('o menu do "Perfil" não abriu; clicando em "Perfil" novamente'); await pause(800); }
    await click(profileButton(), '"Perfil"', { small: true });
    try { await accountMenu().waitFor({ state: "visible", timeout: 2000 }); return; } catch {}
  }
  throw new Error('O menu do "Perfil" não abriu após 2 tentativas');
}
// Abre o carrinho pelo Header. Sob a carga da gravação o drawer às vezes não abre no primeiro clique,
// então confirma; se não abriu, registra e repete o MESMO clique (no máximo 2 tentativas).
async function openCart() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) { log('o carrinho não abriu; clicando em "Carrinho" novamente'); await pause(800); }
    await click(cartButton(), '"Carrinho" no Header');
    try { await drawer().waitFor({ state: "visible", timeout: 2500 }); return; } catch {}
  }
  throw new Error('O carrinho não abriu após 2 tentativas');
}
async function favoriteToggle(name, buttonName, tooltip) {
  const card = productCard(name);
  await hover(card.locator(".store-product-photo"), `card "${name}"`, PACE.favoriteHoverMs[0]);
  const fav = card.getByRole("button", { name: buttonName, exact: true });
  await hover(fav, `marcador de favorito ("${tooltip}")`, PACE.favoriteHoverMs[1]);
  await card.getByRole("tooltip").filter({ hasText: tooltip }).waitFor({ state: "visible", timeout: 3000 });
  await click(fav, `"${tooltip}"`);
}

// ─── Fluxo ───────────────────────────────────────────────────────────────────
async function flow() {
  await step(1, "Home → carrossel → Jaqueta Jeans Cropped → VER MAIS → rolar → Início", async () => {
    await openHome();
    const carousel = page.getByRole("region", { name: "Carrossel de produtos" });
    await carousel.waitFor({ timeout: TIMEOUT });
    await pause(PACE.carouselIntroMs);
    const active = () => carousel.locator('article[aria-hidden="false"]');
    await hover(carousel, "carrossel", PACE.carouselHoverMs);
    const slides = await carousel.locator("article").count();
    for (let i = 0; i <= slides; i++) {
      if (await active().getByRole("heading", { name: "Jaqueta Jeans Cropped" }).count()) break;
      if (i === slides) throw new Error('"Jaqueta Jeans Cropped" não encontrada no carrossel');
      await click(active().getByRole("button", { name: "Próximo produto" }), '"Próximo produto" no carrossel', { small: true });
      await pause(PACE.carouselSlideMs);
    }
    await pause(PACE.carouselBeforeOpenMs);
    await click(active().getByRole("button", { name: "VER MAIS" }), '"VER MAIS"', { nav: true });
    await page.getByRole("heading", { level: 1, name: "Jaqueta Jeans Cropped" }).waitFor({ timeout: TIMEOUT });
    await settlePage("Jaqueta Jeans Cropped");
    await scrollSuave();
    await click(headerInicio(), '"Início" no Header', { nav: true });
    await waitCatalog();
    await settlePage("Início");
  });

  await step(2, 'Filtros: TAMANHO "G", PÚBLICO "Masculino", CATEGORIA "Bermudas"', async () => {
    await click(aside().getByRole("button", { name: "G", exact: true }), 'tamanho "G"', { filter: true });
    await click(aside().getByRole("button", { name: "Masculino", exact: true }), 'público "Masculino"', { filter: true });
    await click(aside().getByRole("button", { name: "Bermudas", exact: true }), 'categoria "Bermudas"', { filter: true });
    await productCard("Bermuda Linho Verão").waitFor({ timeout: TIMEOUT });
  });

  await step(3, "Bermuda Linho Verão: tamanho G → Adicionar ao carrinho", async () => {
    const card = productCard("Bermuda Linho Verão");
    await click(card.getByRole("button", { name: "G", exact: true }), 'tamanho "G" da Bermuda Linho Verão', { small: true });
    await click(card.getByRole("button", { name: "Adicionar ao carrinho" }), '"Adicionar ao carrinho"', { small: true });
  });

  await step(4, '"Ver no Carrinho" no toast', async () => {
    await click(page.getByRole("button", { name: "Ver no Carrinho" }).first(), '"Ver no Carrinho" no toast');
    await drawer().waitFor({ timeout: TIMEOUT });
  });

  await step(5, '"+" para ficar com 2 unidades', async () => {
    const row = cartRow("Bermuda Linho Verão");
    await click(row.getByRole("button", { name: "Aumentar quantidade" }), '"+"');
    await until(async () => (await row.locator("span.w-6").innerText()).trim() === "2", "quantidade = 2");
  });

  await step(6, '"Finalizar compra" no carrinho', async () => {
    await click(drawer().getByRole("button", { name: "Finalizar compra", exact: true }), '"Finalizar compra"');
    await authForm().waitFor({ timeout: TIMEOUT });
  });

  await step(7, '"Cadastre-se" no modal de login', async () => {
    await click(authForm().getByRole("button", { name: "Cadastre-se" }), '"Cadastre-se"');
    await authForm().getByLabel("Nome completo").waitFor({ timeout: TIMEOUT });
  });

  await step(8, "Preencher cadastro e enviar", async () => {
    const form = authForm();
    await type(form.getByLabel("Nome completo"), USER.name, "Nome completo");
    await type(form.getByLabel("E-mail", { exact: true }), USER.email, "E-mail");
    await type(form.getByLabel("Senha", { exact: true }), USER.password, "Senha");
    await click(form.getByRole("button", { name: "Criar conta" }), '"Criar conta"', { small: true });
    const done = form.getByText("Conta criada com sucesso");
    const failed = form.getByRole("alert");
    await until(async () => (await done.isVisible()) || (await failed.isVisible()), "resposta do cadastro");
    if (await failed.isVisible()) throw new Error(`Cadastro recusado: "${await failed.innerText()}" (rode o reset do usuário de teste)`);
    await readingPause();
  });

  await step(9, "Login com o usuário recém-criado", async () => {
    await login();
  });

  await step(10, '"Carrinho" no Header → "Finalizar compra"', async () => {
    // Após o login o app vai sozinho para o /checkout (e fecha o carrinho) quando termina de sincronizar.
    // Espera esse redirecionamento terminar para o carrinho não ser fechado logo depois de abrir.
    log("aguardar o app concluir o redirecionamento pós-login");
    await page.waitForURL(/\/checkout$/, { timeout: 10000 }).catch(() => {});
    await waitSynced();
    await settlePage("Checkout");
    await openCart();
    await drawer().waitFor({ timeout: TIMEOUT });
    await cartRow("Bermuda Linho Verão").waitFor({ timeout: TIMEOUT });
    log(`mostrar o carrinho com os itens após o login (${PACE.highlightMs / 1000} s)`);
    await pause(PACE.highlightMs);
    await click(drawer().getByRole("button", { name: "Finalizar compra", exact: true }), '"Finalizar compra"', { nav: true });
    await page.waitForURL(/\/checkout$/, { timeout: TIMEOUT });
    await page.getByRole("heading", { level: 1, name: "Checkout" }).waitFor({ timeout: TIMEOUT });
    await settlePage("Checkout");
  });

  await step(11, '"Sim, preciso de entrega" → "Cadastrar endereço"', async () => {
    await click(page.getByText("Sim, preciso de entrega", { exact: true }), '"Sim, preciso de entrega"');
    await click(page.getByRole("link", { name: "Cadastrar endereço" }), '"Cadastrar endereço"', { nav: true });
    await page.waitForURL(/\/minha-conta/, { timeout: TIMEOUT });
    await page.getByLabel("CEP", { exact: true }).waitFor({ timeout: TIMEOUT });
    await settlePage("Minha Conta");
    await readingPause();
  });

  await step(12, "Minha Conta: CEP, número, salvar e voltar ao checkout", async () => {
    await type(page.getByLabel("CEP", { exact: true }), "01001-000", "CEP");
    const street = page.getByLabel("Rua / Logradouro", { exact: true });
    await click(street, 'campo "Rua / Logradouro" (validar CEP)', { small: true });
    log("aguardar o endereço carregar pelo CEP");
    await until(async () => (await street.inputValue()).trim().length > 0, "endereço preenchido pelo CEP", 12000);
    await readingPause();
    await type(page.getByLabel("Número", { exact: true }), "1234", "Número");
    await click(page.getByRole("button", { name: "Salvar alterações" }), '"Salvar alterações"', { small: true });
    await page.getByText("Alteração salva.").waitFor({ timeout: TIMEOUT });
    await readingPause();
    await click(page.getByRole("link", { name: "Voltar ao checkout com alterações salvas" }), '"Voltar ao checkout com alterações salvas"', { nav: true });
    await page.waitForURL(/\/checkout$/, { timeout: TIMEOUT });
    await page.getByRole("heading", { level: 1, name: "Checkout" }).waitFor({ timeout: TIMEOUT });
    await settlePage("Checkout");
    await page.getByText("Conferindo disponibilidade e preços...").waitFor({ state: "hidden", timeout: TIMEOUT }).catch(() => {});
    log(`mostrar o checkout com o endereço atualizado (${PACE.highlightMs / 1000} s)`);
    await pause(PACE.highlightMs);
  });

  await step(13, 'Hover em "Finalizar compra pelo WhatsApp" por 3 s', async () => {
    await page.getByText("Conferindo disponibilidade e preços...").waitFor({ state: "hidden", timeout: TIMEOUT });
    const finalize = page.getByRole("button", { name: "Finalizar compra pelo WhatsApp" });
    await moveTo(finalize);
    log(`mostrar hover "Checkout desativado no modo de demonstração" (${PACE.demoHoverMs / 1000} s)`);
    await page.getByText("Checkout desativado no modo de demonstração").waitFor({ state: "visible", timeout: 3000 });
    await pause(PACE.demoHoverMs);
  });

  await step(14, '"Início" no Header → "Limpar filtros"', async () => {
    await click(headerInicio(), '"Início" no Header', { nav: true });
    await waitCatalog();
    await settlePage("Início");
    await click(page.getByRole("button", { name: "Limpar filtros" }).first(), '"Limpar filtros"', { filter: true });
  });

  await step(15, 'Favoritar "Jaqueta Sarja Urbana"', async () => {
    await favoriteToggle("Jaqueta Sarja Urbana", "Favoritar", "Adicionar aos Favoritos");
    await until(async () => (await productCard("Jaqueta Sarja Urbana").getByRole("button", { name: "Remover dos favoritos" }).count()) > 0, "produto favoritado");
  });

  await step(16, '"Perfil" → "Favoritos"', async () => {
    await openProfileMenu();
    await click(accountMenu().getByRole("link", { name: "Favoritos" }), '"Favoritos"', { nav: true });
    await page.getByRole("heading", { level: 1, name: "Favoritos" }).waitFor({ timeout: TIMEOUT });
    await productCard("Jaqueta Sarja Urbana").waitFor({ timeout: TIMEOUT });
    await settlePage("Favoritos");
    await readingPause();
  });

  await step(17, 'Favoritos: tamanho "P" da Jaqueta Sarja Urbana → Adicionar ao carrinho', async () => {
    const card = productCard("Jaqueta Sarja Urbana");
    await click(card.getByRole("button", { name: "P", exact: true }), 'tamanho "P"', { small: true });
    await click(card.getByRole("button", { name: "Adicionar ao carrinho" }), '"Adicionar ao carrinho"');
  });

  await step(18, '"Perfil" → "Sair"', async () => {
    await openProfileMenu();
    await click(accountMenu().getByRole("button", { name: "Sair" }), '"Sair"', { nav: true });
    await page.getByRole("heading", { level: 1, name: "Área de clientes" }).waitFor({ timeout: TIMEOUT });
    await settlePage("Área de clientes");
  });

  await step(19, '"Entrar" e login novamente', async () => {
    await click(page.getByRole("main").getByRole("button", { name: "Entrar", exact: true }), '"Entrar"', { small: true });
    await login();
    await page.getByRole("heading", { level: 1, name: "Favoritos" }).waitFor({ timeout: TIMEOUT });
    await productCard("Jaqueta Sarja Urbana").waitFor({ timeout: TIMEOUT });
    await settlePage("Favoritos");
    await readingPause();
  });

  await step(20, 'Desfavoritar "Jaqueta Sarja Urbana"', async () => {
    await favoriteToggle("Jaqueta Sarja Urbana", "Remover dos favoritos", "Desfavoritar");
    await productCard("Jaqueta Sarja Urbana").waitFor({ state: "detached", timeout: TIMEOUT });
  });

  await step(21, '"Carrinho" no Header (itens continuam salvos)', async () => {
    await openCart();
    await cartRow("Bermuda Linho Verão").waitFor({ timeout: TIMEOUT });
    await cartRow("Jaqueta Sarja Urbana").waitFor({ timeout: TIMEOUT });
    log(`mostrar o carrinho com os itens após o novo login (${PACE.highlightMs / 1000} s)`);
    await pause(PACE.highlightMs);
  });

  await step(22, 'Bermuda Linho Verão: "-" (diminuir 1 unidade)', async () => {
    const row = cartRow("Bermuda Linho Verão");
    await click(row.getByRole("button", { name: "Diminuir quantidade" }), '"-"');
    await until(async () => (await row.locator("span.w-6").innerText()).trim() === "1", "quantidade = 1");
  });

  await step(23, 'Remover "Jaqueta Sarja Urbana" (lixeira)', async () => {
    await click(cartRow("Jaqueta Sarja Urbana").getByRole("button", { name: "Remover item" }), "lixeira da Jaqueta Sarja Urbana");
    await cartRow("Jaqueta Sarja Urbana").waitFor({ state: "detached", timeout: TIMEOUT });
  });

  await step(24, '"Limpar Carrinho" → fechar carrinho', async () => {
    await click(drawer().getByRole("button", { name: "Limpar Carrinho" }), '"Limpar Carrinho"');
    await drawer().getByText("Carrinho vazio").waitFor({ timeout: TIMEOUT });
    await click(drawer().getByRole("button", { name: "Fechar carrinho" }), '"Fechar carrinho"', { small: true });
  });

  await step(25, '"Início" no Header → Home com o carrossel → fim', async () => {
    await click(headerInicio(), '"Início" no Header', { nav: true });
    await waitCatalog();
    await page.getByRole("region", { name: "Carrossel de produtos" }).waitFor({ state: "visible", timeout: TIMEOUT });
    await settlePage("Início");
    log(`Home com o carrossel visível (${PACE.homeEndMs / 1000} s) e fim`);
    await pause(PACE.homeEndMs);
  });
}

// ─── Teste curto (Home + filtros, ~12 s) para validar a nitidez ──────────────
async function shortFlow() {
  await step(1, "Teste curto: Home", async () => {
    await openHome();
    await pause(2000);
  });
  await step(2, 'Teste curto: filtros TAMANHO "G", PÚBLICO "Masculino", CATEGORIA "Bermudas"', async () => {
    await click(aside().getByRole("button", { name: "G", exact: true }), 'tamanho "G"', { filter: true });
    await click(aside().getByRole("button", { name: "Masculino", exact: true }), 'público "Masculino"', { filter: true });
    await click(aside().getByRole("button", { name: "Bermudas", exact: true }), 'categoria "Bermudas"', { filter: true });
    await productCard("Bermuda Linho Verão").waitFor({ timeout: TIMEOUT });
    await sleep(1500);
  });
}

// ─── Execução ────────────────────────────────────────────────────────────────
// Procura o ffmpeg no PATH, em $FFMPEG ou na pasta do winget (o PATH pode não ter sido recarregado).
function findFfmpeg() {
  const candidates = [process.env.FFMPEG, "ffmpeg"];
  const winget = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Microsoft", "WinGet");
  if (winget) {
    candidates.push(join(winget, "Links", "ffmpeg.exe"));
    try {
      for (const pkg of readdirSync(join(winget, "Packages")).filter(dir => dir.startsWith("Gyan.FFmpeg"))) {
        for (const build of readdirSync(join(winget, "Packages", pkg))) candidates.push(join(winget, "Packages", pkg, build, "bin", "ffmpeg.exe"));
      }
    } catch {}
  }
  for (const candidate of candidates.filter(Boolean)) {
    if (spawnSync(candidate, ["-version"], { stdio: "ignore" }).status === 0) return candidate;
  }
  return null;
}

// MP4 final: H.264, yuv420p, 30 fps, crf/preset do VIDEO, +faststart, sem áudio. Sem redimensionar:
// o filtro só converte a cor (RGB → yuv420p, faixa de TV) e fixa os 30 fps.
function encodeMp4(ffmpeg, inputArgs, mp4) {
  const vf = `scale=in_range=auto:out_range=tv,fps=${VIDEO.fps},format=yuv420p`;
  const args = ["-y", "-loglevel", "error", ...inputArgs, "-vf", vf, "-c:v", "libx264", "-preset", VIDEO.preset, "-crf", String(VIDEO.crf),
    "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", String(VIDEO.fps), "-movflags", "+faststart", "-an", mp4];
  return spawnSync(ffmpeg, args, { stdio: "inherit" }).status === 0;
}

// Inicia o gdigrab no monitor de captura. A captura bruta é sem perdas (ultrafast/qp 0) para não perder
// quadros em tempo real; o MP4 final (crf/preset) é gerado depois, a partir dela.
function startGdigrab(ffmpeg, rawPath) {
  const args = ["-hide_banner", "-y", "-f", "gdigrab", "-framerate", String(VIDEO.fps), "-draw_mouse", "0",
    "-offset_x", String(VIDEO.screenX), "-offset_y", String(VIDEO.screenY), "-video_size", `${VIDEO.viewportW}x${VIDEO.viewportH}`,
    "-i", "desktop", "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv444p", "-an", rawPath];
  const proc = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  let log = "";
  const started = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ffmpeg não começou a gravar em 10 s:\n${log.slice(-800)}`)), 10000);
    proc.stderr.on("data", chunk => {
      log += chunk.toString();
      if (/frame=\s*\d+/.test(log)) { clearTimeout(timer); resolve(); }
    });
    proc.on("exit", code => { clearTimeout(timer); reject(new Error(`ffmpeg saiu (código ${code}):\n${log.slice(-800)}`)); });
  });
  const exited = new Promise(resolve => proc.on("exit", code => resolve(code)));
  return { proc, started, exited, tail: () => log.slice(-600) };
}

// Cursor real do Windows: o Windows reenvia a posição dele à janela quando o conteúdo muda por baixo,
// o que moveria o cursor falso e criaria hovers. Durante a gravação ele fica fora do monitor gravado.
function powershell(script) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}
function parkOsCursor() {
  const info = powershell(`Add-Type -AssemblyName System.Windows.Forms; $p=[System.Windows.Forms.Cursor]::Position;
    $s=[System.Windows.Forms.Screen]::AllScreens | ForEach-Object { @{x=$_.Bounds.X;y=$_.Bounds.Y;w=$_.Bounds.Width;h=$_.Bounds.Height} };
    @{x=$p.X;y=$p.Y;screens=@($s)} | ConvertTo-Json -Compress -Depth 3`);
  if (!info) return null;
  const { x, y, screens } = JSON.parse(info);
  const cap = { x: VIDEO.screenX, y: VIDEO.screenY, w: VIDEO.viewportW, h: VIDEO.viewportH };
  const other = screens.find(s => s.x >= cap.x + cap.w || s.x + s.w <= cap.x || s.y >= cap.y + cap.h || s.y + s.h <= cap.y);
  const park = other ? { x: other.x + Math.round(other.w / 2), y: other.y + Math.round(other.h / 2) } : { x: cap.x + cap.w - 1, y: cap.y + cap.h - 1 };
  setOsCursor(park);
  console.log(other ? "Cursor do Windows movido para o outro monitor durante a gravação." : "Cursor do Windows movido para o canto do monitor gravado.");
  return { x, y };
}
function setOsCursor({ x, y }) {
  powershell(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})`);
}

// Encerra o ffmpeg de forma limpa ("q" no stdin) para o arquivo ficar válido.
async function stopGdigrab(rec) {
  if (rec.proc.exitCode !== null) return rec.exited;
  try { rec.proc.stdin.write("q"); rec.proc.stdin.end(); } catch {}
  const code = await Promise.race([rec.exited, sleep(15000).then(() => "timeout")]);
  if (code === "timeout") { rec.proc.kill(); return rec.exited; }
  return code;
}

async function main() {
  mkdirSync(VIDEO_DIR, { recursive: true });
  const recording = !VALIDATE;
  const method = VIDEO.method === "screencast" ? "screencast" : "gdigrab";
  const kiosk = method === "gdigrab" && !(VALIDATE && HEADLESS);
  console.log(`MCD Store demo — ${VALIDATE ? "VALIDAÇÃO (sem vídeo)" : SHORT_TEST ? "TESTE CURTO" : "GRAVAÇÃO"} — ${kiosk ? "tela cheia (kiosk)" : HEADLESS ? "headless" : "headed"} — ${BASE_URL}`);
  console.log(`Página ${VIDEO.viewportW}x${VIDEO.viewportH} px CSS = captura ${VIDEO.viewportW}x${VIDEO.viewportH} px · deviceScaleFactor 1 · sem zoom · método ${method}`);
  if (method === "gdigrab" && recording && HEADLESS) {
    console.error("O método gdigrab grava a tela: precisa do navegador visível. Rode sem HEADLESS=1.");
    process.exit(1);
  }
  const ffmpeg = findFfmpeg();
  if (recording && !ffmpeg) {
    console.error("ffmpeg não encontrado. Instale com: winget install --id Gyan.FFmpeg -e");
    process.exit(1);
  }

  const name =`mcd-store-demo-${SHORT_TEST ? "teste-curto-" : ""}${new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19)}`;
  const common = { locale: "pt-BR", timezoneId: "America/Sao_Paulo" };
  let browser = null, context, profileDir = null;

  if (kiosk) {
    // Tela cheia de verdade no monitor principal: sem abas, endereço, favoritos ou avisos.
    profileDir = mkdtempSync(join(tmpdir(), "mcd-demo-profile-"));
    // Sem gerenciador de senhas: senão o Chromium abre "Salvar senha?" e "Mude sua senha" (vazamento)
    // por cima da página após o login — balões do navegador que bloqueiam a tela gravada.
    mkdirSync(join(profileDir, "Default"), { recursive: true });
    writeFileSync(join(profileDir, "Default", "Preferences"), JSON.stringify({
      credentials_enable_service: false,
      credentials_enable_autosignin: false,
      profile: { password_manager_enabled: false, password_manager_leak_detection: false, default_content_setting_values: { notifications: 2 } },
      autofill: { profile_enabled: false, credit_card_enabled: false },
      translate: { enabled: false },
    }));
    context = await chromium.launchPersistentContext(profileDir, {
      ...common,
      headless: false,
      viewport: null,
      args: ["--kiosk", "--force-device-scale-factor=1", `--window-position=${VIDEO.screenX},${VIDEO.screenY}`, `--window-size=${VIDEO.viewportW},${VIDEO.viewportH}`,
        "--disable-extensions", "--lang=pt-BR", "--no-first-run", "--no-default-browser-check",
        "--hide-crash-restore-bubble", "--password-store=basic",
        "--disable-features=Translate,TranslateUI,PasswordLeakDetection,PasswordManagerOnboarding,PasswordCheck,AutofillServerCommunication"],
      ignoreDefaultArgs: ["--enable-automation"],
    });
  } else {
    browser = await chromium.launch({ headless: HEADLESS, args: ["--disable-extensions", "--lang=pt-BR", "--force-device-scale-factor=1"], ignoreDefaultArgs: ["--enable-automation"] });
    context = await browser.newContext({ ...common, viewport: { width: VIDEO.viewportW, height: VIDEO.viewportH }, deviceScaleFactor: 1 });
  }
  mouse.x = VIDEO.viewportW / 2; mouse.y = VIDEO.viewportH / 2;
  await context.addInitScript(CURSOR_SCRIPT);
  await context.addInitScript(NAV_TOP_SCRIPT);
  // Trava de segurança: nenhuma navegação de página pode sair de localhost:5173.
  await context.route("**/*", route => {
    const request = route.request();
    if (request.isNavigationRequest() && new URL(request.url()).origin !== BASE_URL) {
      console.error(`Navegação bloqueada para fora de ${BASE_URL}.`);
      return route.abort();
    }
    return route.fallback();
  });

  page = context.pages()[0] ?? await context.newPage();
  for (const extra of context.pages()) if (extra !== page) await extra.close();

  // ── Encerramento único (fim normal, falha, Ctrl+C ou janela fechada) ──
  let rec = null, cdp = null, ok = false, finishing = null, osCursor = null;
  const frames = [];
  const framesDir = join(VIDEO_DIR, `${name}-frames`);
  const finish = (reason) => finishing ??= (async () => {
    if (reason) console.log(`\n${reason}`);
    const end = Date.now();
    if (cdp) await cdp.send("Page.stopScreencast").catch(() => {});
    if (rec) { console.log("Encerrando o ffmpeg..."); await stopGdigrab(rec); }
    if (osCursor) setOsCursor(osCursor); // devolve o cursor do Windows para onde estava
    await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (profileDir) rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    const timelinePath = join(VIDEO_DIR, VALIDATE ? "timeline-validacao.txt" : SHORT_TEST ? "timeline-teste-curto.txt" : "timeline.txt");
    writeFileSync(timelinePath, timeline.join("\n") + "\n", "utf8");
    console.log(`Timeline: ${timelinePath}`);
    const mp4 = join(VIDEO_DIR, `${ok ? name : `${name}-INCOMPLETO`}.mp4`);
    if (rec) {
      console.log("Gerando o MP4 final (H.264)...");
      if (encodeMp4(ffmpeg, ["-i", rec.rawPath], mp4)) { rmSync(rec.rawPath, { force: true }); console.log(`Vídeo (.mp4): ${mp4}`); }
      else console.log(`Falha ao gerar o MP4. Captura bruta mantida em: ${rec.rawPath}`);
    }
    if (cdp && frames.length) {
      const list = [];
      frames.forEach((frame, index) => {
        const until = index + 1 < frames.length ? frames[index + 1].at : end;
        const from = index === 0 ? Math.min(frame.at, t0) : frame.at;
        list.push(`file '${frame.file}'`, `duration ${Math.max(0.001, (until - from) / 1000).toFixed(3)}`);
      });
      list.push(`file '${frames.at(-1).file}'`);
      const listPath = join(framesDir, "frames.ffconcat");
      writeFileSync(listPath, "ffconcat version 1.0\n" + list.join("\n") + "\n", "utf8");
      if (encodeMp4(ffmpeg, ["-f", "concat", "-safe", "0", "-i", listPath], mp4)) { rmSync(framesDir, { recursive: true, force: true }); console.log(`Vídeo (.mp4): ${mp4}`); }
      else console.log(`Falha ao montar o MP4. Quadros mantidos em: ${framesDir}`);
    }
  })();
  process.on("SIGINT", async () => {
    await finish("Ctrl+C recebido: abortando a gravação.");
    console.log("\n✖ Gravação abortada.");
    process.exit(130);
  });
  context.on("close", () => { if (!finishing && !ok) console.log("\nA janela do navegador foi fechada: abortando."); });

  try {
    // Navegador já em tela cheia e com a Home carregada ANTES de a gravação começar.
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await waitCatalog();
    await page.evaluate(() => document.fonts?.ready);
    await sleep(800);
    // Diagnóstico + validação obrigatória na janela de gravação (antes de iniciar o ffmpeg).
    const m = await page.evaluate(() => ({ innerWidth, innerHeight, devicePixelRatio, visualViewportScale: window.visualViewport?.scale ?? null,
      screenWidth: screen.width, screenHeight: screen.height, cssZoom: getComputedStyle(document.documentElement).zoom }));
    console.log(`Janela: innerWidth=${m.innerWidth} innerHeight=${m.innerHeight} devicePixelRatio=${m.devicePixelRatio} ` +
      `visualViewport.scale=${m.visualViewportScale} screen.width=${m.screenWidth} screen.height=${m.screenHeight} zoom CSS=${m.cssZoom}`);
    const bad = [];
    if (m.innerWidth !== VIDEO.viewportW) bad.push(`innerWidth=${m.innerWidth} (esperado ${VIDEO.viewportW})`);
    if (m.innerHeight !== VIDEO.viewportH) bad.push(`innerHeight=${m.innerHeight} (esperado ${VIDEO.viewportH})`);
    if (m.devicePixelRatio !== 1) bad.push(`devicePixelRatio=${m.devicePixelRatio} (esperado 1)`);
    if (bad.length) throw new Error(`ABORTADO antes de gravar: ${bad.join(", ")}. Nada foi gravado.`);
    if (kiosk) {
      guardZoom = true;
      osCursor = parkOsCursor();
    }
    if (recording && method === "gdigrab") {
      const rawPath = join(VIDEO_DIR, `${name}-captura-bruta.mkv`);
      rec = { ...startGdigrab(ffmpeg, rawPath), rawPath };
      await rec.started;
      t0 = Date.now(); // timeline = tempo desde o início da gravação do ffmpeg
      log(`ffmpeg gravando; estabilizando ${PACE.startMs / 1000} s`);
      await pause(PACE.startMs);
    } else if (recording) {
      rmSync(framesDir, { recursive: true, force: true });
      mkdirSync(framesDir, { recursive: true });
      cdp = await context.newCDPSession(page);
      cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
        const file = `f${String(frames.length).padStart(6, "0")}.jpg`;
        writeFileSync(join(framesDir, file), Buffer.from(data, "base64"));
        frames.push({ file, at: metadata.timestamp ? metadata.timestamp * 1000 : Date.now() });
        cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      });
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: VIDEO.jpegQuality, maxWidth: VIDEO.viewportW, maxHeight: VIDEO.viewportH, everyNthFrame: 1 });
      t0 = Date.now();
    } else {
      t0 = Date.now();
    }
    await (SHORT_TEST ? shortFlow() : flow());
    ok = true;
  } catch (error) {
    if (!(error instanceof StepError)) console.error(`\n✖ ${error.message}`);
  }
  await finish();
  console.log(ok ? "\n✔ Fluxo concluído com sucesso." : "\n✖ Fluxo interrompido.");
  process.exit(ok ? 0 : 1);
}

await main();
