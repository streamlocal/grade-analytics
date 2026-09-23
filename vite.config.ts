import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The hosted app runs at the domain root. GitHub Pages builds can still
// override this through VITE_BASE (for example, /grade-analytics/).
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  plugins: [react()],
  base,
  build: { outDir: 'dist', sourcemap: false },
});
