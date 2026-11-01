import Replicate from "npm:replicate@0.25.2";
import { completeReplicateCaption, CaptionProviderError, CAPTION_MODEL } from "../_shared/replicateCaption.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getSupabaseClient } from '../_shared/db-client.ts';
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { ErrorResponses, createErrorResponse } from '../_shared/errorHandler.ts';
import { withTelemetry } from '../_shared/telemetry.ts';
import { lookupAiCache, storeAiCache } from '../_shared/ai-semantic-cache.ts';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(withTelemetry('generate-caption', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "generate-caption" });


  const requestId = crypto.randomUUID();
  
  try {
    // Input validation schema
    const requestSchema = z.object({
      topic: z.string()
        .trim()
        .min(3, 'Topic too short')
        .max(1000, 'Topic too long'),
      tone: z.enum(['professional', 'casual', 'friendly', 'formal', 'humorous', 'inspirational']),
      platform: z.enum(['instagram', 'facebook', 'linkedin', 'twitter', 'tiktok', 'youtube']),
      language: z.enum(['en', 'de', 'es']),
      maxLength: z.number().min(50).max(500).optional(),
      hashtagCount: z.number().min(3).max(15).optional(),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return ErrorResponses.validation(
        { validationErrors: validation.error.errors, requestId },
        'generate-caption input validation'
      );
    }

    const { topic, tone, platform, language } = validation.data;

    // Get user from auth header (using Anon Key for auth)
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return ErrorResponses.authentication(
        { reason: 'No authorization header', requestId },
        'generate-caption auth check'
      );
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return ErrorResponses.authentication(
        { userError, requestId },
        'generate-caption user fetch'
      );
    }

    // Use pooled connection for database operations
    const supabase = getSupabaseClient();

    // Get settings for caption length and hashtag count (parallel queries)
    const [
      { data: captionSettings },
      { data: hashtagSettings }
    ] = await Promise.all([
      supabase
        .from('settings')
        .select('value_json')
        .eq('key', 'caption_max_length')
        .single(),
      supabase
        .from('settings')
        .select('value_json')
        .eq('key', 'hashtag_count')
        .single()
    ]);

    const maxLength = validation.data.maxLength || captionSettings?.value_json?.length || 250;
    const hashtagCount = validation.data.hashtagCount || hashtagSettings?.value_json?.count || 5;

    // Caption completions use the owned Replicate account.
    
    const languageNames: Record<string, string> = {
      en: 'English',
      de: 'German',
      es: 'Spanish'
    };

    const languageInstructions: Record<string, string> = {
      en: 'IMPORTANT: Write the entire caption in ENGLISH only.',
      de: 'WICHTIG: Schreibe die gesamte Caption NUR auf DEUTSCH.',
      es: 'IMPORTANTE: Escribe todo el texto SOLO en ESPAÑOL.'
    };

    const prompt = `${languageInstructions[language] || languageInstructions.en}

Write a short, engaging social media caption (max ${maxLength} characters) for ${platform} about "${topic}" in a ${tone} tone.

Then provide exactly ${hashtagCount} relevant hashtags.

Format your response exactly like this:
CAPTION: [your caption here in ${languageNames[language] || 'English'}]
HASHTAGS: #tag1 #tag2 #tag3 #tag4 #tag5`;

    // Phase 2: Check AI semantic cache before calling provider
    const cacheKey = `${platform}|${tone}|${topic}|${maxLength}|${hashtagCount}`;
    const cached = await lookupAiCache<{ caption: string; hashtags: string[] }>({
      endpoint: 'generate-caption',
      promptText: cacheKey,
      language,
      ttlHours: 24,
      semantic: false, // Exact cache remains available; no external embedding provider is configured.
    });

    if (cached.hit && cached.data) {
      console.log(`[generate-caption] Cache hit (similarity: ${cached.similarity})`);
      // Persist to user's history
      await supabase.from('captions').insert({
        user_id: user.id,
        topic, tone, platform,
        caption_text: cached.data.caption,
        hashtags: cached.data.hashtags,
        language,
      });
      return new Response(
        JSON.stringify({ ...cached.data, requestId, cached: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPromptLanguage: Record<string, string> = {
      en: 'You are a professional social media caption writer. Always write in English.',
      de: 'Du bist ein professioneller Social-Media-Texter. Schreibe IMMER auf Deutsch.',
      es: 'Eres un escritor profesional de subtítulos para redes sociales. Escribe SIEMPRE en español.'
    };

    const systemPrompt = systemPromptLanguage[language] || systemPromptLanguage.en;

    const token = Deno.env.get('REPLICATE_API_KEY');
    if (!token) return ErrorResponses.serviceUnavailable({ requestId }, 'generate-caption provider configuration');
    const replicate = new Replicate({ auth: token });
    let generatedText: string;
    try {
      generatedText = await completeReplicateCaption((model, options) => replicate.run(model, options), prompt, systemPrompt);
    } catch (error: unknown) {
      const status = error instanceof CaptionProviderError ? error.status : 503;
      if (status === 429) return ErrorResponses.rateLimit({ requestId }, 'generate-caption provider rate limit');
      if (status === 402) return ErrorResponses.paymentRequired({ requestId }, 'generate-caption provider credits');
      return ErrorResponses.serviceUnavailable({ requestId }, 'generate-caption provider unavailable');
    }

    // Parse the response
    const captionMatch = generatedText.match(/CAPTION:\s*(.+?)(?=\nHASHTAGS:|$)/s);
    const hashtagsMatch = generatedText.match(/HASHTAGS:\s*(.+)/);

    const caption = captionMatch ? captionMatch[1].trim() : generatedText.slice(0, maxLength);
    const hashtagsText = hashtagsMatch ? hashtagsMatch[1].trim() : '';
    const hashtags = hashtagsText.split(/\s+/).filter((tag: string) => tag.startsWith('#')).slice(0, hashtagCount);

    // If not enough hashtags were generated, add generic ones
    const genericHashtags = ['#socialmedia', '#content', '#marketing', '#viral', '#trending'];
    while (hashtags.length < hashtagCount && genericHashtags.length > 0) {
      hashtags.push(genericHashtags.shift()!);
    }

    // Save caption to database
    const { error: insertError } = await supabase
      .from('captions')
      .insert({
        user_id: user.id,
        topic,
        tone,
        platform,
        caption_text: caption,
        hashtags,
        language
      });

    if (insertError) {
      console.error('Insert error:', insertError);
    }

    // Phase 2: Store in AI semantic cache for future requests
    storeAiCache(
      { endpoint: 'generate-caption', promptText: cacheKey, language, model: CAPTION_MODEL, ttlHours: 24, semantic: false },
      { caption, hashtags }
    ).catch((e) => console.warn('[generate-caption] Cache store failed:', e));

    return new Response(
      JSON.stringify({
        caption,
        hashtags,
        requestId
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    return ErrorResponses.internal(
      { error: error instanceof Error ? error.message : String(error), requestId },
      'generate-caption unexpected error'
    );
  }
}));