import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function pagesBase(): string {
  const raw = process.env.MATCHAHEAD_BASE ?? '/matchahead/';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`;
}

function pagesFallback(base: string): Plugin {
  const script = [
    '(function () {',
    `  var base = ${JSON.stringify(base)};`,
    '  var path = location.pathname;',
    '  var rest = path.indexOf(base) === 0 ? path.slice(base.length) : "";',
    '  rest = rest.replace(/^index\\.html$/, "").replace(/\\/$/, "");',
    '  location.replace(base + "#/" + rest);',
    '})();',
  ].join('\n');
  return {
    name: 'matchahead-pages-fallback',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '404.html',
        source: `<!doctype html><html lang="sr"><head><meta charset="utf-8"><title>MatchAhead</title><script>${script}</script></head><body><p>Preusmeravanje na MatchAhead.</p></body></html>`,
      });
    },
  };
}

const base = pagesBase();

export default defineConfig({
  base,
  define: {
    __APP_BUILD__: JSON.stringify(process.env.MATCHAHEAD_BUILD ?? 'dev'),
  },
  resolve: {
    alias: {
      '@matchahead/domain': fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      manifest: {
        id: base,
        name: 'MatchAhead',
        short_name: 'MatchAhead',
        description: 'Raspored izabranih klubova. Google prijava je obavezna.',
        lang: 'sr',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0f1512',
        theme_color: '#0f1512',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest,json,svg,ico}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        minify: false,
      },
      devOptions: { enabled: false },
    }),
    pagesFallback(base),
  ],
});
