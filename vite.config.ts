import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => {
  const development = command === 'serve';
  const policy = [
    "default-src 'none'",
    `script-src 'self'${development ? " 'unsafe-inline'" : ''}`,
    `style-src 'self'${development ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:",
    `connect-src https://api.green-api.com https://*.api.green-api.com${development ? ' ws://127.0.0.1:*' : ''}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  return {
    base: './',
    plugins: [
      react(),
      {
        name: 'content-security-policy',
        transformIndexHtml() {
          return [
            {
              tag: 'meta',
              attrs: {
                'http-equiv': 'Content-Security-Policy',
                content: policy,
              },
              injectTo: 'head-prepend',
            },
          ];
        },
      },
    ],
    test: {
      include: ['src/**/*.test.ts'],
      clearMocks: true,
      restoreMocks: true,
    },
  };
});
