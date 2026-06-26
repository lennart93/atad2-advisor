#!/usr/bin/env node
/*
 * Upload the patched memo template (templates/memo_atad2_with_structure_placeholder.docx)
 * to Supabase Storage so the live download picks it up. The appendices only
 * render once Storage has the {{@appendicesXml}} placeholder, so this must run
 * after scripts/patch-memo-template.cjs and before the feature works in prod.
 *
 * Anon cannot write to the bucket; pass a service-role key:
 *
 *   SUPABASE_SERVICE_KEY=<service_role_jwt> node scripts/upload-memo-template.cjs
 *
 * Alternative without a key: open Supabase Studio (http://135.225.104.142:3000),
 * Storage -> templates bucket, and upload the file, replacing the existing one.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const STORAGE_BASE = 'https://api.atad2.tax/storage/v1';
// v2 key: the patched template (no static sectPr) only works with the new frontend,
// so it is published separately and the v1 key is left intact for the currently
// deployed frontend until this ships.
const OBJECT = 'templates/memo_atad2_with_structure_placeholder_v2.docx';
const FILE = path.join(__dirname, '..', 'templates', 'memo_atad2_with_structure_placeholder.docx');

const key = process.env.SUPABASE_SERVICE_KEY;
if (!key) {
  console.error('Set SUPABASE_SERVICE_KEY to a service-role JWT, or upload via Studio (see header).');
  process.exit(1);
}

const body = fs.readFileSync(FILE);
const url = new URL(`${STORAGE_BASE}/object/${OBJECT}`);
const req = https.request(
  url,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'x-upsert': 'true',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': body.length,
    },
  },
  (res) => {
    let out = '';
    res.on('data', (c) => (out += c));
    res.on('end', () => {
      if (res.statusCode === 200 || res.statusCode === 201) {
        console.log(`Uploaded ${OBJECT} (${body.length} bytes). HTTP ${res.statusCode}.`);
      } else {
        console.error(`Upload failed: HTTP ${res.statusCode} ${out}`);
        process.exit(1);
      }
    });
  },
);
req.on('error', (e) => {
  console.error(e.message || e);
  process.exit(1);
});
req.write(body);
req.end();
