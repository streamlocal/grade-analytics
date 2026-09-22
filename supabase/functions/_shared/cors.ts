// Shared CORS handling. Browser calls to Edge Functions (via supabase.functions.invoke)
// trigger an OPTIONS preflight; without these headers the browser reports
// "Failed to send a request to the Edge Function".
// `*` origin is acceptable here: every request still requires a valid user JWT
// (which a foreign origin cannot read from this app's localStorage), and responses
// never contain the LMS token or another user's data.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Returns a response for preflight requests, otherwise null.
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
  return null;
}
