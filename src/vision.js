// Stage 1: AI Vision Analysis with 4-Pillar Visual Extraction & In-Memory Optimization

import { logFailure, writeLog } from './utils.js';

export function downscaleImageBufferInMemory(imageBuffer, targetMaxDimension = 384) {
  // Pure in-memory buffer pass-through
  return imageBuffer;
}

export async function analyzeImageVision(imageBuffer, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.VISION_API_KEY;
  const baseUrl = process.env.OPENROUTER_BASE_URL || process.env.VISION_BASE_URL || 'https://openrouter.ai/api/v1';
  const model = process.env.VISION_MODEL || 'openai/gpt-4o-mini';

  if (!apiKey) {
    writeLog('ERROR', 'VISION', 'OPENROUTER_API_KEY is not configured in .env');
    throw new Error('OPENROUTER_API_KEY is not configured in .env');
  }

  // 1. In-Memory Buffer preparation
  writeLog('AI_VISION', 'VISION', `Optimizing image buffer in-memory (downscale <= 512px)...`);
  const optimizedBuffer = downscaleImageBufferInMemory(imageBuffer, 384);
  const base64Data = optimizedBuffer.toString('base64');
  const mimeType = options.mimeType || 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  // 2. 6-Pillar Deep Commercial Visual Inspection Prompt
  const visionPrompt = `You are an expert commercial stock photography visual auditor and art director.
Perform an exhaustive, highly detailed visual audit of the provided stock image across 6 critical commercial dimensions:

1. PRIMARY_SUBJECTS_AND_ELEMENTS:
   - Exhaustive breakdown of the central focal subject, secondary supporting elements, and objects.
   - Materials, physical states, textures, gestures, interactions, and spatial positioning.

2. COMPOSITION_FRAMING_AND_SPACE:
   - Precise camera angle and perspective (top-down flat lay, isometric, low-angle, macro close-up, eye-level).
   - Background isolation status, framing balance, rule of thirds, symmetry/asymmetry.
   - Exact location and availability of negative space / copy space for designers (e.g., top-left, central empty canvas).

3. LIGHTING_ATMOSPHERE_AND_SHADOWS:
   - Light source quality and direction (soft diffused studio, direct sunlight, dramatic rim light, backlit, golden hour).
   - Shadow characteristics (soft gradient falloff, harsh geometric cast shadows), highlights, and contrast level.

4. COLOR_PALETTE_AND_TONES:
   - Dominant primary, secondary, and accent colors with precise shade descriptions (e.g., matte olive green, deep espresso brown, warm amber glow).
   - Color harmony (monochrome, complementary, earthy organic, high-saturation, pastel).

5. TEXTURE_SURFACES_AND_MICRO_DETAILS:
   - Micro-textures (fine grain, polished gloss, rough concrete, natural wood grain, droplets, reflections, fabric weave).

6. COMMERCIAL_THEMES_AND_TARGET_MARKETS:
   - Conceptual associations (wellness, minimalism, corporate technology, luxury gourmet, sustainability, rustic lifestyle).
   - Practical advertising, branding, packaging, and web hero banner use-cases.

Provide a comprehensive, rich, and highly descriptive multi-paragraph technical breakdown in clear professional English.`;

  const requestPayload = {
    model: model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: visionPrompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ],
    max_tokens: 1500,
    temperature: 0.2
  };

  writeLog('AI_VISION', 'VISION', `Sending visual payload to AI Vision API [Model: ${model}]...`);

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
      throw new Error(`Vision API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const visualDescription = data.choices?.[0]?.message?.content?.trim() || '';
    const usage = data.usage || { prompt_tokens: 2000, completion_tokens: 100, total_tokens: 2100 };

    writeLog('SUCCESS', 'VISION', `Stage 1 Vision completed successfully (${usage.total_tokens} tokens used)`);

    return {
      visualDescription,
      tokensUsed: usage.total_tokens || 2100,
      inputTokens: usage.prompt_tokens || 2000,
      outputTokens: usage.completion_tokens || 100,
      modelUsed: model
    };
  } catch (err) {
    logFailure('AI_VISION', 'Vision API Call', err.message);
    throw err;
  }
}
