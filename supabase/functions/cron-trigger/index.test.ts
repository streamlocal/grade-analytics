import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ adminClient: vi.fn() }));
vi.mock('../_shared/auth.ts', () => ({
  adminClient: mocks.adminClient,
  json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
}));
vi.mock('../_shared/cors.ts', () => ({ preflight: () => null }));

describe('scheduled sync dispatch', () => {
  let handler: (request: Request) => Promise<Response>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let queryError: unknown;

  beforeEach(async () => {
    vi.resetModules();
    queryError = null;
    const userIds = ['accepted', 'running', 'failed', 'extra-1', 'extra-2', 'opted-out'];
    mocks.adminClient.mockReturnValue({
      from: (table: string) => ({ select: async () => ({
        data: table === 'lms_credentials'
          ? userIds.map((user_id) => ({ user_id }))
          : [{ user_id: 'opted-out', daily_sync: false }],
        error: queryError,
      }) }),
    });
    vi.stubGlobal('Deno', {
      env: { get: (key: string) => ({ CRON_SECRET: 'cron-secret', SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key' })[key] },
      serve: (fn: typeof handler) => { handler = fn; },
    });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await import('./index.ts');
  });

  afterEach(() => vi.unstubAllGlobals());

  const request = (secret = 'cron-secret') => new Request('https://example.test/cron-trigger', {
    method: 'POST', headers: { Authorization: `Bearer ${secret}` },
  });

  it('requests background syncs, honors opt-outs, and reports partial failure', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.background).toBe(true);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response(null, { status: body.for_user === 'accepted' ? 202 : body.for_user === 'running' ? 409 : 503 });
    });
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, triggered: 1, already_running: 1, failed: 3, users: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('treats existing sync locks as a successful dispatch and bounds concurrency', async () => {
    let active = 0, peak = 0;
    fetchMock.mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return new Response(null, { status: 409 });
    });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ triggered: 0, already_running: 5, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('continues dispatching after a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValue(new Response(null, { status: 202 }));
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ triggered: 4, failed: 1 });
  });

  it('fails on a target lookup error instead of reporting an empty successful run', async () => {
    queryError = { message: 'database unavailable' };
    expect((await handler(request())).status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unauthorized calls before dispatching', async () => {
    expect((await handler(request('wrong-secret'))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
