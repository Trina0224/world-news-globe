const ALLOWED_ORIGIN = 'https://trina0224.github.io';

function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin)
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || ALLOWED_ORIGIN;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'POST only' }, 405, origin);
    }

    try {
      const body = await request.json();
      const country = String(body?.country || '').trim();
      const region = String(body?.region || '').trim();

      if (!country) {
        return json({ ok: false, error: 'country is required' }, 400, origin);
      }

      // Initial connectivity test. The next step replaces this with
      // per-area Google News RSS fetching + ranking.
      return json({
        ok: true,
        country,
        region,
        mode: 'connectivity-test',
        message: 'World News refresh Worker is online.'
      }, 200, origin);
    } catch (error) {
      return json({
        ok: false,
        error: error?.message || 'Invalid request'
      }, 500, origin);
    }
  }
};
