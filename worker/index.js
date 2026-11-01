// Cloudflare Worker in front of the app. Pages come from ./dist (wrangler.jsonc); this script only adds a daily
// keep-alive: Supabase's free plan pauses a project after about a week without database activity.
// Needs two Worker secrets (the same public values as .env.local):
//   npx.cmd wrangler secret put SUPABASE_URL
//   npx.cmd wrangler secret put SUPABASE_ANON_KEY
export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('keep-alive: Worker secrets not set');
    // An anonymous read: row security returns nothing, but the database still runs the query, which counts as activity.
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/households?select=id&limit=1`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
    });
    if (!r.ok) throw new Error(`keep-alive: Supabase answered ${r.status}`);
  },
};
