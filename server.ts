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

const WEEKLY_INSIGHTS_CACHE_TTL_MS = 30 * 60 * 1000;
const weeklyInsightsCache = new Map<string, CacheEntry>();

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

function getCachedWeeklyInsights(key: string): unknown | null {
  const entry = weeklyInsightsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    weeklyInsightsCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedWeeklyInsights(key: string, data: unknown) {
  if (weeklyInsightsCache.size >= 100) {
    const oldestKey = weeklyInsightsCache.keys().next().value;
    if (oldestKey) weeklyInsightsCache.delete(oldestKey);
  }
  weeklyInsightsCache.set(key, {
    data,
    expiresAt: Date.now() + WEEKLY_INSIGHTS_CACHE_TTL_MS,
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

interface WeeklyInsightsDayInput {
  date?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  mealCount?: number;
  topMeals?: string[];
}

interface WeeklyInsightsBody {
  startDate?: string;
  endDate?: string;
  forceRefresh?: boolean;
  targets?: {
    calorieTarget?: number;
    proteinTargetG?: number;
    carbsTargetG?: number;
    fatTargetG?: number;
  };
  dailyBreakdown?: WeeklyInsightsDayInput[];
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/weekly-insights', async (req: Request, res: Response) => {
    try {
      const body = req.body as WeeklyInsightsBody;
      const startDate = String(body.startDate ?? '').trim().slice(0, 20);
      const endDate = String(body.endDate ?? '').trim().slice(0, 20);
      const forceRefresh = Boolean(body.forceRefresh);

      if (!startDate || !endDate || !Array.isArray(body.dailyBreakdown)) {
        res.status(400).json({ error: 'Invalid weekly summary payload.' });
        return;
      }

      const targets = {
        calorieTarget: Math.max(500, Math.min(10000, Number(body.targets?.calorieTarget) || 2000)),
        proteinTargetG: Math.max(20, Math.min(600, Number(body.targets?.proteinTargetG) || 140)),
        carbsTargetG: Math.max(10, Math.min(1000, Number(body.targets?.carbsTargetG) || 200)),
        fatTargetG: Math.max(10, Math.min(500, Number(body.targets?.fatTargetG) || 65)),
      };

      const sanitizedDays = body.dailyBreakdown.slice(0, 7).map((day) => ({
        date: String(day.date ?? '').trim().slice(0, 20),
        calories: Math.max(0, Math.round(Number(day.calories) || 0)),
        proteinG: Math.max(0, Math.round((Number(day.proteinG) || 0) * 10) / 10),
        carbsG: Math.max(0, Math.round((Number(day.carbsG) || 0) * 10) / 10),
        fatG: Math.max(0, Math.round((Number(day.fatG) || 0) * 10) / 10),
        fiberG: Math.max(0, Math.round((Number(day.fiberG) || 0) * 10) / 10),
        mealCount: Math.max(0, Math.min(50, Math.round(Number(day.mealCount) || 0))),
        topMeals: Array.isArray(day.topMeals)
          ? day.topMeals
              .slice(0, 5)
              .map((m) => String(m ?? '').trim().slice(0, 80))
              .filter(Boolean)
          : [],
      }));

      const loggedDays = sanitizedDays.filter((d) => d.mealCount > 0);
      if (loggedDays.length === 0) {
        res.status(400).json({ error: 'Log at least one meal in this 7-day window to generate insights.' });
        return;
      }

      const avgCalories = Math.round(
        loggedDays.reduce((sum, d) => sum + d.calories, 0) / loggedDays.length
      );
      const avgProteinG =
        Math.round((loggedDays.reduce((sum, d) => sum + d.proteinG, 0) / loggedDays.length) * 10) / 10;
      const avgCarbsG =
        Math.round((loggedDays.reduce((sum, d) => sum + d.carbsG, 0) / loggedDays.length) * 10) / 10;
      const avgFatG =
        Math.round((loggedDays.reduce((sum, d) => sum + d.fatG, 0) / loggedDays.length) * 10) / 10;
      const avgFiberG =
        Math.round((loggedDays.reduce((sum, d) => sum + d.fiberG, 0) / loggedDays.length) * 10) / 10;
      const proteinGoalPct = Math.round((avgProteinG / targets.proteinTargetG) * 100);
      const proteinHitDays = loggedDays.filter(
        (d) => d.proteinG >= targets.proteinTargetG * 0.9
      ).length;

      const cacheKey = JSON.stringify({ startDate, endDate, targets, sanitizedDays });
      if (!forceRefresh) {
        const cached = getCachedWeeklyInsights(cacheKey);
        if (cached) {
          res.json(cached);
          return;
        }
      }

      const ai = getAiClient();
      const prompt = [
        `Analyze this user's 7-day nutrition window (${startDate} to ${endDate}).`,
        `Daily Targets: ${targets.calorieTarget} kcal, ${targets.proteinTargetG}g protein, ${targets.carbsTargetG}g carbs, ${targets.fatTargetG}g fat.`,
        `Logged-Day Averages (${loggedDays.length} of 7 days logged): ${avgCalories} kcal/day, ${avgProteinG}g protein/day (${proteinGoalPct}% of goal, hit >=90% goal on ${proteinHitDays}/${loggedDays.length} logged days), ${avgCarbsG}g carbs/day, ${avgFatG}g fat/day, ${avgFiberG}g fiber/day.`,
        `Daily Breakdown JSON: ${JSON.stringify(sanitizedDays)}`,
        'Return concise, specific, encouraging, evidence-based nutrition insights referencing their actual numbers and recurring meals.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are a precision sports nutrition coach summarizing 7 days of logged meals against personal calorie and macronutrient targets. Use ONLY the exact numbers and meal names provided in the user prompt. Keep prose crisp, practical, and free of fluff.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: {
                type: Type.STRING,
                description: 'One concise takeaway sentence summarizing the 7-day nutrition pattern.',
              },
              proteinAssessment: {
                type: Type.STRING,
                description: '2 short sentences comparing average daily protein intake and consistency against the user goal.',
              },
              calorieAssessment: {
                type: Type.STRING,
                description: '2 short sentences evaluating daily energy intake vs target and macro balance (carbs, fat, fiber).',
              },
              highlights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 or 3 specific positive wins observed in the logged meals or days.',
              },
              actionItems: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 or 3 concrete, practical adjustments for next week based on gaps.',
              },
            },
            required: [
              'headline',
              'proteinAssessment',
              'calorieAssessment',
              'highlights',
              'actionItems',
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
      const payload = {
        ...parsed,
        generatedAt: new Date().toISOString(),
      };
      setCachedWeeklyInsights(cacheKey, payload);
      res.json(payload);
    } catch (err: unknown) {
      const parsedErr = parseGeminiError(err);
      if (parsedErr.status === 429) {
        console.warn('Weekly insights rate-limited (429 RESOURCE_EXHAUSTED).');
      } else {
        console.error('Weekly insights error:', parsedErr.code, parsedErr.message);
      }
      res.status(parsedErr.status).json({
        error: parsedErr.message,
        code: parsedErr.code,
      });
    }
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
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (
            base === 'index.html' ||
            base === 'sw.js' ||
            base === 'registerSW.js' ||
            base === 'manifest.webmanifest' ||
            base.startsWith('workbox-')
          ) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  } else {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const viteReady = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: hmrDisabled ? false : true,
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
      return vite.middlewares;
    })();
    viteReady.catch((err) => {
      console.error('Vite middleware initialization failed:', err);
    });
    app.use(async (req: Request, res: Response, next) => {
      try {
        const viteMiddlewares = await viteReady;
        viteMiddlewares(req, res, next);
      } catch (err) {
        console.error('Error handling request during Vite startup:', req.path, err);
        res.status(500).send('Development server failed to initialize.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`KinHealth server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
