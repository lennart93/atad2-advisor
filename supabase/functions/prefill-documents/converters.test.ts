import { toAnthropicBlock, isAccepted } from "./converters.ts";
import { assertEquals, assertRejects } from "std/assert/mod.ts";

Deno.test("isAccepted recognises all spec'd mime types", () => {
  for (const mime of [
    "application/pdf",
    "image/png", "image/jpeg", "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv", "text/markdown",
  ]) {
    assertEquals(isAccepted(mime), true, `expected ${mime} to be accepted`);
  }
});

Deno.test("isAccepted rejects legacy formats", () => {
  assertEquals(isAccepted("application/msword"), false);
  assertEquals(isAccepted("application/vnd.ms-excel"), false);
  assertEquals(isAccepted("application/octet-stream"), false);
});

Deno.test("toAnthropicBlock handles plain text", async () => {
  const block = await toAnthropicBlock(new TextEncoder().encode("hello"), "text/plain");
  assertEquals(block.type, "text");
  if (block.type === "text") assertEquals(block.text, "hello");
});

Deno.test("toAnthropicBlock handles markdown and csv", async () => {
  const md = await toAnthropicBlock(new TextEncoder().encode("# Title"), "text/markdown");
  assertEquals(md.type, "text");
  const csv = await toAnthropicBlock(new TextEncoder().encode("a,b\n1,2"), "text/csv");
  assertEquals(csv.type, "text");
});

Deno.test("toAnthropicBlock throws on unknown mime", async () => {
  await assertRejects(() => toAnthropicBlock(new Uint8Array(), "application/unknown"));
});

Deno.test("toAnthropicBlock wraps PDFs as document blocks", async () => {
  const block = await toAnthropicBlock(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf");
  assertEquals(block.type, "document");
  if (block.type === "document") {
    assertEquals(block.source.media_type, "application/pdf");
  }
});
