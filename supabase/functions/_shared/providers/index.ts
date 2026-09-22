import { canvasProvider } from './providers/canvas.ts';
import type { LMSProvider } from './providers/types.ts';

export function getProvider(name: string): LMSProvider {
  if (name === 'canvas') return canvasProvider;
  throw new Error(`Unknown provider: ${name}`);
}
