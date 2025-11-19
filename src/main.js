import { Actor } from 'apify';
import axios from 'axios';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_PRICING = {
    'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
    'openai/gpt-4o': { input: 2.50, output: 10.00 }
};

const LANGUAGES = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
    pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
    ar: 'Arabic', hi: 'Hindi', nl: 'Dutch', pl: 'Polish', tr: 'Turkish'
};

await Actor.main(async () => {
    const input = await Actor.getInput();
    if (!input?.text) throw new Error('Text is required');
    if (!input?.targetLanguages || input.targetLanguages.length === 0) throw new Error('At least one target language is required');
    if (!input?.openrouterApiKey) throw new Error('OpenRouter API key is required');

    const {
        text,
        sourceLanguage = 'auto',
        targetLanguages,
        preserveFormatting = true,
        context = '',
        model = 'anthropic/claude-3.5-sonnet',
        openrouterApiKey
    } = input;

    console.log(`Translating to ${targetLanguages.length} languages...`);

    const prompt = `Translate the following text to multiple languages.

${context ? `Context: ${context}\n` : ''}Source text: "${text}"
${sourceLanguage !== 'auto' ? `Source language: ${LANGUAGES[sourceLanguage] || sourceLanguage}` : ''}

Target languages: ${targetLanguages.map(lang => LANGUAGES[lang] || lang).join(', ')}

${preserveFormatting ? 'IMPORTANT: Preserve all formatting, HTML tags, and special characters.' : ''}

Return JSON:
{
  "detectedLanguage": "language code",
  "translations": [
    {
      "language": "code",
      "languageName": "name",
      "text": "translated text",
      "confidence": 0.95
    }
  ]
}`;

    const result = await callOpenRouter(prompt, model, openrouterApiKey);
    const response = JSON.parse(result.content);
    const cost = calculateCost(result.usage, model);

    await Actor.pushData({
        originalText: text,
        sourceLanguage: response.detectedLanguage || sourceLanguage,
        translations: response.translations,
        wordCount: text.split(/\s+/).length,
        cost: parseFloat(cost.totalCost.toFixed(6)),
        chargePrice: 0.30,
        profit: parseFloat((0.30 - cost.totalCost).toFixed(4)),
        translatedAt: new Date().toISOString()
    });

    console.log(`✓ Translated to ${targetLanguages.length} languages! Cost: $${cost.totalCost.toFixed(6)}`);
});

async function callOpenRouter(prompt, model, apiKey) {
    const response = await axios.post(OPENROUTER_API_URL, {
        model,
        messages: [
            { role: 'system', content: 'You are an expert translator. Provide accurate, natural-sounding translations.' },
            { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
    }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': 'https://apify.com', 'X-Title': 'Multi-Language Translator' }
    });
    return { content: response.data.choices[0].message.content, usage: response.data.usage };
}

function calculateCost(usage, model) {
    const pricing = MODEL_PRICING[model];
    return { totalCost: (usage.prompt_tokens / 1000000) * pricing.input + (usage.completion_tokens / 1000000) * pricing.output };
}
