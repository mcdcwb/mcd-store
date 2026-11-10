# Gravação da demo (MCD Store — lado do cliente)

Grava em vídeo (MP4 1920x1080, H.264, 30 fps, sem áudio) o fluxo de compra do cliente, com cursor visível e movimentos humanizados.
Roda **somente** contra `http://localhost:5173`; qualquer outra URL aborta. O script de gravação não lê `DATABASE_URL` nem credenciais.

## Instalar (uma vez)

```powershell
cd demo-recording
npm install
winget install --id Gyan.FFmpeg -e   # necessário para montar o MP4
```

Usa `@playwright/test` 1.63.0, a mesma versão do projeto, então reaproveita o Chromium já baixado.
Se o Chromium não estiver no cache: `npx playwright install chromium` (download de ~150 MB).
O script encontra o ffmpeg do winget mesmo antes de o PATH ser recarregado (ou use `$env:FFMPEG` com o caminho).

## Antes de cada gravação

1. Front (`npm run dev` na raiz) e backend (`npm run dev` em `backend/`) rodando, com o banco local `mcd_store_demo`.
2. Limpe o usuário de teste (num terminal com `DATABASE_URL` do banco **local** definida e `NODE_ENV` vazio):

```powershell
cd demo-recording
$env:DATABASE_URL = "postgresql://mcd_demo:<senha>@127.0.0.1:5432/mcd_store_demo?schema=public"
npm run reset
```

O reset aborta sem apagar nada se a URL não for localhost/127.0.0.1, se o banco não for `mcd_store_demo`, se contiver "neon" ou se `NODE_ENV` estiver definido.

## Rodar

```powershell
node record-demo.mjs --short-test     # teste curto (~14 s, Home + filtros) para conferir a nitidez
npm run record                        # gravação completa: Chromium em tela cheia (kiosk) + ffmpeg gdigrab
$env:HEADLESS = "1"; npm run validate # valida o fluxo sem gravar e sem ocupar a tela (cria o usuário de teste: rode o reset depois)
```

Como funciona: o Chromium abre em `--kiosk` no monitor principal (0,0), o script confere `innerWidth x innerHeight = 1920x1080`
e `devicePixelRatio = 1` (senão para sem gravar), e só então inicia o ffmpeg (`gdigrab`, 30 fps, `-draw_mouse 0`, só a área
1920x1080 do monitor principal). A captura bruta é sem perdas; ao final vira o MP4 H.264 (crf 17, preset slow, yuv420p, +faststart).
O `timeline.txt` conta o tempo desde o início da gravação do ffmpeg.

Durante a gravação, **não use teclado nem mouse no monitor principal** (a janela em tela cheia recebe a entrada real).
Se o zoom do navegador mudar (ex.: Ctrl+roda), o script para no próximo passo em vez de gravar um layout errado.

**Abortar no meio:** `Alt+F4` na janela da loja, ou `Alt+Tab` até o terminal e `Ctrl+C`. O ffmpeg é finalizado
(MP4 válido com sufixo `-INCOMPLETO`), o navegador é fechado e o perfil temporário é removido. Ao terminar ou falhar,
o script também fecha o navegador sozinho.

Saída em `demo-recording/videos/`:
- `mcd-store-demo-<data>.mp4`
- `timeline.txt`: cada passo com o tempo desde o início do vídeo, para a edição
- `erro-passo-N.png`: screenshot quando um passo falha (o script para no primeiro erro)

## Resolução

Renderização 1:1, igual ao Chrome normal num monitor 1920x1080 a 100%: sem zoom, sem deviceScaleFactor (sempre 1,
com `--force-device-scale-factor=1`) e sem escala no ffmpeg. Antes de gravar, o script imprime `innerWidth`, `innerHeight`,
`devicePixelRatio`, `visualViewport.scale`, `screen.width`/`screen.height` e o zoom CSS da janela, e **aborta** se
`innerWidth`/`innerHeight` não forem `VIEWPORT_W`/`VIEWPORT_H` ou se `devicePixelRatio` não for 1.

Variáveis de ambiente (padrões entre parênteses), também no objeto `VIDEO` no topo de `record-demo.mjs`:
- `VIEWPORT_W` / `VIEWPORT_H` (1920x1080): tamanho da página em px CSS = tamanho da captura e do vídeo.
- `CAPTURE_METHOD` (`gdigrab`): tela cheia + ffmpeg gdigrab. Alternativa: `screencast` (quadros do Chromium via CDP, funciona em headless). O `recordVideo` do Playwright não é usado.
- `SCREEN_X` / `SCREEN_Y` (0, 0): origem do monitor capturado. `CRF` (17), `PRESET` (slow), `CURSOR_PX` (30, diâmetro do cursor falso em px).

## Mudar o ritmo

Tudo fica no objeto `PACE` no topo de `record-demo.mjs`:
- `scale`: multiplicador geral (`1.5` = 50% mais lento, `0.8` = mais rápido)
- `moveMs`, `beforeClickMs`, `afterActionMs`, `afterSmallActionMs`: movimentos e pausas
- `keyMs`: tempo por tecla ao digitar
- `scrollStepPx`, `scrollTickMs`: rolagem suave
- `filterSettleMs`, `filterSettleTimeoutMs`, `afterFilterMs`: espera da rolagem automática após cada filtro
