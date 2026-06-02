import type { SupabaseClient } from "supabase";
import { assertEquals } from "std/assert/mod.ts";
import { fetchImageBlocks, type ImageRef } from "./analyze.ts";

// A 1×1 transparent PNG. Anything <16 bytes is fine for the test — the
// converter does not validate image contents, it only wraps them as base64.
const ONE_PIXEL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function fakeStorageClient(files: Record<string, Uint8Array>): SupabaseClient {
  return {
    storage: {
      from(_bucket: string) {
        return {
          async download(path: string) {
            const bytes = files[path];
            if (!bytes) return { data: null, error: new Error("not found") };
            return { data: new Blob([bytes]), error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
}

Deno.test("fetchImageBlocks returns image content blocks for each ref", async () => {
  const client = fakeStorageClient({ "user/sess/abc.png": ONE_PIXEL_PNG });
  const refs: ImageRef[] = [
    { doc_label: "Photo 1", storage_path: "user/sess/abc.png", mime_type: "image/png", relevance_note: null },
  ];
  const blocks = await fetchImageBlocks(client, "sess", "q1", refs);
  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].type, "image");
  if (blocks[0].type === "image") {
    assertEquals(blocks[0].source.type, "base64");
    assertEquals(blocks[0].source.media_type, "image/png");
    // base64 of the 8-byte PNG header is "iVBORw0KGgo=".
    assertEquals(blocks[0].source.data, "iVBORw0KGgo=");
  }
});

Deno.test("fetchImageBlocks skips refs that fail to download", async () => {
  const client = fakeStorageClient({ "user/sess/good.png": ONE_PIXEL_PNG });
  const refs: ImageRef[] = [
    { doc_label: "Missing", storage_path: "user/sess/missing.png", mime_type: "image/png", relevance_note: null },
    { doc_label: "Good", storage_path: "user/sess/good.png", mime_type: "image/png", relevance_note: null },
  ];
  const blocks = await fetchImageBlocks(client, "sess", "q1", refs);
  assertEquals(blocks.length, 1);
});

Deno.test("fetchImageBlocks returns empty array for empty refs", async () => {
  const client = fakeStorageClient({});
  const blocks = await fetchImageBlocks(client, "sess", "q1", []);
  assertEquals(blocks.length, 0);
});
