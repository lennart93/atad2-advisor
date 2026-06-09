// Ingest the curated ATAD2 knowledge chunks into the shared `documents` vector
// store. Embeds with Azure ada-002 (same 1536-dim space as the NDFR corpus),
// tags every row with metadata.kb='atad2' so re-runs are idempotent (existing
// atad2 rows are deleted first) and the NDFR corpus is never touched.
//
// Keys via env: AZURE_KEY (Azure OpenAI), SR (Supabase service role).
//   node scripts/kb/ingest.mjs

import { readFileSync } from 'node:fs';

const AZ_KEY = process.env.AZURE_KEY;
const SR = process.env.SR;
if (!AZ_KEY || !SR) { console.error('Set AZURE_KEY and SR'); process.exit(1); }

const EMBED_URL = 'https://atad2.cognitiveservices.azure.com/openai/deployments/text-embedding-ada-002/embeddings?api-version=2023-05-15';
const BASE = 'https://api.atad2.tax/rest/v1';
const hdr = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };

const chunks = [
  ...JSON.parse(readFileSync(new URL('./chunks.json', import.meta.url), 'utf8')),
  ...JSON.parse(readFileSync(new URL('./classification-list.json', import.meta.url), 'utf8')),
];
console.log(`loaded ${chunks.length} chunks`);

// 1) embed (ada-002 accepts a batch of inputs in one call)
const er = await fetch(EMBED_URL, {
  method: 'POST',
  headers: { 'api-key': AZ_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: chunks.map((c) => c.content) }),
});
if (!er.ok) { console.error('embed failed', er.status, await er.text()); process.exit(1); }
const ej = await er.json();
const vectors = ej.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
console.log(`embedded ${vectors.length} chunks (${vectors[0].length} dims, ${ej.usage.total_tokens} tokens)`);

// 2) idempotent: drop any prior atad2 knowledge rows
const del = await fetch(`${BASE}/documents?metadata->>kb=eq.atad2`, { method: 'DELETE', headers: hdr });
console.log('deleted prior atad2 rows:', del.status);

// 3) insert (single batch)
const rows = chunks.map((c, i) => ({
  content: c.content,
  metadata: { kb: 'atad2', category: c.category, source: c.source, period: c.period, article_refs: c.article_refs, section: c.section },
  embedding: `[${vectors[i].join(',')}]`,
}));
const ins = await fetch(`${BASE}/documents`, { method: 'POST', headers: { ...hdr, Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
if (!ins.ok) { console.error('insert failed', ins.status, await ins.text()); process.exit(1); }
console.log('insert:', ins.status);

// 4) verify
const cnt = await fetch(`${BASE}/documents?metadata->>kb=eq.atad2&select=count`, { method: 'GET', headers: { ...hdr, Prefer: 'count=exact' } });
console.log('atad2 rows now:', cnt.headers.get('content-range'));
const byCat = await (await fetch(`${BASE}/documents?metadata->>kb=eq.atad2&select=metadata->category`, { headers: hdr })).json();
const counts = byCat.reduce((m, r) => ((m[r.category] = (m[r.category] || 0) + 1), m), {});
console.log('by category:', JSON.stringify(counts));
