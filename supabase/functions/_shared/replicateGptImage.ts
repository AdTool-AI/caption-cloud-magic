/** Replicate schema reviewed on AWS: GPT Image 2 version 209a2756. */
export const REPLICATE_GPT_IMAGE_MODEL = 'openai/gpt-image-2:209a275610f9165a0424dc04027edfc230cb9bd463d7fabc0b99d1a5e498319e' as const;
export interface GptImageInput {
  prompt: string;
  aspect_ratio: '1:1' | '3:2' | '2:3';
  quality: 'low';
  number_of_images: 1;
  background: 'transparent' | 'opaque';
  output_format: 'png' | 'jpeg';
  input_images?: string[];
}
export function buildReplicateGptImageInput(prompt: string, aspectRatio: string, references: string[], transparent: boolean): GptImageInput {
  if (!prompt.trim() || !['1:1','3:2','2:3'].includes(aspectRatio) || references.length > 4) throw new Error('INVALID_GPT_IMAGE_INPUT');
  for (const reference of references) {
    let url: URL;
    try { url = new URL(reference); } catch { throw new Error('INVALID_GPT_IMAGE_REFERENCE'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || reference.length > 8192) throw new Error('INVALID_GPT_IMAGE_REFERENCE');
  }
  return {prompt, aspect_ratio: aspectRatio as GptImageInput['aspect_ratio'], quality:'low', number_of_images:1,
    background:transparent?'transparent':'opaque', output_format:transparent?'png':'jpeg',
    ...(references.length ? {input_images:[...references]} : {})};
}
