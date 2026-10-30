import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lyricsRequirementError, minimaxInstrumentalInput, INSTRUMENTAL_STRUCTURE } from "./instrumental.ts";
const P = "upbeat warm indie-pop, light and appetizing";
Deno.test("Phase C instrumental prompt without lyrics passes validation", () => {
  assertEquals(lyricsRequirementError(true, "instrumental", undefined), null);
  const i = minimaxInstrumentalInput(P);
  assertEquals(i.lyrics, INSTRUMENTAL_STRUCTURE);
  assertEquals(i.lyrics.replace(/\[[^\]]+\]/g, "").trim(), "");
  assert(i.prompt.startsWith(P) && i.prompt.includes("instrumental"));
});
Deno.test("vocal path without lyrics still rejected", () => {
  assertEquals(lyricsRequirementError(true, undefined, ""), "MISSING_LYRICS");
  assertEquals(lyricsRequirementError(true, undefined, "short"), "MISSING_LYRICS");
});
