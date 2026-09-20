// Cost Tracking & Token Pre-Estimation

// Pricing per 1M tokens (USD)
export const MODEL_PRICING = {
  // Vision Models
  'google/gemini-2.0-flash-001': { input: 0.10, output: 0.40 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'qwen/qwen-2.5-vl-72b-instruct': { input: 0.20, output: 0.80 },

  // SEO Text Models
  'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
  'meta-llama/llama-3.3-70b-instruct': { input: 0.12, output: 0.30 },

  // Default fallback
  'default': { input: 0.15, output: 0.50 }
};

export function calculateCost(model, tokensInput = 0, tokensOutput = 0) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
  const inputCost = (tokensInput / 1_000_000) * pricing.input;
  const outputCost = (tokensOutput / 1_000_000) * pricing.output;
  return Number((inputCost + outputCost).toFixed(6));
}

export function estimateVisionTokens(imageWidth = 384, imageHeight = 384) {
  // Downscaled image to 384x384 consumes ~1200 - 2400 tokens on modern vision models
  return 2000;
}

export function estimateSeoTokens(promptLength = 300, outputTargetLength = 400) {
  const inputTokens = Math.ceil(promptLength / 4);
  const outputTokens = Math.ceil(outputTargetLength / 4);
  return { inputTokens, outputTokens };
}
