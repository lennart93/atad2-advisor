// Server-side mirror of src/lib/appendix/skeleton.ts.
// Keep in sync (rowId, legalFramework, allowedStates, drivenByQuestionIds, renderIfQuestionEquals).
export interface ServerSkeletonRow {
  rowId: string;
  legalFramework: string;
  allowedStates: string[];
  drivenByQuestionIds: string[];
  renderIfQuestionEquals?: { questionId: string; equals: string };
}

const STANDARD = ["Not applicable", "Potentially applicable", "Further information needed"];

export const SKELETON_ROWS: ServerSkeletonRow[] = [
  { rowId: "0.1", legalFramework: "Article 2(1) / Article 3 Wet Vpb 1969, subject to Dutch CIT (resident, or non-resident with a Dutch permanent establishment)", allowedStates: ["Yes", "No", "Further information needed"], drivenByQuestionIds: ["Q1", "Q2"] },
  { rowId: "0.2", legalFramework: "Cross-border element present", allowedStates: ["Yes", "No", "Further information needed"], drivenByQuestionIds: ["Q3"] },
  { rowId: "0.3", legalFramework: "Article 12ac jo. Article 10a(6) Wet Vpb 1969, related party (broad associated-enterprise test) or structured arrangement", allowedStates: ["Yes", "No", "Further information needed"], drivenByQuestionIds: ["Q28"] },
  { rowId: "0.4", legalFramework: "Financial year starting on or after 1 Jan 2020 (Article 12ag in force)", allowedStates: ["Yes", "No"], drivenByQuestionIds: [] },

  { rowId: "1.a", legalFramework: "Article 12aa(1)(a) Wet Vpb 1969, hybrid financial instrument or hybrid transfer", allowedStates: STANDARD, drivenByQuestionIds: ["Q30", "Q8", "Q11"] },
  { rowId: "1.b", legalFramework: "Article 12aa(1)(b) Wet Vpb 1969, payment to a hybrid entity", allowedStates: STANDARD, drivenByQuestionIds: ["Q26", "Q27"] },
  { rowId: "1.c", legalFramework: "Article 12aa(1)(c) Wet Vpb 1969, payment to an entity with permanent establishment(s), allocation conflict", allowedStates: STANDARD, drivenByQuestionIds: ["Q12", "Q13", "Q14"] },
  { rowId: "1.d", legalFramework: "Article 12aa(1)(d) Wet Vpb 1969, disregarded permanent establishment", allowedStates: STANDARD, drivenByQuestionIds: ["Q14", "Q18b"] },
  { rowId: "1.e", legalFramework: "Article 12aa(1)(e) Wet Vpb 1969, payment by a hybrid entity (disregarded payment)", allowedStates: STANDARD, drivenByQuestionIds: ["Q26", "Q27"] },
  { rowId: "1.f", legalFramework: "Article 12aa(1)(f) Wet Vpb 1969, deemed payment between head office and PE", allowedStates: STANDARD, drivenByQuestionIds: ["Q20b", "Q21b"] },
  { rowId: "1.g", legalFramework: "Article 12aa(1)(g) Wet Vpb 1969, double deduction", allowedStates: STANDARD, drivenByQuestionIds: ["Q19", "Q4c", "Q4d"] },

  { rowId: "1bis.1", legalFramework: "Foreign head office inside or outside the EU", allowedStates: ["Yes", "No", "Further information needed"], drivenByQuestionIds: ["Q31"], renderIfQuestionEquals: { questionId: "Q2", equals: "Yes" } },
  { rowId: "1bis.2", legalFramework: "Article 12aa(1)(g) Wet Vpb 1969, double deduction at head office and Dutch PE", allowedStates: STANDARD, drivenByQuestionIds: ["Q32"], renderIfQuestionEquals: { questionId: "Q2", equals: "Yes" } },
  { rowId: "1bis.3", legalFramework: "Article 12aa(1)(f) Wet Vpb 1969, deemed payment to the Dutch PE, included abroad or not", allowedStates: STANDARD, drivenByQuestionIds: ["Q33", "Q34"], renderIfQuestionEquals: { questionId: "Q2", equals: "Yes" } },
  { rowId: "1bis.4", legalFramework: "Article 12aa(1)(f) Wet Vpb 1969, non-EU PE makes a deemed payment to the Dutch PE", allowedStates: STANDARD, drivenByQuestionIds: ["Q35"], renderIfQuestionEquals: { questionId: "Q2", equals: "Yes" } },

  { rowId: "2.1", legalFramework: "Article 12ab(1) jo. (3) Wet Vpb 1969, NL as recipient state includes income where the payer state does not deny the deduction, only for an art. 12aa(1)(a), (b), (c), (e) or (f) mismatch (never d, never g)", allowedStates: STANDARD, drivenByQuestionIds: [] },

  { rowId: "3.1", legalFramework: "Article 12ac Wet Vpb 1969, associated-enterprise / related-party test met (broad: holdings up/down/sister, consolidated group, significant influence, acting together; 25%, raised to 50% for hybrid-entity cases)", allowedStates: ["Yes", "No", "Further information needed"], drivenByQuestionIds: ["Q28"] },
  { rowId: "3.2", legalFramework: "Article 12ac Wet Vpb 1969, structured arrangement", allowedStates: ["Yes", "No", "Further information needed"], drivenByQuestionIds: ["Q28"] },
  { rowId: "3.3", legalFramework: "Qualification under Dutch standards (FKR comparison method, from 1 Jan 2025)", allowedStates: STANDARD, drivenByQuestionIds: [] },
  { rowId: "3.4", legalFramework: "Dual-inclusion income present", allowedStates: ["Yes", "No", "Further information needed"], drivenByQuestionIds: ["Q4d", "Q11", "Q25"] },

  { rowId: "4.1", legalFramework: "Article 12ad Wet Vpb 1969, NL payment to a related party or under a structured arrangement", allowedStates: STANDARD, drivenByQuestionIds: ["Q5", "Q28"] },
  { rowId: "4.2", legalFramework: "Article 12ad Wet Vpb 1969, hybrid mismatch (DD or D/NI) elsewhere in the financing chain", allowedStates: STANDARD, drivenByQuestionIds: ["Q9", "Q10"] },
  { rowId: "4.3", legalFramework: "Article 12ad Wet Vpb 1969, the NL payment funds that foreign cost (direct/indirect, back-to-back)", allowedStates: STANDARD, drivenByQuestionIds: ["Q9", "Q10"] },
  { rowId: "4.4", legalFramework: "Article 12ad(2) Wet Vpb 1969, mismatch not neutralised in any foreign state (carve-out)", allowedStates: STANDARD, drivenByQuestionIds: ["Q11"] },
  { rowId: "4.5", legalFramework: "Article 12aa/12ab Wet Vpb 1969, already neutralised in NL on the same payment", allowedStates: STANDARD, drivenByQuestionIds: [] },

  { rowId: "5A.1", legalFramework: "Article 2 Wet Vpb 1969 (verify live lid), a related participant treats the NL taxpayer as transparent (classification conflict)", allowedStates: STANDARD, drivenByQuestionIds: ["Q4"] },
  { rowId: "5A.2", legalFramework: "Article 2 Wet Vpb 1969 (verify live lid), deductible payment to that holder, not in its tax base", allowedStates: STANDARD, drivenByQuestionIds: ["Q4b"] },
  { rowId: "5A.3", legalFramework: "Article 2 Wet Vpb 1969 (verify live lid), costs, charges or losses also deducted in the holder state", allowedStates: STANDARD, drivenByQuestionIds: ["Q4c"] },
  { rowId: "5A.4", legalFramework: "Article 2 Wet Vpb 1969 (verify live lid), set off against dual-inclusion income", allowedStates: ["Yes", "No", "Further information needed"], drivenByQuestionIds: ["Q4d"] },
  { rowId: "5A.5", legalFramework: "Article 2 Wet Vpb 1969 (verify live lid), 50% or more of votes, capital or profit held, directly or indirectly, by related parties (the reverse-hybrid test)", allowedStates: STANDARD, drivenByQuestionIds: ["Q4"] },
  { rowId: "5A.6", legalFramework: "Article 2 Wet Vpb 1969 (verify live lid), UCITS/AIF exception, or former open CV whose CIT liability lapsed on 1 Jan 2025 (Wet FKR)", allowedStates: STANDARD, drivenByQuestionIds: [] },

  { rowId: "5B.1", legalFramework: "Article 12ae Wet Vpb 1969, dual tax residence (the NL taxpayer is also resident elsewhere)", allowedStates: STANDARD, drivenByQuestionIds: ["Q29"] },
  { rowId: "5B.2", legalFramework: "Article 12ae Wet Vpb 1969, same remunerations, payments, charges or losses deducted in both states", allowedStates: STANDARD, drivenByQuestionIds: ["Q29"] },
  { rowId: "5B.3", legalFramework: "Article 12ae Wet Vpb 1969, set off against dual-inclusion income", allowedStates: ["Yes", "No", "Further information needed"], drivenByQuestionIds: [] },
  { rowId: "5B.4", legalFramework: "Article 12ae(2) Wet Vpb 1969, for an EU Member State the deduction is denied only if a treaty makes the taxpayer a resident of that other Member State", allowedStates: STANDARD, drivenByQuestionIds: [] },

  { rowId: "6.1", legalFramework: "Article 12af Wet Vpb 1969, earlier-year denial under 12aa(1)(e)/(f)/(g), 12ae, or inclusion under 12ab(1)", allowedStates: STANDARD, drivenByQuestionIds: [] },
  { rowId: "6.2", legalFramework: "Article 12af Wet Vpb 1969, dual-inclusion income in a later year than the denial", allowedStates: STANDARD, drivenByQuestionIds: [] },

  { rowId: "7.1", legalFramework: "Article 12ag(1) Wet Vpb 1969, within Section 2.2a, financial year from 1 Jan 2020", allowedStates: ["Yes", "No"], drivenByQuestionIds: ["Q1", "Q2"] },
  { rowId: "7.2", legalFramework: "Article 12ag Wet Vpb 1969, inventory per remuneration, payment, deemed payment, charge or loss", allowedStates: ["Further information needed", "Not applicable"], drivenByQuestionIds: [] },
  { rowId: "7.3", legalFramework: "Article 12ag Wet Vpb 1969, records show, per item, to what extent and how Section 2.2a applies", allowedStates: STANDARD, drivenByQuestionIds: [] },
  { rowId: "7.4", legalFramework: "Article 12ag Wet Vpb 1969, where a correction is applied, its computation is in the file", allowedStates: STANDARD, drivenByQuestionIds: [] },
  { rowId: "7.5", legalFramework: "Article 12ag Wet Vpb 1969, file producible on request", allowedStates: ["Yes", "Further information needed"], drivenByQuestionIds: [] },
  { rowId: "7.6", legalFramework: "Article 12ag(3) Wet Vpb 1969, checked for a ministerial regulation with extra data fields", allowedStates: ["Yes", "Further information needed"], drivenByQuestionIds: [] },
];
