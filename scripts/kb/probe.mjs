// Quick retrieval-quality probe: embed a few realistic questions and show which
// curated chunks match_documents returns (source + section + similarity).
// Env: AZURE_KEY, SR.

const AZ_KEY = process.env.AZURE_KEY, SR = process.env.SR;
const EMBED_URL = 'https://atad2.cognitiveservices.azure.com/openai/deployments/text-embedding-ada-002/embeddings?api-version=2023-05-15';
const BASE = 'https://api.atad2.tax/rest/v1';
const hdr = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };

async function embed(t) {
  const r = await fetch(EMBED_URL, { method: 'POST', headers: { 'api-key': AZ_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: t }) });
  return (await r.json()).data[0].embedding;
}
async function match(vec, category, k) {
  const r = await fetch(`${BASE}/rpc/match_documents`, { method: 'POST', headers: hdr, body: JSON.stringify({ query_embedding: vec, match_count: k, filter: { kb: 'atad2', category } }) });
  return await r.json();
}

const probes = [
  { category: 'samenwerkende_groep', q: 'Een Luxemburgs private equity fonds (SCSp) met een general partner en parallelle aandeelhoudersleningen; vormen de passieve investeerders een samenwerkende groep voor de hybridemismatchtoets?' },
  { category: 'rechtsvorm_classificatie', q: 'Hoe kwalificeert Nederland een Luxemburgse SCSp en een Duitse GmbH & Co KG, en wat verandert er door de Wet FKR per 2025?' },
  { category: 'rechtsvorm_lijst', q: 'Indicatieve NL-kwalificatie van rechtsvormen in Verenigde Staten voor boekjaar 2024. Betrokken entiteiten: Acme Fund LP' },
  { category: 'rechtsvorm_lijst', q: 'Indicatieve NL-kwalificatie van rechtsvormen in Duitsland voor boekjaar 2024. Betrokken entiteiten: Holding GmbH & Co KG' },
  { category: 'rechtsvorm_lijst', q: 'Indicatieve NL-kwalificatie van rechtsvormen in Hongarije voor boekjaar 2024. Betrokken entiteiten: Investor Bt' },
];

for (const p of probes) {
  const vec = await embed(p.q);
  const rows = await match(vec, p.category, 4);
  console.log(`\n### [${p.category}] ${p.q}`);
  for (const r of rows) console.log(`  [${r.similarity.toFixed(3)}] ${r.metadata.source} -- ${r.metadata.section} (period=${r.metadata.period})`);
}
