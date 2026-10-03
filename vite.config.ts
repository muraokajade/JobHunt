import { defineConfig } from 'vitest/config';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

/*
 * Vitest(テスト)の実行中は laravel-vite-plugin を読み込まない。
 * このプラグインの役割は、Laravelへのエントリ指定・ビルドマニフェスト・開発サーバー(HMR)で、テストでは使わない。
 * 一方でVitestは設定をserveモードで読み込むため、プラグインの「CI環境でHMRサーバーを起動しない」検査
 * (CI環境変数があると例外)に掛かり、GitHub Actions上でテストが起動できなくなる。
 * VITESTはVitestだけが設定する変数なので、vite build・vite(開発サーバー)の挙動と、上の検査はそのまま保たれる。
 */
const isVitest = process.env.VITEST !== undefined;

export default defineConfig({
    plugins: [
        ...(isVitest
            ? []
            : [
                  laravel({
                      input: ['resources/css/app.css', 'resources/js/app.tsx'],
                      refresh: true,
                  }),
              ]),
        tailwindcss(),
        react(),
    ],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./resources/js/test/setup.ts'],
        include: ['resources/js/**/*.test.{ts,tsx}'],
    },
});
