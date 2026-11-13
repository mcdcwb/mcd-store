import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

// Botão "voltar ao topo", só no celular (< 768px). Aparece quando o carrossel do topo já saiu da tela E a pessoa
// rolou mais de UP_THRESHOLD px seguidos para cima; some ao rolar para baixo, com o carrossel visível, no topo e
// enquanto houver toast (no celular eles ficam embaixo, no mesmo canto). Fica acima do WhatsApp, quando houver.
const MOBILE_QUERY = "(max-width: 767px)";
const UP_THRESHOLD = 40;
const CAROUSEL = 'section[aria-label="Carrossel de produtos"]';
const LOGO = '[aria-label="MCD Store — página inicial"]';

export function BackToTop({ blocked, aboveWhatsapp }: { blocked: boolean; aboveWhatsapp: boolean }) {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [shown, setShown] = useState(false);
  const state = useRef({ lastY: window.scrollY, up: 0, frame: 0 });

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const change = () => setMobile(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (!mobile) { setShown(false); return; }
    const s = state.current;
    const evaluate = () => {
      s.frame = 0;
      const y = window.scrollY;
      if (y < s.lastY) s.up += s.lastY - y; else if (y > s.lastY) s.up = 0;
      s.lastY = y;
      const carousel = document.querySelector(CAROUSEL);
      const pastCarousel = carousel ? carousel.getBoundingClientRect().bottom <= 0 : y > window.innerHeight;
      const toast = document.querySelector("[data-sonner-toast]") !== null;
      setShown(y > 8 && pastCarousel && s.up > UP_THRESHOLD && !toast);
    };
    const schedule = () => { if (!s.frame) s.frame = requestAnimationFrame(evaluate); };
    window.addEventListener("scroll", schedule, { passive: true });
    // Toast entrando ou saindo muda a regra sem rolagem: reavalia (sem contar como rolagem para cima).
    const observer = new MutationObserver(() => { const toast = document.querySelector("[data-sonner-toast]") !== null; if (toast) setShown(false); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { window.removeEventListener("scroll", schedule); observer.disconnect(); if (s.frame) cancelAnimationFrame(s.frame); s.frame = 0; };
  }, [mobile]);

  if (!mobile) return null;
  const visible = shown && !blocked;
  const goTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: reduce ? "instant" : "smooth" });
    state.current.up = 0;
    setShown(false);
    document.querySelector<HTMLElement>(LOGO)?.focus({ preventScroll: true });
  };
  return (
    <button type="button" aria-label="Voltar ao topo" onClick={goTop} data-back-to-top
      tabIndex={visible ? 0 : -1} aria-hidden={visible ? undefined : true}
      className={`fixed right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-primary bg-card text-primary shadow-lg transition-[opacity,transform] duration-200 motion-reduce:transition-none ${aboveWhatsapp ? "bottom-[76px]" : "bottom-5"} ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}>
      <ArrowUp aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
