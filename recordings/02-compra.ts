// Vídeo 02-compra — Fluxo de compra.
// Rodar: npm run record:02   (front em http://localhost:5173 e backend local no ar)
import { startRecording, moveAndClick, hover, typeHuman, smoothScroll, smoothScrollTo, pause } from "./helpers.ts";

const rec = await startRecording("02-compra");
const { page } = rec;
try {
  await rec.open("/");

  // ROTEIRO: será definido no próximo prompt.
  await pause(1500);
} finally {
  await rec.finish();
}

// Mantidos importados para o roteiro (evita reescrever a linha de import).
void [moveAndClick, hover, typeHuman, smoothScroll, smoothScrollTo, page];
