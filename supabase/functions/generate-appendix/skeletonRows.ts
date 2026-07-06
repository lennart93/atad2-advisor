// Server-side mirror of src/lib/appendix/skeleton.ts (v3).
// Keep in sync (rowId, legalBasis, conditionTested, allowedStates, drivenByQuestionIds, renderIfQuestionEquals).
// This is a fallback only: the live rows are read from atad2_appendix_skeleton.
export interface ServerSkeletonRow {
  rowId: string;
  legalBasis: string;
  conditionTested: string;
  allowedStates: string[];
  drivenByQuestionIds: string[];
  renderIfQuestionEquals?: { questionId: string; equals: string };
}

const S = ["Not triggered", "N/A", "Triggered", "Insufficient information"];
const inbound = { questionId: "Q2", equals: "Yes" };

export const SKELETON_ROWS: ServerSkeletonRow[] = [
  { rowId: "1.1", legalBasis: "Article 2(1) / Article 3 CIT Act", conditionTested: "The taxpayer is subject to Dutch corporate income tax, as a resident or as a non-resident with a Dutch permanent establishment", allowedStates: S, drivenByQuestionIds: ["Q1", "Q2"] },
  { rowId: "1.2", legalBasis: "N/A", conditionTested: "A cross-border element is present", allowedStates: S, drivenByQuestionIds: ["Q3"] },

  { rowId: "2.1", legalBasis: "Article 12ac par. 2 CIT Act", conditionTested: "Associated enterprise / related party: an interest of more than 25%, aggregated across an acting-together group", allowedStates: S, drivenByQuestionIds: ["Q28"] },
  { rowId: "2.2", legalBasis: "Article 12ac CIT Act", conditionTested: "A structured arrangement is present (the mismatch is priced into the terms, or the arrangement is designed to produce it)", allowedStates: S, drivenByQuestionIds: ["Q28"] },
  { rowId: "2.3", legalBasis: "Article 12ac CIT Act", conditionTested: "Dual-inclusion income is present (income included in the tax base of both states that can absorb a mismatch)", allowedStates: S, drivenByQuestionIds: ["Q4d", "Q11", "Q25"] },

  { rowId: "3.1", legalBasis: "Article 12aa(1)(a) CIT Act", conditionTested: "A hybrid financial instrument or hybrid transfer gives a deduction without a corresponding inclusion", allowedStates: S, drivenByQuestionIds: ["Q30", "Q8", "Q11"] },
  { rowId: "3.2", legalBasis: "Article 12aa(1)(b) CIT Act", conditionTested: "A payment to a hybrid entity gives a deduction without a corresponding inclusion", allowedStates: S, drivenByQuestionIds: ["Q26", "Q27"] },
  { rowId: "3.3", legalBasis: "Article 12aa(1)(c) CIT Act", conditionTested: "A payment to an entity with one or more permanent establishments gives a deduction without inclusion through an allocation conflict", allowedStates: S, drivenByQuestionIds: ["Q12", "Q13", "Q14"] },
  { rowId: "3.4", legalBasis: "Article 12aa(1)(d) and Article 15e par. 9 CIT Act", conditionTested: "A disregarded permanent establishment gives a deduction without inclusion; for such a PE the object exemption is set aside (art. 15e par. 9)", allowedStates: S, drivenByQuestionIds: ["Q14", "Q18b"] },
  { rowId: "3.5", legalBasis: "Article 12aa(1)(e) and par. 3 CIT Act", conditionTested: "A payment by a hybrid entity (a disregarded payment) gives a deduction without inclusion; denied only to the extent it is not set off against dual-inclusion income (par. 3)", allowedStates: S, drivenByQuestionIds: ["Q26", "Q27"] },
  { rowId: "3.6", legalBasis: "Article 12aa(1)(f) and par. 3 CIT Act", conditionTested: "A deemed payment between head office and permanent establishment gives a deduction without inclusion; denied only to the extent it is not set off against dual-inclusion income (par. 3)", allowedStates: S, drivenByQuestionIds: ["Q20b", "Q21b"] },
  { rowId: "3.7", legalBasis: "Article 12aa(1)(g) and par. 3 CIT Act", conditionTested: "The same charge is deducted twice (double deduction); denied only to the extent it is not set off against dual-inclusion income (par. 3), with later-year recapture under art. 12af", allowedStates: S, drivenByQuestionIds: ["Q19", "Q4c", "Q4d"] },
  { rowId: "3.8", legalBasis: "Article 3 CIT Act", conditionTested: "The foreign head office of the Dutch permanent establishment is located outside the EU", allowedStates: S, drivenByQuestionIds: ["Q31"], renderIfQuestionEquals: inbound },
  { rowId: "3.9", legalBasis: "Article 12aa(1)(g) CIT Act", conditionTested: "The same charge is deducted at the foreign head office and at the Dutch permanent establishment (double deduction)", allowedStates: S, drivenByQuestionIds: ["Q32"], renderIfQuestionEquals: inbound },
  { rowId: "3.10", legalBasis: "Article 12aa(1)(f) CIT Act", conditionTested: "A deemed payment to the Dutch permanent establishment is not included at the head office (deduction without inclusion)", allowedStates: S, drivenByQuestionIds: ["Q33", "Q34"], renderIfQuestionEquals: inbound },
  { rowId: "3.11", legalBasis: "Article 12aa(1)(f) CIT Act", conditionTested: "A non-EU permanent establishment makes a deemed payment to the Dutch permanent establishment that is deductible abroad", allowedStates: S, drivenByQuestionIds: ["Q35"], renderIfQuestionEquals: inbound },

  { rowId: "4.1", legalBasis: "Article 12ab(1) and (3) CIT Act", conditionTested: "As the recipient state, the Netherlands includes the income where the payer state does not deny the deduction; this applies only to sub-paragraphs (a), (b), (c), (e) and (f), never (d) or (g)", allowedStates: S, drivenByQuestionIds: [] },

  { rowId: "5.1", legalBasis: "Article 12ae CIT Act", conditionTested: "The taxpayer is a tax resident of two states (dual residence)", allowedStates: S, drivenByQuestionIds: ["Q29"] },
  { rowId: "5.2", legalBasis: "Article 12ae CIT Act", conditionTested: "The same remunerations, payments, charges or losses are deducted in both states", allowedStates: S, drivenByQuestionIds: ["Q29"] },
  { rowId: "5.3", legalBasis: "Article 12ae CIT Act", conditionTested: "The double deduction is set off against dual-inclusion income", allowedStates: S, drivenByQuestionIds: [] },
  { rowId: "5.4", legalBasis: "Article 12ae(2) CIT Act", conditionTested: "Where the other state is an EU Member State, the deduction is denied only if a tax treaty makes the taxpayer a resident of that other Member State", allowedStates: S, drivenByQuestionIds: [] },

  { rowId: "6.1", legalBasis: "Article 12ad CIT Act", conditionTested: "The Dutch payment is made to a related party or under a structured arrangement", allowedStates: S, drivenByQuestionIds: ["Q5", "Q28"] },
  { rowId: "6.2", legalBasis: "Article 12ad CIT Act", conditionTested: "There is a hybrid mismatch (double deduction or deduction without inclusion) elsewhere in the financing chain", allowedStates: S, drivenByQuestionIds: ["Q9", "Q10"] },
  { rowId: "6.3", legalBasis: "Article 12ad CIT Act", conditionTested: "The Dutch payment funds that foreign cost, directly or indirectly (including back-to-back arrangements)", allowedStates: S, drivenByQuestionIds: ["Q9", "Q10"] },
  { rowId: "6.4", legalBasis: "Article 12ad(2) CIT Act", conditionTested: "The mismatch is not neutralised in any other state (the carve-out does not apply)", allowedStates: S, drivenByQuestionIds: ["Q11"] },
  { rowId: "6.5", legalBasis: "Article 12aa / 12ab CIT Act", conditionTested: "The mismatch is already neutralised in the Netherlands on the same payment, so the imported-mismatch backstop is not reached", allowedStates: S, drivenByQuestionIds: [] },

  { rowId: "7.1", legalBasis: "Article 12af CIT Act", conditionTested: "A deduction was denied in an earlier year under art. 12aa(1)(e), (f) or (g), or art. 12ae, or income was included under art. 12ab(1)", allowedStates: S, drivenByQuestionIds: [] },
  { rowId: "7.2", legalBasis: "Article 12af CIT Act", conditionTested: "Dual-inclusion income arises in a later year than the denial, allowing the earlier deduction to be taken (recapture)", allowedStates: S, drivenByQuestionIds: [] },

  { rowId: "8.1", legalBasis: "Article 2 CIT Act", conditionTested: "A related participant regards the Dutch partnership as non-transparent (independently taxable) while the Netherlands treats it as transparent (reverse-hybrid classification conflict)", allowedStates: S, drivenByQuestionIds: ["Q4"] },
  { rowId: "8.2", legalBasis: "Article 2 par. 11 CIT Act", conditionTested: "50% or more of the voting rights, capital or profit is held, directly or indirectly, by related entities in a state that regards the partnership as taxable", allowedStates: S, drivenByQuestionIds: ["Q4"] },
  { rowId: "8.3", legalBasis: "Article 2 par. 12 CIT Act", conditionTested: "The collective-investment exception applies (a UCITS or AIF holding tradable securities with a diversified portfolio)", allowedStates: S, drivenByQuestionIds: [] },
];
