#!/usr/bin/env python3
"""
Wire the n8n ATAD2 workflow to fetch memo_system from atad2_prompts:
  - Add "Get memo prompt" Supabase node (uses existing supabaseApi cred)
  - Reroute connections: Get answers -> Get memo prompt -> Build prompt + metrics
  - Replace Build prompt + metrics jsCode with a placeholder-replacement version

CAUTION — the LIVE "Build prompt + metrics" node has diverged from NEW_JS_CODE
below: it was later edited to fill {{CONFIRMED_APPENDIX_BLOCK}} from a
`confirmed_appendix` payload field (memo appendices work). Re-running this script
as-is would OVERWRITE that appendix wiring. To change the outcome wording on the
live node, do NOT re-run the whole script: fetch the live node's jsCode and apply
only these targeted string swaps (they are already reflected in NEW_JS_CODE here):
    riskCategory = 'Low.'              -> riskCategory = 'No risk identified.'   (x2)
    ... : 'Low.')                      -> ... : 'No risk identified.')           (override block)
    - < 0.2 -> Outcome: Low            -> - < 0.2 -> Outcome: No risk identified  (coreLogicBlock)
The stored override value stays 'low_risk'; only the printed label changes.
"""
import json
import os
import sys
import urllib.request

API_KEY = os.environ["N8N_API_KEY"]
BASE = "https://n8n.atad2.tax/api/v1"
WF_ID = "GgTlOyRddY7l0pIe"

SUPABASE_CRED_ID = "s6VSZiGTbL9uWUlN"   # same cred as Get session / Get answers

NEW_NODE_NAME = "Get memo prompt"

NEW_JS_CODE = r"""const sessionItems = $items('Get session');
const answersItems = $items('Get answers');
const memoPromptItems = $items('Get memo prompt');

const session = Array.isArray(sessionItems?.[0]?.json)
  ? (sessionItems?.[0]?.json?.[0] || {})
  : (sessionItems?.[0]?.json || {});
const answers = Array.isArray(answersItems?.[0]?.json)
  ? (answersItems?.[0]?.json || [])
  : (answersItems || []).map(i => i.json);

// memo_system prompt rows (one per version). Handle both Supabase node
// return shapes: items[0].json as an array of rows, or items[] each with .json being a row.
const promptRowsRaw = Array.isArray(memoPromptItems?.[0]?.json)
  ? (memoPromptItems?.[0]?.json || [])
  : (memoPromptItems || []).map(i => i.json).filter(Boolean);
const activePromptRow = promptRowsRaw.find(r => r && (r.is_active === true || r.is_active === 'true'));
if (!activePromptRow || !activePromptRow.system_prompt) {
  throw new Error('No active memo_system prompt found in atad2_prompts.');
}
const memoTemplate = String(activePromptRow.system_prompt);

const webhookItems = $items('Webhook (generate report)');
const webhookBody = webhookItems[0]?.json?.body || {};
const requestSessionId = webhookBody.session_id || webhookItems[0]?.json?.query?.session_id || '';
const documentsBlock = String(webhookBody.documents_block || "").trim();

if (!session.session_id) session.session_id = requestSessionId;

if (!session.session_id || !session.taxpayer_name) {
  throw new Error('Session not found or incomplete - aborting.');
}

const safe = (v) => (v === null || v === undefined) ? '' : String(v);
const unknownCount = answers.filter(a => a.answer === 'unknown').length;
const totalRisk = answers.reduce((acc, a) => acc + (Number(a.risk_points) || 0), 0);

// === OVERRIDE LOGIC ===
const isOverridden = session.outcome_overridden === true;
const overrideOutcome = safe(session.override_outcome);
const overrideReason = safe(session.override_reason);

let riskCategory = '';
if (isOverridden && overrideOutcome) {
  if (overrideOutcome === 'risk' || overrideOutcome.includes('risk_identified')) {
    riskCategory = 'ATAD2 risk identified.';
  } else if (overrideOutcome === 'insufficient_information' || overrideOutcome.includes('insufficient')) {
    riskCategory = 'Insufficient information.';
  } else if (overrideOutcome === 'low' || overrideOutcome === 'low_risk') {
    riskCategory = 'No risk identified.';
  } else {
    riskCategory = overrideOutcome;
  }
} else {
  if (totalRisk >= 1.0) riskCategory = 'ATAD2 risk identified.';
  else if (totalRisk >= 0.2) riskCategory = 'Insufficient information.';
  else riskCategory = 'No risk identified.';
}

const qaList = answers.map(a => {
  const parts = [
    `Q${safe(a.question_id)}: ${safe(a.question_text)}`,
    `Answer: ${safe(a.answer)}`,
    a.explanation ? `Context: ${safe(a.explanation)}` : null,
    (a.difficult_term && a.term_explanation) ? `Term: ${safe(a.difficult_term)} - ${safe(a.term_explanation)}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}).join('\n\n');

const additionalContext = safe(session.additional_context);

// === Computed conditional blocks ===
const overrideBlock = (isOverridden && overrideOutcome) ? `
---
**IMPORTANT: USER OVERRIDE ACTIVE**

The user has manually overridden the calculated risk assessment.

- Original calculated risk score: ${totalRisk}
- Original calculated outcome: ${totalRisk >= 1.0 ? 'ATAD2 risk identified.' : (totalRisk >= 0.2 ? 'Insufficient information.' : 'No risk identified.')}
- **OVERRIDDEN OUTCOME: ${riskCategory}**
- **User's reason for override:** ${overrideReason || 'No reason provided.'}

You MUST use the overridden outcome "${riskCategory}" throughout the entire memorandum.
---
` : '';

const coreLogicBlock = isOverridden
  ? `**The risk assessment outcome has been manually set to "${riskCategory}" by the user. Use this outcome directly.**`
  : `The entire memorandum is shaped by the risk assessment outcome. First, calculate the total risk score based on the following points system:

Confirmed risk indicator ("red flag"): 1 point each
Unknown answer: 0.1 points each

Apply these thresholds:

- >= 1.0 -> Outcome: ATAD2 risk identified
- >= 0.2 but < 1.0 -> Outcome: Insufficient information
- < 0.2 -> Outcome: No risk identified

If both unknowns and confirmed risks exist, the outcome is always ATAD2 risk identified.`;

const overrideInfoBlock = isOverridden ? `
**OUTCOME OVERRIDE:**
- Overridden to: ${riskCategory}
- Reason: ${overrideReason || 'Not provided'}
` : '';

const documentsBlockFormatted = documentsBlock ? `---
<u>Background documents</u>

The taxpayer provided the following documents as background reference. Use them only to verify or refine the framing of the answers below; do NOT introduce new factual claims that are not also reflected in those answers.

${documentsBlock}

---
` : '';

const additionalContextBlock = additionalContext ? `---
<u>Additional context provided</u>
${additionalContext}
` : '';

const prompt = memoTemplate
  .replace(/\{\{FISCAL_YEAR\}\}/g, safe(session.fiscal_year))
  .replace(/\{\{TAXPAYER_NAME\}\}/g, safe(session.taxpayer_name))
  .replace(/\{\{SESSION_ID\}\}/g, safe(session.session_id))
  .replace(/\{\{TOTAL_RISK\}\}/g, String(totalRisk))
  .replace(/\{\{ANSWERS_COUNT\}\}/g, String(answers.length))
  .replace(/\{\{UNKNOWN_COUNT\}\}/g, String(unknownCount))
  .replace(/\{\{RISK_CATEGORY\}\}/g, riskCategory)
  .replace(/\{\{CORE_LOGIC_BLOCK\}\}/g, coreLogicBlock)
  .replace(/\{\{OVERRIDE_BLOCK\}\}/g, overrideBlock)
  .replace(/\{\{OVERRIDE_INFO_BLOCK\}\}/g, overrideInfoBlock)
  .replace(/\{\{DOCUMENTS_BLOCK_FORMATTED\}\}/g, documentsBlockFormatted)
  .replace(/\{\{QA_LIST\}\}/g, qaList)
  .replace(/\{\{ADDITIONAL_CONTEXT_BLOCK\}\}/g, additionalContextBlock)
  .trim();

return [{ json: { prompt, session, totalRisk, answersCount: answers.length, unknownCount, riskCategory } }];
"""


def http(method: str, path: str, body=None):
    req = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        headers={
            "X-N8N-API-KEY": API_KEY,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        data=json.dumps(body).encode("utf-8") if body is not None else None,
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    wf = http("GET", f"/workflows/{WF_ID}")
    print(f"Loaded workflow '{wf['name']}', {len(wf['nodes'])} nodes")

    # 1) Update Build prompt + metrics jsCode
    build_node = next(n for n in wf["nodes"] if n["name"] == "Build prompt + metrics")
    build_node["parameters"]["jsCode"] = NEW_JS_CODE
    print(f"Updated jsCode on '{build_node['name']}' ({len(NEW_JS_CODE)} chars)")

    # 2) Add (or replace) the Get memo prompt Supabase node
    new_node = {
        "parameters": {
            "operation": "getAll",
            "tableId": "atad2_prompts",
            "returnAll": False,
            "limit": 50,
            "filters": {
                "conditions": [
                    {"keyName": "key", "condition": "eq", "keyValue": "memo_system"}
                ]
            }
        },
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [496, 224],
        "name": NEW_NODE_NAME,
        "credentials": {
            "supabaseApi": {
                "id": SUPABASE_CRED_ID,
                "name": "Supabase account"
            }
        }
    }
    wf["nodes"] = [n for n in wf["nodes"] if n["name"] != NEW_NODE_NAME] + [new_node]
    print(f"Added node '{NEW_NODE_NAME}'")

    # 3) Reroute connections: Get answers -> Get memo prompt -> Build prompt + metrics
    conns = wf["connections"]
    conns["Get answers"] = {
        "main": [[{"node": NEW_NODE_NAME, "type": "main", "index": 0}]]
    }
    conns[NEW_NODE_NAME] = {
        "main": [[{"node": "Build prompt + metrics", "type": "main", "index": 0}]]
    }
    print("Rewired connections: Get answers -> Get memo prompt -> Build prompt + metrics")

    # 4) PUT back (strip read-only fields)
    EDITABLE = {"name", "nodes", "connections", "settings", "staticData"}
    body = {k: v for k, v in wf.items() if k in EDITABLE}
    # n8n public API only accepts a small subset of settings.
    ALLOWED_SETTING_KEYS = {
        "executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution",
        "saveManualExecutions", "saveExecutionProgress", "executionTimeout",
        "errorWorkflow", "timezone",
    }
    body["settings"] = {
        k: v for k, v in (wf.get("settings") or {}).items() if k in ALLOWED_SETTING_KEYS
    }
    try:
        resp = http("PUT", f"/workflows/{WF_ID}", body)
        print(f"PUT ok, returned id={resp.get('id')}")
    except urllib.error.HTTPError as e:
        print("PUT failed:", e.code, e.read().decode("utf-8"))
        sys.exit(1)


if __name__ == "__main__":
    main()
