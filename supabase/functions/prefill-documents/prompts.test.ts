import { renderTemplate } from "./prompts.ts";
import { assertEquals } from "std/assert/mod.ts";

Deno.test("renderTemplate replaces known placeholders", () => {
  const out = renderTemplate("Hello {{name}}, you are {{role}}.", {
    name: "Lennart", role: "admin",
  });
  assertEquals(out, "Hello Lennart, you are admin.");
});

Deno.test("renderTemplate leaves unknown placeholders empty", () => {
  const out = renderTemplate("{{a}}-{{missing}}", { a: "1" });
  assertEquals(out, "1-");
});

Deno.test("renderTemplate handles repeated placeholders", () => {
  assertEquals(renderTemplate("{{x}}{{x}}", { x: "ab" }), "abab");
});
