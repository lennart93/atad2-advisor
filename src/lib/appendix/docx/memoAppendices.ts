// Builds the memo's two appendices as Word markup, assembled deterministically
// from the confirmed appendix snapshot (never free-written by the model) so the
// document matches the on-screen appendices and the dossier export exactly.
//
//   Appendix 1 - Facts and relationships        (from AppendixFacts)
//   Appendix 2 - Condition-by-condition assessment (from the confirmed rows)
//
// Numbering: the body is Arabic; the appendices are letter-prefixed Arabic
// (A.1/A.2/A.3 and B.1, B.2 ...). One decimal page-number section throughout,
// no Roman numerals. The builder also emits the document's final section
// properties, injected through the {{@appendicesXml}} raw placeholder, because
// the template carries no static <w:sectPr> of its own.
//
// Spacing is left to the Word heading styles (no manual blank paragraphs between
// sections); only a single trailing paragraph sits before the section properties.

import type { AppendixFacts, AppendixRow, AppendixSectionKey, FactEntity, SkeletonRow, Status } from '../types';
import { APPENDIX_SKELETON } from '../skeleton';
import { factsForClient } from '../factsExport';
import { visibleFacts } from '../facts/visibleFacts';
import { isSectionExcluded } from '../facts/sections';
import { effJurisdiction, effEntityType, effNlQualification } from '../facts/entityFields';
import { nlQualificationLabel } from '../facts/nlTaxStatus';
import { localQualification, entityHasQualificationDifference } from '../facts/conclusions';
import { relevantTransactions, accountedTransactionGroups } from '../facts/relevance';
import { actingLikelihoodLabel } from '../facts/actingLikelihood';
import { cleanReasoning } from '../reasoningText';
import { buildClientSections } from '../clientExport';
import { statusDisplayLabel, tonePrintColor } from '../status';
import { rowTone } from '../conditionPolarity';
import { countryName } from '@/lib/structure/countries';
import { normalizeEntityName } from '@/lib/legalName';
import { cell, emptyPara, para, row, run, table, textPara } from './ooxml';

const HEADER_SHADE = 'E7E6E6';
const GROUP_SHADE = 'F2F2F2';
const MUTED = '808080';

// Section content width in DXA = page width (11906) minus 2 cm (1134) left+right.
const CONTENT_W = 9638;
const ENTITY_COLS = [580, 2940, 1700, 1585, 1690, 1143]; // # | Entity | Jur | Class(NL) | Local | Related%
const TX_COLS = [544, 2380, 1247, 1473, 2720, 1274]; //      # | Flow | Type | Instrument | Why | Article(s)
const COND_COLS = [2602, 1060, 1157, 4819]; //                Condition | Article | Status | Assessment

// One status vocabulary everywhere (screen, print, memo). The cell shade is
// driven by the row's tone, the same signal the screen and print/export use, so
// the memo can never disagree with the on-screen colour: green for a clean test or
// a satisfied scope gate, lighter green for N/A, amber for a real risk or missing
// info. No red, no blue.
function statusShade(status: Status | null, rowId: string): string | undefined {
  if (!status) return undefined;
  return tonePrintColor(rowTone(status, rowId)).bg.replace('#', '').toUpperCase();
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
  if (e.role === 'Subsidiary' && e.directLink != null) {
    return e.directLink ? 'Subsidiary (direct)' : 'Subsidiary (indirect)';
  }
  if (e.role === 'Group entity') return e.shareholderOfTaxpayer ? 'Shareholder' : characteriseGroupEntity(e);
  return e.role;
}

// --- section properties (single decimal section) -------------------------

const PG_SIZE = '<w:pgSz w:w="11906" w:h="16838"/>';
const PG_MAR = '<w:pgMar w:top="1417" w:right="1134" w:bottom="1417" w:left="1134" w:header="851" w:footer="567" w:gutter="0"/>';
const REFS =
  '<w:headerReference w:type="first" r:id="rId12"/>' +
  '<w:footerReference w:type="default" r:id="rId11"/>' +
  '<w:footerReference w:type="first" r:id="rId13"/>';

/** The document's final section properties: one Arabic (decimal) page-number section. */
function finalSectPr(): string {
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

export interface MemoAppendixOptions {
  /** Include Appendix 1 (facts). Pass false when the advisor skipped the facts page. */
  includeFacts?: boolean;
  /** Include Appendix 2 (conditions). Pass false when the advisor skipped the checklist page. */
  includeChecklist?: boolean;
}

/**
 * The document tail injected through {{@appendicesXml}}: the appendices (if any)
 * plus the final section properties. Always returns valid markup ending in a
 * <w:sectPr>, because the template no longer carries its own.
 */
export function buildMemoAppendicesXml(
  facts: AppendixFacts | null,
  rows: AppendixRow[],
  skeleton: SkeletonRow[] = APPENDIX_SKELETON,
  opts: MemoAppendixOptions = {},
): string {
  const includeFacts = opts.includeFacts !== false && !!facts && facts.entities.length > 0;
  const includeChecklist = opts.includeChecklist !== false && rows.some((r) => !r.excludedFromClient);

  const blocks: string[] = [];
  if (includeFacts) {
    const a1 = factsAppendix(facts!);
    if (a1) blocks.push(a1);
  }
  if (includeChecklist) blocks.push(conditionsAppendix(rows, skeleton));

  if (!blocks.length) return finalSectPr();
  // A trailing empty paragraph keeps the last table from butting up against the
  // section properties; spacing between sections comes from the heading styles.
  return blocks.join('') + emptyPara() + finalSectPr();
}

// ---------------------------------------------------------------------------
// Appendix 1 - Facts and relationships
// ---------------------------------------------------------------------------

function factsAppendix(rawFacts: AppendixFacts): string {
  const f = factsForClient(rawFacts);
  const drop = (key: AppendixSectionKey) => isSectionExcluded(rawFacts, key);

  const clsByEntity = new Map(f.classifications.map((c) => [c.entityId, c]));
  const likelyMemberIds = new Set(f.actingTogether.flatMap((a) => a.memberEntityIds));
  const isTaxpayerSide = (e: FactEntity) =>
    e.role === 'Taxpayer' || !!e.memberOfUnityId || !!e.inTaxpayerFiscalUnity;
  const relatedPctOf = (e: FactEntity) => e.ownershipPct ?? e.relatedViaPct ?? null;
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
  const showActingTogether = !drop('actingTogether');
  const showTransactions = !drop('transactions');
  if (!showRegister && !showActingTogether && !showTransactions) return '';

  const out: string[] = [];
  out.push(textPara('Appendix 1: Facts and relationships', { style: 'Heading1', pageBreakBefore: true }));

  // A.1 The group and the taxpayer (starts directly here; no summary block).
  if (showRegister) {
    out.push(textPara('A.1 The group and the taxpayer', { style: 'Heading2' }));
    out.push(
      textPara(
        'The table below sets out the taxpayer and the group entities relevant to this assessment, with their jurisdiction, Dutch classification, local qualification and effective related-party percentage.',
      ),
    );

    const headerCells = ['#', 'Entity', 'Jurisdiction', 'Classification (NL)', 'Local', 'Related %'].map((t, i) =>
      cell({ text: t, bold: true, shade: HEADER_SHADE, width: ENTITY_COLS[i], align: i === 5 ? 'right' : 'left' }),
    );
    const headerRow = row(headerCells, { header: true });
    const groupHeader = (label: string) =>
      row([cell({ text: label, bold: true, shade: GROUP_SHADE, gridSpan: 6, width: CONTENT_W })]);
    const entityRow = (e: FactEntity): string => {
      const jur = effJurisdiction(e);
      const c = clsByEntity.get(e.id);
      const localQ = c ? localQualification(c.homeClass) : 'undetermined';
      const isMember = !!e.memberOfUnityId;
      const nameRuns =
        (isMember ? run('↳ ', { color: MUTED }) : '') +
        run(normalizeEntityName(e.name)) +
        run(`  ${roleLabel(e)}`, { italic: true, color: MUTED }) +
        (e.isFiscalUnity ? run('  [fiscal unity]', { color: MUTED }) : '') +
        (e.inTaxpayerFiscalUnity ? run('  [fiscal unity / taxpayer]', { color: MUTED }) : '');
      const localText = c ? `${nlQualificationLabel(localQ)}${c.homeState ? ` (${c.homeState})` : ''}` : '-';
      const relatedText =
        e.role === 'Taxpayer' || isMember ? '' : relatedPctOf(e) != null ? pct(relatedPctOf(e)) : '-';
      return row([
        cell({ text: e.id, width: ENTITY_COLS[0] }),
        cell({ runs: nameRuns, width: ENTITY_COLS[1] }),
        cell({ text: jur ? countryName(jur) || jur : '-', width: ENTITY_COLS[2] }),
        cell({ text: nlQualificationLabel(effNlQualification(e)), width: ENTITY_COLS[3] }),
        cell({ text: localText, width: ENTITY_COLS[4] }),
        cell({ text: relatedText, width: ENTITY_COLS[5], align: 'right' }),
      ]);
    };

    const tableRows: string[] = [headerRow];
    if (taxpayerEnts.length) {
      tableRows.push(groupHeader('The taxpayer'));
      taxpayerEnts.forEach((e) => tableRows.push(entityRow(e)));
    }
    if (relevantEnts.length) {
      tableRows.push(groupHeader('Related and relevant'));
      relevantEnts.forEach((e) => tableRows.push(entityRow(e)));
    }
    if (restEnts.length) {
      tableRows.push(
        groupHeader('Other group entities (below the 25% threshold, no qualification difference)'),
      );
      restEnts.forEach((e) => tableRows.push(entityRow(e)));
    }
    out.push(table(tableRows, ENTITY_COLS));
  }

  // A.2 Acting together -----------------------------------------------------
  if (showActingTogether) {
    out.push(textPara('A.2 Acting together', { style: 'Heading2' }));
    if (f.actingTogether.length === 0) {
      out.push(textPara('No entities that could form an acting-together group.'));
    } else {
      f.actingTogether.forEach((a) => {
        const members = a.memberEntityIds.map((id) => nameOf(rawFacts, id)).join(' + ');
        const combined = a.combinedPct != null ? ` ≈ ${pct(a.combinedPct)}` : '';
        out.push(
          para(
            run(`${members}${combined}: `, { bold: true }) +
              run(`${actingLikelihoodLabel(a.likelihood)}. ${a.reasoning}`),
          ),
        );
      });
    }
    const notLikely = visibleFacts(rawFacts).actingTogether.filter(
      (a) => !(a.likelihood === 'likely' || a.likelihood === 'highly_likely'),
    ).length;
    if (notLikely > 0) {
      out.push(
        textPara(
          `${notLikely} candidate ${notLikely === 1 ? 'grouping was' : 'groupings were'} considered and not assessed as likely; ${notLikely === 1 ? 'it is' : 'they are'} left out of the assessment.`,
          { italic: true, color: MUTED },
        ),
      );
    }
  }

  // A.3 Relevant transactions ----------------------------------------------
  if (showTransactions) {
    out.push(textPara('A.3 Relevant transactions', { style: 'Heading2' }));
    const relevantTx = relevantTransactions(f);
    if (relevantTx.length === 0) {
      out.push(textPara('No relevant intra-group transactions identified.'));
    } else {
      out.push(
        textPara('The intra-group flows assessed as relevant to the ATAD2 analysis are set out below.'),
      );
      const txHeaderCells = ['#', 'Flow', 'Type', 'Instrument', 'Why relevant', 'Article(s)'].map((t, i) =>
        cell({ text: t, bold: true, shade: HEADER_SHADE, width: TX_COLS[i] }),
      );
      const txHeader = row(txHeaderCells, { header: true });
      const txRows = relevantTx.map((t) =>
        row(
          [
            cell({ text: t.id, width: TX_COLS[0] }),
            cell({ text: `${nameOf(rawFacts, t.fromEntityId)} → ${nameOf(rawFacts, t.toEntityId)}`, width: TX_COLS[1] }),
            cell({ text: t.kind, width: TX_COLS[2] }),
            cell({ text: t.instrument ?? '-', width: TX_COLS[3] }),
            cell({ text: t.relevanceReason ?? '-', width: TX_COLS[4] }),
            cell({ text: t.articlesTested.length ? t.articlesTested.join(' · ') : '-', width: TX_COLS[5] }),
          ],
          { cantSplit: true },
        ),
      );
      out.push(table([txHeader, ...txRows], TX_COLS));
    }

    const accounted = accountedTransactionGroups(f);
    if (accounted.length) {
      out.push(textPara('Transactions assessed as not relevant', { style: 'Heading3' }));
      accounted.forEach((g) => {
        out.push(
          textPara(
            `${g.transactions.length} ${g.transactions.length === 1 ? 'transaction' : 'transactions'} not relevant: ${g.reason}`,
          ),
        );
      });
    }
  }

  return out.join('');
}

// ---------------------------------------------------------------------------
// Appendix 2 - Condition-by-condition assessment (B.1, B.2 ...)
// ---------------------------------------------------------------------------

function conditionsAppendix(rows: AppendixRow[], skeleton: SkeletonRow[]): string {
  const sections = buildClientSections(rows, skeleton);
  const out: string[] = [];

  out.push(
    textPara('Appendix 2: Condition-by-condition assessment', { style: 'Heading1', pageBreakBefore: true }),
  );

  if (!sections.length) {
    out.push(textPara('No conditions to report.'));
    return out.join('');
  }

  for (const sec of sections) {
    out.push(textPara(`B.${sec.displayNum} ${sec.sectionTitle}`, { style: 'Heading2' }));

    const headerCells = ['Condition', 'Article', 'Status', 'Assessment'].map((t, i) =>
      cell({ text: t, bold: true, shade: HEADER_SHADE, width: COND_COLS[i] }),
    );
    const header = row(headerCells, { header: true });
    const condRows = sec.rows.map((cr) =>
      row(
        [
          cell({ runs: run(`B.${cr.displayCode}  `, { bold: true }) + run(cr.sk.conditionTested), width: COND_COLS[0] }),
          cell({ text: cr.sk.legalBasis, width: COND_COLS[1] }),
          // One status vocabulary; the cell shade is driven by the row's tone.
          cell({ text: statusDisplayLabel(cr.row.status), width: COND_COLS[2], shade: statusShade(cr.row.status, cr.sk.rowId) }),
          cell({ text: cleanReasoning(cr.row.reasoning), width: COND_COLS[3] }),
        ],
        { cantSplit: true },
      ),
    );
    out.push(table([header, ...condRows], COND_COLS));
  }

  return out.join('');
}
