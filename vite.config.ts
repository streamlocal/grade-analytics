import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project site lives under /<REPO>/ — NOT domain root.
// Set VITE_BASE at build time, e.g. VITE_BASE=/my-repo/ .
// deploy-pages.yml passes it automatically from the repo name.
// Falls back to /grade-analytics/ for local preview clarity.
const base = process.env.VITE_BASE || '/grade-analytics/';

export default defineConfig({
  plugins: [react()],
  base,
  build: { outDir: 'dist', sourcemap: false },
});
