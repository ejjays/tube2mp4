import { GoogleGenAI } from '@google/genai';
import { logger } from '../../utils/infra/logger.util.js';
import { secureFetch } from '../../utils/network/security.util.js';
import { recordFailure } from '../../utils/infra/metrics.util.js';

type GroqResponse = {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
};

type GetModelFn = (options: { model: string }) => {
  generateContent: (prompt: string) => Promise<{
    response: { text: () => string };
  }>;
};

const client =
  process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== ''
    ? (new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) as unknown as {
        getGenerativeModel: GetModelFn;
      })
    : null;

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  year: number | string;
  isrc?: string;
  duration: number;
}

export interface AIQueryResult {
  query: string | null;
  confidence: number;
}

const aiCache = new Map<string, AIQueryResult>();

async function queryGroq(promptText: string): Promise<AIQueryResult | null> {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const response = await secureFetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: promptText }],
          response_format: { type: 'json_object' },
        }),
      }
    );
    if (response.ok) {
      const data: GroqResponse = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;
      return JSON.parse(
        content.trim().replace(/```json|```/gu, '')
      ) as AIQueryResult;
    }
  } catch (error: unknown) {
    const err = error as Error;
    recordFailure('resolve:ai_groq');
    logger.debug('[SpotifyAI] Groq error:', err.message);
  }
  return null;
}

async function queryGemini(promptText: string): Promise<AIQueryResult | null> {
  if (!client) return null;
  const modelsToTry = ['gemini-3.1-flash-lite'];

  for (const modelName of modelsToTry) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(promptText);
      const text = result.response
        .text()
        .trim()
        .replace(/```json|```/gu, '');
      if (text) return JSON.parse(text) as AIQueryResult;
    } catch (error: unknown) {
      const err = error as Error;
      recordFailure('resolve:ai_gemini');
      logger.debug(`[SpotifyAI] Gemini error (${modelName}):`, err.message);
    }
  }
  return null;
}

export async function refineSearchWithAI(
  metadata: TrackMetadata
): Promise<AIQueryResult> {
  const cacheKey = `${metadata.title}-${metadata.artist}`.toLowerCase();
  const cached = aiCache.get(cacheKey);
  if (cached) return cached;

  const promptText = `Act as a Professional Music Query Architect.
        DATA: Title: "${metadata.title}", Artist: "${metadata.artist}", Album: "${metadata.album}", Year: "${metadata.year}", VERIFIED_ISRC: "${metadata.isrc || 'NONE'}", Duration: ${Math.round(metadata.duration / 1000)}s
        TASK: Create a high-precision YouTube search query. Include ISRC if provided. RETURN JSON ONLY: {"query": "Artist Title [ISRC] Topic", "confidence": 100}`;

  const result =
    (await queryGroq(promptText)) || (await queryGemini(promptText));
  if (result) aiCache.set(cacheKey, result);
  return result || { query: null, confidence: 0 };
}
