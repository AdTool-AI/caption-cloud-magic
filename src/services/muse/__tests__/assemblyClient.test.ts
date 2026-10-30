import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { AssemblyError, isStaleAssemblyError, paramsFromScope, prepareAssembly, startAssembly } from "../assemblyClient";

const scope = {
  branding_mode: "text_only",
  steps: [
    { step: "voiceover", params: { text: "Hallo", voice_id: "XrExE9yKIg1WjnnlVkGX", language: "de", start: 0 } },
    { step: "subtitles", params: { language: "de" } },
    { step: "music", params: { prompt: "warm", tier: "minimax-15", volume: 0.5, duck: 0.35 } },
    { step: "sfx", params: { prompt: "cup", start: 1, duration: 2, volume: 0.6 } },
    { step: "export", params: {} },
  ],
};

const httpError = (body: unknown) => ({ message: "non-2xx", context: new Response(JSON.stringify(body), { status: 409 }) });

beforeEach(() => invoke.mockReset());

describe("assemblyClient", () => {
  it("surfaces SCOPE_MISMATCH as a stale-package error", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError({ error: "mismatch", code: "SCOPE_MISMATCH" }) });
    const err = await startAssembly("a1").catch((e) => e);
    expect(err).toBeInstanceOf(AssemblyError);
    expect(err.code).toBe("SCOPE_MISMATCH");
    expect(isStaleAssemblyError(err)).toBe(true);
  });

  it("other errors are not treated as stale", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError({ error: "nope", code: "NOT_PENDING" }) });
    expect(isStaleAssemblyError(await startAssembly("a1").catch((e) => e))).toBe(false);
  });

  it("prepare again calls only prepare_assembly, never start_assembly", async () => {
    invoke.mockResolvedValue({ data: { assembly_id: "new" }, error: null });
    const out = await prepareAssembly("v1", paramsFromScope(scope));
    expect(out.assembly_id).toBe("new");
    expect(invoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = invoke.mock.calls[0];
    expect(fn).toBe("campaign-spot");
    expect(opts.body.action).toBe("prepare_assembly");
    expect(opts.body.video_id).toBe("v1");
    expect(invoke.mock.calls.some(([, o]) => o.body.action === "start_assembly")).toBe(false);
  });

  it("paramsFromScope reproduces the stored content and branding", () => {
    expect(paramsFromScope(scope)).toEqual({
      branding_mode: "text_only",
      voiceover: { text: "Hallo", voice_id: "XrExE9yKIg1WjnnlVkGX", language: "de", start: 0 },
      music: { prompt: "warm", tier: "minimax-15", volume: 0.5, duck: 0.35 },
      sfx: { prompt: "cup", start: 1, duration: 2, volume: 0.6 },
    });
  });
});
