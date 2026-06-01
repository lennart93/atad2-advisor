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

Deno.test("SwarmPrefill accepts hint-only payload (no answer, no toelichting)", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: null,
    source_refs: [],
    contextual_hint: "Confirmation is needed from the participating shareholders.",
  });
  assertEquals(parsed.suggested_toelichting, null);
  assertEquals(parsed.contextual_hint, "Confirmation is needed from the participating shareholders.");
});

Deno.test("SwarmPrefill accepts toelichting-only payload (no hint)", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 82,
    answer_rationale: "Camden B.V. pays disregarded royalties to a US LLC.",
    suggested_toelichting: "Camden B.V. is a Dutch BV that ...",
    source_refs: [{ doc_label: "Local file 2025", location: "§3.2 p.14" }],
    contextual_hint: null,
  });
  assertEquals(parsed.suggested_toelichting, "Camden B.V. is a Dutch BV that ...");
  assertEquals(parsed.contextual_hint, null);
});

Deno.test("SwarmPrefill drops contextual_hint when both fields populated (toelichting wins)", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 82,
    answer_rationale: "x",
    suggested_toelichting: "Real toelichting content.",
    source_refs: [{ doc_label: "Doc", location: "p.1" }],
    contextual_hint: "This should be dropped.",
  });
  assertEquals(parsed.suggested_toelichting, "Real toelichting content.");
  assertEquals(parsed.contextual_hint, null);
});

Deno.test("SwarmPrefill rejects when both suggested_toelichting and contextual_hint are null", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: null,
    source_refs: [],
    contextual_hint: null,
  }));
});

Deno.test("SwarmPrefill rejects contextual_hint over 1000 chars", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: null,
    source_refs: [],
    contextual_hint: "x".repeat(1001),
  }));
});

Deno.test("SwarmPrefill accepts hint + companion unknown-toelichting (v9 route B)", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: null,
    source_refs: [],
    contextual_hint: "In this case, confirmation is needed from the participants.",
    suggested_toelichting_unknown: "Camden B.V. has participants whose classification is unknown.",
  });
  assertEquals(parsed.contextual_hint, "In this case, confirmation is needed from the participants.");
  assertEquals(parsed.suggested_toelichting_unknown, "Camden B.V. has participants whose classification is unknown.");
});

Deno.test("SwarmPrefill defaults missing suggested_toelichting_unknown to null (older swarm payloads)", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: null,
    source_refs: [],
    contextual_hint: "Hint only, older swarm.",
  });
  assertEquals(parsed.suggested_toelichting_unknown, null);
});

Deno.test("SwarmPrefill drops suggested_toelichting_unknown when contextual_hint is null", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 82,
    answer_rationale: "x",
    suggested_toelichting: "Real toelichting.",
    source_refs: [{ doc_label: "Doc", location: "p.1" }],
    contextual_hint: null,
    suggested_toelichting_unknown: "Stray unknown text that should be dropped.",
  });
  assertEquals(parsed.suggested_toelichting_unknown, null);
});

Deno.test("SwarmPrefill rejects suggested_toelichting_unknown over 1000 chars", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: null,
    source_refs: [],
    contextual_hint: "Hint.",
    suggested_toelichting_unknown: "x".repeat(1001),
  }));
});
