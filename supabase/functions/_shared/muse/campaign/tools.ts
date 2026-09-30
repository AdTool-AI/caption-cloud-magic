/**
 * Phase A campaign tool contracts (research + planning only, never spend money).
 * Definitions only — no platform imports.
 */

import type { MuseFunctionTool } from '../museClient.ts';
import { BUSINESS_AREAS, FUNNEL_STAGES } from './diversity.ts';

const str = { type: 'string' };
const strArr = { type: 'array', items: { type: 'string' } };

const videoSchema = {
  type: 'object',
  properties: {
    index: { type: 'integer', description: '1..N' },
    title: str,
    concept: { type: 'string', description: 'One-sentence creative concept.' },
    pillar: { type: 'string', description: 'Exact name of one stored content pillar.' },
    business_area: { type: 'string', enum: [...BUSINESS_AREAS] },
    funnel_stage: { type: 'string', enum: [...FUNNEL_STAGES] },
    target_audience: str,
    emotional_angle: str,
    commercial_objective: str,
    primary_goal: { type: 'string', description: 'Distinct strategic purpose of this video in the campaign.' },
    hook_type: { type: 'string', description: 'e.g. question, pov, sensory_closeup, before_after, social_proof, countdown, behind_the_scenes, offer' },
    hook_text: { type: 'string', description: 'The actual hook line (campaign language).' },
    cta: { type: 'string', description: 'Exact CTA text (campaign language). Must differ per video.' },
    visual_style: str,
    hero_subject: { type: 'string', description: 'Main product/person/place shown.' },
    main_message: str,
    shot_structure: { ...strArr, description: 'Ordered beat list, e.g. ["hook close-up","product","atmosphere","people","offer","brand+cta"].' },
    rationale: { type: 'string', description: 'Why this video exists and how it complements the others.' },
    series_key: { type: 'string', description: 'Only if videos are an intentional series sharing a subject.' },
  },
  required: ['index', 'title', 'concept', 'pillar', 'business_area', 'funnel_stage', 'target_audience', 'emotional_angle', 'commercial_objective', 'primary_goal', 'hook_type', 'hook_text', 'cta', 'visual_style', 'hero_subject', 'main_message', 'shot_structure', 'rationale'],
  additionalProperties: false,
};

export const CAMPAIGN_TOOL_DEFINITIONS: MuseFunctionTool[] = [
  {
    type: 'function',
    name: 'create_campaign',
    description: 'Creates (or returns the existing) durable campaign for a commercial goal, e.g. "Win Café Buur with a 30-second demo ad". Free. Call once per business per chat, then research_business.',
    parameters: {
      type: 'object',
      properties: {
        company_name: str,
        website: str,
        location: str,
        goal: str,
        language: { type: 'string', enum: ['de', 'en', 'es'], description: 'Language of scripts/voiceover.' },
        video_count: { type: 'integer', minimum: 1, maximum: 12 },
        video_duration_s: { type: 'integer', minimum: 10, maximum: 60, description: 'Length of each video, default 30.' },
      },
      required: ['company_name', 'goal', 'language', 'video_count'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'research_business',
    description: 'Runs public web research (cited web search + the official website, robots.txt respected) and stores every source URL and public image (images default to reference_only). Returns a report with numbered citations. Free for the video wallet.',
    parameters: {
      type: 'object',
      properties: { campaign_id: str, focus: { type: 'string', description: 'Optional extra research focus.' } },
      required: ['campaign_id'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'record_research_findings',
    description: 'Stores the interpreted research: target audience, strongest commercial angle with rationale, and facts. Every fact must quote a source_url returned by research_business; facts without a stored source are saved as hypotheses.',
    parameters: {
      type: 'object',
      properties: {
        campaign_id: str,
        summary: str,
        audience: str,
        commercial_angle: str,
        angle_rationale: str,
        facts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: ['business_info', 'products', 'branding', 'audience', 'selling_point', 'reviews', 'social', 'offers', 'competitors', 'content_style'] },
              fact: str,
              source_url: str,
            },
            required: ['category', 'fact'],
            additionalProperties: false,
          },
        },
      },
      required: ['campaign_id', 'audience', 'commercial_angle', 'angle_rationale', 'facts'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'collect_campaign_assets',
    description: 'Lists campaign assets: public web images from research (reference_only), plus the user\'s own brand kit logo and Media Library items (reuse_ok). Only reuse_ok assets may appear in a final deliverable.',
    parameters: { type: 'object', properties: { campaign_id: str }, required: ['campaign_id'], additionalProperties: false },
  },
  {
    type: 'function',
    name: 'identify_content_pillars',
    description: 'Stores the business\'s main content pillars ranked by relevance to the campaign goal (replaces previous list). Include evidence source URLs.',
    parameters: {
      type: 'object',
      properties: {
        campaign_id: str,
        pillars: {
          type: 'array',
          minItems: 3,
          items: {
            type: 'object',
            properties: { name: str, rank: { type: 'integer' }, relevance: str, evidence_urls: strArr },
            required: ['name', 'rank', 'relevance'],
            additionalProperties: false,
          },
        },
      },
      required: ['campaign_id', 'pillars'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'identify_business_areas',
    description: 'Scores every business area 0..1 for relevance to this business and goal (replaces previous scores). Used for coverage planning.',
    parameters: {
      type: 'object',
      properties: {
        campaign_id: str,
        areas: {
          type: 'array',
          items: {
            type: 'object',
            properties: { area: { type: 'string', enum: [...BUSINESS_AREAS] }, relevance: { type: 'number' }, rationale: str, evidence_urls: strArr },
            required: ['area', 'relevance', 'rationale'],
            additionalProperties: false,
          },
        },
      },
      required: ['campaign_id', 'areas'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'plan_campaign_videos',
    description: 'Submits the full content matrix for ALL requested videos. The server validates exact diversity rules and semantic duplicates (concept, hook, CTA, shot structure, hero subject, main message). If rejected, revise the named videos and resubmit (max 3 rounds). On success stores the videos and the coverage_score.',
    parameters: {
      type: 'object',
      properties: {
        campaign_id: str,
        campaign_explanation: { type: 'string', description: 'How the videos work together as one campaign.' },
        videos: { type: 'array', items: videoSchema },
      },
      required: ['campaign_id', 'campaign_explanation', 'videos'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'write_video_scripts',
    description: 'Stores script + shot plan for one or more planned videos (batch them). Shots: 5-7 contiguous shots of 2-8 s covering the full duration. Brand names and CTAs belong in on_screen_text (added in editing), never trusted to generative video.',
    parameters: {
      type: 'object',
      properties: {
        campaign_id: str,
        videos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              video_index: { type: 'integer' },
              script: {
                type: 'object',
                properties: {
                  hook: str, main_message: str, cta: str,
                  voiceover: { type: 'string', description: 'Full spoken copy in campaign language.' },
                  on_screen_text: strArr,
                  timing: { type: 'array', items: { type: 'object', properties: { start_s: { type: 'number' }, end_s: { type: 'number' }, beat: str }, required: ['start_s', 'end_s', 'beat'], additionalProperties: false } },
                  music_direction: str, sound_direction: str,
                },
                required: ['hook', 'main_message', 'cta', 'voiceover', 'on_screen_text', 'timing', 'music_direction', 'sound_direction'],
                additionalProperties: false,
              },
              shots: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    start_s: { type: 'number' }, end_s: { type: 'number' }, purpose: str,
                    shot_type: { type: 'string', description: 'e.g. macro close-up, wide establishing, handheld medium' },
                    subject_emphasis: { type: 'string', enum: ['product', 'people', 'atmosphere', 'brand'] },
                    description: { type: 'string', description: 'Visual description in English.' },
                    on_screen_text: str, voiceover: str,
                    asset_id: { type: 'string', description: 'Optional campaign asset id used as reference.' },
                  },
                  required: ['start_s', 'end_s', 'purpose', 'shot_type', 'subject_emphasis', 'description'],
                  additionalProperties: false,
                },
              },
            },
            required: ['video_index', 'script', 'shots'],
            additionalProperties: false,
          },
        },
      },
      required: ['campaign_id', 'videos'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_campaign',
    description: 'Returns the full stored campaign (stage, research, sources, pillars, areas, assets, videos, scripts, shots, coverage). Without campaign_id returns the latest campaign of this chat.',
    parameters: { type: 'object', properties: { campaign_id: str }, additionalProperties: false },
  },
];

export const CAMPAIGN_TOOL_NAMES = new Set(CAMPAIGN_TOOL_DEFINITIONS.map((t) => t.name));
