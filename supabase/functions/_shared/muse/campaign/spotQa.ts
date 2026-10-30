/**
 * Full-spot AI QA + acceptance status (pure).
 * Kept separate from shot QA: never writes model_qa_stats.
 * Technical acceptance and customer-ready status are always derived separately.
 */
import { totalCut, type SpotEdit } from './spot.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export function buildSpotQaPrompt(e: SpotEdit): string {
  const texts = [...e.overlays.map((o) => `${o.start}-${o.end}s "${o.text}"`), ...(e.endcard ? [`endcard "${e.endcard.headline}" / "${e.endcard.cta}"`] : [])];
  return [
    'You review a finished vertical advertisement as a strict QA editor. Judge only what you can see/hear.',
    `Planned length: ${totalCut(e)} s, aspect ${e.aspect}.`,
    `Planned on-screen texts: ${texts.join('; ') || 'none'}.`,
    e.voiceover?.script ? `Planned voiceover (${e.voiceover.language ?? 'de'}): "${e.voiceover.script}"` : 'No voiceover planned.',
    e.logo ? 'An original brand logo should appear during the endcard.' : 'No logo planned.',
    'Review: overall visual continuity; morphing/flicker/artifacts; text readability; subtitle placement and timing; CTA/end-card readability; audio presence; voiceover/music/SFX balance (only if you can hear it); commercial coherence from start to end.',
    'Return JSON only: {"score":0-10,"verdict":"pass"|"needs_work"|"fail","issues":[{"category":"visual|text|subtitle|brand|audio|pacing|logic","severity":"low|medium|high","at_s":number|null,"detail":string}],"audio":{"present":boolean|null,"balance":string|null},"summary":string,"recommendation":string}',
  ].join('\n');
}

export function parseSpotQa(raw: string) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('SPOT_QA_UNPARSEABLE');
  const j = JSON.parse(m[0]);
  const score = Number(j.score);
  if (!Number.isFinite(score) || score < 0 || score > 10) throw new Error('SPOT_QA_BAD_SCORE');
  const verdict = ['pass', 'needs_work', 'fail'].includes(j.verdict) ? j.verdict : 'needs_work';
  const issues = Array.isArray(j.issues) ? j.issues.map((i: Row) => ({ category: String(i.category ?? 'other'), severity: ['low', 'medium', 'high'].includes(i.severity) ? i.severity : 'medium', at_s: typeof i.at_s === 'number' ? i.at_s : null, detail: String(i.detail ?? '') })) : [];
  const by = (cats: string[]) => issues.filter((i: Row) => cats.includes(i.category));
  return {
    score, verdict: verdict as 'pass' | 'needs_work' | 'fail', issues, summary: String(j.summary ?? ''),
    text_branding_issues: by(['text', 'subtitle', 'brand']), audio_issues: by(['audio']),
    audio: { present: typeof j.audio?.present === 'boolean' ? j.audio.present : null, balance: j.audio?.balance ? String(j.audio.balance) : null },
    recommendation: String(j.recommendation ?? ''),
  };
}

/** Technical acceptance = automatic file checks + frame visibility for the same exported revision. */
export function technicalAcceptance(video: Row): { status: 'passed' | 'failed' | 'pending'; revision: number | null; reasons: string[] } {
  const rev = video.export_revision ?? null;
  const tech = video.technical_check, frames = video.frame_check;
  const reasons: string[] = [];
  if (video.export_status !== 'done' || rev !== video.edit_revision) return { status: 'pending', revision: rev, reasons: ['EXPORT_NOT_CURRENT'] };
  if (tech?.revision !== rev) reasons.push('TECHNICAL_CHECK_MISSING');
  if (frames?.revision !== rev) reasons.push('FRAME_CHECK_MISSING');
  if (reasons.length) return { status: 'pending', revision: rev, reasons };
  if (!tech.passed) reasons.push(...(tech.items ?? []).filter((i: Row) => i.ok !== true).map((i: Row) => `TECH_${String(i.key).toUpperCase()}`));
  if (!frames.passed) reasons.push(...(frames.items ?? []).filter((i: Row) => i.status !== 'visible').map((i: Row) => `FRAME_${i.element_id}_${i.status}`));
  return { status: reasons.length ? 'failed' : 'passed', revision: rev, reasons };
}

/** Customer-ready requires every active shot to be visually client-ready — independent of technical acceptance. */
export function customerReady(video: Row, shots: Row[]): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const bad = shots.filter((s) => !s.archived_at && s.visual_client_ready !== true);
  if (bad.length) reasons.push(`SHOTS_NOT_VISUALLY_READY:${bad.length}`);
  if (technicalAcceptance(video).status !== 'passed') reasons.push('TECHNICAL_ACCEPTANCE_NOT_PASSED');
  const rev = video.export_revision;
  if (!(video.final_ai_qa?.revision === rev && video.final_ai_qa?.verdict === 'pass')) reasons.push('AI_QA_NOT_PASSED');
  if (!(video.content_check?.revision === rev && video.content_check?.passed === true)) reasons.push('USER_CONTENT_NOT_CONFIRMED');
  return { ready: reasons.length === 0, reasons };
}
