import { build } from 'esbuild';
import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), 'VITE_');
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) throw new Error('Car Soccer rooms need the Grade Analytics Supabase URL and anon key.');

await build({
  entryPoints: ['src/carSoccerRelay.js'],
  outfile: 'dist/car-soccer/relay.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  define: {
    __SUPABASE_URL__: JSON.stringify(url),
    __SUPABASE_ANON_KEY__: JSON.stringify(anon),
  },
});
