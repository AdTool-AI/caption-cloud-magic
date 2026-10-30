import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { tl, withLang } from "../_shared/i18n.ts";
import { allowanceJobKey, claimIncludedAllowance, releaseIncludedAllowance } from "../_shared/included-allowance.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// ---- Engine catalog (mirror of src/lib/music/engineCatalog.ts) ----
interface EngineMeta {
  price: number;             // flat retail (used when pricingModel === 'flat')
  pricingModel: 'flat' | 'per-second';
  pricePerSecond?: number;   // used when pricingModel === 'per-second'
  maxDuration: number;
  route: 'replicate';
  vocals: boolean;
  requiresLyrics: boolean;
  replicateModel: string;
  label: string;
}
const ENGINES: Record<string, EngineMeta> = {
  'stable-audio-25':     { price: 0.55, pricingModel: 'flat',       maxDuration: 190, route: 'replicate', vocals: false, requiresLyrics: false, replicateModel: 'stability-ai/stable-audio-2.5', label: 'Stable Audio 2.5' },
  'minimax-15':          { price: 0.30, pricingModel: 'flat',       maxDuration: 60,  route: 'replicate', vocals: true,  requiresLyrics: true,  replicateModel: 'minimax/music-1.5',            label: 'MiniMax Music 1.5' },
  'elevenlabs-music-v2': { price: 6.90, pricingModel: 'per-second', pricePerSecond: 0.023, maxDuration: 300, route: 'replicate', vocals: true, requiresLyrics: false, replicateModel: 'elevenlabs/music', label: 'ElevenLabs Music v2' },
  'lyria-3-pro':         { price: 0.42, pricingModel: 'flat',       maxDuration: 180, route: 'replicate', vocals: true,  requiresLyrics: false, replicateModel: 'google/lyria-3-pro',           label: 'Google Lyria 3 Pro' },
};

function computeCharge(meta: EngineMeta, durationSeconds: number): number {
  if (meta.pricingModel === 'per-second' && meta.pricePerSecond) {
    const secs = Math.max(1, Math.min(meta.maxDuration, Math.round(durationSeconds)));
    return Math.round(meta.pricePerSecond * secs * 100) / 100;
  }
  return meta.price;
}

// Legacy tier IDs → new engine IDs (keeps old clients / stored plans working).
const LEGACY_ALIAS: Record<string, string> = {
  quick:                  'stable-audio-25',
  adaptive:               'stable-audio-25',
  standard:               'elevenlabs-music-v2',
  vocal:                  'minimax-15',
  pro:                    'elevenlabs-music-v2',
  'suno-v5':              'elevenlabs-music-v2',
  'stable-audio-open-2':  'stable-audio-25',
  'stable-audio-3-large': 'elevenlabs-music-v2',
};

function resolveEngine(id: string): { id: string; meta: EngineMeta } | null {
  const normalized = ENGINES[id] ? id : LEGACY_ALIAS[id];
  if (!normalized) return null;
  return { id: normalized, meta: ENGINES[normalized] };
}


import { lyricsRequirementError, minimaxInstrumentalInput } from './instrumental.ts';

interface GenerateMusicRequest {
  prompt: string;
  tier: string;                     // engineId (or legacy tier)
  durationSeconds?: number;
  genre?: string;
  mood?: string;
  instrumental?: boolean;
  bpm?: number;
  key?: string;
  lyrics?: string;
  loop?: boolean;
  language?: string;
  languageName?: string;
  styleTags?: string;               // Suno style tags
  mode?: 'instrumental';            // Phase C: background bed, no lyrics, no AI lyrics
}

function buildEnhancedPrompt(req: GenerateMusicRequest): string {
  const parts = [req.prompt.trim()];
  if (req.genre && req.genre !== 'any') parts.push(`Genre: ${req.genre}`);
  if (req.mood) parts.push(`Mood: ${req.mood}`);
  if (req.bpm && req.bpm >= 40 && req.bpm <= 220) parts.push(`Tempo: exactly ${Math.round(req.bpm)} BPM`);
  if (req.key) parts.push(`Key: ${req.key}`);
  if (req.instrumental) parts.push('instrumental, no vocals');
  parts.push('high quality, professional production, studio mastered');
  return parts.join('. ');
}

function extractAudioUrl(output: any): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length > 0) {
    return typeof output[0] === 'string' ? output[0] : null;
  }
  if (output && typeof output === 'object') {
    if ('audio' in output && typeof (output as any).audio === 'string') return (output as any).audio;
    if ('url' in output) {
      const u = (output as any).url;
      return typeof u === 'function' ? u().toString() : u;
    }
  }
  return null;
}

serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "music" });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const user = await resolveRequestUser(req, supabaseClient);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json() as GenerateMusicRequest;
    const { prompt, tier, durationSeconds = 30, genre, mood, instrumental = true, bpm, key, lyrics, loop, languageName, styleTags, mode } = body;

    if (!prompt?.trim() || prompt.length > 800) {
      return new Response(JSON.stringify({ error: "Prompt is required (max 800 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const resolved = resolveEngine(tier);
    if (!resolved) {
      return new Response(JSON.stringify({ error: `Unknown engine '${tier}'` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const engineId = resolved.id;
    const engine = resolved.meta;

    if (lyricsRequirementError(!!engine.requiresLyrics, mode, lyrics)) {
      return new Response(JSON.stringify({
        error: tl({ de: "Lyrics zu kurz (min. 10 Zeichen). Bitte Songtext eingeben oder AI-Lyrics generieren.", en: "Lyrics too short (min. 10 characters). Please enter lyrics or generate AI lyrics.", es: "Letra demasiado corta (mín. 10 caracteres). Por favor, introduce la letra o genera letras con IA." }),
        code: "MISSING_LYRICS",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const duration = Math.max(5, Math.min(engine.maxDuration, durationSeconds));

    // Wallet check
    const { data: wallet } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('balance_euros, currency')
      .eq('user_id', user.id)
      .single();

    const currency = (wallet?.currency || 'EUR') as 'EUR' | 'USD';
    const listCost = computeCharge(engine, duration);
    const currencySymbol = currency === 'USD' ? '$' : '€';

    // Monthly included usage: MiniMax Music 1.5 is included with an active
    // subscription / Creator account. Claimed BEFORE the provider call and
    // released again whenever the generation does not succeed.
    const includedEligible = engineId === 'minimax-15';
    const jobKey = includedEligible
      ? await allowanceJobKey([
          (body as { requestId?: string }).requestId,
          user.id, engineId, duration, prompt.trim(), (lyrics ?? '').trim(),
          (body as { requestId?: string }).requestId ? null : Math.floor(Date.now() / 60_000),
        ])
      : '';
    const included = includedEligible
      ? await claimIncludedAllowance(supabaseAdmin, user.id, 'music', jobKey, Deno.env.get('STRIPE_SECRET_KEY'))
      : { claimed: false, duplicate: false, used: 0, limit: 0 };
    const cost = included.claimed ? 0 : listCost;
    const releaseIncluded = async () => {
      if (included.claimed) await releaseIncludedAllowance(supabaseAdmin, user.id, 'music', jobKey);
    };

    if (!included.claimed) {
      if (!wallet) {
        return new Response(JSON.stringify({
          error: "No AI Credits wallet found. Please purchase credits first.",
          code: "NO_WALLET", needsPurchase: true
        }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (wallet.balance_euros < cost) {
        return new Response(JSON.stringify({
          error: `Insufficient credits. Need ${currencySymbol}${cost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS", needsPurchase: true, required: cost, available: wallet.balance_euros, currency,
        }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const enhancedPrompt = buildEnhancedPrompt(body);
    console.log(`[generate-music-track] engine=${engineId} duration=${duration}s cost=${currencySymbol}${cost} included=${included.claimed}`);


    let audioBuffer: ArrayBuffer | null = null;
    let engineUsed = engine.label;

    // =================================================================
    // All engines run through Replicate.
    // =================================================================
    {
      const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
      if (!REPLICATE_API_KEY) {
        return new Response(JSON.stringify({ error: "REPLICATE_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const replicate = new Replicate({ auth: REPLICATE_API_KEY });
      engineUsed = `replicate/${engine.replicateModel}`;

      let input: Record<string, unknown> = {};
      if (engineId === 'stable-audio-25') {
        const p = loop ? `${enhancedPrompt}. Seamless loop, no fade-in or fade-out, continuous beat` : enhancedPrompt;
        input = { prompt: p, duration, steps: 8, cfg_scale: 7, output_format: 'mp3' };
      } else if (engineId === 'minimax-15') {
        const FILLER = 'Cinematic studio production, mastered mix, professional arrangement';
        let styleDesc = [
          genre && genre !== 'any' ? `Genre: ${genre}` : '',
          mood ? `Mood: ${mood}` : '',
          bpm ? `Tempo: ${bpm} BPM` : '',
          key ? `Key: ${key}` : '',
          prompt.trim(),
          languageName ? `Sung in ${languageName}` : '',
          'Studio production quality',
        ].filter(Boolean).join('. ');
        if (styleDesc.length < 10) styleDesc = `${styleDesc} ${FILLER}`.trim();
        if (styleDesc.length > 300) styleDesc = styleDesc.slice(0, 300);
        let lyricsInput = (lyrics ?? '').trim();
        if (lyricsInput.length > 600) lyricsInput = lyricsInput.slice(0, 600);
        input = mode === 'instrumental' ? minimaxInstrumentalInput(prompt) : { lyrics: lyricsInput, prompt: styleDesc };
      } else if (engineId === 'elevenlabs-music-v2') {
        // Replicate elevenlabs/music: prompt + music_length_ms + force_instrumental
        const promptParts = [enhancedPrompt];
        if (languageName) promptParts.push(`Vocals in ${languageName}`);
        input = {
          prompt: promptParts.join('. '),
          music_length_ms: Math.min(duration, 300) * 1000,
          force_instrumental: !!instrumental,
          output_format: 'mp3_high_quality',
        };
        if (lyrics && lyrics.trim()) {
          (input as Record<string, unknown>).lyrics = lyrics.trim();
        }
      } else if (engineId === 'lyria-3-pro') {
        // Replicate google/lyria-3-pro: prompt + optional negative_prompt/seed
        const promptParts = [enhancedPrompt];
        if (languageName) promptParts.push(`Vocals in ${languageName}`);
        if (instrumental) promptParts.push('instrumental, no vocals');
        if (lyrics && lyrics.trim()) {
          promptParts.push(`Lyrics:\n${lyrics.trim()}`);
        }
        input = {
          prompt: promptParts.join('. '),
          negative_prompt: 'low quality, distorted, muddy, harsh clipping',
        };
      }

      console.log(`[generate-music-track] Replicate input for ${engineId}:`, Object.keys(input));

      let output: any;
      try {
        output = await replicate.run(engine.replicateModel as `${string}/${string}`, { input });
      } catch (err: any) {
        console.error(`[generate-music-track] Replicate error (${engineId}):`, err);
        await releaseIncluded();
        let providerDetail: string | undefined;
        try {
          if (err?.response && typeof err.response.json === 'function') {
            const b = await err.response.clone().json();
            providerDetail = b?.detail || JSON.stringify(b);
          }
        } catch { /* ignore */ }
        return new Response(JSON.stringify({
          error: providerDetail || err?.message || 'Unknown Replicate error',
          code: "REPLICATE_ERROR",
          stage: "replicate-input",
          engine: engineId,
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const audioUrl = extractAudioUrl(output);
      if (!audioUrl) {
        await releaseIncluded();
        return new Response(JSON.stringify({ error: `No audio returned from ${engine.label}`, code: "NO_OUTPUT" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        await releaseIncluded();
        return new Response(JSON.stringify({ error: "Failed to fetch generated audio" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      audioBuffer = await audioRes.arrayBuffer();
    }


    if (!audioBuffer || audioBuffer.byteLength < 1000) {
      await releaseIncluded();
      return new Response(JSON.stringify({ error: "Generated audio too small / invalid" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }


    // ===== Upload to Storage =====
    const storagePath = `${user.id}/music/${engineId}-${Date.now()}.mp3`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('audio-studio')
      .upload(storagePath, new Uint8Array(audioBuffer), {
        contentType: 'audio/mpeg',
        upsert: false,
      });
    if (uploadError) {
      console.error('[generate-music-track] Storage upload error:', uploadError);
      await releaseIncluded();
      return new Response(JSON.stringify({ error: `Storage error: ${uploadError.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('audio-studio').getPublicUrl(storagePath);
    const publicUrl = publicUrlData.publicUrl;

    const title = prompt.trim().slice(0, 60) + (prompt.length > 60 ? '...' : '');

    const { data: asset, error: insertError } = await supabaseAdmin
      .from('universal_audio_assets')
      .insert({
        user_id: user.id,
        type: 'music',
        title,
        url: publicUrl,
        storage_url: publicUrl,
        storage_path: storagePath,
        duration_sec: duration,
        genre: genre || null,
        mood: mood || null,
        source: 'generated',
        processing_preset: engineId,
        effect_config: {
          prompt: prompt.trim(),
          enhanced_prompt: enhancedPrompt,
          engine: engineUsed,
          engine_id: engineId,
          instrumental,
          bpm: bpm || null,
          key: key || null,
          lyrics: lyrics || null,
          loop: loop || false,
          style_tags: styleTags || null,
          language: languageName || null,
        },
      })
      .select()
      .single();
    if (insertError) {
      console.warn('[generate-music-track] Asset insert warning:', insertError);
    }

    let newBalance: number | null = null;
    if (!included.claimed) {
      const { data: balanceAfter, error: deductError } = await supabaseAdmin.rpc(
        'deduct_ai_video_credits',
        { p_user_id: user.id, p_amount: cost, p_generation_id: asset?.id || null }
      );
      if (deductError) {
        console.error('[generate-music-track] Deduct error:', deductError);
      }
      newBalance = balanceAfter ?? null;
    }

    return new Response(JSON.stringify({
      success: true,
      track: {
        id: asset?.id,
        url: publicUrl,
        title,
        duration_sec: duration,
        engine: engineUsed,
      },
      cost,
      currency,
      included: included.claimed,
      includedUsed: included.claimed ? included.used : undefined,
      includedLimit: included.claimed ? included.limit : undefined,
      newBalance: newBalance ?? ((wallet?.balance_euros ?? 0) - cost),
      tier: engineId,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });


  } catch (error: any) {
    console.error("[generate-music-track] Error:", error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
})(req)));
