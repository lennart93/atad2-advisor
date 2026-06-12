// One-shot validation of the knowledge-base ingest + retrieval path against the
// live `documents` table. Embeds with Azure ada-002, inserts via PostgREST
// (service role), retrieves via match_documents with a metadata filter, cleans up.
// Keys are passed via env (AZURE_KEY, SR) so they never appear in source.

const AZ_KEY = process.env.AZURE_KEY;
const SR = process.env.SR;
const EMBED_URL = 'https://atad2.cognitiveservices.azure.com/openai/deployments/text-embedding-ada-002/embeddings?api-version=2023-05-15';
const BASE = 'https://api.atad2.tax/rest/v1';
const hdr = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };

async function embed(text) {
  const r = await fetch(EMBED_URL, { method: 'POST', headers: { 'api-key': AZ_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: text }) });
  if (!r.ok) throw new Error(`embed ${r.status}: ${await r.text()}`);
  return (await r.json()).data[0].embedding;
}

const vec = await embed('De samenwerkende groep vereist coordinatie door een general partner.');
console.log('embed dims =', vec.length);

let r = await fetch(`${BASE}/documents`, { method: 'POST', headers: { ...hdr, Prefer: 'return=representation' }, body: JSON.stringify({ content: 'TEST kb selftest chunk', metadata: { category: 'kb_selftest' }, embedding: `[${vec.join(',')}]` }) });
const ins = r.ok ? await r.json() : null;
console.log('insert =', r.status, 'id =', ins?.[0]?.id ?? `(err: ${await safeText(r, ins)})`);

r = await fetch(`${BASE}/rpc/match_documents`, { method: 'POST', headers: hdr, body: JSON.stringify({ query_embedding: vec, match_count: 3, filter: { category: 'kb_selftest' } }) });
const m = r.ok ? await r.json() : [];
console.log('match =', r.status, 'rows =', m.length, 'sim =', m[0]?.similarity?.toFixed?.(4), 'content =', JSON.stringify(m[0]?.content));

r = await fetch(`${BASE}/documents?metadata->>category=eq.kb_selftest`, { method: 'DELETE', headers: hdr });
console.log('cleanup =', r.status);

async function safeText(resp, parsed) { try { return parsed ? JSON.stringify(parsed) : await resp.text(); } catch { return '?'; } }
