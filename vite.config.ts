/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any sub-path (e.g. embedded in the portfolio).
  base: './',
  server: { port: 5180 },
  preview: { port: 5180 },
  test: { environment: 'node' },
});
