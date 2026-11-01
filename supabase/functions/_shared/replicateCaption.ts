/** Direct Replicate caption adapter. One SDK run; caller owns Auth, history and cache. */
export const CAPTION_MODEL = 'google/gemini-2.5-flash:cfa7dd7a2b626fb3329fd0aefa8320163c02a01a8da769b8e214dd630f6876b7' as const;
export interface CaptionRunner {
  (model: typeof CAPTION_MODEL, options: {input: {prompt: string; system_instruction: string; max_output_tokens: number}}): Promise<unknown>;
}
export class CaptionProviderError extends Error {
  constructor(public readonly status: number) { super('Caption provider unavailable'); }
}
export async function completeReplicateCaption(run: CaptionRunner, prompt: string, systemInstruction: string): Promise<string> {
  let output: unknown;
  try {
    output = await run(CAPTION_MODEL, {input: {prompt, system_instruction: systemInstruction, max_output_tokens: 2048}});
  } catch (error: unknown) {
    const candidate = error as {response?: {status?: unknown}};
    const status = candidate?.response?.status;
    throw new CaptionProviderError(status === 429 || status === 402 ? status : 503);
  }
  // Replicate text models return a string or ordered text chunks, rather than chat-completion choices.
  const text = typeof output === 'string' ? output : Array.isArray(output) && output.every(part => typeof part === 'string') ? output.join('') : null;
  if (!text || !text.trim() || text.length > 32768) throw new CaptionProviderError(503);
  return text;
}
