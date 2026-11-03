import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(), requireUser: vi.fn(), decryptCredential: vi.fn(),
  getProvider: vi.fn(), refreshAiForUser: vi.fn(),
}));
vi.mock('../_shared/auth.ts', () => ({
  ...mocks,
  json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
}));
vi.mock('../_shared/cors.ts', () => ({ preflight: () => null }));
vi.mock('../_shared/providers/index.ts', () => ({ getProvider: mocks.getProvider }));
vi.mock('../_shared/ai.ts', () => ({ refreshAiForUser: mocks.refreshAiForUser }));

describe('background scheduled sync acceptance', () => {
  let handler: (request: Request) => Promise<Response>;
  let background: Promise<void>[];
  let updates: unknown[];
  let existing: { id: string; started_at: string }[];
  let rejectCredential: (error: Error) => void;

  beforeEach(async () => {
    vi.resetModules();
    background = [];
    updates = [];
    existing = [];
    const admin = { from: () => {
      const query = {
        select: () => query, eq: () => query,
        limit: async () => ({ data: existing }),
        insert: () => query,
        single: async () => ({ data: { id: 'run-id' }, error: null }),
        update: (value: unknown) => { updates.push(value); return query; },
      };
      return query;
    } };
    mocks.adminClient.mockReturnValue(admin);
    mocks.getProvider.mockReturnValue({ fetchCourses: async () => [] });
    mocks.refreshAiForUser.mockResolvedValue(undefined);
    mocks.requireUser.mockResolvedValue({ user: { id: 'signed-in-user' }, admin });
    mocks.decryptCredential.mockImplementation(() => new Promise((_resolve, reject) => { rejectCredential = reject; }));
    vi.stubGlobal('Deno', {
      env: { get: (key: string) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service-key' : undefined },
      serve: (fn: typeof handler) => { handler = fn; },
    });
    vi.stubGlobal('EdgeRuntime', { waitUntil: (task: Promise<void>) => background.push(task) });
    await import('./index.ts');
  });

  afterEach(() => vi.unstubAllGlobals());

  const request = (token = 'service-key') => new Request('https://example.test/sync', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'sync', for_user: 'target-user', background: true }),
  });

  it('acknowledges a locked run before slow work completes, then records failures', async () => {
    const response = await handler(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, accepted: true, run_id: 'run-id' });
    expect(background).toHaveLength(1);
    rejectCredential(new Error('Canvas unavailable'));
    await Promise.all(background);
    expect(updates).toContainEqual(expect.objectContaining({ status: 'failed', error: 'Canvas unavailable' }));
  });

  it('keeps ordinary user requests synchronous even if they request background mode', async () => {
    mocks.decryptCredential.mockRejectedValue(new Error('Canvas unavailable'));
    const response = await handler(request('user-jwt'));
    expect(response.status).toBe(502);
    expect(background).toHaveLength(0);
    expect(mocks.decryptCredential).toHaveBeenCalledWith(expect.anything(), 'signed-in-user');
  });

  it('records completion after accepting a scheduled sync', async () => {
    mocks.decryptCredential.mockResolvedValue({ cred: { provider: 'canvas' }, token: 'canvas-token' });
    expect((await handler(request())).status).toBe(202);
    await Promise.all(background);
    expect(updates).toContainEqual(expect.objectContaining({ status: 'complete', stage: 'Complete' }));
    expect(mocks.refreshAiForUser).toHaveBeenCalled();
  });

  it('does not start another job when a sync is already running', async () => {
    existing = [{ id: 'existing-run', started_at: new Date().toISOString() }];
    expect((await handler(request())).status).toBe(409);
    expect(background).toHaveLength(0);
  });
});
