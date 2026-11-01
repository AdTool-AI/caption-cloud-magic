import { getVisualStyleHint } from "../composer-visual-styles.ts";
import { isQaMockRequest, qaMockJson } from "../qaMock.ts";
import {
  ALL_EFFECT_IDS,
  EFFECT_DESCRIPTIONS,
  getDefaultEffects,
  sanitizeEffects,
  type SceneEffectId,
} from "../composer-effects.ts";
import { tl, withLang } from "../i18n.ts";
import { callBriefingGateway } from "./models.ts";
import { briefingErrorResponse } from "./errors.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-qa-mock",
};

interface ComposerCharacter {
  id: string;
  name: string;
  appearance: string;
  signatureItems: string;
  appearanceFrequency?: 'cameo' | 'balanced' | 'lead';
}

// Maps user-chosen frequency to a (minRatio, maxRatio) of total scenes.
// `balanced` matches the previous default behaviour.
function freqRange(freq?: 'cameo' | 'balanced' | 'lead'): { min: number; max: number } {
  switch (freq) {
    case 'cameo': return { min: 0.15, max: 0.4 };
    case 'lead': return { min: 0.8, max: 1.0 };
    case 'balanced':
    default: return { min: 0.4, max: 0.6 };
  }
}

type VideoMode = 'video' | 'image' | 'mixed';

interface Briefing {
  mode: string;
  productName: string;
  productDescription: string;
  usps: string[];
  targetAudience: string;
  tone: string;
  duration: number;
  aspectRatio: string;
  brandColors: string[];
  visualStyle?: string;
  characters?: ComposerCharacter[];
  videoMode?: VideoMode;
  /** Stock-First hint: prefer free Pexels/Pixabay clips for generic B-roll. */
  preferStock?: boolean;
}

function cleanActionText(value: unknown, maxWords = 25): string {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[-–—:\s]+/, "")
    .trim();
  if (!text) return "";
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") : text;
}

function promptActionFallback(prompt: unknown, maxWords = 25): string {
  const cleaned = String(prompt ?? "")
    .replace(/\[SceneAction\][\s\S]*?\[\/SceneAction\]\s*/gi, "")
    .replace(/\[CastActions\][\s\S]*?\[\/CastActions\]\s*/gi, "")
    .replace(/^Featuring\s+[^:]{1,500}:\s*/i, "")
    .replace(/,\s*no on-screen text[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const firstSentence = cleaned.match(/^[^.!?]+[.!?]?/)?.[0] || cleaned;
  const actionClause = firstSentence.split(/,\s*(?:shot on|camera|lens|lighting|golden hour|soft light|shallow depth|filmic|muted palette|anamorphic|no on-screen)/i)[0];
  return cleanActionText(actionClause || firstSentence, maxWords);
}

/**
 * Extract the action of a SPECIFIC character from a scene prompt.
 *
 * Cast-aware: only returns a clause if it actually mentions this character
 * by name. Never copies another character's action and never falls back to
 * the generic scene action — that would result in every cast slot showing
 * "Sarah looks out the window" when only Sarah was named in the prompt.
 *
 * Returns "" when no character-specific clause can be located; the UI
 * field then stays empty and the user can fill it manually.
 */
function promptCharacterActionFallback(prompt: unknown, characterName: string | undefined): string {
  const body = String(prompt ?? "")
    .replace(/\[SceneAction\][\s\S]*?\[\/SceneAction\]\s*/gi, "")
    .replace(/\[CastActions\][\s\S]*?\[\/CastActions\]\s*/gi, "")
    .replace(/^Featuring\s+[^:]{1,500}:\s*/i, "")
    .replace(/,\s*no on-screen text[\s\S]*$/i, "");
  const name = String(characterName ?? "").trim();
  if (!name) return "";
  const first = name.split(/\s+/)[0]?.toLowerCase() || "";
  if (first.length < 3) return "";
  const lowerBody = body.toLowerCase();
  if (!lowerBody.includes(name.toLowerCase()) && !lowerBody.includes(first)) return "";
  const clauses = body.split(/[.!?]\s+|;\s+|,\s+(?=(?:while|as|and|then|with|beside|next to)\b)/i);
  const match = clauses.find((clause) => {
    const lower = clause.toLowerCase();
    return lower.includes(name.toLowerCase()) || lower.includes(first);
  });
  if (!match) return "";
  return cleanActionText(match, 12);
}

/**
 * Neutral fallback action for a character slot when neither the LLM nor the
 * prompt-clause heuristic produced anything usable. Guarantees the per-slot
 * "AKTION — WAS TUT {NAME}?" field is never empty after storyboard generation.
 */
function neutralCharacterAction(language: string): { en: string; user: string } {
  const en = "performs the scene action naturally, visible to camera";
  const user =
    language === "de" ? tl({ de: "führt die Szenen-Aktion natürlich aus, sichtbar zur Kamera", en: "naturally performs the scene action, visible to the camera", es: "realiza la acción de la escena de forma natural, visible para la cámara" }) :
    language === "es" ? "realiza la acción de la escena con naturalidad, visible a cámara" :
    en;
  return { en, user };
}



const CATEGORY_STRUCTURES: Record<string, string> = {
  "product-ad": `USP-DRIVEN PRODUCT AD — use the AIDA framework. Treat the briefing's "productName" as the product, "usps" as benefits, "targetAudience" as the buyer persona.
1. Hook (3-4s): Attention-grabbing visual that stops scrolling
2. Problem (4-6s): Show the pain point the audience faces
3. Solution (4-6s): Introduce the product as the answer
4. Demo (5-10s): Show the product in action with key features
5. Social Proof (4-6s): Testimonials, numbers, or trust signals
6. CTA (3-5s): Clear call-to-action with urgency`,

  "corporate-ad": `MISSION-DRIVEN CORPORATE FILM — trust-building, brand-led. Treat "productName" as the COMPANY name, "productDescription" as industry/mission, "usps" as core brand messages.
1. Hook (3-5s): Bold brand statement or vision
2. Problem (4-6s): Industry challenge or market need the company addresses
3. Solution (5-8s): Company's unique approach / mission in action
4. Demo (5-10s): Team, services or impact showcase
5. Social Proof (4-6s): Client logos, awards, metrics, longevity
6. CTA (3-5s): Brand tagline + next step (visit, contact, join)`,

  storytelling: `NARRATIVE STORYTELLING — 3-act emotional arc, NO ad copy. Treat "productName" as the STORY TITLE, "productDescription" as the logline/setting, "usps" as key beats/scenes, "targetAudience" as the protagonist + conflict (parsed from "Protagonist: X | Conflict: Y") combined with the target emotion. Build a real story with character, tension and emotional payoff. Avoid sales language entirely. 🚨 NO TEXT OVERLAYS AT ALL — the textOverlayText field MUST be an empty string "" for every single scene. Storytelling lebt rein von Bildsprache, Atmosphäre, Schauspiel und Schnitt — keine Schrift, keine Untertitel, keine Datums-/Ort-Inserts, keine Title-Cards, keine Lower-Thirds. Der Zuschauer soll den Film SEHEN, nicht LESEN.
ACT 1 — SETUP (≈25% of duration): Introduce protagonist and world. Establish tone and stakes.
ACT 2 — CONFRONTATION (≈50% of duration): Inciting incident → rising conflict → midpoint twist → crisis. Multiple scenes here.
ACT 3 — RESOLUTION (≈25% of duration): Climax → emotional payoff → final image that lingers.
Use sceneType values loosely — map "hook"=opening, "problem"=conflict beats, "solution"=turning point, "demo"=climax, "social-proof"=emotional payoff, "cta"=final image.`,

  custom: `FREE EDITOR MODE — follow the user's free description as literally as possible. Treat "productName" as the title, "productDescription" as the user's full creative brief (TOP PRIORITY — the storyboard must reflect it scene-by-scene), "usps" as optional style hints. Do NOT impose AIDA or any fixed framework. Generate scenes that mirror the user's description in order. Text overlays only if the brief implies them.`,
};

export function handleStoryboard(
  req: Request,
  preparsedBody?: Record<string, unknown>,
): Promise<Response> {
  return withLang(req, () => (async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "compose-video-storyboard" });
  }

  try {
    const { briefing, category, language } = (preparsedBody ?? await req.json()) as unknown as {
      briefing: Briefing;
      category: string;
      language: string;
    };

    if (!briefing?.productName) {
      return new Response(JSON.stringify({ error: "productName is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const structure = CATEGORY_STRUCTURES[category] || CATEGORY_STRUCTURES["custom"];
    const targetSceneCount = Math.max(4, Math.min(10, Math.round(briefing.duration / 8)));

    const langLabel = language === "de" ? "German" : language === "es" ? "Spanish" : "English";

    // Tone → visual styling translation (drives lighting/lens/look)
    const toneStyling: Record<string, string> = {
      professional: 'clean key light, neutral white-balance, 50mm lens, subtle dolly, restrained composition',
      energetic: 'handheld camera, neon practicals, rapid push-ins, high-contrast color, 24mm wide lens',
      emotional: 'soft window light, shallow depth of field, 85mm portrait lens, slow motion, golden hour warmth',
      funny: 'bright even light, playful primary colors, snap-zoom punch-ins, whip pans, 35mm lens',
      luxury: 'low-key chiaroscuro, marble & gold textures, slow orbit, 50mm anamorphic, deep blacks',
      minimal: 'single hard light source, monochrome palette, locked-off composition, 50mm lens, generous negative space',
      dramatic: 'top-down rim light, smoke, low angle, 35mm anamorphic with lens flares, slow dolly-in',
      friendly: 'soft daylight, pastel palette, eye-level composition, 35mm lens, gentle handheld breathing',
    };
    const toneLook = toneStyling[briefing.tone] || toneStyling.professional;

    // Visual style — applied uniformly to every scene for visual consistency.
    const visualStyleId = briefing.visualStyle || 'realistic';
    const visualStyleHint = getVisualStyleHint(visualStyleId);
    const styleDirective = visualStyleHint
      ? `\n\n🎨 GLOBAL VISUAL STYLE (HIGHEST PRIORITY — applied to ALL scenes for visual consistency):\nEvery aiPrompt MUST be written in the "${visualStyleId}" visual style. Style clause: "${visualStyleHint.replace(/^,\s*/, '')}". This style overrides realism defaults — for example, "comic" means flat ink-and-color illustration (NOT photoreal), "anime" means hand-drawn 2D animation, "claymation" means stop-motion clay puppets, "pixel-art" means 16-bit sprites. Treat humans, products and environments consistently in this style across ALL scenes. Do NOT mix styles between scenes.`
      : '';

    // Per scene-type structural hints — PRODUCT-IN-SCENE, NOT PRODUCT-AS-SCENE
    const sceneTypeHints = `Scene-type visual templates (product MUST appear within a real-world human moment, not isolated):
- hook: emotional human moment that stops the scroll — a person in a relatable situation, product visible but in context (held in hand, in pocket, on the table next to them, on the desk while they work). NEVER an isolated product macro on a plain background.
- problem: medium shot of a frustrated/struggling person in their real environment · low-key light · cool tint · NO product yet (this is the pain scene)
- solution: reveal moment where the person discovers / picks up / uses the product for the first time — product ENTERS the scene through human action (hand reaching in, unboxing, switching it on). Product is NOT standing alone.
- demo: a real person actively USING the product in a real environment — show the result/benefit on their face and surroundings, not just the product spinning. ⚠️ If (and only if) the briefing truly demands a clean product beauty-shot, this is the ONE scene allowed to be an isolated hero — but prefer hands-in-frame even here.
- social-proof: real people in real settings reacting to / holding / wearing / talking about the product — testimonial or candid lifestyle framing · 85mm · soft natural light · shallow depth
- cta: wide hero shot of person + product together in their world (lifestyle final frame), brand color dominant in environment — NEVER product alone on background or gradient`;

    const systemPrompt = `You are a senior cinematographer + video ad director. You write professional, production-ready storyboards for short-form video ads. Your AI prompts must read like real cinematography directions, not generic descriptions.

Hard rules:
- Each scene 3-15 seconds; total ≈ ${briefing.duration}s; create ${targetSceneCount} scenes (±1)
- Transitions in English (enum)

🚨 TEXT OVERLAY BAN (ABSOLUTE — applies to ALL categories):
textOverlayText MUST be "" (empty string) for EVERY single scene. textAnimation MUST be "none".
Reason: text overlays, hooks, CTAs and subtitles are added LATER in the editor by the user — never by the storyboard AI. The storyboard only describes footage, never on-screen text. No exceptions, no dates, no place names, no dialogue cards, no chapter titles, no hooks, no CTAs.

🚨 NO BURNED-IN TEXT RULE (ABSOLUTE — overrides everything else):
The video clips are generated independently and we apply our OWN subtitles, captions and text overlays in a later editing step. Therefore the AI-generated footage MUST NEVER contain any readable text, captions, subtitles, watermarks, logos, signs with words, UI overlays, lower-thirds, typography or written language of any kind. Every aiPrompt MUST end with the exact negative clause defined in rule 10 below. Never quote on-screen text inside the prompt.

🚨 PRODUCT INTEGRATION RULES (HIGHEST PRIORITY — overrides anything else):
A. The SUBJECT of the MAJORITY of scenes must be a HUMAN or a LIFE SITUATION — NOT the product alone. The product appears WITHIN the scene, integrated into the action.
B. Maximum ratio: at most ONE out of every four scenes may be a pure isolated product hero-shot. All other scenes must show the product in use / in context / in a human's hands / in an environment.
C. Every aiPrompt MUST explicitly describe HOW the product is embedded in the scene (e.g. "in the hands of a jogging woman at sunrise", "on the kitchen counter next to a cooking family", "in the backpack of a hiker overlooking the valley", "on the desk while she takes a video call").
D. ANTI-PATTERNS — strictly avoid these phrasings unless writing the single allowed hero scene: "product floating", "product rotating on white", "product on pedestal", "isolated product shot", "product hero on gradient", "product spinning in empty space", "product on plain background".

AI prompt requirements (CRITICAL — every aiPrompt MUST contain ALL of these):
1. SUBJECT: a person or life situation (per Rule A) — concrete, with role/age/mood, in a specific environment. Product is mentioned as part of the scene, not as the subject itself.
2. ACTION: what the person is doing AND how they interact with the product
3. CAMERA: angle + movement (e.g. "low angle slow dolly-in", "overhead static", "handheld whip pan")
4. LENS: focal length or framing (e.g. "shot on 35mm anamorphic", "macro lens", "85mm portrait")
5. LIGHTING: direction + quality + color temp (e.g. "golden hour key from camera left, soft fill")
6. MOOD/STYLE: cinematic look (e.g. "shallow depth of field, filmic grain, muted Kodak Portra palette")
7. TONE-DRIVEN LOOK for "${briefing.tone}" → ${toneLook}
8. ENVIRONMENT: explicit real-world setting (kitchen, sidewalk, café, bedroom, gym, office, park...) — never "studio" or "white background" except for the single allowed hero scene
9. Length: minimum 50 words per aiPrompt — aim for 60-80
10. Always end aiPrompt with: ", no on-screen text, no captions, no subtitles, no watermarks, no logos, no isolated product on plain background, no floating product, no product rotating in empty space" (CRITICAL — prevents AI from burning text or generating isolated product shots)
11. Never include any quoted on-screen text in the aiPrompt itself

ACTION FIELD REQUIREMENTS (CRITICAL — these drive editable manual override fields):
- For EVERY scene, set sceneActionEn to a concise English action summary matching the aiPrompt (max 25 words). It answers: "What generally happens in this scene?"
- For EVERY scene, set sceneActionLocalized to the same action in ${langLabel}, faithful to sceneActionEn. If language is English, it can equal sceneActionEn.
- For every visible characterShots[] slot, set actionEn/actionUser. actionEn is what this exact character physically does in the scene in English (max 12 words). actionUser is the faithful ${langLabel} version for the manual UI field.
- These action fields MUST be extracted from / agree with aiPrompt. Do not create conflicting actions and never leave action fields empty when a cast member is visible.

${sceneTypeHints}

${(() => {
  const chars = (briefing.characters || []).filter(c => c.name && (c.appearance || c.signatureItems));
  if (chars.length === 0) {
    // No characters defined → original constraint applies (each scene self-contained)
    return `🚨 CHARACTER CONSISTENCY CONSTRAINT (CRITICAL — technical limitation):
Each scene is generated INDEPENDENTLY by a separate AI video model call (Hailuo / Kling / Sora). There is NO character/face consistency between scenes — the model cannot remember a person from a previous scene. Therefore:
- NEVER reference "the same person", "she from before", "he again", "the woman from scene 1", "our protagonist returns"
- NEVER use pronouns or phrases that imply continuity across scenes ("she continues", "he then…", "later that day she…", "now smiling at the camera")
- Each scene MUST describe its human subject FRESH and SELF-CONTAINED — re-state age, gender, appearance, clothing, ethnicity hints, setting — as if the viewer has never seen them before
- If a recurring TYPE of person is desired (e.g. always a young professional woman), describe the ARCHETYPE generically in each scene (e.g. "a young professional woman in business casual, late 20s, warm smile") — but never claim it's the same individual
- Treat the storyboard as a MONTAGE / MOOD-BOARD of standalone shots that share a vibe, NOT as a continuous narrative with one persistent protagonist
- Variation between scenes' people is expected and fine — do not try to lock identity`;
  }

  // Characters defined → switch to SMART SHOT VARIATION strategy
  const charList = chars.map(c => {
    const appearance = c.appearance ? `appearance="${c.appearance}"` : 'appearance=(none provided)';
    const items = c.signatureItems ? `signatureItems="${c.signatureItems}"` : 'signatureItems=(none provided)';
    const freq = c.appearanceFrequency || 'balanced';
    const r = freqRange(freq);
    const minS = Math.max(1, Math.ceil(targetSceneCount * r.min));
    const maxS = Math.max(minS, Math.floor(targetSceneCount * r.max));
    return `  • id="${c.id}" name="${c.name}" — ${appearance}, ${items}, frequency="${freq}" (target ${minS}–${maxS} of ${targetSceneCount} scenes)`;
  }).join('\n');

  return `🎭 SMART CHARACTER USAGE (the user defined recurring characters):
Each AI video scene is generated INDEPENDENTLY — exact face identity between scenes is technically impossible. Use the "Sherlock Holmes effect": the AI is reliable at repeating CLOTHING and OBJECTS but unreliable at faces, so we lean on signatureItems as the visual anchor whenever the character actually appears.

Available characters:
${charList}

CHARACTER-AS-ANCHOR PHILOSOPHY (read carefully):
- The character is a recurring NARRATIVE ANCHOR. They MUST appear in a meaningful share of scenes.
- 🚨 USER-CHOSEN FREQUENCY: Each character has a "frequency" tag — \`cameo\` (1–2 scenes only, ≈15–40%), \`balanced\` (40–60%, the default), or \`lead\` (80–100%, almost every scene). RESPECT THE TARGET RANGE listed for each character. Do NOT exceed the upper bound for cameo characters and do NOT fall below the lower bound for any character.
- Beyond the minimum, you may also include environmental, product, or atmospheric scenes WITHOUT the character — but those are the supporting cast, not the majority.

WHEN you do feature the character, vary the framing across those scenes (no quotas — just variety):
- "full": full character visible (rare — reserve for 1, maybe 2 hero/establishing moments). Include BOTH appearance + signatureItems verbatim at the start of aiPrompt.
- "profile" / "back" / "silhouette": indirect view (side-profile from distance, over-the-shoulder, back-shot, gegenlicht). Include ONLY signatureItems verbatim — omit appearance.
- "detail": detail framing (just the eyes, just the hands holding an object, just the feet). Include ONLY the relevant body part + 1 matching signature item.
- "pov": point-of-view of the character (we see what they see — character not visible at all). Include 1 signature item naturally present in their visual field if possible.

CRITICAL RULES:
- 🚨 The character MUST appear within their per-character target range (see "frequency" tag in the list above). For \`cameo\` aim for the LOW end (1–2 scenes only). For \`lead\` aim for the HIGH end. Never return a storyboard where a character is absent from every scene.
- Prefer the Hook and CTA scenes as character anchors unless the brief explicitly says otherwise.
- Never put the character in two consecutive scenes with the same shotType. When the character does appear, vary the framing.
- ALWAYS write signatureItems verbatim when ANY part of the character is visible. This is the visual anchor.
- DO NOT use continuity pronouns ("the same person", "she from before") — consistency comes from repeated signatureItems, not claimed identity.
- For each scene that features a character, set characterShot.characterId to the exact id from the list and characterShot.shotType to the chosen value (this is the PRIMARY slot, kept for backward compatibility).
- ALSO populate characterShots[] with one entry per character actually visible in the scene (1–4 entries). The first entry MUST mirror characterShot. For solo scenes, characterShots has exactly one entry.
- For each visible characterShots[] entry, ALSO set actionEn and actionUser. They must describe what THIS character does in the same scene action already written in aiPrompt.
- For scenes WITHOUT any character, omit characterShot entirely (or set characterId="" + shotType="absent") and leave characterShots empty.

🎭 MULTI-CHARACTER CO-PRESENCE (when ${chars.length} ≥ 2 characters are defined):
- Aim to feature TWO characters together in roughly 30–60% of the character-bearing scenes (occasionally three). The remaining character scenes can be solo for variety.
- Pick co-presence scenes naturally based on the story: shared moments, conversations, parallel actions in the same environment, family/team scenes, etc.
- 🚨 ENSEMBLE REQUIREMENT (HARD): At least ONE scene MUST be an ensemble shot featuring ALL ${chars.length} briefed characters together in a single group composition (max 4 per scene — Nano Banana 2 / Vidu Q2 cast limit). For storyboards with ≥ 6 scenes, provide at least TWO such ensemble scenes. Prefer the Hook or CTA as ensemble anchors. Every ensemble scene follows the LIP-SYNC SAFE GROUP SCENE RULES below.


🚨 LIP-SYNC SAFE GROUP SCENE RULES (HARD REQUIREMENT — applies whenever characterShots[] has 2+ entries):
- Framing MUST be a wide or medium GROUP shot that fits ALL characters in the frame at once. No single-character close-ups, no single-character hero shots when the cast is multi.
- EVERY cast member's FULL FACE must be clearly visible to camera. FORBIDDEN shotTypes for multi-cast scenes: "back", "pov", "detail", "silhouette". Use only "full" or "profile" — and at least ONE character per multi-cast scene MUST be "full".
- Characters MUST be placed side-by-side (left-to-right or in a clear group composition), NEVER stacked behind each other, NEVER one in front blocking another. No occlusion of any face.
- The aiPrompt MUST name EVERY character verbatim in the action body (not only in a leading "Featuring …" header) and give EACH of them a distinct, simultaneous physical action. Never describe only one character while the others are listed as cast.
- The scene MUST establish DIALOGUE INTENT so lip-sync works: either the characters speak with each other (turn-taking, eye contact, reactions) OR each character speaks directly into the camera in clear visible turns. State this explicitly in the prompt ("they talk to each other", "each speaks to camera in turn", "engaged in conversation").
- For EACH characterShots[] entry actionEn MUST be the action of THAT specific character (not the scene's general action and not another character's action). actionUser is the same in ${langLabel}.
- sceneActionEn MUST describe the GROUP situation including ALL character names (e.g. "Sarah, Matthew and Kailee discuss the launch around the desk"), never just one character.
- Do NOT use "the two of them" or pronouns — always restate names.
- Never put the same identical pair in two consecutive scenes with the same shotTypes — vary framing.`;
})()}

Write text overlays separately (in ${langLabel}) — they're rendered as a distinct layer on top of the video.${styleDirective}`;

    const labels = (() => {
      switch (category) {
        case "corporate-ad":
          return { name: "Company", desc: "Industry / Mission", list: "Core messages", audience: "Target audience" };
        case "storytelling":
          return { name: "Story title", desc: "Logline / Setting", list: "Key scenes / Beats", audience: "Protagonist & conflict (+ target emotion)" };
        case "custom":
          return { name: "Title", desc: "Creative brief (follow literally, scene-by-scene)", list: "Style hints", audience: "" };
        default:
          return { name: "Product", desc: "Description", list: "USPs", audience: "Target audience" };
      }
    })();

    const userPrompt = `Create a storyboard for a ${category} video.

${labels.name}: ${briefing.productName}
${labels.desc}: ${briefing.productDescription || "Not provided"}
${labels.list}: ${briefing.usps.length > 0 ? briefing.usps.join(", ") : "Not provided"}
${labels.audience ? `${labels.audience}: ${briefing.targetAudience || "Not provided"}\n` : ""}Tone: ${briefing.tone}
Duration: ${briefing.duration} seconds
Aspect Ratio: ${briefing.aspectRatio}

Structure to follow:
${structure}

🚨 INTEGRATION REQUIREMENT (non-negotiable): The product must appear *within* real-world scenes — used by people, in real environments, in lifestyle moments. The product is part of the story, not the story itself. Avoid isolated product shots entirely, except for AT MOST ONE hero scene if the briefing genuinely calls for a clean beauty-shot. Every other scene must feature a human or life situation with the product integrated naturally.

${(briefing.characters && briefing.characters.length > 0)
  ? `🎭 CHARACTER GUIDANCE: The user defined ${briefing.characters.length} recurring character(s): ${briefing.characters.map(c => `${c.name} [${c.appearanceFrequency || 'balanced'}]`).join(', ')}. STRICTLY follow each character's per-character target scene range from the SMART CHARACTER USAGE block. Cameo = a brief 1–2 scene appearance only (do NOT spam them into every scene). Balanced = 40–60%. Lead = 80–100%. Vary the shotType when the character does appear.`
  : `🚨 INDEPENDENCE REQUIREMENT (non-negotiable): Every scene is rendered by a SEPARATE AI generation with no memory of other scenes. Describe each human subject FROM SCRATCH in each scene — no "same person", no "she/he from before", no continuity pronouns. Treat each scene as a standalone shot in a montage. If you want a recurring type, describe the archetype generically in every scene rather than claiming identity continuity.`}

Generate the storyboard using the create_storyboard function.`;

    // Build the request body once — the model is the only field that changes
    // between the primary attempt and the gemini-2.5-flash fallback below.
    const buildBody = (model: string) => JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "create_storyboard",
            description: "Create a structured video storyboard with scenes",
            parameters: {
              type: "object",
              properties: {
                scenes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      sceneType: {
                        type: "string",
                        enum: ["hook", "problem", "solution", "demo", "social-proof", "cta", "custom"],
                      },
                      durationSeconds: {
                        type: "number",
                        description: "Duration in seconds (3-15)",
                      },
                      aiPrompt: {
                        type: "string",
                        description: "Detailed English prompt for AI video generation. Describe camera angle, subject, motion, lighting, mood.",
                      },
                      sceneActionEn: {
                        type: "string",
                        description: "Concise English summary of the general scene action, faithfully matching aiPrompt, max 25 words.",
                      },
                      sceneActionLocalized: {
                        type: "string",
                        description: `Same scene action as sceneActionEn, localized in ${langLabel} for the editable UI field.`,
                      },
                      stockKeywords: {
                        type: "string",
                        description: "Comma-separated English keywords for stock video search fallback",
                      },
                      textOverlayText: {
                        type: "string",
                        description: `🚨 MUST always be an empty string "". The storyboard AI never writes burned-in text. The user adds text overlays / hooks / CTAs later in the editor. No exceptions, regardless of category.`,
                      },
                      textPosition: {
                        type: "string",
                        enum: ["top", "center", "bottom", "bottom-left", "bottom-right"],
                      },
                      textAnimation: {
                        type: "string",
                        enum: ["none", "fade-in", "scale-bounce", "slide-left", "slide-right", "word-by-word", "glow-pulse"],
                      },
                      transitionType: {
                        type: "string",
                        enum: ["none", "fade", "crossfade", "wipe", "slide", "zoom"],
                      },
                      characterShot: {
                        type: "object",
                        description: "PRIMARY slot — when a recurring character is featured, set characterId to the character's id from the briefing and shotType to the chosen framing strategy. Omit (or shotType=\"absent\") for scenes without any character. When the scene features multiple characters, this MUST mirror characterShots[0].",
                        properties: {
                          characterId: { type: "string" },
                          shotType: {
                            type: "string",
                            enum: ["full", "profile", "back", "detail", "pov", "silhouette", "absent"],
                          },
                        },
                        required: ["characterId", "shotType"],
                        additionalProperties: false,
                      },
                      characterShots: {
                        type: "array",
                        description: "Multi-character cast for this scene. 1 entry for solo, 2–4 entries when several recurring characters share the frame. The first entry MUST equal characterShot. Leave empty for scenes without any character.",
                        maxItems: 4,
                        items: {
                          type: "object",
                          properties: {
                            characterId: { type: "string" },
                            shotType: {
                              type: "string",
                              enum: ["full", "profile", "back", "detail", "pov", "silhouette", "absent"],
                            },
                            actionEn: {
                              type: "string",
                              description: "What this exact character physically does in this scene, English, max 12 words, matching aiPrompt.",
                            },
                            actionUser: {
                              type: "string",
                              description: `Same character action localized in ${langLabel} for the editable UI field.`,
                            },
                          },
                          required: ["characterId", "shotType"],
                          additionalProperties: false,
                        },
                      },
                      effects: {
                        type: "array",
                        description: `Pick 1-2 frame-deterministic visual effects to layer above this scene's clip/image. Available effects: ${ALL_EFFECT_IDS.map(id => `"${id}" (${EFFECT_DESCRIPTIONS[id]})`).join('; ')}. Match effect to scene type & visual style. Use "intensity" 0.3-0.7 for subtle, 0.7-1.0 for hero moments.`,
                        maxItems: 2,
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string", enum: [...ALL_EFFECT_IDS] },
                            intensity: { type: "number", minimum: 0, maximum: 1 },
                          },
                          required: ["id", "intensity"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["sceneType", "durationSeconds", "aiPrompt", "stockKeywords", "textOverlayText", "textPosition", "textAnimation", "transitionType"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["scenes"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "create_storyboard" } },
    });

    // One shared provider contract + one shared, localised error surface for the
    // whole briefing pipeline (see _shared/briefing/models.ts).
    let response: Response;
    try {
      const attempt = await callBriefingGateway(
        (model) => JSON.parse(buildBody(model)),
        "storyboard",
      );
      response = attempt.response;
    } catch (gwErr: any) {
      const status = gwErr?.status === 429 || gwErr?.status === 402 ? gwErr.status : 503;
      console.error(`[storyboard] gateway gave up: ${gwErr?.message} ${gwErr?.body ?? ""}`.slice(0, 400));
      return briefingErrorResponse(status, corsHeaders);
    }


    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No structured output from AI");
    }

    let parsed: { scenes: any[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error("Failed to parse AI storyboard output");
    }

    // Map AI output to ComposerScene format. We append the visual style hint
    // server-side as a hard guarantee — even if the AI forgot it, the rendered
    // clip will still match the chosen style.
    const appendStyle = (prompt: string): string => {
      if (!visualStyleHint) return prompt;
      // Avoid duplicate appending if AI already included the exact clause.
      const probe = visualStyleHint.replace(/^,\s*/, '').slice(0, 30).toLowerCase();
      if (prompt.toLowerCase().includes(probe)) return prompt;
      return prompt.replace(/[.\s,]*$/, '') + visualStyleHint;
    };

    // Determine default clipSource based on videoMode:
    // - 'video' → ai-hailuo (existing default)
    // - 'image' → ai-image (Gemini stills + Ken-Burns)
    // - 'mixed' → hook + cta as ai-hailuo (premium hero shots), rest as ai-image
    const videoMode: VideoMode = briefing.videoMode || 'video';
    const brandColor = briefing.brandColors?.[0];
    const preferStock = briefing.preferStock === true;

    // Stock-First detection: scenes that show generic environments / B-roll /
    // lifestyle moments WITHOUT the product as visible hero AND WITHOUT a
    // recurring character anchor are safe candidates for free stock footage.
    const hasCharacters = (briefing.characters || []).length > 0;
    const isStockCandidate = (sceneType: string, characterShot: any): boolean => {
      if (!preferStock) return false;
      // Never use stock for the hero moments — those drive brand recognition.
      if (sceneType === 'hook' || sceneType === 'cta' || sceneType === 'demo') return false;
      // Never use stock when a recurring character is featured in this scene.
      if (hasCharacters && characterShot?.shotType && characterShot.shotType !== 'absent') return false;
      // Problem / social-proof / custom B-roll → safe stock candidates.
      return ['problem', 'social-proof', 'custom'].includes(sceneType);
    };

    const pickClipSource = (sceneType: string, idx: number, total: number, characterShot: any): string => {
      // Stock-First takes priority when applicable.
      if (isStockCandidate(sceneType, characterShot)) return 'stock';
      if (videoMode === 'image') return 'ai-image';
      if (videoMode === 'mixed') {
        const isHero = sceneType === 'hook' || sceneType === 'cta' || idx === 0 || idx === total - 1;
        return isHero ? 'ai-hailuo' : 'ai-image';
      }
      return 'ai-hailuo';
    };

    // Valid character ids for filtering LLM output
    const validCharIds = new Set((briefing.characters || []).map((c) => c.id));
    const charByIdForActions = new Map((briefing.characters || []).map((c) => [c.id, c]));
    const normalizeShots = (rawShots: any, primaryShot: any, prompt: string, sceneActionEn: string): Array<{ characterId: string; shotType: string; actionEn?: string; actionUser?: string }> => {
      const out: Array<{ characterId: string; shotType: string; actionEn?: string; actionUser?: string }> = [];
      const seen = new Set<string>();
      const push = (slot: any) => {
        if (!slot || !slot.shotType || slot.shotType === 'absent') return;
        const id = String(slot.characterId || '').trim();
        if (!id || seen.has(id)) return;
        // tolerate id-drift only when exactly 1 character defined
        if (!validCharIds.has(id) && !(briefing.characters?.length === 1)) return;
        const finalId = validCharIds.has(id) ? id : briefing.characters![0].id;
        if (seen.has(finalId)) return;
        seen.add(finalId);
        const character = charByIdForActions.get(finalId);
        const neutral = neutralCharacterAction(language);
        const llmEn = cleanActionText(slot.actionEn, 12);
        const llmUser = cleanActionText(slot.actionUser, 12);
        const heuristic = cleanActionText(promptCharacterActionFallback(prompt, character?.name), 12);
        const actionEn = llmEn || heuristic || neutral.en;
        const actionUser = llmUser || (llmEn ? actionEn : (heuristic || neutral.user));
        out.push({ characterId: finalId, shotType: slot.shotType, actionEn, actionUser });
      };
      if (Array.isArray(rawShots)) for (const s of rawShots) push(s);
      push(primaryShot);
      return out.slice(0, 4);
    };

    const scenes = parsed.scenes.map((s: any, index: number, arr: any[]) => {
      const aiEffects = sanitizeEffects(s.effects);
      const finalEffects = aiEffects.length > 0
        ? aiEffects.map(e => ({ ...e, color: e.color || brandColor }))
        : getDefaultEffects(s.sceneType || 'custom', visualStyleId, brandColor);
      const sceneActionEn = cleanActionText(s.sceneActionEn || promptActionFallback(s.aiPrompt, 25), 25);
      const sceneActionUser = cleanActionText(s.sceneActionLocalized || sceneActionEn, 25);
      const shots = normalizeShots(s.characterShots, s.characterShot, s.aiPrompt || "", sceneActionEn);
      const primary = shots[0];
      const clipSource = pickClipSource(s.sceneType || 'custom', index, arr.length, primary);
      return {
        id: `scene_${Date.now()}_${index}`,
        projectId: "",
        orderIndex: index,
        sceneType: s.sceneType || "custom",
        durationSeconds: Math.max(3, Math.min(15, s.durationSeconds || 5)),
        clipSource,
        aiPrompt: appendStyle(s.aiPrompt || ""),
        sceneActionEn,
        sceneActionUser,
        stockKeywords: s.stockKeywords || "",
        clipStatus: "pending",
        textOverlay: {
          text: s.textOverlayText || "",
          position: s.textPosition || "bottom",
          animation: s.textAnimation || "fade-in",
          fontSize: 48,
          color: "#FFFFFF",
        },
        transitionType: s.transitionType || "fade",
        transitionDuration: 0.5,
        retryCount: 0,
        costEuros: clipSource === 'ai-image' ? 0.05 : 1.2,
        effects: finalEffects,
        ...(primary ? { characterShot: primary } : {}),
        ...(shots.length > 0 ? { characterShots: shots } : {}),
      };
    });

    // 🛡️ SERVER-SIDE CHARACTER FLOOR + CAP — auto-repair if LLM ignored the
    // per-character frequency target. Now multi-character aware: runs one
    // floor/cap pass for EACH defined character independently. Floor adds the
    // character to scenes that don't yet feature them (appended to characterShots
    // up to 4 slots); cap removes the character from excess scenes.
    const syncPrimaryFromShots = (sc: any) => {
      const shots: Array<{ characterId: string; shotType: string }> = sc.characterShots || [];
      const first = shots.find((x) => x && x.shotType && x.shotType !== 'absent');
      if (first) sc.characterShot = { characterId: first.characterId, shotType: first.shotType };
      else { sc.characterShot = { characterId: '', shotType: 'absent' }; }
    };
    const updateClipSource = (sc: any, idx: number) => {
      const newSource = pickClipSource(sc.sceneType || 'custom', idx, scenes.length, sc.characterShot);
      if (newSource !== sc.clipSource) {
        sc.clipSource = newSource;
        sc.costEuros = newSource === 'ai-image' ? 0.05 : 1.2;
      }
    };

    if (hasCharacters && scenes.length > 0) {
      // FLOOR pass — per character
      for (const ch of briefing.characters!) {
        const r = freqRange(ch.appearanceFrequency);
        const minRequired = Math.max(1, Math.ceil(scenes.length * r.min));
        const isTolerantSingle = briefing.characters!.length === 1;
        const featuresChar = (sc: any) => {
          const list: any[] = sc.characterShots || [];
          if (list.some((x) => x && x.shotType && x.shotType !== 'absent' && x.characterId === ch.id)) return true;
          if (isTolerantSingle && list.some((x) => x && x.shotType && x.shotType !== 'absent')) return true;
          return false;
        };
        const currentCount = scenes.filter(featuresChar).length;
        if (currentCount >= minRequired) continue;

        const needed = minRequired - currentCount;
        // Spread additions across the timeline; prefer hook + cta + middle.
        const candidateOrder: number[] = [0];
        if (scenes.length > 1) candidateOrder.push(scenes.length - 1);
        for (let i = 1; i < scenes.length - 1; i++) candidateOrder.push(i);
        const rotation: Array<'profile' | 'detail' | 'silhouette' | 'back' | 'full'> =
          ['profile', 'detail', 'silhouette', 'back', 'full'];
        let inserted = 0;
        let rotIdx = 0;
        for (const idx of candidateOrder) {
          if (inserted >= needed) break;
          const sc: any = scenes[idx];
          if (featuresChar(sc)) continue;
          const shots: any[] = sc.characterShots || [];
          if (shots.length >= 4) continue; // slot cap
          const shotType = rotation[rotIdx % rotation.length];
          rotIdx++;
          const neutral = neutralCharacterAction(language);
          const heuristic = cleanActionText(promptCharacterActionFallback(sc.aiPrompt, ch.name), 12);
          const actionEn = heuristic || neutral.en;
          const actionUser = heuristic ? actionEn : neutral.user;
          shots.push({
            characterId: ch.id,
            shotType,
            actionEn,
            actionUser,
          });
          sc.characterShots = shots;
          syncPrimaryFromShots(sc);
          updateClipSource(sc, idx);
          inserted++;
        }
        if (inserted > 0) {
          console.log(`[storyboard] character-floor auto-repair (${ch.name}): inserted ${inserted} anchor(s), need ${minRequired}, freq=${ch.appearanceFrequency || 'balanced'}`);
        }
      }

      // CAP pass — per character
      for (const ch of briefing.characters!) {
        const r = freqRange(ch.appearanceFrequency);
        const minRequired = Math.max(1, Math.ceil(scenes.length * r.min));
        const maxAllowed = Math.max(minRequired, Math.floor(scenes.length * r.max));
        const featuredIndices = scenes
          .map((sc: any, i: number) => ({ sc, i }))
          .filter(({ sc }) => (sc.characterShots || []).some((x: any) => x?.characterId === ch.id && x.shotType !== 'absent'))
          .map(({ i }) => i);
        if (featuredIndices.length <= maxAllowed) continue;

        const excess = featuredIndices.length - maxAllowed;
        // Strip from middle first (keep hook + cta as anchors)
        const middle = featuredIndices.filter((i) => i !== 0 && i !== scenes.length - 1);
        const tail = featuredIndices.filter((i) => i === 0 || i === scenes.length - 1);
        const stripOrder = [...middle, ...tail];
        let removed = 0;
        for (const idx of stripOrder) {
          if (removed >= excess) break;
          const sc: any = scenes[idx];
          sc.characterShots = (sc.characterShots || []).filter((x: any) => x.characterId !== ch.id);
          syncPrimaryFromShots(sc);
          updateClipSource(sc, idx);
          removed++;
        }
        if (removed > 0) {
          console.log(`[storyboard] character-cap auto-repair (${ch.name}): removed ${removed} anchor(s), max ${maxAllowed}, freq=${ch.appearanceFrequency || 'balanced'}`);
        }
      }
    }

    // 🎭 ENSEMBLE GUARANTEE — at least ONE scene must feature ALL briefed
    // characters together (max 4 per scene — Nano Banana 2 / Vidu Q2 cast cap).
    // For storyboards with ≥ 6 scenes, guarantee TWO ensemble moments so a
    // long-form spot has more than one group beat. Prefers hook + CTA as
    // ensemble anchors; falls back to middle scenes with the most existing
    // cast overlap. Idempotent: skips when the requirement is already met.
    if (hasCharacters && scenes.length > 0 && (briefing.characters?.length ?? 0) >= 2) {
      const allChars = briefing.characters!.slice(0, 4); // cast slot cap = 4
      const requiredIds = new Set(allChars.map((c) => c.id));
      const requiredEnsembles = scenes.length >= 6 ? 2 : 1;

      const isEnsemble = (sc: any) => {
        const visible = (sc.characterShots || []).filter((x: any) => x && x.shotType && x.shotType !== 'absent');
        const present = new Set(visible.map((x: any) => x.characterId));
        for (const id of requiredIds) if (!present.has(id)) return false;
        return true;
      };

      const currentCount = scenes.filter(isEnsemble).length;
      if (currentCount < requiredEnsembles) {
        const needed = requiredEnsembles - currentCount;
        // Candidate order: hook, cta, then middle scenes sorted by existing
        // cast coverage (more matches first → smaller edit).
        const middle: number[] = [];
        for (let i = 1; i < scenes.length - 1; i++) middle.push(i);
        middle.sort((a, b) => {
          const cov = (i: number) => {
            const visible = (scenes[i].characterShots || []).filter((x: any) => x?.shotType && x.shotType !== 'absent');
            return visible.filter((x: any) => requiredIds.has(x.characterId)).length;
          };
          return cov(b) - cov(a);
        });
        const candidateOrder: number[] = [];
        candidateOrder.push(0);
        if (scenes.length > 1) candidateOrder.push(scenes.length - 1);
        for (const i of middle) candidateOrder.push(i);

        const repairedSceneIds: string[] = [];
        let repaired = 0;
        for (const idx of candidateOrder) {
          if (repaired >= needed) break;
          const sc: any = scenes[idx];
          if (isEnsemble(sc)) continue;

          const shots: any[] = Array.isArray(sc.characterShots) ? [...sc.characterShots] : [];
          const present = new Set(
            shots
              .filter((x) => x?.shotType && x.shotType !== 'absent')
              .map((x) => x.characterId),
          );
          for (const ch of allChars) {
            if (present.has(ch.id)) continue;
            if (shots.filter((x) => x?.shotType && x.shotType !== 'absent').length >= 4) break;
            const neutral = neutralCharacterAction(language);
            const heuristic = cleanActionText(promptCharacterActionFallback(sc.aiPrompt, ch.name), 12);
            const actionEn = heuristic || neutral.en;
            const actionUser = heuristic ? actionEn : neutral.user;
            shots.push({
              characterId: ch.id,
              shotType: 'full',
              actionEn,
              actionUser,
            });
            present.add(ch.id);
          }
          sc.characterShots = shots;
          syncPrimaryFromShots(sc);
          updateClipSource(sc, idx);
          repairedSceneIds.push(String(sc.id ?? idx));
          repaired++;
        }
        if (repaired > 0) {
          console.log(
            `[storyboard] ensemble-guarantee auto-repair: added ensemble to ${repaired} scene(s) — ` +
              `scenes_total=${scenes.length} characters_briefed=${allChars.length} ` +
              `repaired_scene_ids=${JSON.stringify(repairedSceneIds)}`,
          );
        }
      }
    }

    // 🎬 SERVER-SIDE CAST HARD-ANCHOR — guarantee that EVERY character listed
    // in characterShots is named in the scene's aiPrompt. The client backfill
    // (`applyCastToPrompt`) adds a localised marker; we inject a deterministic
    // English prefix here so providers always receive the names even on race
    // conditions / id-drift.
    if (hasCharacters && scenes.length > 0) {
      const charById = new Map<string, any>();
      for (const c of briefing.characters!) charById.set(c.id, c);
      const findChar = (slot: any) => {
        if (!slot?.characterId) return undefined;
        const exact = charById.get(slot.characterId);
        if (exact) return exact;
        return briefing.characters!.length === 1 ? briefing.characters![0] : undefined;
      };
      for (const s of scenes as any[]) {
        const shots: any[] = s.characterShots && s.characterShots.length > 0
          ? s.characterShots
          : (s.characterShot ? [s.characterShot] : []);
        const missing: string[] = [];
        for (const shot of shots) {
          if (!shot || !shot.shotType || shot.shotType === 'absent') continue;
          const char = findChar(shot);
          if (!char?.name) continue;
          const promptLower = String(s.aiPrompt || '').toLowerCase();
          const first = String(char.name).trim().toLowerCase().split(/\s+/)[0];
          const alreadyNamed =
            promptLower.includes(String(char.name).toLowerCase()) ||
            (first.length >= 3 && promptLower.includes(first));
          if (!alreadyNamed) missing.push(`${char.name} (${shot.shotType})`);
        }
        if (missing.length > 0) {
          s.aiPrompt = `Featuring ${missing.join(' and ')}: ${s.aiPrompt || ''}`.trim();
        }
      }
    }

    // 🎭 LIP-SYNC SAFE MULTI-CAST REWRITE — for every scene with 2+ characters,
    // normalize forbidden shotTypes (back/pov/detail/silhouette → profile),
    // ensure each character has its OWN action (synthesize a neutral one if
    // the LLM only wrote a single-character clause), rewrite the generic
    // sceneActionEn into a group sentence that names every cast member, and
    // prepend a deterministic group-scene clause to aiPrompt so providers
    // generate a wide composition with all faces visible and clear dialogue
    // intent — instead of a hero close-up of one character with a "Featuring
    // X and Y and Z:" header glued on top.
    if (hasCharacters && scenes.length > 0) {
      const charById = new Map<string, any>();
      for (const c of briefing.characters!) charById.set(c.id, c);
      const FORBIDDEN_MULTI = new Set(['back', 'pov', 'detail', 'silhouette']);
      const joinNames = (names: string[]) => {
        if (names.length <= 1) return names.join('');
        if (names.length === 2) return `${names[0]} and ${names[1]}`;
        return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      };
      for (const sc of scenes as any[]) {
        const shots: any[] = Array.isArray(sc.characterShots) ? sc.characterShots : [];
        const visible = shots.filter((x) => x && x.shotType && x.shotType !== 'absent');
        if (visible.length < 2) continue;

        // 1) Normalize forbidden shotTypes; first slot is forced to 'full',
        //    the rest stay 'full' or downgrade to 'profile'.
        let hasFull = false;
        visible.forEach((slot, i) => {
          if (FORBIDDEN_MULTI.has(slot.shotType)) {
            slot.shotType = i === 0 ? 'full' : 'profile';
          }
          if (slot.shotType === 'full') hasFull = true;
        });
        if (!hasFull) visible[0].shotType = 'full';

        // 2) Per-character action — never copy another character's clause.
        const castEntries: Array<{ name: string; signature: string; action: string; slot: any }> = [];
        for (const slot of visible) {
          const char = charById.get(slot.characterId);
          if (!char?.name) continue;
          const existing = cleanActionText(slot.actionEn, 12);
          const fromPrompt = cleanActionText(promptCharacterActionFallback(sc.aiPrompt, char.name), 12);
          const neutral = neutralCharacterAction(language);
          const finalAction = existing || fromPrompt || neutral.en;
          slot.actionEn = finalAction;
          const llmUser = cleanActionText(slot.actionUser, 12);
          slot.actionUser = llmUser || (existing ? finalAction : (fromPrompt || neutral.user));
          castEntries.push({
            name: char.name,
            signature: String(char.signatureItems || '').trim(),
            action: finalAction,
            slot,
          });
        }
        if (castEntries.length < 2) continue;

        // 3) Group scene action (overrides the single-character sceneActionEn).
        const names = castEntries.map((e) => e.name);
        const groupAction = `${joinNames(names)} share the scene together, each visible to camera with their own action`;
        sc.sceneActionEn = cleanActionText(groupAction, 25);
        // Keep the localized field in sync — for non-EN we leave the English
        // group sentence as a safe default; the UI lets the user edit it.
        sc.sceneActionUser = cleanActionText(sc.sceneActionUser && sc.sceneActionUser.toLowerCase().includes(names[0].toLowerCase()) && names.every((n) => sc.sceneActionUser.toLowerCase().includes(n.toLowerCase())) ? sc.sceneActionUser : groupAction, 25);
        // Mirror the primary characterShot to the first visible slot.
        sc.characterShot = { characterId: visible[0].characterId, shotType: visible[0].shotType };

        // 4) Rewrite aiPrompt: strip any prior "Featuring …:" header and any
        //    [SceneAction]/[CastActions] marker blocks (we'll let the client
        //    re-inject them deterministically from the new fields), then
        //    prepend a deterministic lip-sync-safe group clause that names
        //    every cast member with their action and locks framing/dialogue.
        const stripped = String(sc.aiPrompt || '')
          .replace(/\[SceneAction\][\s\S]*?\[\/SceneAction\]\s*/gi, '')
          .replace(/\[CastActions\][\s\S]*?\[\/CastActions\]\s*/gi, '')
          .replace(/^\s*Featuring\s+[^:]{1,500}:\s*/i, '')
          .trim();
        const castClauses = castEntries.map((e) => {
          const sig = e.signature ? ` (${e.signature})` : '';
          return `${e.name}${sig} ${e.action}`;
        });
        const groupClause =
          `Group scene with ${joinNames(names)} all clearly visible on camera, balanced left-to-right composition, every face fully in frame and unobstructed (no back-shots, no POV, no silhouettes, no occlusion, no single-character close-up). ` +
          `Each character has a distinct simultaneous action: ${castClauses.join('; ')}. ` +
          `They are engaged in dialogue — either speaking with one another with eye contact and reactions, or each speaking to camera in clear visible turns — so the mouth movements of every visible character can be lip-synced. `;
        sc.aiPrompt = appendStyle((groupClause + stripped).trim());
      }
    }

    // v223: multi-speaker prompt slim — strip LLM-emitted "Four speakers, …"
    // enumerators and per-turn "<Name> is speaking" suffixes from ai_prompt
    // and sceneActionEn. These patterns trigger Alibaba Green Net ("HappyHorse")
    // as role-instruction / person-impersonation heuristics. Speaker binding
    // lives in dialog_turns / speakerCharacterId, not in the image prompt.
    const SPEAKER_COUNT_PREFIX = /\b(?:Two|Three|Four|Five|Six|Seven|Eight)\s+speakers?,\s*/gi;
    const IS_SPEAKING_SUFFIX =
      /\s*[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2}\s+is\s+speaking(?:,\s*while\s+[^.]+)?\.?/g;
    const slimPrompt = (t: unknown) =>
      String(t ?? "").replace(SPEAKER_COUNT_PREFIX, "").replace(IS_SPEAKING_SUFFIX, "").replace(/[ \t]+/g, " ").trim();
    for (const sc of scenes as any[]) {
      if (sc?.aiPrompt) sc.aiPrompt = slimPrompt(sc.aiPrompt);
      if (sc?.sceneActionEn) sc.sceneActionEn = slimPrompt(sc.sceneActionEn);
      if (sc?.sceneActionUser) sc.sceneActionUser = slimPrompt(sc.sceneActionUser);
    }

    return new Response(JSON.stringify({ scenes, sceneCount: scenes.length, pipelineVersion: "v223-multi-speaker-prompt-slim" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[storyboard] error:", error);
    return briefingErrorResponse(500, corsHeaders, error instanceof Error ? error.message : "Unknown error");
  }
})(req));
}
