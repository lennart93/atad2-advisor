import { Stage1Output, Stage2Output } from "./schemas.ts";
import { assertEquals, assertThrows } from "std/assert/mod.ts";

Deno.test("Stage1Output parses minimal valid input", () => {
  const parsed = Stage1Output.parse({
    document_kind: "local_file",
    language: "en",
  });
  assertEquals(parsed.fiscal_periods, []);
  assertEquals(parsed.entities, []);
});

Deno.test("Stage1Output rejects unknown document_kind", () => {
  assertThrows(() => Stage1Output.parse({
    document_kind: "unknown_kind",
    language: "en",
  }));
});

Deno.test("Stage2Output rejects prefill with no source_refs", () => {
  assertThrows(() => Stage2Output.parse({
    prefills: [{
      question_id: "1",
      suggested_toelichting: "test",
      source_refs: [],
      verbatim_quote: null,
    }],
  }));
});

Deno.test("Stage2Output rejects suggested_toelichting over 1000 chars", () => {
  const long = "x".repeat(1001);
  assertThrows(() => Stage2Output.parse({
    prefills: [{
      question_id: "1",
      suggested_toelichting: long,
      source_refs: [{ document_id: "d", doc_label: "l", location: "p.1" }],
      verbatim_quote: null,
    }],
  }));
});

Deno.test("Stage2Output accepts a valid multi-prefill payload", () => {
  const parsed = Stage2Output.parse({
    prefills: [
      {
        question_id: "27",
        suggested_toelichting: "Facts go here.",
        source_refs: [{ document_id: "d", doc_label: "Local File 2025", location: "§3.2" }],
        verbatim_quote: "Quote.",
      },
      {
        question_id: "29",
        suggested_toelichting: "Other facts.",
        source_refs: [{ document_id: "d2", doc_label: "Trial Balance", location: "account 481000" }],
        verbatim_quote: null,
      },
    ],
  });
  assertEquals(parsed.prefills.length, 2);
});
