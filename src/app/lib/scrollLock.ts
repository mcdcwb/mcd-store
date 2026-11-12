// Trava a rolagem da página enquanto um modal ou drawer está aberto, sem a página "pular".
// Com overflow: hidden a barra de rolagem some e a página ganha a largura dela; por isso o body recebe
// padding-right do mesmo tamanho, e os elementos position: fixed (botão do WhatsApp, toasts, aviso de
// sincronização) recuam a mesma largura via --scroll-lock-gap (ver store-theme.css).
// No celular a barra é sobreposta (largura 0) e nada muda. Vários modais podem travar ao mesmo tempo.
let locks = 0;

export function lockScroll(): () => void {
  const root = document.documentElement, body = document.body;
  if (locks++ === 0) {
    const gap = Math.max(0, window.innerWidth - root.clientWidth);
    root.style.setProperty("--scroll-lock-gap", `${gap}px`);
    root.dataset.scrollLocked = "";
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks > 0) return;
    body.style.overflow = "";
    body.style.paddingRight = "";
    delete root.dataset.scrollLocked;
    root.style.removeProperty("--scroll-lock-gap");
  };
}
