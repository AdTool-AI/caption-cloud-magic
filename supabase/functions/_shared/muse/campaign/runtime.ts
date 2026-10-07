/**
 * Phase A campaign tool handlers. Research + planning only: these handlers
 * never call pricing, wallet or generation code.
 */

import type { ToolContext, ToolResult } from '../toolRuntime.ts';
import { createMuseResponse } from '../museClient.ts';
import { researchBusiness } from './research.ts';
import { embedTexts } from './embeddings.ts';
import { computeSocialCompleteness, discoverSocialProfiles } from './social.ts';
import {
  assessPairs, coverageScore, dimensionText, exactDiversityRules, norm, SIMILARITY_DIMENSIONS,
  validateShape, validateShots, type PlannedVideo,
} from './diversity.ts';
import {
  estimateCampaignBudget, prepareShotRetry, productionStatus, requestShotRetryApproval, retryShot,
  reviewShot, routeCampaignShots, startCampaignProduction,
} from './production.ts';

// Phase B paid execution tools — foreground-only for Muse (background turns never receive them).
export const PAID_CAMPAIGN_TOOLS = new Set<string>(['start_campaign_production', 'retry_shot']);

const MAX_REVISION_ROUNDS = 3;

// deno-lint-ignore no-explicit-any
type Args = any;

const err = (code: string, error: string, extra: Record<string, unknown> = {}): ToolResult => ({ output: { error, code, ...extra } });

async function loadCampaign(ctx: ToolContext, id?: string) {
  let q = ctx.admin.from('agent_campaigns').select('*').eq('user_id', ctx.userId);
  q = id ? q.eq('id', id) : q.eq('conversation_id', ctx.conversationId).order('created_at', { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  return data as Record<string, any> | null;
}

async function setStage(ctx: ToolContext, id: string, stage: string, patch: Record<string, unknown> = {}) {
  await ctx.admin.from('agent_campaigns').update({ stage, ...patch }).eq('id', id).eq('user_id', ctx.userId);
}

const STAGE_ORDER = ['research', 'strategy', 'asset_collection', 'script', 'shot_planning', 'plan_ready'];
const advance = (current: string, next: string) =>
  STAGE_ORDER.indexOf(next) > STAGE_ORDER.indexOf(current) || !STAGE_ORDER.includes(current) ? next : current;

// ---------------------------------------------------------------------------

async function createCampaign(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const company = String(a.company_name ?? '').trim();
  if (!company) return err('INVALID', 'company_name is required.');
  const { data: existing } = await ctx.admin
    .from('agent_campaigns').select('id, stage, requested_video_count')
    .eq('user_id', ctx.userId).eq('conversation_id', ctx.conversationId).ilike('company_name', company)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (a.video_count && a.video_count !== existing.requested_video_count && ['research', 'strategy', 'asset_collection'].includes(existing.stage)) {
      patch.requested_video_count = a.video_count;
    }
    if (Object.keys(patch).length) await ctx.admin.from('agent_campaigns').update(patch).eq('id', existing.id);
    return { output: { campaign_id: existing.id, stage: existing.stage, existing: true, ...patch } };
  }
  const { data, error } = await ctx.admin.from('agent_campaigns').insert({
    user_id: ctx.userId,
    conversation_id: ctx.conversationId,
    company_name: company,
    website: a.website ?? null,
    location: a.location ?? null,
    goal: String(a.goal ?? '').slice(0, 1000),
    language: ['de', 'en', 'es'].includes(a.language) ? a.language : 'de',
    requested_video_count: Math.min(12, Math.max(1, Number(a.video_count) || 1)),
    video_duration_s: Math.min(60, Math.max(10, Number(a.video_duration_s) || 30)),
  }).select('id, stage').single();
  if (error) return err('DB_ERROR', error.message);
  return { output: { campaign_id: data.id, stage: data.stage, next: 'research_business' } };
}

async function researchTool(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const bundle = await researchBusiness({ company: c.company_name, website: c.website, location: c.location, focus: a.focus });
  if (!bundle.sources.length) {
    await ctx.admin.from('agent_campaigns').update({ error: bundle.errors.join('; ').slice(0, 1000) }).eq('id', c.id);
    return err('RESEARCH_FAILED', 'No public sources could be retrieved.', { details: bundle.errors });
  }
  const srcRows = bundle.sources.map((s) => ({
    campaign_id: c.id, user_id: ctx.userId, url: s.url, title: s.title ?? null, excerpt: s.excerpt?.slice(0, 1000) ?? null, via: s.via,
  }));
  await ctx.admin.from('campaign_sources').upsert(srcRows, { onConflict: 'campaign_id,url', ignoreDuplicates: true });
  if (bundle.images.length) {
    await ctx.admin.from('campaign_assets').upsert(
      bundle.images.map((i) => ({
        campaign_id: c.id, user_id: ctx.userId, url: i.url, kind: i.kind, source_url: i.source_url,
        reuse_status: 'reference_only', owner_note: `Public web image (${i.alt ?? 'no alt'}). Reuse rights unknown — reference only.`,
      })),
      { onConflict: 'campaign_id,url', ignoreDuplicates: true },
    );
  }
  if (!c.website && bundle.website?.url) await ctx.admin.from('agent_campaigns').update({ website: bundle.website.url }).eq('id', c.id);
  await setStage(ctx, c.id, advance(c.stage, 'strategy'), { error: null });
  return {
    output: {
      campaign_id: c.id,
      report: bundle.report.slice(0, 12000),
      sources: bundle.sources.map((s) => ({ url: s.url, title: s.title, via: s.via })),
      public_images_found: bundle.images.length,
      warnings: bundle.errors,
      next: 'record_research_findings, identify_content_pillars, identify_business_areas (can run together)',
    },
  };
}

async function recordFindings(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const { data: sources } = await ctx.admin.from('campaign_sources').select('id, url').eq('campaign_id', c.id);
  const byUrl = new Map<string, string>((sources ?? []).map((s: { id: string; url: string }) => [s.url.replace(/\/$/, ''), s.id]));
  const facts = (Array.isArray(a.facts) ? a.facts : []).slice(0, 60).map((f: Args) => {
    const u = f.source_url ? String(f.source_url).replace(/\/$/, '') : '';
    const sid = u ? byUrl.get(u) ?? byUrl.get(u + '/') ?? null : null;
    return {
      campaign_id: c.id, user_id: ctx.userId, category: String(f.category ?? 'business_info'), fact: String(f.fact ?? '').slice(0, 800),
      source_id: sid, source_url: f.source_url ?? null, is_hypothesis: !sid,
    };
  }).filter((f: { fact: string }) => f.fact);
  await ctx.admin.from('campaign_facts').delete().eq('campaign_id', c.id);
  if (facts.length) await ctx.admin.from('campaign_facts').insert(facts);
  let website: string | undefined;
  try {
    const host = a.website ? new URL(String(a.website)).hostname.replace(/^www\./, '') : '';
    const backed = host && (sources ?? []).some((s: { url: string }) => { try { return new URL(s.url).hostname.replace(/^www\./, '') === host; } catch { return false; } });
    if (backed) website = new URL(String(a.website)).origin;
  } catch { /* invalid url → not stored */ }
  await setStage(ctx, c.id, advance(c.stage, 'asset_collection'), {
    ...(website ? { website } : {}),
    audience: a.audience, commercial_angle: a.commercial_angle, angle_rationale: a.angle_rationale, research_summary: a.summary ?? null,
  });
  const cited = facts.filter((f: { is_hypothesis: boolean }) => !f.is_hypothesis).length;
  return { output: { stored_facts: facts.length, website: website ?? (a.website ? 'not stored: no research source on that domain' : undefined), cited_facts: cited, hypotheses: facts.length - cited, note: cited < facts.length ? 'Facts without a stored source_url were saved as hypotheses.' : undefined } };
}

async function collectAssets(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const [{ data: brand }, { data: media }] = await Promise.all([
    ctx.admin.from('brand_kits').select('logo_url, brand_name').eq('user_id', ctx.userId).eq('is_active', true).is('archived_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ctx.admin.from('media_library').select('id, file_url, file_name, file_type, description').eq('user_id', ctx.userId)
      .order('created_at', { ascending: false }).limit(20),
  ]);
  const own: Record<string, unknown>[] = [];
  const brandMatches = brand?.brand_name && norm(brand.brand_name).includes(norm(c.company_name).split(' ')[0] ?? '');
  if (brand?.logo_url && brandMatches) {
    own.push({ campaign_id: c.id, user_id: ctx.userId, url: brand.logo_url, kind: 'brand_kit', source_url: null, reuse_status: 'reuse_ok', owner_note: 'Logo from the user\'s own brand kit.' });
  }
  for (const m of media ?? []) {
    if (!m.file_url) continue;
    own.push({ campaign_id: c.id, user_id: ctx.userId, url: m.file_url, kind: 'adtool_media', media_library_id: m.id, source_url: null, reuse_status: 'reuse_ok', owner_note: `User's own Media Library item: ${m.file_name ?? ''}` });
  }
  if (own.length) await ctx.admin.from('campaign_assets').upsert(own, { onConflict: 'campaign_id,url', ignoreDuplicates: true });
  const { data: assets } = await ctx.admin.from('campaign_assets').select('id, url, kind, source_url, reuse_status, owner_note').eq('campaign_id', c.id).order('created_at');
  await setStage(ctx, c.id, advance(c.stage, 'asset_collection'));
  return {
    output: {
      assets: (assets ?? []).slice(0, 40),
      counts: {
        reuse_ok: (assets ?? []).filter((x: { reuse_status: string }) => x.reuse_status === 'reuse_ok').length,
        reference_only: (assets ?? []).filter((x: { reuse_status: string }) => x.reuse_status === 'reference_only').length,
      },
      rule: 'Public web images are reference_only and must not appear in a final deliverable. User Media Library items are the user\'s own; check they fit this business before using them.',
    },
  };
}

async function storePillars(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const list = (Array.isArray(a.pillars) ? a.pillars : []).slice(0, 12);
  if (list.length < 3) return err('INVALID', 'Provide at least 3 pillars.');
  const rows = [...list].sort((x: Args, y: Args) => x.rank - y.rank).map((p: Args, i: number) => ({
    campaign_id: c.id, user_id: ctx.userId, name: String(p.name).slice(0, 120), rank: i + 1, relevance: p.relevance ?? null,
    evidence_urls: Array.isArray(p.evidence_urls) ? p.evidence_urls.slice(0, 6) : [],
  }));
  await ctx.admin.from('campaign_pillars').delete().eq('campaign_id', c.id);
  const { error } = await ctx.admin.from('campaign_pillars').insert(rows);
  if (error) return err('DB_ERROR', error.message);
  return { output: { pillars: rows.map((r: { rank: number; name: string }) => ({ rank: r.rank, name: r.name })) } };
}

async function storeAreas(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const seen = new Set<string>();
  const rows = (Array.isArray(a.areas) ? a.areas : []).filter((x: Args) => x?.area && !seen.has(x.area) && seen.add(x.area)).map((x: Args) => ({
    campaign_id: c.id, user_id: ctx.userId, area: x.area, relevance: Math.max(0, Math.min(1, Number(x.relevance) || 0)),
    rationale: x.rationale ?? null, evidence_urls: Array.isArray(x.evidence_urls) ? x.evidence_urls.slice(0, 6) : [],
  }));
  await ctx.admin.from('campaign_business_areas').delete().eq('campaign_id', c.id);
  const { error } = await ctx.admin.from('campaign_business_areas').insert(rows);
  if (error) return err('DB_ERROR', error.message);
  return { output: { relevant_areas: rows.filter((r: { relevance: number }) => r.relevance >= 0.5).map((r: { area: string }) => r.area) } };
}

interface JudgeVerdict { same_concept: boolean; reason: string }

async function judgePair(ctx: ToolContext, A: PlannedVideo, B: PlannedVideo): Promise<JudgeVerdict> {
  const describe = (v: PlannedVideo) =>
    `concept: ${v.concept}\nhook: ${v.hook_type} — ${v.hook_text}\ncta: ${v.cta}\nhero_subject: ${v.hero_subject}\nmain_message: ${v.main_message}\nshots: ${v.shot_structure.join(' > ')}`;
  try {
    const res = await createMuseResponse(ctx.museConfig, {
      instructions:
        'You check an ad campaign for near-duplicate videos. Two videos are the SAME concept if a viewer would perceive them as the same ad idea reworded (e.g. "Best brunch in town" vs "Your new favorite brunch spot"). Different products, audiences, emotions or funnel goals make them distinct. Reply ONLY with JSON {"same_concept": boolean, "reason": string}.',
      input: [{ role: 'user', content: `VIDEO A\n${describe(A)}\n\nVIDEO B\n${describe(B)}` }],
    });
    const m = res.outputText.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    if (parsed && typeof parsed.same_concept === 'boolean') return { same_concept: parsed.same_concept, reason: String(parsed.reason ?? '') };
  } catch (_e) { /* fall through */ }
  // Unable to judge: be conservative only when very close.
  return { same_concept: false, reason: 'judge_unavailable' };
}

function toVideo(v: Args): PlannedVideo {
  return {
    index: Number(v.index), title: String(v.title ?? ''), concept: String(v.concept ?? ''), pillar: String(v.pillar ?? ''),
    business_area: String(v.business_area ?? ''), funnel_stage: String(v.funnel_stage ?? ''), target_audience: String(v.target_audience ?? ''),
    emotional_angle: String(v.emotional_angle ?? ''), commercial_objective: String(v.commercial_objective ?? ''), primary_goal: String(v.primary_goal ?? ''),
    hook_type: String(v.hook_type ?? ''), hook_text: String(v.hook_text ?? ''), cta: String(v.cta ?? ''), visual_style: String(v.visual_style ?? ''),
    hero_subject: String(v.hero_subject ?? ''), main_message: String(v.main_message ?? ''),
    shot_structure: Array.isArray(v.shot_structure) ? v.shot_structure.map(String) : [], rationale: String(v.rationale ?? ''),
    series_key: v.series_key ? String(v.series_key) : null,
  };
}

/** Plans with production attempts are frozen: re-planning would delete shots that already have outputs. */
async function productionLocked(ctx: ToolContext, campaignId: string): Promise<boolean> {
  const { count } = await ctx.admin.from('campaign_shot_attempts').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId);
  return (count ?? 0) > 0;
}
const LOCKED = () => err('PLAN_LOCKED', 'This campaign already has production attempts. Its videos and shots are not replanned so existing outputs stay intact.');

async function planVideos(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  if (await productionLocked(ctx, c.id)) return LOCKED();
  const videos: PlannedVideo[] = (Array.isArray(a.videos) ? a.videos : []).map(toVideo);
  const [{ data: pillars }, { data: areas }] = await Promise.all([
    ctx.admin.from('campaign_pillars').select('name, rank').eq('campaign_id', c.id),
    ctx.admin.from('campaign_business_areas').select('area, relevance').eq('campaign_id', c.id),
  ]);
  if (!pillars?.length) return err('PREREQUISITE', 'Call identify_content_pillars first.');
  if (!areas?.length) return err('PREREQUISITE', 'Call identify_business_areas first.');

  const pillarNames = new Set(pillars.map((p: { name: string }) => norm(p.name)));
  const violations = validateShape(videos, c.requested_video_count);
  for (const v of videos) {
    if (!pillarNames.has(norm(v.pillar))) violations.push({ rule: 'unknown_pillar', videos: [v.index], detail: `Video ${v.index}: pillar "${v.pillar}" is not one of the stored pillars.` });
  }
  const relevantAreas = areas.filter((x: { relevance: number }) => Number(x.relevance) >= 0.5).length;
  violations.push(...exactDiversityRules(videos, { pillarCount: pillars.length, relevantAreaCount: relevantAreas }));

  const round = c.plan_revision_round + 1;
  const tooSimilar: { a: number; b: number; reason: string }[] = [];
  let semanticError: string | null = null;

  if (!violations.some((v) => ['video_count', 'missing_field', 'index'].includes(v.rule)) && videos.length > 1) {
    try {
      const texts: string[] = [];
      const keys: string[] = [];
      for (const v of videos) for (const d of SIMILARITY_DIMENSIONS) { keys.push(`${v.index}:${d}`); texts.push(dimensionText(v, d)); }
      const vecs = await embedTexts(texts);
      const map = new Map<string, number[]>(keys.map((k, i) => [k, vecs[i]]));
      const pairs = assessPairs(videos, map);
      const byIdx = new Map(videos.map((v) => [v.index, v]));
      const judged = await Promise.all(pairs.map(async (p) => ({ p, judge: p.borderline ? await judgePair(ctx, byIdx.get(p.a)!, byIdx.get(p.b)!) : null })));
      const rows = judged.map(({ p, judge }) => {
        const dup = p.hardHits.length > 0 || judge?.same_concept === true;
        const reason = p.hardHits.length ? `Too similar on: ${p.hardHits.join(', ')}` : judge?.same_concept ? `Same concept: ${judge.reason}` : null;
        if (dup) tooSimilar.push({ a: p.a, b: p.b, reason: reason! });
        return {
          campaign_id: c.id, user_id: ctx.userId, revision_round: round, video_a: p.a, video_b: p.b,
          scores: p.scores, judge, verdict: dup ? 'too_similar' : 'distinct', reason,
        };
      });
      if (rows.length) await ctx.admin.from('campaign_similarity_checks').insert(rows);
    } catch (e) {
      semanticError = (e as Error).message;
    }
  }
  if (semanticError) {
    // Fail closed: never accept a plan whose semantic check could not run.
    return err('SIMILARITY_CHECK_UNAVAILABLE', 'The duplicate check could not run; plan not stored. Try again shortly.', { detail: semanticError.slice(0, 300) });
  }
  for (const t of tooSimilar) violations.push({ rule: 'semantic_duplicate', videos: [t.a, t.b], detail: `Videos ${t.a} and ${t.b}: ${t.reason}. Revise one of them.` });

  const passed = violations.length === 0;
  const exhausted = !passed && round >= MAX_REVISION_ROUNDS;
  await ctx.admin.from('agent_campaigns').update({ plan_revision_round: round }).eq('id', c.id);

  if (!passed && !exhausted) {
    return { output: { accepted: false, revision_round: round, rounds_left: MAX_REVISION_ROUNDS - round, violations } };
  }

  // Persist (passed, or exhausted → stored but flagged for the user).
  const cov = coverageScore({
    videos, pillars, areas: areas.map((x: { area: string; relevance: number }) => ({ area: x.area, relevance: Number(x.relevance) })), tooSimilarPairs: tooSimilar.length,
  });
  const rows = videos.map((v) => ({
    campaign_id: c.id, user_id: ctx.userId, video_index: v.index, title: v.title, concept: v.concept, pillar: v.pillar,
    business_area: v.business_area, funnel_stage: v.funnel_stage, target_audience: v.target_audience, emotional_angle: v.emotional_angle,
    commercial_objective: v.commercial_objective, primary_goal: v.primary_goal, hook_type: v.hook_type, hook_text: v.hook_text, cta: v.cta,
    visual_style: v.visual_style, hero_subject: v.hero_subject, main_message: v.main_message, shot_structure: v.shot_structure,
    rationale: v.rationale, series_key: v.series_key, script: null,
  }));
  await ctx.admin.from('campaign_videos').delete().eq('campaign_id', c.id).gt('video_index', videos.length);
  const { error } = await ctx.admin.from('campaign_videos').upsert(rows, { onConflict: 'campaign_id,video_index' });
  if (error) return err('DB_ERROR', error.message);
  // Shots are kept (stable ids); write_video_scripts updates them in place and
  // marks only shots whose routing-relevant fields changed as routing_stale.

  const explanation = `${String(a.campaign_explanation ?? '').slice(0, 2000)}\n\nCovered pillars: ${cov.coveredPillars.join(', ') || '-'}; missed top pillars: ${cov.missedTopPillars.join(', ') || 'none'}. Covered business areas: ${cov.coveredAreas.join(', ') || '-'}; missed relevant areas: ${cov.missedRelevantAreas.join(', ') || 'none'}.`;
  await setStage(ctx, c.id, advance(c.stage, 'script'), {
    coverage_score: cov.score, coverage_breakdown: cov.breakdown, coverage_explanation: explanation,
    needs_user_review: exhausted, review_reason: exhausted ? violations.map((v) => v.detail).join(' | ').slice(0, 2000) : null,
  });
  return {
    output: {
      accepted: passed,
      flagged_for_user: exhausted,
      unresolved_violations: exhausted ? violations : undefined,
      coverage_score: cov.score,
      coverage: cov,
      next: 'write_video_scripts (batch all videos in one call if possible)',
    },
  };
}

async function writeScripts(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  if (await productionLocked(ctx, c.id)) return LOCKED();
  const { data: vids } = await ctx.admin.from('campaign_videos').select('id, video_index').eq('campaign_id', c.id);
  if (!vids?.length) return err('PREREQUISITE', 'Call plan_campaign_videos first.');
  const { data: assetRows } = await ctx.admin.from('campaign_assets').select('id').eq('campaign_id', c.id);
  const assetIds = new Set((assetRows ?? []).map((x: { id: string }) => x.id));
  const byIdx = new Map<number, string>(vids.map((v: { id: string; video_index: number }) => [v.video_index, v.id]));

  const results: Record<string, unknown>[] = [];
  for (const item of Array.isArray(a.videos) ? a.videos : []) {
    const vid = byIdx.get(Number(item.video_index));
    if (!vid) { results.push({ video_index: item.video_index, stored: false, errors: ['Unknown video_index.'] }); continue; }
    const shots = (Array.isArray(item.shots) ? item.shots : []).map((s: Args) => ({ ...s, start_s: Number(s.start_s), end_s: Number(s.end_s) }));
    const errors = validateShots(shots, c.video_duration_s);
    const timing = item.script?.timing ?? [];
    if (!item.script?.voiceover?.trim()) errors.push('Script voiceover is empty.');
    if (Array.isArray(timing) && timing.length) {
      const end = Math.max(...timing.map((t: Args) => Number(t.end_s) || 0));
      if (Math.abs(end - c.video_duration_s) > 1) errors.push(`Script timing ends at ${end} s; video is ${c.video_duration_s} s.`);
    }
    if (errors.length) { results.push({ video_index: item.video_index, stored: false, errors }); continue; }
    await ctx.admin.from('campaign_videos').update({ script: item.script }).eq('id', vid);
    // Update in place by shot_index: ids, routing and cost of unchanged shots survive.
    const { data: existing } = await ctx.admin.from('campaign_shots')
      .select('id, shot_index, start_s, end_s, purpose, shot_type, subject_emphasis, description, on_screen_text, voiceover, asset_id, routing_fingerprint, selected_model, attempt_count, current_generation_id')
      .eq('video_id', vid);
    const incoming: ShotPlanFields[] = shots.map((s: Args) => ({
      start_s: s.start_s, end_s: s.end_s, purpose: String(s.purpose), shot_type: String(s.shot_type),
      subject_emphasis: String(s.subject_emphasis), description: String(s.description),
      on_screen_text: s.on_screen_text ?? null, voiceover: s.voiceover ?? null,
      asset_id: s.asset_id && assetIds.has(s.asset_id) ? s.asset_id : null,
    }));
    const save = planShotSave((existing ?? []) as ExistingShot[], incoming);
    for (const u of save.updates) {
      await ctx.admin.from('campaign_shots').update({
        ...u.fields,
        ...(u.stale ? { routing_stale: true, status: 'planned' } : {}),
      }).eq('id', u.id);
    }
    if (save.inserts.length) {
      await ctx.admin.from('campaign_shots').insert(save.inserts.map((f) => ({ ...f, video_id: vid, campaign_id: c.id, user_id: ctx.userId })));
    }
    if (save.deletes.length) await ctx.admin.from('campaign_shots').delete().in('id', save.deletes);
    results.push({
      video_index: item.video_index, stored: true, shots: incoming.length,
      kept_ids: save.updates.filter((u) => !u.stale).length, routing_stale: save.updates.filter((u) => u.stale).map((u) => u.fields.shot_index),
      new_shots: save.inserts.length, removed: save.deletes.length, kept_with_attempts: save.kept.length,
    });
  }
  const { data: withScript } = await ctx.admin.from('campaign_videos').select('id, script').eq('campaign_id', c.id);
  const { data: shotVideos } = await ctx.admin.from('campaign_shots').select('video_id').eq('campaign_id', c.id);
  const shotSet = new Set((shotVideos ?? []).map((s: { video_id: string }) => s.video_id));
  const complete = (withScript ?? []).every((v: { id: string; script: unknown }) => v.script && shotSet.has(v.id));
  await setStage(ctx, c.id, advance(c.stage, complete ? 'plan_ready' : 'shot_planning'));
  return {
    output: {
      results,
      campaign_plan_complete: complete,
      social_research_complete: !!(await loadCampaign(ctx, c.id))?.social_research_complete,
      note: complete ? 'Phase A plan is complete. Nothing has been generated or charged. Paid production is not available yet.' : 'Some videos still need a valid script + shot plan.',
    },
  };
}

// ---------------------------------------------------------------------------
// Social profiles (Instagram, TikTok, Facebook, YouTube)

async function socialState(ctx: ToolContext, campaignId: string) {
  const { data } = await ctx.admin.from('campaign_social_profiles').select('*').eq('campaign_id', campaignId);
  const rows = (data ?? []) as Record<string, any>[];
  const { complete, missing } = computeSocialCompleteness(rows as { platform: string; status: string }[]);
  await ctx.admin.from('agent_campaigns').update({ social_research_complete: complete }).eq('id', campaignId).eq('user_id', ctx.userId);
  return { rows, complete, missing };
}

async function discoverSocial(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const found = await discoverSocialProfiles({ company: c.company_name, website: c.website, location: c.location });
  const { data: existing } = await ctx.admin.from('campaign_social_profiles').select('platform, status').eq('campaign_id', c.id);
  const analyzed = new Set((existing ?? []).filter((r: { status: string }) => r.status === 'analyzed').map((r: { platform: string }) => r.platform));
  const rows = found.platforms
    .filter((p) => !analyzed.has(p.platform)) // never overwrite a finished analysis
    .map((p) => ({
      campaign_id: c.id, user_id: ctx.userId, platform: p.platform, status: p.status, found: p.found, profile_url: p.profile_url,
      discovery_source: p.discovery_source, discovery_via: p.discovery_via, discovery_evidence: p.discovery_evidence, access_note: p.access_note,
    }));
  if (rows.length) await ctx.admin.from('campaign_social_profiles').upsert(rows, { onConflict: 'campaign_id,platform' });
  const srcs = found.platforms.flatMap((p) => p.discovery_evidence.map((e) => e.url));
  const extra = [...new Set([...srcs, ...(found.research?.citations ?? [])])].map((url) => ({
    campaign_id: c.id, user_id: ctx.userId, url, title: 'Social research', excerpt: null,
    via: srcs.includes(url) && !found.research?.citations.includes(url) ? 'firecrawl' : 'perplexity',
  }));
  if (extra.length) await ctx.admin.from('campaign_sources').upsert(extra, { onConflict: 'campaign_id,url', ignoreDuplicates: true });
  const state = await socialState(ctx, c.id);
  return {
    output: {
      campaign_id: c.id,
      platforms: found.platforms.map((p) => ({
        platform: p.platform, status: analyzed.has(p.platform) ? 'analyzed' : p.status, profile_url: p.profile_url,
        found_via: p.discovery_via, found_at: p.discovery_source, access_note: p.access_note,
        public_profile_excerpt: p.public_excerpt?.slice(0, 2500) ?? null,
      })),
      social_research: found.research ? { text: found.research.text.slice(0, 8000), citations: found.research.citations } : null,
      warnings: found.errors,
      social_research_complete: state.complete,
      rule: 'Only analyse what is publicly visible in the excerpts/citations above. not_accessible means the profile exists but is not public — never treat it as absent.',
      next: 'record_social_analysis for every platform with status found_not_analyzed (and optionally public signals for not_accessible).',
    },
  };
}

async function recordSocial(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const { data: existing } = await ctx.admin.from('campaign_social_profiles').select('*').eq('campaign_id', c.id);
  const byPlatform = new Map((existing ?? []).map((r: Record<string, any>) => [r.platform, r]));
  const results: Record<string, unknown>[] = [];
  for (const p of Array.isArray(a.platforms) ? a.platforms : []) {
    const row = byPlatform.get(p.platform);
    if (!row) { results.push({ platform: p.platform, stored: false, reason: 'Run discover_social_profiles first.' }); continue; }
    const posts = (Array.isArray(p.recent_posts) ? p.recent_posts : []).slice(0, 10);
    const themes = (Array.isArray(p.content_themes) ? p.content_themes : []).map(String).slice(0, 12);
    let status = row.status as string;
    if (p.status === 'not_accessible' && row.found) status = 'not_accessible';
    else if (p.status === 'analyzed') {
      if (!row.found || !row.profile_url) { results.push({ platform: p.platform, stored: false, reason: 'No discovered profile — cannot be analysed.' }); continue; }
      if (row.status === 'not_accessible') { results.push({ platform: p.platform, stored: false, reason: 'Profile is not publicly accessible — keep it not_accessible.' }); continue; }
      if (!posts.length && !themes.length) { results.push({ platform: p.platform, stored: false, reason: 'An analysis needs at least one public post example or content theme.' }); continue; }
      status = 'analyzed';
    }
    await ctx.admin.from('campaign_social_profiles').update({
      status, recent_posts: posts, content_themes: themes, visual_style: p.visual_style ?? null,
      strongest_formats: p.strongest_formats ?? null, performance_signals: p.performance_signals ?? null,
      content_gaps: (Array.isArray(p.content_gaps) ? p.content_gaps : []).map(String).slice(0, 12),
      access_note: p.access_note ?? row.access_note, analyzed_at: status === 'analyzed' ? new Date().toISOString() : row.analyzed_at,
    }).eq('id', row.id);
    results.push({ platform: p.platform, stored: true, status });
  }
  const state = await socialState(ctx, c.id);
  return {
    output: {
      results,
      social_research_complete: state.complete,
      missing_platforms: state.missing,
      note: state.complete
        ? 'Social research complete: every major platform is analysed or explicitly marked not_found / not_accessible.'
        : `Social research NOT complete — do not claim full social analysis. Missing: ${state.missing.join(', ')}.`,
    },
  };
}

async function getCampaign(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a?.campaign_id);
  if (!c) return err('NOT_FOUND', 'No campaign in this chat yet.');
  const [sources, facts, assets, pillars, areas, videos, shots, social] = await Promise.all([
    ctx.admin.from('campaign_sources').select('url, title, via').eq('campaign_id', c.id),
    ctx.admin.from('campaign_facts').select('category, fact, source_url, is_hypothesis').eq('campaign_id', c.id),
    ctx.admin.from('campaign_assets').select('id, url, kind, reuse_status').eq('campaign_id', c.id),
    ctx.admin.from('campaign_pillars').select('name, rank, relevance').eq('campaign_id', c.id).order('rank'),
    ctx.admin.from('campaign_business_areas').select('area, relevance').eq('campaign_id', c.id),
    ctx.admin.from('campaign_videos').select('*').eq('campaign_id', c.id).order('video_index'),
    ctx.admin.from('campaign_shots').select('video_id, shot_index, start_s, end_s, purpose, shot_type, description, on_screen_text').eq('campaign_id', c.id).order('shot_index'),
    ctx.admin.from('campaign_social_profiles').select('platform, status, profile_url, discovery_via, access_note, content_themes, visual_style, strongest_formats, content_gaps').eq('campaign_id', c.id),
  ]);
  return {
    output: {
      campaign: {
        id: c.id, company: c.company_name, website: c.website, goal: c.goal, stage: c.stage, language: c.language,
        video_count: c.requested_video_count, duration_s: c.video_duration_s, audience: c.audience, commercial_angle: c.commercial_angle,
        coverage_score: c.coverage_score, needs_user_review: c.needs_user_review,
        social_research_complete: c.social_research_complete,
      },
      sources: sources.data, facts: facts.data, assets: (assets.data ?? []).slice(0, 30), pillars: pillars.data, business_areas: areas.data, social_profiles: social.data,
      videos: (videos.data ?? []).map((v: Record<string, any>) => ({
        ...v, shots: (shots.data ?? []).filter((s: { video_id: string }) => s.video_id === v.id),
      })),
    },
  };
}

export async function executeCampaignTool(ctx: ToolContext, name: string, args: Args): Promise<ToolResult | null> {
  switch (name) {
    case 'create_campaign': return await createCampaign(ctx, args ?? {});
    case 'research_business': return await researchTool(ctx, args ?? {});
    case 'record_research_findings': return await recordFindings(ctx, args ?? {});
    case 'collect_campaign_assets': return await collectAssets(ctx, args ?? {});
    case 'identify_content_pillars': return await storePillars(ctx, args ?? {});
    case 'identify_business_areas': return await storeAreas(ctx, args ?? {});
    case 'plan_campaign_videos': return await planVideos(ctx, args ?? {});
    case 'write_video_scripts': return await writeScripts(ctx, args ?? {});
    case 'discover_social_profiles': return await discoverSocial(ctx, args ?? {});
    case 'record_social_analysis': return await recordSocial(ctx, args ?? {});
    case 'get_campaign': return await getCampaign(ctx, args ?? {});
    case 'route_campaign_shots': return await routeCampaignShots(ctx, args ?? {});
    case 'estimate_campaign_budget': return await estimateCampaignBudget(ctx, args ?? {});
    case 'start_campaign_production': return await startCampaignProduction(ctx, args ?? {});
    case 'review_shot': return await reviewShot(ctx, args ?? {});
    case 'prepare_shot_retry': return await prepareShotRetry(ctx, args ?? {});
    case 'request_retry_approval': return await requestShotRetryApproval(ctx, args ?? {});
    case 'retry_shot': return await retryShot(ctx, args ?? {});
    case 'get_campaign_production_status': return await productionStatus(ctx, args ?? {});
    default: return null;
  }
}
