import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Code2 } from "lucide-react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// Ritmo da animação de entrada (segundos). Os "overlap" sobrepõem cada item ao final do anterior.
const ANIMATION = {
  charDuration: 0.45,     // cada letra de "PROJETO END-TO-END"
  charStagger: 0.03,      // intervalo entre uma letra e a próxima
  linkDuration: 0.45,     // fade + deslize de "por LUAN MACHADO"
  linkOverlap: 0.3,
  underlineDuration: 0.45, // sublinhado se desenhando
  underlineOverlap: 0.25,
  tagDuration: 0.5,       // "E-COMMERCE DEMONSTRATIVO"
  tagOverlap: 0.3,
  tagLetterSpacing: "0.3em", // espaçamento inicial, abre até o valor atual (só em telas >= 1024 px)
};

// Letreiro (marquee) que começa, sem salto, da posição em que os itens terminam a entrada.
// O espaçamento não é uma constante: é medido do layout original (ver measure()).
const MARQUEE = {
  pxPerSecond: 75,        // velocidade constante em px/s
  holdSeconds: 0.6,       // pausa com os itens parados entre o fim da entrada e o início do movimento
  startSeconds: 1.2,      // aceleração suave ao começar a andar
  hoverEaseSeconds: 0.5,  // desaceleração/retomada no hover, foco ou toque
  touchResumeSeconds: 2,  // no toque (mobile): volta a andar depois deste tempo
};

const PROJECT_LABEL = "PROJETO END-TO-END";
// Trechos que podem quebrar linha como no texto original: palavras e partes após cada hífen.
const PROJECT_CHUNKS = PROJECT_LABEL.split(" ").map(word => word.split(/(?<=-)/));
const AUTHOR_URL = "https://luan-machado.vercel.app/";
const MAIN_COPY = 1; // a cópia que fica onde estava o layout original (as outras ficam antes e depois)

const LABEL_CLASS = "text-[9px] font-bold leading-relaxed tracking-[0.08em] sm:text-xs sm:tracking-[0.16em]";
const LINK_CLASS = "store-strip-link whitespace-nowrap text-[10px] font-semibold tracking-[0.1em] transition-colors hover:text-primary focus-visible:text-primary sm:text-xs sm:tracking-[0.14em]";
const ICON_CLASS = "h-4 w-4 shrink-0 sm:h-5 sm:w-5";

// Medidas do layout original (px, relativas à faixa), aplicadas a todas as cópias do letreiro.
type StripLayout = {
  left: number;      // left do primeiro item: posição inicial da cópia principal
  widths: [number, number, number];
  gapA: number;      // PROJETO → link (como no original)
  gapB: number;      // link → E-COMMERCE (como no original)
  copyWidth: number; // largura de uma cópia: itens + gapA + gapB + emenda (gap da fórmula), arredondada
  copies: number;    // cópias na trilha (cobrem a faixa em qualquer posição do loop)
};

function Underline() {
  return <span data-strip-underline aria-hidden="true" className="store-strip-underline pointer-events-none absolute inset-x-0 -bottom-[0.2em] h-px bg-current" />;
}

// Letras em spans (para o charStagger). A mesma marcação em todas as cópias, para as larguras serem idênticas.
function ProjectChars() {
  return <>{PROJECT_CHUNKS.map((parts, word) => (
    <Fragment key={word}>
      {word > 0 && " "}
      {parts.map((part, index) => (
        <span key={index} className="inline-block whitespace-nowrap">
          {[...part].map((char, charIndex) => <span key={charIndex} data-strip-char className="inline-block">{char}</span>)}
        </span>
      ))}
    </Fragment>
  ))}</>;
}

// Uma cópia do letreiro. Larguras e espaços vêm das medidas do original (variáveis CSS na trilha).
// Só a cópia principal é lida por leitores de tela; as outras ficam aria-hidden e fora do Tab.
function MarqueeCopy({ main, hidden }: { main: boolean; hidden: boolean }) {
  const item = "inline-flex shrink-0 items-center whitespace-nowrap";
  return (
    <div data-strip-main={main || undefined} aria-hidden={!main || undefined}
      className={`flex shrink-0 items-center ${hidden ? "invisible" : ""}`} style={{ width: "var(--strip-copy)" }}>
      <span className={`${item} justify-start gap-2 sm:gap-4`} style={{ width: "var(--strip-w1)", marginRight: "var(--strip-gap-a)" }}>
        <Code2 aria-hidden="true" className={ICON_CLASS} />
        <span className={LABEL_CLASS}>
          {main && <span className="sr-only">{PROJECT_LABEL}</span>}
          <span aria-hidden="true"><ProjectChars /></span>
        </span>
      </span>
      <a data-strip-link className={`${LINK_CLASS} ${item}`} style={{ width: "var(--strip-w2)", marginRight: "var(--strip-gap-b)" }}
        href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" tabIndex={main ? undefined : -1}>
        <span className="relative inline-block">
          por LUAN MACHADO
          <Underline />
        </span>
      </a>
      <span className={`${item} justify-end gap-2 sm:gap-4`} style={{ width: "var(--strip-w3)" }}>
        <span data-strip-tag className={`hidden sm:inline ${LABEL_CLASS}`}>E-COMMERCE DEMONSTRATIVO</span>
        <Code2 aria-hidden="true" className={ICON_CLASS} />
      </span>
    </div>
  );
}

export function ServiceStrip() {
  const root = useRef<HTMLElement>(null);
  const staticRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<gsap.core.Tween | null>(null);
  const phaseRef = useRef<number | null>(null); // fração da cópia já percorrida (preservada no resize)
  const currentXRef = useRef(0);
  const startedRef = useRef(false);
  const [entered, setEntered] = useState(false);
  const [layout, setLayout] = useState<StripLayout | null>(null);
  const measureRef = useRef<() => void>(() => {});

  // 1) Mede o layout original (bloco estático, sempre no DOM; invisível quando há letreiro) e calcula
  //    posições e espaços. Roda antes da pintura e de novo em resize e quando as fontes carregam.
  useLayoutEffect(() => {
    const section = root.current, original = staticRef.current, viewport = marqueeRef.current;
    if (!section || !original || !viewport) return;
    const part = (name: string) => original.querySelector<HTMLElement>(`[data-strip-part="${name}"]`)!;
    const textRect = (el: HTMLElement) => { const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect(); };
    const measure = () => {
      const origin = viewport.getBoundingClientRect().left;
      const tag = part("tag");
      const tagShown = getComputedStyle(tag).display !== "none"; // no mobile o original esconde "E-COMMERCE"
      const first = { left: part("icon1").getBoundingClientRect().left, right: textRect(part("project")).right };
      const link = part("link").getBoundingClientRect();
      const last = { left: tagShown ? textRect(tag).left : part("icon2").getBoundingClientRect().left, right: part("icon2").getBoundingClientRect().right };
      const widths: [number, number, number] = [first.right - first.left, link.width, last.right - last.left];
      if (!widths[0] || !widths[1]) return;
      const gapA = link.left - first.right;
      const gapB = last.left - link.right;
      // gap = (right do último − left do primeiro − soma das larguras) / 2 → usado na emenda entre as cópias.
      const seam = (last.right - first.left - widths[0] - widths[1] - widths[2]) / 2;
      const copyWidth = Math.round(last.right - first.left + seam); // inteiro: a emenda cai exatamente num pixel
      const next: StripLayout = {
        left: first.left - origin, widths, gapA, gapB, copyWidth,
        copies: Math.max(MAIN_COPY + 2, Math.ceil(viewport.clientWidth / copyWidth) + 1),
      };
      setLayout(prev => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measureRef.current = measure;
    measure();
    // Resize da faixa e mudança de tamanho dos itens originais (ex.: quando a fonte da web termina de carregar).
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    for (const name of ["link", "tag", "icon1"]) observer.observe(part(name));
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, []);

  // 2) Entrada (charStagger inalterado), já dentro da trilha do letreiro, na cópia principal.
  useGSAP(() => {
    const mm = gsap.matchMedia();
    // Com prefers-reduced-motion: reduce nada é animado: fica o bloco original, estático.
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const q = gsap.utils.selector(root);
      const chars = q("[data-strip-main] [data-strip-char]");
      const link = q("[data-strip-main] [data-strip-link]");
      const underline = q("[data-strip-main] [data-strip-underline]");
      const tag = q("[data-strip-main] [data-strip-tag]");
      // Abaixo de 1024 px o espaçamento maior faria o texto quebrar linha (layout shift): só fade.
      const openSpacing = window.matchMedia("(min-width: 1024px)").matches;

      // Antes da pintura: o letreiro (com os itens nas posições originais) substitui o bloco estático.
      gsap.set(staticRef.current, { autoAlpha: 0 });
      gsap.set(marqueeRef.current, { autoAlpha: 1 });

      // Os .from() aplicam o estado inicial já na montagem (antes da pintura), então nada pisca visível.
      gsap.timeline({
        defaults: { ease: "power3.out" },
        scrollTrigger: { trigger: root.current, start: "top 85%", once: true },
        onComplete: () => {
          // Limpa só o que a entrada animou ("all" apagaria também width/margin postos pelo React no link).
          gsap.set([...chars, ...link, ...underline], { clearProps: "transform,opacity,visibility" });
          gsap.set(tag, { clearProps: "opacity,visibility,letterSpacing" });
          measureRef.current(); // posições finais (fonte da web já carregada) antes de o loop começar
          setEntered(true);
        },
      })
        .from(chars, { y: 20, autoAlpha: 0, duration: ANIMATION.charDuration, stagger: ANIMATION.charStagger })
        .from(link, { y: 8, autoAlpha: 0, duration: ANIMATION.linkDuration }, `-=${ANIMATION.linkOverlap}`)
        .from(underline, { scaleX: 0, transformOrigin: "left center", duration: ANIMATION.underlineDuration }, `-=${ANIMATION.underlineOverlap}`)
        .from(tag, { autoAlpha: 0, ...(openSpacing ? { letterSpacing: ANIMATION.tagLetterSpacing } : {}), duration: ANIMATION.tagDuration }, `-=${ANIMATION.tagOverlap}`);
    });
    return () => mm.revert();
  }, { scope: root });

  // 3) Posição da trilha e loop. Antes do fim da entrada a trilha só fica posicionada (cópia principal no
  //    lugar do original). Depois, só o x muda: loop contínuo com wrap a partir de qualquer posição.
  //    Refeito no resize preservando a fase atual; o useGSAP reverte o anterior (sem acumular tweens).
  useGSAP(() => {
    const viewport = marqueeRef.current, track = trackRef.current;
    if (!layout || !viewport || !track) return;
    const { copyWidth } = layout;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const wrapX = gsap.utils.wrap(-copyWidth, 0);
      // x = left - copyWidth põe a cópia MAIN_COPY (1) exatamente em layout.left.
      const homeX = wrapX(layout.left - (MAIN_COPY - 1) * copyWidth);
      const startX = phaseRef.current === null ? homeX : -copyWidth + phaseRef.current * copyWidth;
      gsap.set(track, { x: startX });
      if (!entered) return;

      const loop = gsap.to(track, {
        x: `-=${copyWidth}`, duration: copyWidth / MARQUEE.pxPerSecond, ease: "none", repeat: -1,
        // wrap: x sempre entre -copyWidth e 0 (loop contínuo de qualquer posição); guarda o x atual
        // para o resize retomar da mesma fase (o revert do contexto zera o x antes do cleanup).
        modifiers: { x: gsap.utils.unitize((x: number) => (currentXRef.current = wrapX(x))) },
      });
      loopRef.current = loop;
      if (!startedRef.current) {
        startedRef.current = true;
        loop.timeScale(0);
        gsap.to(loop, { timeScale: 1, duration: MARQUEE.startSeconds, delay: MARQUEE.holdSeconds, ease: "power1.in" });
      }

      const speed = (timeScale: number) => gsap.to(loop, { timeScale, duration: MARQUEE.hoverEaseSeconds, ease: "power2.out", overwrite: true });
      let touchTimer: number | undefined;
      const enter = (event: PointerEvent) => { if (event.pointerType !== "touch") speed(0); };
      const leave = (event: PointerEvent) => { if (event.pointerType !== "touch") speed(1); };
      const touchDown = (event: PointerEvent) => {
        if (event.pointerType !== "touch") return;
        window.clearTimeout(touchTimer);
        speed(0);
      };
      const touchUp = (event: PointerEvent) => {
        if (event.pointerType !== "touch") return;
        window.clearTimeout(touchTimer);
        touchTimer = window.setTimeout(() => speed(1), MARQUEE.touchResumeSeconds * 1000);
      };
      const focusIn = () => speed(0);
      const focusOut = (event: FocusEvent) => { if (!viewport.contains(event.relatedTarget as Node | null)) speed(1); };
      viewport.addEventListener("pointerenter", enter);
      viewport.addEventListener("pointerleave", leave);
      viewport.addEventListener("pointerdown", touchDown);
      viewport.addEventListener("pointerup", touchUp);
      viewport.addEventListener("pointercancel", touchUp);
      viewport.addEventListener("focusin", focusIn);
      viewport.addEventListener("focusout", focusOut);
      return () => {
        window.clearTimeout(touchTimer);
        viewport.removeEventListener("pointerenter", enter);
        viewport.removeEventListener("pointerleave", leave);
        viewport.removeEventListener("pointerdown", touchDown);
        viewport.removeEventListener("pointerup", touchUp);
        viewport.removeEventListener("pointercancel", touchUp);
        viewport.removeEventListener("focusin", focusIn);
        viewport.removeEventListener("focusout", focusOut);
      };
    });
    return () => {
      if (loopRef.current) {
        phaseRef.current = (currentXRef.current + copyWidth) / copyWidth;
      }
      loopRef.current = null;
      mm.revert();
    };
  }, { scope: root, dependencies: [entered, layout], revertOnUpdate: true });

  const trackVars = layout ? {
    "--strip-copy": `${layout.copyWidth}px`,
    "--strip-w1": `${layout.widths[0]}px`, "--strip-w2": `${layout.widths[1]}px`, "--strip-w3": `${layout.widths[2]}px`,
    "--strip-gap-a": `${layout.gapA}px`, "--strip-gap-b": `${layout.gapB}px`,
  } as CSSProperties : undefined;

  return (
    <section ref={root} data-testid="service-strip" className="store-service-strip relative overflow-hidden border-b-2 border-[#111111] bg-[#D9FF38] px-4 py-3 text-[#111111] sm:py-4">
      {/* Layout original: referência de medida e versão estática (prefers-reduced-motion / sem JS).
          Com o letreiro ativo fica invisível, mas continua no fluxo (dá a altura da faixa). */}
      <div ref={staticRef} className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:gap-4">
        <Code2 data-strip-part="icon1" aria-hidden="true" className={ICON_CLASS} />
        {/* Mesmas letras em spans do letreiro: larguras idênticas (spans inline-block não têm kerning). */}
        <p data-strip-part="project" className={`min-w-0 flex-1 text-left ${LABEL_CLASS}`}>
          <span className="sr-only">{PROJECT_LABEL}</span>
          <span aria-hidden="true"><ProjectChars /></span>
        </p>
        <a className={`${LINK_CLASS} text-right sm:text-center`} href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
          <span data-strip-part="link" className="relative inline-block">
            por LUAN MACHADO
            <Underline />
          </span>
        </a>
        <p data-strip-part="tag" className={`hidden min-w-0 text-right sm:block ${LABEL_CLASS}`}>E-COMMERCE DEMONSTRATIVO</p>
        <Code2 data-strip-part="icon2" aria-hidden="true" className={ICON_CLASS} />
      </div>

      {/* Letreiro: sobreposto ao original (mesma altura, sem layout shift). A cópia principal começa
          exatamente onde estavam os itens; a entrada roda nela e depois só o x da trilha muda. */}
      <div ref={marqueeRef} className="invisible absolute inset-0 flex items-center overflow-hidden">
        <div ref={trackRef} data-testid="service-strip-track" className="flex w-max items-center will-change-transform" style={trackVars}>
          {Array.from({ length: layout?.copies ?? MAIN_COPY + 2 }, (_, copy) => (
            <MarqueeCopy key={copy} main={copy === MAIN_COPY} hidden={!entered && copy !== MAIN_COPY} />
          ))}
        </div>
      </div>
    </section>
  );
}
