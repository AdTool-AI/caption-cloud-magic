/**
 * Tool contracts exposed to Muse. Definitions only — no execution logic and no
 * platform imports, so this file is safe to reuse from any backend.
 */

import type { MuseFunctionTool } from './museClient.ts';

export const MUSE_TOOL_DEFINITIONS: MuseFunctionTool[] = [
  {
    type: 'function',
    name: 'get_user_context',
    description:
      'Safe context about the signed-in AdTool user: brand kit (name, colours, tone, audience), plan, AI video wallet balance and currency, and the most recent media items. Call this before planning any production.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'get_available_video_models',
    description:
      'Lists the video models currently available in AdTool with their supported modes, durations, resolutions, aspect ratios, native audio support and the exact per-second price for this account (wallet currency, discounts applied).',
    parameters: {
      type: 'object',
      properties: {
        family: {
          type: 'string',
          description: 'Optional filter, e.g. "seedance", "kling", "veo", "hailuo", "wan", "ltx", "vidu", "luma", "grok".',
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'estimate_video_cost',
    description:
      'Calculates the exact amount that would be charged for a given model, duration and resolution, without starting anything. Use this before asking the user to confirm a generation.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        duration: { type: 'number' },
        resolution: { type: 'string', description: 'e.g. "720p", "1080p". Optional — defaults to the model default.' },
      },
      required: ['model', 'duration'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'generate_video',
    description:
      'Starts a real, paid video generation through the existing AdTool generation pipeline (credits, entitlements and pricing validation all apply). Only call this after the user has agreed to the cost.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model id from get_available_video_models.' },
        prompt: { type: 'string', description: 'The full generation prompt, in English.' },
        duration: { type: 'number', description: 'Duration in seconds, must be supported by the model.' },
        aspect_ratio: { type: 'string', description: 'e.g. "9:16", "16:9", "1:1".' },
        resolution: { type: 'string', description: 'e.g. "720p", "1080p".' },
        generate_audio: { type: 'boolean', description: 'Request native audio when the model supports it.' },
        start_image_url: { type: 'string', description: 'Optional reference/first-frame image URL owned by the user.' },
        negative_prompt: { type: 'string' },
      },
      required: ['model', 'prompt', 'duration', 'aspect_ratio'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_video_status',
    description:
      'Reads the status of a generation started by generate_video or regenerate_video: queued, processing, completed or failed, plus the output video URL when finished.',
    parameters: {
      type: 'object',
      properties: { generation_id: { type: 'string' } },
      required: ['generation_id'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'analyze_asset',
    description:
      'Critically analyses a finished image or video against the original intent: prompt adherence, visual quality, realism, consistency, AI artefacts, text errors and suitability for social advertising. Returns a verdict and concrete improvement notes.',
    parameters: {
      type: 'object',
      properties: {
        asset_url: { type: 'string' },
        intent: { type: 'string', description: 'What the asset was supposed to show / achieve.' },
        generation_id: { type: 'string', description: 'Optional generation this asset came from.' },
      },
      required: ['asset_url', 'intent'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'regenerate_video',
    description:
      'Starts one improved retry of a previous generation with a revised prompt or settings. Strictly capped per task; the tool refuses further attempts once the cap is reached.',
    parameters: {
      type: 'object',
      properties: {
        previous_generation_id: { type: 'string' },
        prompt: { type: 'string', description: 'The improved prompt.' },
        reason: { type: 'string', description: 'Why the previous result was unacceptable.' },
        model: { type: 'string', description: 'Optional different model id.' },
        duration: { type: 'number' },
        aspect_ratio: { type: 'string' },
        resolution: { type: 'string' },
      },
      required: ['previous_generation_id', 'prompt', 'reason'],
      additionalProperties: false,
    },
  },
];

/** Tools that can spend the user's money — used for budget gating. */
export const MUSE_PAID_TOOLS = new Set(['generate_video', 'regenerate_video']);
