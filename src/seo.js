// Stage 2: Elite Microstock SEO & Keywording Algorithm Specialist

import { logFailure, writeLog } from './utils.js';

export const TITLE_MAX_LEN = 70;
export const KEYWORDS_MIN = 25;
export const KEYWORDS_TARGET = 40;
export const KEYWORDS_MAX = 49;

export const FORBIDDEN_TERMS = new Set([
  'canon', 'nikon', 'sony', 'fujifilm', 'leica', 'panasonic', 'olympus', 'hasselblad',
  'apple', 'iphone', 'ipad', 'macbook', 'samsung', 'huawei', 'xiaomi', 'starbucks', 'nespresso',
  'nike', 'adidas', 'puma', 'gucci', 'prada', 'louis vuitton', 'zara',
  'porsche', 'bmw', 'mercedes', 'ferrari', 'lamborghini', 'tesla', 'toyota', 'honda',
  'iso', 'f/2.8', '50mm', 'shutter', 'dslr', 'megapixels', 'raw format',
  'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tags', 'keyword', 'keywords'
]);

export function validateSeoOutput(raw) {
  let title = (raw.title || '').trim();
  let description = (raw.description || '').trim();
  let rawKeywords = Array.isArray(raw.keywords) ? raw.keywords : [];

  // 1. Remove leading filler words from title
  title = title.replace(/^(a|an|the|photo of|image of|close up of)\s+/i, '').trim();

  // 2. Clamp title to max 70 characters cleanly
  if (title.length > TITLE_MAX_LEN) {
    const truncated = title.slice(0, TITLE_MAX_LEN);
    const lastSpace = truncated.lastIndexOf(' ');
    title = (lastSpace > 30 ? truncated.slice(0, lastSpace) : truncated).trim();
  }

  // 3. Validate & Sanitize Keywords (Max 2 words per tag, lowercase, no trademarks)
  const cleanKeywords = [];
  for (let kw of rawKeywords) {
    if (typeof kw !== 'string') continue;
    kw = kw.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ');
    if (!kw || kw.length < 2) continue;

    // Enforce maximum 2 words per tag
    const wordCount = kw.split(' ').length;
    if (wordCount > 2) {
      // Split into single words if too long
      const subWords = kw.split(' ').filter(w => w.length > 2);
      for (const sw of subWords) {
        if (!FORBIDDEN_TERMS.has(sw) && !cleanKeywords.includes(sw) && cleanKeywords.length < KEYWORDS_MAX) {
          cleanKeywords.push(sw);
        }
      }
      continue;
    }

    // Filter forbidden brand / camera terms
    if (FORBIDDEN_TERMS.has(kw)) continue;

    if (!cleanKeywords.includes(kw) && cleanKeywords.length < KEYWORDS_MAX) {
      cleanKeywords.push(kw);
    }
  }

  // 4. Ensure Core Title Words are in Top 10 Keywords (Algorithmic Search Relevance)
  const titleWords = title
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 3 && !FORBIDDEN_TERMS.has(w));

  for (const tw of titleWords) {
    if (!cleanKeywords.slice(0, 10).includes(tw)) {
      // Remove if it exists later and move to top
      const existingIdx = cleanKeywords.indexOf(tw);
      if (existingIdx !== -1) {
        cleanKeywords.splice(existingIdx, 1);
      }
      cleanKeywords.unshift(tw);
    }
  }

  // 5. Fallback Description
  if (!description && title) {
    description = `${title}. Commercial high-quality stock asset ready for marketing, creative designs, and editorial publications.`;
  }

  const finalKeywords = cleanKeywords.slice(0, KEYWORDS_MAX);
  writeLog('SEO', 'VALIDATE', `Title (${title.length}/${TITLE_MAX_LEN} chars): "${title}" | Keywords: ${finalKeywords.length} tags`);

  return {
    title,
    description,
    keywords: finalKeywords
  };
}

export async function refineSeoMetadata(visualDescription) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.SEO_API_KEY;
  const baseUrl = process.env.OPENROUTER_BASE_URL || process.env.SEO_BASE_URL || 'https://openrouter.ai/api/v1';
  const model = process.env.SEO_MODEL || 'deepseek/deepseek-v4-flash-0731';

  if (!apiKey) {
    writeLog('ERROR', 'SEO', 'OPENROUTER_API_KEY is not configured in .env');
    throw new Error('OPENROUTER_API_KEY is not configured in .env');
  }

  const systemPrompt = `You are the World's Leading Microstock SEO & Keywording Algorithm Specialist (expert in Adobe Stock Sensei, Shutterstock mSearch, and Freepik indexing).

Your mission is to craft maximum-visibility, high-converting metadata for stock buyers based on this visual analysis:
"${visualDescription}"

==============================================================================
ALGORITHMIC METADATA RULES:
==============================================================================

1. STOCK TITLE (Maximum 70 Characters - Strict):
   - FRONT-LOADED FORMULA: [Top Searched Root Noun] + [Key Commercial Modifier] + [Composition / Background Context]
   - Example: "Roasted Coffee Beans Macro Texture in Morning Sunlight" (58 chars)
   - Zero filler words: Never start with "A", "An", "The", "Photo of", "Image of".
   - High commercial intent, descriptive, natural English.

2. DESCRIPTION (1-2 Engaging Sentences):
   - Highlight composition, mood, and practical commercial copy space for designers and marketers.

3. KEYWORDS (Exactly 35 to 45 Tags - STRICT ALGORITHMIC SEARCH RANKING):
   Generate tags categorized into 4 strategic layers ordered by buyer search volume:

   - TIER 1 (Tags 1-10 // PRIMARY ANCHORS - Highest Weight):
     * The exact root nouns and modifiers from the TITLE.
     * Most critical search queries buyers type first (e.g., 'coffee', 'beans', 'roasted', 'espresso', 'caffeine', 'dark roast', 'coffee beans').

   - TIER 2 (Tags 11-20 // VISUAL SPECIFICS & COMPOSITION):
     * Shot type, angle, lighting, colors, background (e.g., 'macro', 'top view', 'close up', 'dark brown', 'texture', 'background', 'natural light', 'flat lay', 'copy space').

   - TIER 3 (Tags 21-30 // COMMERCIAL CONCEPTS & EMOTIONAL RELEVANCE):
     * Moods, abstract concepts, sensory triggers, seasonal associations (e.g., 'freshness', 'morning', 'energy', 'aroma', 'cozy', 'gourmet', 'artisan', 'organic', 'warmth').

   - TIER 4 (Tags 31-40+ // INDUSTRIES, NICHES & APPLICATIONS):
     * End-use markets, professions, business categories (e.g., 'cafe', 'barista', 'coffee shop', 'beverage', 'culinary', 'breakfast', 'hospitality', 'packaging', 'advertising').

==============================================================================
CRITICAL CONSTRAINTS:
==============================================================================
- MAX 2 WORDS PER TAG (e.g., 'coffee beans', 'dark roast' are VALID; 'cup of dark coffee' is INVALID).
- ALL TAGS IN LOWERCASE ENGLISH.
- ZERO TRADEMARKS (no Apple, Canon, Nike, Starbucks, etc.).
- ZERO CAMERA GEAR JARGON (no ISO, 50mm, f/2.8, DSLR).
- NO DUPLICATE TAGS.
- MINIMAL REASONING: Output the final JSON immediately without over-deliberating.

Respond ONLY with valid JSON:
{
  "title": "...",
  "description": "...",
  "keywords": ["tag1", "tag2", "tag3", ...]
}`;

  const requestPayload = {
    model: model,
    messages: [
      { 
        role: 'system', 
        content: 'You are an expert microstock metadata specialist. Respond ONLY with valid JSON conforming to the required schema {"title": "...", "description": "...", "keywords": [...]}. Keep reasoning brief and output the JSON immediately.' 
      },
      { role: 'user', content: systemPrompt }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 6000,
    temperature: 0.1
  };

  writeLog('AI_SEO', 'SEO', `Refining visual metadata via DeepSeek SEO model [Model: ${model}]...`);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/imgmeta-seo',
        'X-Title': 'IMGMETA-SEO'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`SEO API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = (choice?.message?.content || '').trim();
    const reasoning = (choice?.message?.reasoning || '').trim();

    let parsedRaw = null;

    // Helper to find valid JSON in a string
    const tryParse = (str) => {
      if (!str) return null;
      const cleaned = str.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
      try {
        const direct = JSON.parse(cleaned);
        if (direct && (direct.title || direct.keywords)) return direct;
      } catch (e) {}

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const matched = JSON.parse(jsonMatch[0]);
          if (matched && (matched.title || matched.keywords)) return matched;
        } catch (e) {}
      }
      return null;
    };

    parsedRaw = tryParse(content) || tryParse(reasoning);

    if (!parsedRaw) {
      throw new Error(`Invalid JSON format from SEO model. Content: "${content.slice(0, 80)}" | Reasoning: "${reasoning.slice(0, 80)}"`);
    }

    const validated = validateSeoOutput(parsedRaw);
    const usage = data.usage || { prompt_tokens: 350, completion_tokens: 200, total_tokens: 550 };

    writeLog('SUCCESS', 'SEO', `Stage 2 DeepSeek SEO completed successfully (${usage.total_tokens} tokens used)`);

    return {
      seo: validated,
      tokensUsed: usage.total_tokens || 550,
      inputTokens: usage.prompt_tokens || 350,
      outputTokens: usage.completion_tokens || 200,
      modelUsed: model
    };
  } catch (err) {
    logFailure('AI_SEO', 'SEO Refinement API Call', err.message);
    throw err;
  }
}
