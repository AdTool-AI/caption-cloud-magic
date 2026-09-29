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
      'Calculates the exact amount that would be charged for a given model, duration and resolution, without starting anything. Creates a pending approval request (approval_id) that the user must confirm in the AdTool UI. generate_video is refused by the server until the user has confirmed.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        duration: { type: 'number' },
        resolution: { type: 'string', description: 'e.g. "720p", "1080p". Optional — defaults to 720p.' },
        retry_budget: {
          type: 'integer',
          description: 'How many automatic quality retries (0-2) the user is asked to pre-approve at the same price each. Default 0.',
        },
      },
      required: ['model', 'duration'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'generate_video',
    description:
      'Starts a real, paid video generation through the existing AdTool generation pipeline (credits, entitlements and pricing validation all apply). Requires approval_id from estimate_video_cost AFTER the user confirmed it; model, duration and resolution must match the quote exactly. Each approval can be used once.',
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
        approval_id: { type: 'string', description: 'The confirmed approval_id from estimate_video_cost.' },
      },
      required: ['model', 'prompt', 'duration', 'aspect_ratio', 'approval_id'],
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
      'Quality control. For videos pass generation_id: the WHOLE video is reviewed (scene segmentation + temporal review of character/product consistency, hands/faces in motion, disappearing objects, motion artefacts, text stability, continuity, audio/lip-sync). Returns a structured verdict, timestamped issues and regeneration hints (prompt_fixes, negative_prompt_additions, suggested_prompt). For images pass asset_url.',
    parameters: {
      type: 'object',
      properties: {
        asset_url: { type: 'string', description: 'Image URL (images only).' },
        intent: { type: 'string', description: 'What the asset was supposed to show / achieve.' },
        generation_id: { type: 'string', description: 'Required for videos: the AdTool generation id.' },
      },
      required: ['intent'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'regenerate_video',
    description:
      'Starts one improved retry of a previous generation with a revised prompt or settings. Needs approval_id: either the original approval (only if the user pre-approved a retry budget; same model/duration/resolution) or a new confirmed approval. Strictly capped per task.',
    parameters: {
      type: 'object',
      properties: {
        previous_generation_id: { type: 'string' },
        prompt: { type: 'string', description: 'The improved prompt.' },
        reason: { type: 'string', description: 'Why the previous result was unacceptable (from analyze_asset).' },
        approval_id: { type: 'string' },
        negative_prompt: { type: 'string', description: 'e.g. negative_prompt_additions from the QA.' },
        model: { type: 'string', description: 'Optional different model id.' },
        duration: { type: 'number' },
        aspect_ratio: { type: 'string' },
        resolution: { type: 'string' },
      },
      required: ['previous_generation_id', 'prompt', 'reason', 'approval_id'],
      additionalProperties: false,
    },
  },
];

/** Tools that can spend the user's money — used for budget gating. */
export const MUSE_PAID_TOOLS = new Set(['generate_video', 'regenerate_video']);
