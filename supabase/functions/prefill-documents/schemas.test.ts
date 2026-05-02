import { SwarmPrefill } from "./schemas.ts";
import { assertEquals, assertThrows } from "std/assert/mod.ts";

Deno.test("SwarmPrefill accepts a yes-answer with confidence + rationale", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 82,
    answer_rationale: "Camden B.V. pays disregarded royalties to a US LLC.",
    suggested_toelichting: "Camden B.V. is a Dutch BV that ...",
    source_refs: [{ doc_label: "Local file 2025", location: "§3.2 p.14" }],
  });
  assertEquals(parsed.suggested_answer, "yes");
  assertEquals(parsed.confidence_pct, 82);
});

Deno.test("SwarmPrefill accepts null answer + null confidence", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: "Some context.",
    source_refs: [{ doc_label: "Doc", location: "p.1" }],
  });
  assertEquals(parsed.suggested_answer, null);
});

Deno.test("SwarmPrefill rejects confidence > 100", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 120,
    answer_rationale: "x",
    suggested_toelichting: "y",
    source_refs: [{ doc_label: "Doc", location: "p.1" }],
  }));
});

Deno.test("SwarmPrefill rejects empty source_refs", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: "no",
    confidence_pct: 50,
    answer_rationale: "x",
    suggested_toelichting: "y",
    source_refs: [],
  }));
});

Deno.test("SwarmPrefill rejects rationale over 200 chars", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 80,
    answer_rationale: "x".repeat(201),
    suggested_toelichting: "y",
    source_refs: [{ doc_label: "Doc", location: "p.1" }],
  }));
});
