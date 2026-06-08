import type { SkeletonRow, Decision } from './types';

const STANDARD: Decision[] = ['Not applicable', 'Potentially applicable', 'Further information needed'];

export const APPENDIX_SKELETON: SkeletonRow[] = [
  // Section 0 - Gateway and scope
  { rowId: '0.1', sectionId: '0', sectionTitle: 'Gateway and scope (art. 2 / art. 3; art. 12ac)', legalFramework: 'Article 2(1) / Article 3 Wet Vpb 1969, subject to Dutch CIT (resident, or non-resident with a Dutch permanent establishment)', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q1', 'Q2'] },
  { rowId: '0.2', sectionId: '0', sectionTitle: 'Gateway and scope (art. 2 / art. 3; art. 12ac)', legalFramework: 'Cross-border element present', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q3'] },
  { rowId: '0.3', sectionId: '0', sectionTitle: 'Gateway and scope (art. 2 / art. 3; art. 12ac)', legalFramework: 'Article 12ac jo. Article 10a(6) Wet Vpb 1969, related party (broad associated-enterprise test) or structured arrangement', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q28'] },
  { rowId: '0.4', sectionId: '0', sectionTitle: 'Gateway and scope (art. 2 / art. 3; art. 12ac)', legalFramework: 'Financial year starting on or after 1 Jan 2020 (Article 12ag in force)', effect: null, allowedStates: ['Yes', 'No'], drivenByQuestionIds: [] },

  // Section 1 - Mismatch categories, art. 12aa(1)(a)-(g)
  { rowId: '1.a', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(a) Wet Vpb 1969, hybrid financial instrument or hybrid transfer', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q30', 'Q8', 'Q11'] },
  { rowId: '1.b', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(b) Wet Vpb 1969, payment to a hybrid entity', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q26', 'Q27'] },
  { rowId: '1.c', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(c) Wet Vpb 1969, payment to an entity with permanent establishment(s), allocation conflict', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q12', 'Q13', 'Q14'] },
  { rowId: '1.d', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(d) Wet Vpb 1969, disregarded permanent establishment', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q14', 'Q18b'] },
  { rowId: '1.e', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(e) Wet Vpb 1969, payment by a hybrid entity (disregarded payment)', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q26', 'Q27'] },
  { rowId: '1.f', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(f) Wet Vpb 1969, deemed payment between head office and PE', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q20b', 'Q21b'] },
  { rowId: '1.g', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(g) Wet Vpb 1969, double deduction', effect: 'DD', allowedStates: STANDARD, drivenByQuestionIds: ['Q19', 'Q4c', 'Q4d'], flags: ['contested'] },

  // Section 1bis - Non-resident with a Dutch PE, art. 3 (render only if Q2 = Yes)
  { rowId: '1bis.1', sectionId: '1bis', sectionTitle: 'Non-resident taxpayer with a Dutch PE, art. 3', legalFramework: 'Foreign head office inside or outside the EU', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q31'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' } },
  { rowId: '1bis.2', sectionId: '1bis', sectionTitle: 'Non-resident taxpayer with a Dutch PE, art. 3', legalFramework: 'Article 12aa(1)(g) Wet Vpb 1969, double deduction at head office and Dutch PE', effect: 'DD', allowedStates: STANDARD, drivenByQuestionIds: ['Q32'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' } },
  { rowId: '1bis.3', sectionId: '1bis', sectionTitle: 'Non-resident taxpayer with a Dutch PE, art. 3', legalFramework: 'Article 12aa(1)(f) Wet Vpb 1969, deemed payment to the Dutch PE, included abroad or not', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q33', 'Q34'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' } },
  { rowId: '1bis.4', sectionId: '1bis', sectionTitle: 'Non-resident taxpayer with a Dutch PE, art. 3', legalFramework: 'Article 12aa(1)(f) Wet Vpb 1969, non-EU PE makes a deemed payment to the Dutch PE', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q35'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' } },

  // Section 2 - Secondary inclusion rule, art. 12ab (only onderdeel a/b/c/e/f)
  { rowId: '2.1', sectionId: '2', sectionTitle: 'Secondary inclusion rule, art. 12ab', legalFramework: 'Article 12ab(1) jo. (3) Wet Vpb 1969, NL as recipient state includes income where the payer state does not deny the deduction, only for an art. 12aa(1)(a), (b), (c), (e) or (f) mismatch (never d, never g)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },

  // Section 3 - Definitions and scope, art. 12ac
  { rowId: '3.1', sectionId: '3', sectionTitle: 'Definitions and scope, art. 12ac', legalFramework: 'Article 12ac Wet Vpb 1969, associated-enterprise / related-party test met (broad: holdings up/down/sister, consolidated group, significant influence, acting together; 25%, raised to 50% for hybrid-entity cases)', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q28'] },
  { rowId: '3.2', sectionId: '3', sectionTitle: 'Definitions and scope, art. 12ac', legalFramework: 'Article 12ac Wet Vpb 1969, structured arrangement', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q28'] },
  { rowId: '3.3', sectionId: '3', sectionTitle: 'Definitions and scope, art. 12ac', legalFramework: 'Qualification under Dutch standards (FKR comparison method, from 1 Jan 2025)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },
  { rowId: '3.4', sectionId: '3', sectionTitle: 'Definitions and scope, art. 12ac', legalFramework: 'Dual-inclusion income present', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q4d', 'Q11', 'Q25'] },

  // Section 4 - Imported mismatches, art. 12ad
  { rowId: '4.1', sectionId: '4', sectionTitle: 'Imported mismatches, art. 12ad', legalFramework: 'Article 12ad Wet Vpb 1969, NL payment to a related party or under a structured arrangement', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q5', 'Q28'] },
  { rowId: '4.2', sectionId: '4', sectionTitle: 'Imported mismatches, art. 12ad', legalFramework: 'Article 12ad Wet Vpb 1969, hybrid mismatch (DD or D/NI) elsewhere in the financing chain', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q9', 'Q10'] },
  { rowId: '4.3', sectionId: '4', sectionTitle: 'Imported mismatches, art. 12ad', legalFramework: 'Article 12ad Wet Vpb 1969, the NL payment funds that foreign cost (direct/indirect, back-to-back)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q9', 'Q10'] },
  { rowId: '4.4', sectionId: '4', sectionTitle: 'Imported mismatches, art. 12ad', legalFramework: 'Article 12ad(2) Wet Vpb 1969, mismatch not neutralised in any foreign state (carve-out)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q11'] },
  { rowId: '4.5', sectionId: '4', sectionTitle: 'Imported mismatches, art. 12ad', legalFramework: 'Article 12aa/12ab Wet Vpb 1969, already neutralised in NL on the same payment', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },

  // Section 5A - Reverse hybrid, art. 2 (verify live lid)
  { rowId: '5A.1', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), a related participant treats the NL taxpayer as transparent (classification conflict)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q4'], flags: ['unverified'] },
  { rowId: '5A.2', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), deductible payment to that holder, not in its tax base', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q4b'] },
  { rowId: '5A.3', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), costs, charges or losses also deducted in the holder state', effect: 'DD', allowedStates: STANDARD, drivenByQuestionIds: ['Q4c'] },
  { rowId: '5A.4', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), set off against dual-inclusion income', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q4d'] },
  { rowId: '5A.5', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), 50% or more of votes, capital or profit held, directly or indirectly, by related parties (the reverse-hybrid test)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q4'] },
  { rowId: '5A.6', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), UCITS/AIF exception, or former open CV whose CIT liability lapsed on 1 Jan 2025 (Wet FKR)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },

  // Section 5B - Dual residence, art. 12ae
  { rowId: '5B.1', sectionId: '5B', sectionTitle: 'Dual residence, art. 12ae', legalFramework: 'Article 12ae Wet Vpb 1969, dual tax residence (the NL taxpayer is also resident elsewhere)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q29'] },
  { rowId: '5B.2', sectionId: '5B', sectionTitle: 'Dual residence, art. 12ae', legalFramework: 'Article 12ae Wet Vpb 1969, same remunerations, payments, charges or losses deducted in both states', effect: 'DD', allowedStates: STANDARD, drivenByQuestionIds: ['Q29'] },
  { rowId: '5B.3', sectionId: '5B', sectionTitle: 'Dual residence, art. 12ae', legalFramework: 'Article 12ae Wet Vpb 1969, set off against dual-inclusion income', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: [] },
  { rowId: '5B.4', sectionId: '5B', sectionTitle: 'Dual residence, art. 12ae', legalFramework: 'Article 12ae(2) Wet Vpb 1969, for an EU Member State the deduction is denied only if a treaty makes the taxpayer a resident of that other Member State', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },

  // Section 6 - Carry-forward of denied deductions, art. 12af
  { rowId: '6.1', sectionId: '6', sectionTitle: 'Carry-forward of denied deductions, art. 12af', legalFramework: 'Article 12af Wet Vpb 1969, earlier-year denial under 12aa(1)(e)/(f)/(g), 12ae, or inclusion under 12ab(1)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [], flags: ['unverified'] },
  { rowId: '6.2', sectionId: '6', sectionTitle: 'Carry-forward of denied deductions, art. 12af', legalFramework: 'Article 12af Wet Vpb 1969, dual-inclusion income in a later year than the denial', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },

  // Section 7 - Documentation obligation, art. 12ag
  { rowId: '7.1', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag(1) Wet Vpb 1969, within Section 2.2a, financial year from 1 Jan 2020', effect: null, allowedStates: ['Yes', 'No'], drivenByQuestionIds: ['Q1', 'Q2'] },
  { rowId: '7.2', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag Wet Vpb 1969, inventory per remuneration, payment, deemed payment, charge or loss', effect: null, allowedStates: ['Further information needed', 'Not applicable'], drivenByQuestionIds: [] },
  { rowId: '7.3', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag Wet Vpb 1969, records show, per item, to what extent and how Section 2.2a applies', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },
  { rowId: '7.4', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag Wet Vpb 1969, where a correction is applied, its computation is in the file', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },
  { rowId: '7.5', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag Wet Vpb 1969, file producible on request', effect: null, allowedStates: ['Yes', 'Further information needed'], drivenByQuestionIds: [] },
  { rowId: '7.6', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag(3) Wet Vpb 1969, checked for a ministerial regulation with extra data fields', effect: null, allowedStates: ['Yes', 'Further information needed'], drivenByQuestionIds: [], flags: ['unverified'] },
];
