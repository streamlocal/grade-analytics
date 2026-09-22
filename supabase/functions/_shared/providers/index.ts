import { canvasProvider } from './canvas.ts';
import type { LMSProvider } from './types.ts';

export function getProvider(name: string): LMSProvider {
  if (name === 'canvas') return canvasProvider;
  throw new Error(`Unknown provider: ${name}`);
}
