import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PORT = 3000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const AUTOCOMPLETE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const autocompleteCache = new Map<string, CacheEntry>();

function getCachedAutocomplete(key: string): unknown | null {
  const entry = autocompleteCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    autocompleteCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedAutocomplete(key: string, data: unknown) {
  if (autocompleteCache.size >= 250) {
    const oldestKey = autocompleteCache.keys().next().value;
    if (oldestKey) autocompleteCache.delete(oldestKey);
  }
  autocompleteCache.set(key, {
    data,
    expiresAt: Date.now() + AUTOCOMPLETE_CACHE_TTL_MS,
  });
}

function parseGeminiError(err: unknown): {
  status: number;
  code: string;
  message: string;
} {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown AI error');
  const statusProp =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : NaN;

  if (raw.includes('GEMINI_API_KEY')) {
    return {
      status: 500,
      code: 'MISSING_API_KEY',
      message: raw,
    };
  }

  if (
    statusProp === 429 ||
    raw.includes('"code":429') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.toLowerCase().includes('quota')
  ) {
    return {
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message:
        'Daily Gemini AI free-tier quota exceeded. Use a billing-enabled GEMINI_API_KEY (in Settings > Secrets or your server/Kubernetes secret) for higher limits, or enter nutrition values manually / use Daily Presets.',
    };
  }

  if (
    statusProp === 403 ||
    statusProp === 400 ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('PERMISSION_DENIED')
  ) {
    return {
      status: statusProp === 403 ? 403 : 400,
      code: 'API_KEY_ERROR',
      message:
        'Gemini API key was rejected or lacks permission. Verify your GEMINI_API_KEY value (and make sure the Generative Language API is enabled on its project).',
    };
  }

  if (statusProp === 404 || raw.includes('NOT_FOUND')) {
    return {
      status: 404,
      code: 'MODEL_NOT_FOUND',
      message:
        'Configured Gemini model was not found for your API key. Check your key permissions or model availability.',
    };
  }

  return {
    status: 502,
    code: 'UPSTREAM_ERROR',
    message: 'AI nutrition service is temporarily unavailable. Please try again or enter values manually.',
  };
}

function getAiClient(): GoogleGenAI {
  const rawKey = process.env.GEMINI_API_KEY ?? '';
  const apiKey = rawKey.trim().replace(/^['"]|['"]$/g, '');
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Set the GEMINI_API_KEY environment variable (or Kubernetes secret kinhealth-secrets) and restart the server.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface AnalyzeFoodBody {
  imageBase64?: string;
  mimeType?: string;
  note?: string;
}

interface AutocompleteMealBody {
  query?: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/autocomplete-meal', async (req: Request, res: Response) => {
    try {
      const body = req.body as AutocompleteMealBody;
      const queryText = (body.query ?? '').trim().slice(0, 140);
      if (queryText.length < 2) {
        res.status(400).json({ error: 'Enter at least 2 characters to autocomplete.' });
        return;
      }

      const cacheKey = queryText.toLowerCase().replace(/\s+/g, ' ');
      const cached = getCachedAutocomplete(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Provide 4 realistic meal autocomplete suggestions and nutrition estimates for the user's partial or complete meal query: "${queryText}".`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are a precision nutrition database assistant. Given a partial or full meal description, return 4 distinct, realistic meal completions with accurate serving sizes, total calories, protein (g), carbs (g), fat (g), and fiber (g). If the user specifies exact quantities (e.g. "3 eggs and 2 toast"), make the first suggestion match those exact quantities.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    mealName: { type: Type.STRING },
                    suggestedMealType: {
                      type: Type.STRING,
                      enum: ['breakfast', 'lunch', 'dinner', 'snack'],
                    },
                    servingNote: { type: Type.STRING },
                    totalCalories: { type: Type.NUMBER },
                    proteinG: { type: Type.NUMBER },
                    carbsG: { type: Type.NUMBER },
                    fatG: { type: Type.NUMBER },
                    fiberG: { type: Type.NUMBER },
                  },
                  required: [
                    'mealName',
                    'suggestedMealType',
                    'servingNote',
                    'totalCalories',
                    'proteinG',
                    'carbsG',
                    'fatG',
                    'fiberG',
                  ],
                },
              },
            },
            required: ['suggestions'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'AI model returned an empty response.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      setCachedAutocomplete(cacheKey, parsed);
      res.json(parsed);
    } catch (err: unknown) {
      const parsedErr = parseGeminiError(err);
      if (parsedErr.status === 429) {
        console.warn('Meal autocomplete rate-limited (429 RESOURCE_EXHAUSTED).');
      } else {
        console.error('Meal autocomplete error:', parsedErr.code, parsedErr.message);
      }
      res.status(parsedErr.status).json({
        error: parsedErr.message,
        code: parsedErr.code,
      });
    }
  });

  app.post('/api/analyze-food', async (req: Request, res: Response) => {
    try {
      const body = req.body as AnalyzeFoodBody;
      const rawBase64 = (body.imageBase64 ?? '').trim();
      const mimeType = (body.mimeType ?? 'image/jpeg').trim();
      const note = (body.note ?? '').trim().slice(0, 300);

      if (!rawBase64) {
        res.status(400).json({ error: 'No image data provided.' });
        return;
      }

      const allowedMimes = new Set([
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/heic',
      ]);
      const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
      if (!allowedMimes.has(normalizedMime)) {
        res.status(400).json({ error: `Unsupported image format: ${mimeType}` });
        return;
      }

      // Strip data URL prefix if present
      const base64Data = rawBase64.includes(',') ? rawBase64.split(',')[1] ?? '' : rawBase64;
      if (!base64Data) {
        res.status(400).json({ error: 'Invalid base64 image payload.' });
        return;
      }

      const ai = getAiClient();

      const promptText = [
        'Analyze this meal or food photo carefully for nutrition tracking.',
        'Identify every visible food item, estimate realistic portion weights/volumes, and calculate total calories, protein (g), carbohydrates (g), fat (g), and fiber (g).',
        note ? `Additional user context about ingredients/portion: "${note}".` : '',
        'Be realistic with cooking oils, sauces, and visible portion sizes. Round calories to nearest whole number and macros to 1 decimal place.',
      ]
        .filter(Boolean)
        .join(' ');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime,
                data: base64Data,
              },
            },
            {
              text: promptText,
            },
          ],
        },
        config: {
          systemInstruction:
            'You are a precision clinical sports nutritionist and dietitian. Given a food photo, return accurate, realistic calorie and macronutrient estimates in strict JSON.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mealName: {
                type: Type.STRING,
                description: 'Concise, natural title for the meal (max 80 chars).',
              },
              suggestedMealType: {
                type: Type.STRING,
                enum: ['breakfast', 'lunch', 'dinner', 'snack'],
              },
              servingNote: {
                type: Type.STRING,
                description: 'Estimated total portion description (e.g. "1 plate (~450g)").',
              },
              totalCalories: { type: Type.NUMBER },
              proteinG: { type: Type.NUMBER },
              carbsG: { type: Type.NUMBER },
              fatG: { type: Type.NUMBER },
              fiberG: { type: Type.NUMBER },
              confidence: {
                type: Type.STRING,
                enum: ['high', 'medium', 'low'],
              },
              nutritionNote: {
                type: Type.STRING,
                description: 'One brief sentence about protein quality or calorie drivers.',
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    estimatedPortion: { type: Type.STRING },
                    calories: { type: Type.NUMBER },
                    proteinG: { type: Type.NUMBER },
                    carbsG: { type: Type.NUMBER },
                    fatG: { type: Type.NUMBER },
                  },
                  required: ['name', 'estimatedPortion', 'calories', 'proteinG', 'carbsG', 'fatG'],
                },
              },
            },
            required: [
              'mealName',
              'suggestedMealType',
              'servingNote',
              'totalCalories',
              'proteinG',
              'carbsG',
              'fatG',
              'fiberG',
              'confidence',
              'nutritionNote',
              'items',
            ],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'AI model returned an empty response.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err: unknown) {
      const parsedErr = parseGeminiError(err);
      if (parsedErr.status === 429) {
        console.warn('Food analysis rate-limited (429 RESOURCE_EXHAUSTED).');
      } else {
        console.error('Food analysis error:', parsedErr.code, parsedErr.message);
      }
      res.status(parsedErr.status).json({
        error: parsedErr.message,
        code: parsedErr.code,
      });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  } else {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        ws: hmrDisabled ? false : undefined,
      },
      plugins: hmrDisabled
        ? [
            {
              name: 'disable-hmr-client-socket',
              transform(code: string, id: string) {
                const cleanId = id.split('?')[0].replace(/\\/g, '/');
                if (cleanId.endsWith('/vite/dist/client/client.mjs')) {
                  return {
                    code: code.replace(
                      /let wsTransport = createWebSocketModuleRunnerTransport\(\{\s*createConnection:[\s\S]*?pingInterval:[^\n]*\n\s*\}\);/,
                      'let wsTransport = { async connect() {}, async disconnect() {}, send() {} };'
                    ),
                    map: null,
                  };
                }
              },
            },
          ]
        : [],
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`KinHealth server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
