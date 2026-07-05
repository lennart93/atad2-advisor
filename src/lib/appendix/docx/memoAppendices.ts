// Builds the memo's two appendices as Word markup, assembled deterministically
// from the confirmed appendix snapshot (never free-written by the model) so the
// document matches the on-screen appendices and the dossier export exactly.
//
//   Appendix 1 - Classification and transaction overview (from AppendixFacts)
//   Appendix 2 - Technical overview (from the confirmed rows)
//
// Numbering: section headings are letter-prefixed Arabic (A.1/A.2 ... and
// B.1, B.2 ...). PAGE numbering runs in two sections: the memo body is decimal
// (1, 2, 3 ...), and the appendix is its own section restarted in lower-roman
// (i, ii, iii ...) so it does not continue the body's count. The builder emits
// both sections' properties (a body section-break paragraph plus the final
// appendix <w:sectPr>), injected through the {{@appendicesXml}} raw placeholder,
// because the template carries no static <w:sectPr> of its own.
//
// Spacing is left to the Word heading styles (no manual blank paragraphs between
// sections); only a single trailing paragraph sits before the section properties.

import type { AppendixFacts, AppendixRow, AppendixSectionKey, FactEntity, SkeletonRow, Status, TransactionItem } from '../types';
import { APPENDIX_SKELETON } from '../skeleton';
import { factsForClient } from '../factsExport';
import { isSectionExcluded } from '../facts/sections';
import { effJurisdiction, effEntityType, effNlQualification, effRelationType, effRelatedPct } from '../facts/entityFields';
import { nlQualificationLabel } from '../facts/nlTaxStatus';
import { effLocalQualification, entityHasQualificationDifference } from '../facts/conclusions';
import { relevantTransactions } from '../facts/relevance';
import { noRiskTransactions, txMemoReason } from '../facts/transactionAssessment';
import { shortTransactionType } from '../facts/transactionCategory';
import { actingBasisLabel } from '../facts/actingBasis';
import { cleanReasoning } from '../reasoningText';
import { buildClientSections } from '../clientExport';
import { statusDisplayLabel } from '../status';
import { rowTone } from '../conditionPolarity';
import { appendixMootRowIds, controlTypeFor } from '../controlType';
import { normalizeEntityName } from '@/lib/legalName';
import { cell, emptyPara, para, row, run, table, textPara, TAB } from './ooxml';
import type { Cell, TableOpts } from './ooxml';

// --- palette (handoff 68, appendix-docx-tables) ----------------------------
// Appendix 1 is a plain black-and-white Word table: flat page, thin horizontal
// rules, no vertical borders, no shaded bands, no colour. Meaning is carried by
// the label text. Appendix 2 uses the same table style and keeps colour on the
// Status cell only, mirroring the tool's condition logic.
//
// Per client review: ALL appendix text is black. Hierarchy comes from weight and
// size, not colour. The old warm-grey tiers read as washed-out next to the black
// memo body, so the text tokens below now all resolve to the same ink; only the
// Status cell (green/amber/red) and the header underline still carry colour.
const INK = '1A1A1A'; //       every text run in both appendices (black)
const SOFT = INK; //           jurisdiction codes, related %, type, article, assessment
const CLS_INK = INK; //        the classification value
const WARM_GREY = INK; //      role lines, reason lines, local-qualification lines
const FAINT = INK; //          row ids, count notes, condition-code prefixes
const RULE_INK = '111111'; //  the header underline (1.2px)
const INTRO_GREY = INK; //     intro paragraphs above the tables

// The Appendix 2 status cell: the whole cell is shaded, with a small icon +
// label inside. Green = not triggered / gate passed, amber = a fact is still
// missing, red = a risk indicator is present, grey = does not apply.
const STATUS_GOOD = { fill: 'EEF0E4', fg: '55632F' } as const;
const STATUS_WARN = { fill: 'F8F0DA', fg: '8A6A1C' } as const;
const STATUS_BAD = { fill: 'F7EBE4', fg: 'A5392B' } as const;
const STATUS_NA = { fill: 'F4F2EC', fg: '8A857B' } as const;

const HEAD_SZ = 19; //      column headers + group headings (~12.5px)
const ROLE_SZ = 18; //      9pt second line under an entity name
const COUNT_SZ = 16; //     the quiet right-hand count on a group heading
const BODY_LINE = 264; //   ~1.1 line spacing for body cells
const DATA_MAR = { top: 80, bottom: 80 } as const;

// Hairline tables with a zero left cell margin and a small right gutter so
// adjacent columns breathe. All appendix tables share the standard-document
// hair token (0.75px #e2ded6); no vertical rules.
const TABLE_OPTS: TableOpts = { borders: 'hairline', hairlineColor: 'E2DED6', cellMargins: { left: 0, right: 120 } };

// Section content width in DXA = page width (11906) minus 2 cm (1134) left+right.
const CONTENT_W = 9638;
const ENTITY_COLS = [520, 4160, 1120, 2680, 1158]; // # | Entity | Jurisdiction | Classification | Related%
const TX_COLS = [520, 4090, 1310, 3718]; //           # | From and to | Type | Assessment
const COND_COLS = [3153, 892, 2082, 3511]; //         Condition | Article | Status | Assessment

// No em dashes anywhere in the appendices; a middot keeps the separator role
// when model-written text used one.
function noEmDash(s: string): string {
  return s.replace(/\s*—\s*/g, ' · ');
}

/**
 * A column-header cell: normal weight, dark ink, sentence case; only the
 * 1.2px near-black bottom rule separates it from the body (handoff 68).
 */
function headerCell(text: string, width: number, align?: Cell['align']): string {
  return cell({
    runs: run(text, { color: INK, sz: HEAD_SZ }),
    width,
    align,
    bottomBorder: { color: RULE_INK, sz: 8 },
    margins: { bottom: 50 },
    line: 240,
    spacingAfter: 0,
  });
}

/**
 * A full-width group heading row: a plain sentence-case ink label in normal
 * weight with an optional lighter count flush right; no shaded band. The
 * table's own hairline draws the rule beneath it, and extra space above keeps
 * the groups apart.
 */
function bandRow(label: string, meta: string | null, gridSpan: number, width: number): string {
  const runs =
    run(label, { color: INK, sz: HEAD_SZ }) +
    (meta ? TAB + run(meta, { color: FAINT, sz: COUNT_SZ }) : '');
  return row([
    cell({
      paras: para(runs, { line: 240, spacingAfter: 0, tabRight: width - 120 }),
      gridSpan,
      width,
      margins: { top: 240, bottom: 40 },
    }),
  ]);
}

/** A plain body cell with the house-style margins and line spacing. `leftPad`
 *  adds a left gutter (used to keep the assessment text off the shaded Status
 *  cell that sits directly to its left). */
function dataCell(
  text: string,
  width: number,
  opts: { color?: string; bold?: boolean; align?: Cell['align']; leftPad?: number } = {},
): string {
  const margins = opts.leftPad != null ? { ...DATA_MAR, left: opts.leftPad } : DATA_MAR;
  return cell({ text, width, color: opts.color, bold: opts.bold, align: opts.align, margins, line: BODY_LINE });
}

// --- Appendix 2 status cell -------------------------------------------------
// One visual per outcome, mirroring the tool's condition logic (controlType +
// rowTone), so the memo can never disagree with the on-screen checklist:
//   gate satisfied  -> green check "Applicable"
//   not triggered   -> green check
//   insufficient    -> amber clock
//   triggered       -> red triangle
//   N/A (incl moot) -> grey dash-circle
interface StatusVisual { fill: string; fg: string; icon: string; label: string }

function statusVisual(r: AppendixRow, mootSet: ReadonlySet<string>): StatusVisual | null {
  const ctype = controlTypeFor(r, mootSet);
  if (ctype === 'gate') {
    if (r.status === 'N/A' || r.status === 'Triggered') return { ...STATUS_GOOD, icon: '✓', label: 'Applicable' };
    if (r.status === 'Insufficient information') return { ...STATUS_WARN, icon: '◷', label: 'Insufficient info' };
    if (r.status === 'Not triggered') return { ...STATUS_NA, icon: '○', label: 'Not met' };
    return null; // no status set yet: an empty, unshaded cell
  }
  if (ctype === 'na') return { ...STATUS_NA, icon: '⊖', label: 'N/A' };
  if (!r.status) return null;
  const tone = rowTone(r.status, r.rowId);
  const label = statusDisplayLabel(r.status);
  switch (tone) {
    case 'risk':
      return { ...STATUS_BAD, icon: '▲', label };
    case 'caution':
      return { ...STATUS_WARN, icon: '◷', label };
    case 'na':
      return { ...STATUS_NA, icon: '⊖', label };
    case 'clear':
    default:
      return { ...STATUS_GOOD, icon: '✓', label };
  }
}

/** An Appendix-2 status cell: the whole cell shaded, a small icon + label inside. */
function statusCell(r: AppendixRow, mootSet: ReadonlySet<string>, width: number): string {
  const v = statusVisual(r, mootSet);
  if (!v) return cell({ text: '', width, margins: DATA_MAR, line: BODY_LINE });
  return cell({
    runs: run(`${v.icon}  `, { color: v.fg, sz: HEAD_SZ }) + run(v.label, { bold: true, color: v.fg, sz: HEAD_SZ }),
    width,
    shade: v.fill,
    margins: { top: 80, bottom: 80, left: 140, right: 100 },
    line: BODY_LINE,
  });
}

function pct(n: number | null): string {
  return n == null ? '-' : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

function nameOf(facts: AppendixFacts, id: string): string {
  return normalizeEntityName(facts.entities.find((e) => e.id === id)?.name ?? id);
}

/**
 * The role descriptor shown in the entity table's italic slot. Below-25% group
 * entities used to all read "Other"; instead characterise them from the data
 * with a small controlled vocabulary. DRAFT heuristics, pending tax review.
 */
function characteriseGroupEntity(e: FactEntity): string {
  const n = (e.name ?? '').toLowerCase();
  const t = (effEntityType(e) ?? '').toLowerCase();
  if (/stichting|foundation/.test(n) || t === 'foundation') return 'Foundation';
  if (/management|beheer/.test(n)) return 'Management company';
  if (/\bbank\b|financ|krediet|credit|lending|\blender\b|\bloan\b/.test(n)) return 'Lender';
  if (/gemeente|provincie|ministerie|ministry|municipal|\bpublic\b|overheid|\bstate\b/.test(n) || t === 'public') {
    return 'Public entity';
  }
  if (/fonds|participat|investment|\binvest\b|capital|venture|equity|\bpartners\b/.test(n) || t === 'fund') {
    return 'Investment / participation fund';
  }
  if ((e.ownershipPct ?? e.relatedViaPct ?? 0) > 0) return 'Minority co-investor';
  return 'Other group company';
}

function roleLabel(e: FactEntity): string {
  const edited = effRelationType(e);
  if (edited) return edited;
  if (e.role === 'Subsidiary' && e.directLink != null) {
    return e.directLink ? 'Subsidiary (direct)' : 'Subsidiary (indirect)';
  }
  if (e.role === 'Group entity') return e.shareholderOfTaxpayer ? 'Shareholder' : characteriseGroupEntity(e);
  return e.role;
}

// --- section properties (decimal body + lower-roman appendix) -------------

const PG_SIZE = '<w:pgSz w:w="11906" w:h="16838"/>';
const PG_MAR = '<w:pgMar w:top="1417" w:right="1134" w:bottom="1417" w:left="1134" w:header="851" w:footer="567" w:gutter="0"/>';
const REFS =
  '<w:headerReference w:type="first" r:id="rId12"/>' +
  '<w:footerReference w:type="default" r:id="rId11"/>' +
  '<w:footerReference w:type="first" r:id="rId13"/>';

/**
 * The memo body's section properties: Arabic (decimal) page numbers, with the
 * cover header/address footer applied to the first page via titlePg. This is the
 * whole document when there is no appendix; when an appendix follows it is
 * emitted inside a section-break paragraph (see sectionBreakPara) so the body
 * ends here and the appendix begins its own section.
 */
function bodySectPr(): string {
  return (
    '<w:sectPr>' +
    REFS +
    PG_SIZE +
    PG_MAR +
    '<w:pgNumType w:fmt="decimal"/>' +
    '<w:cols w:space="708"/><w:titlePg/><w:docGrid w:linePitch="360"/>' +
    '</w:sectPr>'
  );
}

/**
 * The appendix's (final) section properties: lower-roman page numbers restarted
 * at i, so the appendix does not continue the body's count. The page-number
 * footer (rId11) is applied to every appendix page; there is no titlePg, so the
 * first appendix page shows "i" rather than the cover's address footer, and no
 * header reference, matching the body's non-first pages.
 */
function appendixSectPr(): string {
  return (
    '<w:sectPr>' +
    '<w:footerReference w:type="default" r:id="rId11"/>' +
    PG_SIZE +
    PG_MAR +
    '<w:pgNumType w:fmt="lowerRoman" w:start="1"/>' +
    '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/>' +
    '</w:sectPr>'
  );
}

/**
 * An empty paragraph carrying a section's properties in its pPr: the OOXML way
 * to mark the end of a section (here, the memo body). The default break type is
 * "next page", so the following section starts on a fresh page on its own.
 */
function sectionBreakPara(sectPr: string): string {
  return `<w:p><w:pPr>${sectPr}</w:pPr></w:p>`;
}

export interface MemoAppendixOptions {
  /** Include Appendix 1 (facts). Pass false when the advisor skipped the facts page. */
  includeFacts?: boolean;
  /** Include Appendix 2 (conditions). Pass false when the advisor skipped the checklist page. */
  includeChecklist?: boolean;
}

/**
 * The document tail injected through {{@appendicesXml}}: the appendices (if any)
 * plus the section properties. Always returns valid markup ending in a
 * <w:sectPr>, because the template no longer carries its own.
 *
 * With no appendix, the whole document is a single decimal body section. With an
 * appendix, the body is closed off by a section-break paragraph (decimal) and the
 * appendix follows as its own section restarted in lower-roman, so its page count
 * does not continue the body's.
 */
export function buildMemoAppendicesXml(
  facts: AppendixFacts | null,
  rows: AppendixRow[],
  skeleton: SkeletonRow[] = APPENDIX_SKELETON,
  opts: MemoAppendixOptions = {},
): string {
  const includeFacts = opts.includeFacts !== false && !!facts && facts.entities.length > 0;
  const includeChecklist = opts.includeChecklist !== false && rows.some((r) => !r.excludedFromClient);

  // The first rendered appendix heading gets NO page break: the section break at
  // the body/appendix boundary already starts it on a fresh page. Later headings
  // keep their page break so each appendix opens on its own page.
  const blocks: string[] = [];
  if (includeFacts) {
    const a1 = factsAppendix(facts!, blocks.length > 0);
    if (a1) blocks.push(a1);
  }
  if (includeChecklist) blocks.push(conditionsAppendix(rows, skeleton, blocks.length > 0));

  if (!blocks.length) return bodySectPr();
  // Close the body section (decimal) with a section-break paragraph, then the
  // appendix content, then the final lower-roman appendix section. A trailing
  // empty paragraph keeps the last table off the section properties.
  return sectionBreakPara(bodySectPr()) + blocks.join('') + emptyPara() + appendixSectPr();
}

// ---------------------------------------------------------------------------
// Appendix 1 - Classification and transaction overview
// ---------------------------------------------------------------------------

function factsAppendix(rawFacts: AppendixFacts, pageBreakBefore: boolean): string {
  const f = factsForClient(rawFacts);
  const drop = (key: AppendixSectionKey) => isSectionExcluded(rawFacts, key);

  const clsByEntity = new Map(f.classifications.map((c) => [c.entityId, c]));
  const likelyMemberIds = new Set(f.actingTogether.flatMap((a) => a.memberEntityIds));
  const isTaxpayerSide = (e: FactEntity) =>
    e.role === 'Taxpayer' || !!e.memberOfUnityId || !!e.inTaxpayerFiscalUnity;
  const relatedPctOf = effRelatedPct;
  const hasMismatch = (e: FactEntity) => entityHasQualificationDifference(e, clsByEntity.get(e.id));
  const isRelevantRow = (e: FactEntity) =>
    e.related || !!e.shareholderOfTaxpayer || likelyMemberIds.has(e.id) || hasMismatch(e);

  const taxpayerEnts = f.entities.filter(isTaxpayerSide);
  const others = f.entities.filter((e) => !isTaxpayerSide(e));
  const relevantEnts = others
    .filter(isRelevantRow)
    .sort((a, b) => (relatedPctOf(b) ?? -1) - (relatedPctOf(a) ?? -1));
  const restEnts = others.filter((e) => !isRelevantRow(e));

  const showRegister = !drop('entityRegister');
  const showActingTogether = !drop('actingTogether') && f.actingTogether.length > 0;
  const showTransactions = !drop('transactions');
  if (!showRegister && !showActingTogether && !showTransactions) return '';

  const out: string[] = [];
  out.push(textPara('Appendix 1: Classification and transaction overview', { style: 'Heading1', pageBreakBefore }));

  // Subsections are numbered by what actually renders, so the transactions
  // table reads A.2 when there is no acting-together annex (the common case).
  let subNum = 0;
  const subHead = (title: string) => textPara(`A.${++subNum} ${title}`, { style: 'Heading2' });

  // A.1 The group and the taxpayer (starts directly here; no summary block).
  if (showRegister) {
    out.push(subHead('The group and the taxpayer'));
    out.push(
      textPara(
        'The taxpayer and the group entities relevant to this assessment, with their jurisdiction, tax classification and effective related-party interest. For Dutch entities the local qualification equals the Dutch classification, so it is not repeated. A local qualification is shown only where an entity is foreign.',
        { color: INTRO_GREY, line: BODY_LINE },
      ),
    );

    const headerRow = row(
      ['#', 'Entity', 'Jurisdiction', 'Classification', 'Related %'].map((t, i) =>
        headerCell(t, ENTITY_COLS[i], i === 4 ? 'right' : 'left'),
      ),
      { header: true, height: 360 },
    );
    // Every entity row renders in the same colour and weight; the below-threshold
    // group is a grouping, not a dimmer (handoff 68).
    const entityRow = (e: FactEntity): string => {
      const jur = effJurisdiction(e);
      const c = clsByEntity.get(e.id);
      const isNl = (jur ?? '').toUpperCase() === 'NL';
      const isMember = !!e.memberOfUnityId;
      // Entity name on line one; fiscal-unity note and role drop to a quiet second line.
      const nameRuns = run(normalizeEntityName(e.name), { bold: true, color: INK });
      const role = roleLabel(e);
      const fuNote = e.inTaxpayerFiscalUnity || isMember
        ? 'Fiscal unity with the taxpayer. '
        : e.isFiscalUnity
          ? 'Fiscal unity. '
          : '';
      const hasRoleLine = !!(role || fuNote);
      const namePara = para(nameRuns, { line: BODY_LINE, spacingAfter: hasRoleLine ? 20 : 0 });
      const rolePara = hasRoleLine
        ? para(
            (fuNote ? run(fuNote, { color: FAINT, sz: ROLE_SZ }) : '') +
              (role ? run(role, { color: WARM_GREY, sz: ROLE_SZ }) : ''),
            { line: 240, spacingAfter: 0 },
          )
        : '';
      // One classification column. A Dutch entity prints its Dutch classification
      // once; every foreign entity always adds a quiet second line with its
      // home-state (local) qualification, read from the same field Appendix 1 shows
      // on screen (effLocalQualification -> the 4-value vocabulary). The line is
      // shown even when the view is still "To be determined" or matches the Dutch
      // view: no separate raw-class or "not set" wording, so the memo reads exactly
      // like the on-screen appendix.
      const nlQ = effNlQualification(e);
      let clsSecond = '';
      if (!isNl) {
        const localQ = effLocalQualification(e, c);
        const state = (c?.homeState ?? '').trim() || (jur ? jur.toUpperCase() : '');
        clsSecond = state
          ? `${state}: ${nlQualificationLabel(localQ)}`
          : nlQualificationLabel(localQ);
      }
      const clsParas =
        para(run(nlQualificationLabel(nlQ), { color: CLS_INK }), {
          line: BODY_LINE,
          spacingAfter: clsSecond ? 20 : 0,
        }) +
        (clsSecond
          ? para(run(clsSecond, { color: WARM_GREY, sz: ROLE_SZ }), { line: 240, spacingAfter: 0 })
          : '');
      const relatedText =
        e.role === 'Taxpayer' || isMember ? '' : relatedPctOf(e) != null ? pct(relatedPctOf(e)) : '-';
      return row([
        dataCell(e.id, ENTITY_COLS[0], { color: FAINT }),
        cell({ paras: namePara + rolePara, width: ENTITY_COLS[1], margins: DATA_MAR }),
        dataCell(jur ? jur.toUpperCase() : '-', ENTITY_COLS[2], { color: SOFT }),
        cell({ paras: clsParas, width: ENTITY_COLS[3], margins: DATA_MAR }),
        dataCell(relatedText, ENTITY_COLS[4], { align: 'right', color: SOFT }),
      ]);
    };

    const tableRows: string[] = [headerRow];
    if (taxpayerEnts.length) {
      tableRows.push(bandRow('The taxpayer', null, 5, CONTENT_W));
      taxpayerEnts.forEach((e) => tableRows.push(entityRow(e)));
    }
    if (relevantEnts.length) {
      tableRows.push(bandRow('Related', null, 5, CONTENT_W));
      relevantEnts.forEach((e) => tableRows.push(entityRow(e)));
    }
    if (restEnts.length) {
      // Just the word "Other": no right-hand caption, no threshold claim (handoff 68).
      tableRows.push(bandRow('Other', null, 5, CONTENT_W));
      restEnts.forEach((e) => tableRows.push(entityRow(e)));
    }
    out.push(table(tableRows, ENTITY_COLS, TABLE_OPTS));
  }

  // Acting together (only when the annex has content; the "candidate grouping
  // considered and left out" accounting line never prints, handoff 68 fix 2).
  if (showActingTogether) {
    out.push(subHead('Acting together'));
    f.actingTogether.forEach((a) => {
      const members = a.memberEntityIds.map((id) => nameOf(rawFacts, id)).join(' + ');
      const heading = a.name?.trim() ? `${a.name.trim()} (${members})` : members;
      const basis = a.basis ? `${actingBasisLabel(a.basis)}. ` : '';
      out.push(
        para(
          run(`${heading}: `, { bold: true }) +
            run(noEmDash(`${basis}${a.reasoning}`)),
        ),
      );
    });
  }

  // Intra-group transactions: one table with EVERY identified flow, none
  // summarised away. Who pays whom (with the jurisdictions inline, so a
  // cross-border flow is obvious), the type, and a bold text verdict with its
  // one-line reason. Two groups, mirroring the screen: needs-assessment flows
  // first, then the flows reviewed and cleared.
  if (showTransactions) {
    out.push(subHead('Intra-group transactions'));
    const needsTx = relevantTransactions(f);
    const assessedTx = noRiskTransactions(f);
    if (needsTx.length === 0 && assessedTx.length === 0) {
      out.push(textPara('No intra-group transactions identified.', { color: INTRO_GREY, line: BODY_LINE }));
    } else {
      out.push(
        textPara(
          'Each intra-group flow: the two parties and their jurisdictions, the type of flow, and its assessed status, with the reason.',
          { color: INTRO_GREY, line: BODY_LINE },
        ),
      );
      const txHeader = row(
        ['#', 'From and to', 'Type', 'Assessment'].map((t, i) => headerCell(t, TX_COLS[i])),
        { header: true, height: 360 },
      );

      // Payer (JUR) → payee (JUR), names in ink, jurisdictions and arrow quiet.
      const partyRuns = (t: TransactionItem): string => {
        const from = rawFacts.entities.find((e) => e.id === t.fromEntityId);
        const to = rawFacts.entities.find((e) => e.id === t.toEntityId);
        const fj = from ? effJurisdiction(from) : null;
        const tj = to ? effJurisdiction(to) : null;
        return (
          run(nameOf(rawFacts, t.fromEntityId), { color: INK }) +
          (fj ? run(` (${fj.toUpperCase()})`, { color: WARM_GREY }) : '') +
          run('  →  ', { color: FAINT }) +
          run(nameOf(rawFacts, t.toEntityId), { color: INK }) +
          (tj ? run(` (${tj.toUpperCase()})`, { color: WARM_GREY }) : '')
        );
      };
      // The verdict is carried by the label text alone (no marker, no colour);
      // the reason is the same rationale/derived clause the screen shows.
      const txRow = (t: TransactionItem, needs: boolean): string => {
        const why = txMemoReason(f, t);
        const assessParas =
          para(run(needs ? 'Needs assessment' : 'No risk identified', { bold: true, color: INK }), {
            line: BODY_LINE,
            spacingAfter: 20,
          }) + para(run(noEmDash(why), { color: WARM_GREY, sz: ROLE_SZ }), { line: 250, spacingAfter: 0 });
        return row(
          [
            dataCell(t.id, TX_COLS[0], { color: FAINT }),
            cell({ runs: partyRuns(t), width: TX_COLS[1], margins: DATA_MAR, line: BODY_LINE }),
            dataCell(shortTransactionType(t.kind), TX_COLS[2], { color: SOFT }),
            cell({ paras: assessParas, width: TX_COLS[3], margins: DATA_MAR }),
          ],
          { cantSplit: true },
        );
      };

      const txRows: string[] = [txHeader];
      if (needsTx.length) {
        txRows.push(
          bandRow(
            'Needs assessment',
            `${needsTx.length} ${needsTx.length === 1 ? 'transaction' : 'transactions'}, risk ${needsTx.length === 1 ? 'indicator' : 'indicators'} present`,
            4,
            CONTENT_W,
          ),
        );
        needsTx.forEach((t) => txRows.push(txRow(t, true)));
      }
      if (assessedTx.length) {
        txRows.push(
          bandRow(
            'No risk identified',
            `${assessedTx.length} ${assessedTx.length === 1 ? 'transaction' : 'transactions'}, listed in full`,
            4,
            CONTENT_W,
          ),
        );
        assessedTx.forEach((t) => txRows.push(txRow(t, false)));
      }
      out.push(table(txRows, TX_COLS, TABLE_OPTS));
    }
  }

  return out.join('');
}

// ---------------------------------------------------------------------------
// Appendix 2 - Technical overview (B.1, B.2 ...)
// ---------------------------------------------------------------------------

function conditionsAppendix(rows: AppendixRow[], skeleton: SkeletonRow[], pageBreakBefore: boolean): string {
  const sections = buildClientSections(rows, skeleton);
  const mootSet = appendixMootRowIds(rows);
  const out: string[] = [];

  out.push(textPara('Appendix 2: Technical overview', { style: 'Heading1', pageBreakBefore }));

  if (!sections.length) {
    out.push(textPara('No conditions to report.'));
    return out.join('');
  }

  out.push(
    textPara(
      'Every ATAD2 condition tested in this assessment, with the underlying article, the outcome and a short assessment. The Status colour follows the tool: green where the condition is not triggered, amber where a fact is still missing, red where a risk indicator is present. N/A means the condition does not apply to this structure.',
      { color: INTRO_GREY, line: BODY_LINE },
    ),
  );

  for (const sec of sections) {
    out.push(textPara(`B.${sec.displayNum} ${sec.sectionTitle}`, { style: 'Heading2' }));

    const header = row(
      ['Condition', 'Article', 'Status', 'Assessment'].map((t, i) => headerCell(t, COND_COLS[i])),
      { header: true, height: 360 },
    );
    const condRows = sec.rows.map((cr) =>
      row(
        [
          // The condition code sits as a small grey prefix before the name.
          cell({
            runs: run(`B.${cr.displayCode}  `, { color: FAINT, sz: ROLE_SZ }) + run(cr.sk.conditionTested, { bold: true, color: INK }),
            width: COND_COLS[0],
            margins: DATA_MAR,
            line: BODY_LINE,
          }),
          dataCell(cr.sk.legalBasis, COND_COLS[1], { color: SOFT }),
          statusCell(cr.row, mootSet, COND_COLS[2]),
          // leftPad keeps the assessment text off the shaded Status cell to its left.
          dataCell(noEmDash(cleanReasoning(cr.row.reasoning)), COND_COLS[3], { color: SOFT, leftPad: 180 }),
        ],
        { cantSplit: true },
      ),
    );
    out.push(table([header, ...condRows], COND_COLS, TABLE_OPTS));
  }

  return out.join('');
}
