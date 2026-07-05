import type { SkeletonRow, Status } from './types';

const STATUS: Status[] = ['Not triggered', 'N/A', 'Triggered', 'Insufficient information'];

// v3 legal framework, ordered along the ATAD2 cascade. Scope is pure scope;
// definitions hold the relatedness test (the associated-enterprise showcase);
// reverse hybrid (art. 2) is its own section. Citations are English, without the
// year ("CIT Act", "par.", "Section", "and").
const S1 = 'Scope and taxpayer status';
const S2 = 'Definitions (art. 12ac)';
const S3 = 'Primary rule: hybrid mismatches (art. 12aa)';
const S4 = 'Secondary rule: inclusion (art. 12ab)';
const S5 = 'Dual residence (art. 12ae)';
const S6 = 'Imported mismatches (art. 12ad)';
const S7 = 'Carry-forward of denied deductions (art. 12af)';
const S8 = 'Reverse hybrid (art. 2)';

export const APPENDIX_SKELETON: SkeletonRow[] = [
  // Section 1 - Scope and taxpayer status
  { rowId: '1.1', sectionId: '1', sectionTitle: S1, legalBasis: 'Article 2(1) / Article 3 CIT Act', conditionTested: 'The taxpayer is subject to Dutch corporate income tax, as a resident or as a non-resident with a Dutch permanent establishment', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q1', 'Q2'], relatedView: 'none' },
  { rowId: '1.2', sectionId: '1', sectionTitle: S1, legalBasis: 'N/A', conditionTested: 'A cross-border element is present', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q3'], relatedView: 'none' },

  // Section 2 - Definitions (art. 12ac)
  { rowId: '2.1', sectionId: '2', sectionTitle: S2, legalBasis: 'Article 12ac par. 2 CIT Act', conditionTested: 'Associated enterprise / related party: an interest of more than 25%, aggregated across an acting-together group', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q28'], relatedView: 'inline' },
  { rowId: '2.2', sectionId: '2', sectionTitle: S2, legalBasis: 'Article 12ac CIT Act', conditionTested: 'A structured arrangement is present (the mismatch is priced into the terms, or the arrangement is designed to produce it)', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q28'], relatedView: 'none' },
  { rowId: '2.3', sectionId: '2', sectionTitle: S2, legalBasis: 'Article 12ac CIT Act', conditionTested: 'Dual-inclusion income is present (income included in the tax base of both states that can absorb a mismatch)', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q4d', 'Q11', 'Q25'], relatedView: 'none' },

  // Section 3 - Primary rule: hybrid mismatches (art. 12aa)
  { rowId: '3.1', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 12aa(1)(a) CIT Act', conditionTested: 'A hybrid financial instrument or hybrid transfer gives a deduction without a corresponding inclusion', effect: 'D/NI', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q30', 'Q8', 'Q11'], relatedView: 'none' },
  { rowId: '3.2', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 12aa(1)(b) CIT Act', conditionTested: 'A payment to a hybrid entity gives a deduction without a corresponding inclusion', effect: 'D/NI', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q26', 'Q27'], relatedView: 'none' },
  { rowId: '3.3', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 12aa(1)(c) CIT Act', conditionTested: 'A payment to an entity with one or more permanent establishments gives a deduction without inclusion through an allocation conflict', effect: 'D/NI', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q12', 'Q13', 'Q14'], relatedView: 'none' },
  { rowId: '3.4', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 12aa(1)(d) and Article 15e par. 9 CIT Act', conditionTested: 'A disregarded permanent establishment gives a deduction without inclusion; for such a PE the object exemption is set aside (art. 15e par. 9)', effect: 'D/NI', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q14', 'Q18b'], relatedView: 'none' },
  { rowId: '3.5', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 12aa(1)(e) and par. 3 CIT Act', conditionTested: 'A payment by a hybrid entity (a disregarded payment) gives a deduction without inclusion; denied only to the extent it is not set off against dual-inclusion income (par. 3)', effect: 'D/NI', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q26', 'Q27'], relatedView: 'none' },
  { rowId: '3.6', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 12aa(1)(f) and par. 3 CIT Act', conditionTested: 'A deemed payment between head office and permanent establishment gives a deduction without inclusion; denied only to the extent it is not set off against dual-inclusion income (par. 3)', effect: 'D/NI', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q20b', 'Q21b'], relatedView: 'none' },
  { rowId: '3.7', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 12aa(1)(g) and par. 3 CIT Act', conditionTested: 'The same charge is deducted twice (double deduction); denied only to the extent it is not set off against dual-inclusion income (par. 3), with later-year recapture under art. 12af', effect: 'DD', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q19', 'Q4c', 'Q4d'], relatedView: 'none' },
  { rowId: '3.8', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 3 CIT Act', conditionTested: 'The foreign head office of the Dutch permanent establishment is located outside the EU', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q31'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' }, relatedView: 'none' },
  { rowId: '3.9', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 12aa(1)(g) CIT Act', conditionTested: 'The same charge is deducted at the foreign head office and at the Dutch permanent establishment (double deduction)', effect: 'DD', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q32'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' }, relatedView: 'none' },
  { rowId: '3.10', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 12aa(1)(f) CIT Act', conditionTested: 'A deemed payment to the Dutch permanent establishment is not included at the head office (deduction without inclusion)', effect: 'D/NI', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q33', 'Q34'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' }, relatedView: 'none' },
  { rowId: '3.11', sectionId: '3', sectionTitle: S3, legalBasis: 'Article 12aa(1)(f) CIT Act', conditionTested: 'A non-EU permanent establishment makes a deemed payment to the Dutch permanent establishment that is deductible abroad', effect: 'D/NI', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q35'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' }, relatedView: 'none' },

  // Section 4 - Secondary rule: inclusion (art. 12ab)
  { rowId: '4.1', sectionId: '4', sectionTitle: S4, legalBasis: 'Article 12ab(1) and (3) CIT Act', conditionTested: 'As the recipient state, the Netherlands includes the income where the payer state does not deny the deduction; this applies only to sub-paragraphs (a), (b), (c), (e) and (f), never (d) or (g)', effect: null, kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: [], relatedView: 'none' },

  // Section 5 - Dual residence (art. 12ae)
  { rowId: '5.1', sectionId: '5', sectionTitle: S5, legalBasis: 'Article 12ae CIT Act', conditionTested: 'The taxpayer is a tax resident of two states (dual residence)', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q29'], relatedView: 'none' },
  { rowId: '5.2', sectionId: '5', sectionTitle: S5, legalBasis: 'Article 12ae CIT Act', conditionTested: 'The same remunerations, payments, charges or losses are deducted in both states', effect: 'DD', kind: 'operative', allowedStates: STATUS, drivenByQuestionIds: ['Q29'], relatedView: 'none' },
  { rowId: '5.3', sectionId: '5', sectionTitle: S5, legalBasis: 'Article 12ae CIT Act', conditionTested: 'The double deduction is set off against dual-inclusion income', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: [], relatedView: 'none' },
  { rowId: '5.4', sectionId: '5', sectionTitle: S5, legalBasis: 'Article 12ae(2) CIT Act', conditionTested: 'Where the other state is an EU Member State, the deduction is denied only if a tax treaty makes the taxpayer a resident of that other Member State', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: [], relatedView: 'none' },

  // Section 6 - Imported mismatches (art. 12ad)
  { rowId: '6.1', sectionId: '6', sectionTitle: S6, legalBasis: 'Article 12ad CIT Act', conditionTested: 'The Dutch payment is made to a related party or under a structured arrangement', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q5', 'Q28'], relatedView: 'popover' },
  { rowId: '6.2', sectionId: '6', sectionTitle: S6, legalBasis: 'Article 12ad CIT Act', conditionTested: 'There is a hybrid mismatch (double deduction or deduction without inclusion) elsewhere in the financing chain', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q9', 'Q10'], relatedView: 'none' },
  { rowId: '6.3', sectionId: '6', sectionTitle: S6, legalBasis: 'Article 12ad CIT Act', conditionTested: 'The Dutch payment funds that foreign cost, directly or indirectly (including back-to-back arrangements)', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q9', 'Q10'], relatedView: 'none' },
  { rowId: '6.4', sectionId: '6', sectionTitle: S6, legalBasis: 'Article 12ad(2) CIT Act', conditionTested: 'The mismatch is not neutralised in any other state (the carve-out does not apply)', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q11'], relatedView: 'none' },
  { rowId: '6.5', sectionId: '6', sectionTitle: S6, legalBasis: 'Article 12aa / 12ab CIT Act', conditionTested: 'The mismatch is already neutralised in the Netherlands on the same payment, so the imported-mismatch backstop is not reached', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: [], relatedView: 'none' },

  // Section 7 - Carry-forward of denied deductions (art. 12af)
  { rowId: '7.1', sectionId: '7', sectionTitle: S7, legalBasis: 'Article 12af CIT Act', conditionTested: 'A deduction was denied in an earlier year under art. 12aa(1)(e), (f) or (g), or art. 12ae, or income was included under art. 12ab(1)', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: [], relatedView: 'none' },
  { rowId: '7.2', sectionId: '7', sectionTitle: S7, legalBasis: 'Article 12af CIT Act', conditionTested: 'Dual-inclusion income arises in a later year than the denial, allowing the earlier deduction to be taken (recapture)', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: [], relatedView: 'none' },

  // Section 8 - Reverse hybrid (art. 2)
  { rowId: '8.1', sectionId: '8', sectionTitle: S8, legalBasis: 'Article 2 CIT Act', conditionTested: 'A related participant treats the Dutch partnership as transparent while it is regarded as non-transparent in the Netherlands or another state (reverse-hybrid classification conflict)', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q4'], relatedView: 'none' },
  { rowId: '8.2', sectionId: '8', sectionTitle: S8, legalBasis: 'Article 2 par. 11 CIT Act', conditionTested: '50% or more of the voting rights, capital or profit is held, directly or indirectly, by related entities in a state that regards the partnership as taxable', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: ['Q4'], relatedView: 'popover' },
  { rowId: '8.3', sectionId: '8', sectionTitle: S8, legalBasis: 'Article 2 par. 12 CIT Act', conditionTested: 'The collective-investment exception applies (a UCITS or AIF holding tradable securities with a diversified portfolio)', effect: null, kind: 'gate', allowedStates: STATUS, drivenByQuestionIds: [], relatedView: 'none' },
];
