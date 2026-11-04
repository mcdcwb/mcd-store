import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const apiBase = process.env.VITE_API_URL || env.VITE_API_URL || "/api"
  const proxyTarget = process.env.API_PROXY_TARGET || env.API_PROXY_TARGET || "http://127.0.0.1:3000"
  const isLocalApi = (value: string) => {
    if (value === "/api") return true
    try {
      const url = new URL(value)
      return ["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && !url.username && !url.password
    } catch {
      return false
    }
  }
  if (mode !== "production" && (!isLocalApi(apiBase) || !isLocalApi(proxyTarget))) {
    throw new Error("During development, configure only /api or a local backend URL.")
  }

  return {
    server: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (url) => url.replace(/^\/api/, ""),
        },
      },
    },
    plugins: [
      figmaAssetResolver(),
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
