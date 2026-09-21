// Stage 2: Elite Microstock SEO & Keywording Algorithm Specialist

import { logFailure, writeLog } from './utils.js';

export const TITLE_MAX_LEN = 200;
export const KEYWORDS_MIN = 25;
export const KEYWORDS_TARGET = 40;
export const KEYWORDS_MAX = 49;

export const OFFICIAL_SHUTTERSTOCK_CATEGORIES = [
  'Abstract',
  'Animals/Wildlife',
  'Arts',
  'Backgrounds/Textures',
  'Beauty/Fashion',
  'Buildings/Landmarks',
  'Business/Finance',
  'Celebrities',
  'Education',
  'Food and drink',
  'Healthcare/Medical',
  'Holidays',
  'Industrial',
  'Interiors',
  'Miscellaneous',
  'Nature',
  'Objects',
  'Parks/Outdoor',
  'People',
  'Religion',
  'Science',
  'Signs/Symbols',
  'Sports/Recreation',
  'Technology',
  'Transportation',
  'Vintage'
];

export const FORBIDDEN_TERMS = new Set([
  'canon', 'nikon', 'sony', 'fujifilm', 'leica', 'panasonic', 'olympus', 'hasselblad',
  'apple', 'iphone', 'ipad', 'macbook', 'samsung', 'huawei', 'xiaomi', 'starbucks', 'nespresso',
  'nike', 'adidas', 'puma', 'gucci', 'prada', 'louis vuitton', 'zara',
  'porsche', 'bmw', 'mercedes', 'ferrari', 'lamborghini', 'tesla', 'toyota', 'honda',
  'iso', 'f/2.8', '50mm', 'shutter', 'dslr', 'megapixels', 'raw format',
  'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tags', 'keyword', 'keywords'
]);

export function getWordStem(word) {
  if (typeof word !== 'string') return '';
  let w = word.toLowerCase().trim();
  if (w.length <= 3) return w;

  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ves') && w.length > 4) return w.slice(0, -3) + 'f';
  if ((w.endsWith('gy') || w.endsWith('y')) && w.length >= 4 && !w.endsWith('ay') && !w.endsWith('ey') && !w.endsWith('oy') && !w.endsWith('sky')) {
    let base = w.slice(0, -1);
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) {
      base = base.slice(0, -1);
    }
    return base;
  }
  if (w.endsWith('es') && w.length > 4 && !w.endsWith('sches') && !w.endsWith('shes')) {
    const base = w.slice(0, -2);
    if (base.endsWith('x') || base.endsWith('ch') || base.endsWith('sh') || base.endsWith('ss') || base.endsWith('z')) {
      return base;
    }
  }
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') && w.length > 3) {
    return w.slice(0, -1);
  }
  if (w.endsWith('ing') && w.length > 5) {
    let base = w.slice(0, -3);
    if (base.length > 3 && base[base.length - 1] === base[base.length - 2]) {
      base = base.slice(0, -1);
    }
    return base;
  }
  if (w.endsWith('ed') && w.length > 4) {
    let base = w.slice(0, -2);
    if (base.length > 3 && base[base.length - 1] === base[base.length - 2]) {
      base = base.slice(0, -1);
    }
    return base;
  }
  return w;
}

export function hasStemCollision(cleanList, candidate) {
  const candNorm = candidate.toLowerCase().trim();
  const candStem = getWordStem(candNorm);

  for (const existing of cleanList) {
    const exNorm = existing.toLowerCase().trim();
    const exStem = getWordStem(exNorm);

    // Exact match check
    if (candNorm === exNorm) return true;

    // Single-word stem collision check
    if (!candNorm.includes(' ') && !exNorm.includes(' ')) {
      if (candStem === exStem || candStem === exNorm || candNorm === exStem) {
        return true;
      }
    }
  }
  return false;
}

export function validateSeoOutput(raw) {
  let title = (raw.title || '').trim();
  let description = (raw.description || '').trim();
  let rawKeywords = Array.isArray(raw.keywords) ? raw.keywords : [];
  let rawCategories = Array.isArray(raw.categories) ? raw.categories : (typeof raw.categories === 'string' ? [raw.categories] : []);

  // 1. Remove leading filler words from title
  title = title.replace(/^(a|an|the|photo of|image of|close up of)\s+/i, '').trim();

  // 2. Clamp title to max 200 characters cleanly
  if (title.length > TITLE_MAX_LEN) {
    const truncated = title.slice(0, TITLE_MAX_LEN);
    const lastSpace = truncated.lastIndexOf(' ');
    title = (lastSpace > 100 ? truncated.slice(0, lastSpace) : truncated).trim();
  }

  // 3. Validate & Sanitize Keywords (Stemming deduplication, no trademarks, max 2 words per tag)
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
        if (!FORBIDDEN_TERMS.has(sw) && !hasStemCollision(cleanKeywords, sw) && cleanKeywords.length < KEYWORDS_MAX) {
          cleanKeywords.push(sw);
        }
      }
      continue;
    }

    // Filter forbidden brand / camera terms
    if (FORBIDDEN_TERMS.has(kw)) continue;

    if (!hasStemCollision(cleanKeywords, kw) && cleanKeywords.length < KEYWORDS_MAX) {
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
    if (!cleanKeywords.slice(0, 10).includes(tw) && !hasStemCollision(cleanKeywords.slice(0, 10), tw)) {
      // Remove if it exists later and move to top
      const existingIdx = cleanKeywords.findIndex(k => getWordStem(k) === getWordStem(tw));
      if (existingIdx !== -1) {
        cleanKeywords.splice(existingIdx, 1);
      }
      cleanKeywords.unshift(tw);
    }
  }

  // Ensure minimum 7 keywords by extracting from title/description if AI output had too few
  if (cleanKeywords.length < 7 && (title || description)) {
    const textWords = `${title} ${description}`
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 3 && !FORBIDDEN_TERMS.has(w));
    
    for (const tw of textWords) {
      if (!hasStemCollision(cleanKeywords, tw) && cleanKeywords.length < 50) {
        cleanKeywords.push(tw);
      }
      if (cleanKeywords.length >= 7) break;
    }
  }

  // 5. Description Validation (Ensure 1-2 flowing descriptive sentences, not a keyword list)
  const isDotList = description.split(/\.\s+/).length >= 3 && description.split(/\.\s+/).every(s => s.trim().split(' ').length <= 2);
  const isCommaList = description.split(/,\s+/).length >= 4 && description.split(/,\s+/).every(s => s.trim().split(' ').length <= 2);
  
  if (!description || isDotList || isCommaList) {
    description = `${title}. Commercial high-quality stock asset ready for marketing, creative designs, and editorial publications.`;
  }

  // 6. Validate & Normalize Categories (Strictly 1 to 2 from OFFICIAL_SHUTTERSTOCK_CATEGORIES)
  const cleanCategories = [];
  for (const catCandidate of rawCategories) {
    if (typeof catCandidate !== 'string') continue;
    const match = OFFICIAL_SHUTTERSTOCK_CATEGORIES.find(
      c => c.toLowerCase() === catCandidate.trim().toLowerCase()
    );
    if (match && !cleanCategories.includes(match) && cleanCategories.length < 2) {
      cleanCategories.push(match);
    }
  }

  // Smart Fallback Category Inferencing if AI returned invalid or empty categories
  if (cleanCategories.length === 0) {
    const textBlob = `${title} ${description} ${cleanKeywords.join(' ')}`.toLowerCase();
    
    if (/food|coffee|drink|fruit|vegetable|dish|meal|beverage|gourmet|cafe|restaurant|tea|espresso/i.test(textBlob)) {
      cleanCategories.push('Food and drink');
    }
    if (/tree|leaf|flower|plant|sky|nature|sunlight|forest|landscape|cloud|sunset|mountain|garden|animal|wildlife/i.test(textBlob)) {
      cleanCategories.push('Nature');
    }
    if (/building|architecture|city|urban|landmark|facade|house|structure|tower|wall|concrete/i.test(textBlob)) {
      cleanCategories.push('Buildings/Landmarks');
    }
    if (/business|office|finance|money|work|corporate|team|meeting|market|laptop/i.test(textBlob)) {
      cleanCategories.push('Business/Finance');
    }
    if (/texture|background|pattern|abstract|surface|macro|wood|stone|material/i.test(textBlob)) {
      if (cleanCategories.length < 2) cleanCategories.push('Backgrounds/Textures');
    }
    if (/tech|digital|computer|data|screen|mobile|phone|code|network|software/i.test(textBlob)) {
      if (cleanCategories.length < 2) cleanCategories.push('Technology');
    }
    if (/car|vehicle|road|transport|drive|bus|train|plane|traffic|auto/i.test(textBlob)) {
      if (cleanCategories.length < 2) cleanCategories.push('Transportation');
    }

    if (cleanCategories.length === 0) {
      cleanCategories.push('Objects');
    }
  }

  const finalKeywords = cleanKeywords.slice(0, KEYWORDS_MAX);
  writeLog('SEO', 'VALIDATE', `Title (${title.length}/${TITLE_MAX_LEN} chars): "${title}" | Categories: [${cleanCategories.join(', ')}] | Keywords: ${finalKeywords.length} tags`);

  return {
    title,
    description,
    categories: cleanCategories.slice(0, 2),
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

  const systemPrompt = `You are the World's Leading Microstock SEO & Keywording Algorithm Specialist (expert in Shutterstock, Adobe Stock, and Freepik indexing).

Your mission is to craft maximum-visibility, high-converting metadata for stock buyers based on this visual analysis:
"${visualDescription}"

==============================================================================
ALGORITHMIC METADATA & KEYWORD BEST PRACTICES:
==============================================================================

1. STOCK TITLE (Up to 200 Characters):
   - FORMULA: [Primary Focal Object] + [Micro-Textures/Materials] + [Camera Perspective/Angle] + [Lighting & Color] + [Commercial Context]
   - Example: "Freshly Roasted Dark Espresso Coffee Beans Macro Texture Shot with Warm Ambient Lighting and Copy Space for Cafe Advertising"
   - Zero filler words: Never start with "A", "An", "The", "Photo of", "Image of".

2. DESCRIPTION (1-2 Descriptive Sentences):
   - Answer Who, What, When, Where, Why + mood and commercial utility.
   - MUST be a flowing descriptive sentence, NOT a list of keywords.

3. CATEGORIES (Select 1 to 2 from Official 26 List):
   - Select ONLY from: ["Abstract", "Animals/Wildlife", "Arts", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance", "Celebrities", "Education", "Food and drink", "Healthcare/Medical", "Holidays", "Industrial", "Interiors", "Miscellaneous", "Nature", "Objects", "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vintage"]

4. KEYWORDS (Exactly 30 to 45 Tags - 4-LAYER KEYWORD PYRAMID):
   - LAYER 1 (SPECIFIC OBJECTS // Tags 1-10): Focal subjects and primary nouns from title (e.g., 'shiba inu', 'espresso', 'facade').
   - LAYER 2 (BROADER TOPICS // Tags 11-20): Main categories & industries (e.g., 'dog', 'pet', 'coffee', 'architecture').
   - LAYER 3 (CONCEPTS & MOOD // Tags 21-30): Emotional triggers, abstract concepts, sensory moods (e.g., 'playful', 'loyalty', 'minimalism', 'aroma').
   - LAYER 4 (RELEVANT ASSOCIATIONS // Tags 31-45): Commercial uses, backgrounds, shot angles, textures (e.g., 'background', 'pattern', 'macro', 'lighting').

==============================================================================
STRICT CONSTRAINTS (PREVENT REJECTION):
==============================================================================
- NO STEMMING / PLURAL DUPLICATES: Never generate plural forms if singular is present (e.g., DO NOT output both 'dog' and 'dogs', or 'flower' and 'flowers').
- MAX 2 WORDS PER TAG (e.g., 'coffee beans', 'dark roast' are VALID; 'cup of dark coffee' is INVALID).
- ALL TAGS IN LOWERCASE ENGLISH.
- ZERO TRADEMARKS (no Apple, Canon, Nike, Starbucks, etc.).
- ZERO CAMERA GEAR JARGON (no ISO, 50mm, f/2.8, DSLR).
- MINIMAL REASONING: Output the final JSON immediately.

Respond ONLY with valid JSON:
{
  "title": "...",
  "description": "...",
  "categories": ["Category 1", "Category 2"],
  "keywords": ["tag1", "tag2", "tag3", ...]
}`;

  const requestPayload = {
    model: model,
    messages: [
      { 
        role: 'system', 
        content: 'You are an expert microstock metadata specialist. Respond ONLY with valid JSON conforming to the required schema {"title": "...", "description": "...", "categories": [...], "keywords": [...]}. Keep reasoning brief and output the JSON immediately.' 
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
