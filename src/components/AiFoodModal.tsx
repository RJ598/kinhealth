import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Camera,
  Check,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { CreateFoodInput, CreateFoodPresetInput } from '../hooks/useHouseholdData';
import type {
  AiFoodAnalysis,
  FoodLog,
  FoodPreset,
  MealAutocompleteSuggestion,
  MealType,
} from '../types';
import { getLocalDateStr } from '../types';

interface AiFoodModalProps {
  isOpen: boolean;
  defaultDate: string;
  initialMode?: 'ai' | 'manual' | 'presets';
  editingLog: FoodLog | null;
  foodPresets: FoodPreset[];
  onClose: () => void;
  onSave: (input: CreateFoodInput, editingId?: string) => Promise<void>;
  onCreatePreset: (input: CreateFoodPresetInput) => Promise<void>;
  onDeletePreset: (presetId: string) => Promise<void>;
  onLogPreset: (preset: FoodPreset, date: string, multiplier?: number) => Promise<void>;
}

async function compressImageToDataUrl(fileOrCanvas: File | HTMLCanvasElement): Promise<string> {
  if (fileOrCanvas instanceof HTMLCanvasElement) {
    return fileOrCanvas.toDataURL('image/jpeg', 0.84);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not initialize image canvas.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = () => reject(new Error('Could not decode selected image.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(fileOrCanvas);
  });
}

export const AiFoodModal: React.FC<AiFoodModalProps> = ({
  isOpen,
  defaultDate,
  initialMode = 'ai',
  editingLog,
  foodPresets,
  onClose,
  onSave,
  onCreatePreset,
  onDeletePreset,
  onLogPreset,
}) => {
  const [entryMode, setEntryMode] = useState<'ai' | 'manual' | 'presets'>('ai');
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiFoodAnalysis | null>(null);
  const [portionMult, setPortionMult] = useState<number>(1);
  const [baseSnapshot, setBaseSnapshot] = useState<{
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
  } | null>(null);

  // Form fields
  const [date, setDate] = useState(defaultDate || getLocalDateStr());
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [name, setName] = useState('');
  const [servingNote, setServingNote] = useState('');
  const [calories, setCalories] = useState(0);
  const [proteinG, setProteinG] = useState(0);
  const [carbsG, setCarbsG] = useState(0);
  const [fatG, setFatG] = useState(0);
  const [fiberG, setFiberG] = useState(0);
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [saving, setSaving] = useState(false);

  // Presets UI state
  const [presetSearch, setPresetSearch] = useState('');
  const [presetScale, setPresetScale] = useState<number>(1);
  const [loggingPresetId, setLoggingPresetId] = useState<string | null>(null);
  const [loggedPresetNotice, setLoggedPresetNotice] = useState<string | null>(null);

  // AI Meal Autocomplete state
  const [suggestions, setSuggestions] = useState<MealAutocompleteSuggestion[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteCacheRef = useRef<Map<string, MealAutocompleteSuggestion[]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredPresets = useMemo(() => {
    const q = presetSearch.trim().toLowerCase();
    if (!q) return foodPresets;
    return foodPresets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.servingNote.toLowerCase().includes(q) ||
        p.mealType.toLowerCase().includes(q)
    );
  }, [foodPresets, presetSearch]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      abortRef.current?.abort();
      return;
    }
    if (editingLog) {
      setEntryMode('manual');
      setDate(editingLog.date);
      setMealType(editingLog.mealType);
      setName(editingLog.name);
      setServingNote(editingLog.servingNote);
      setCalories(editingLog.calories);
      setProteinG(editingLog.proteinG);
      setCarbsG(editingLog.carbsG);
      setFatG(editingLog.fatG);
      setFiberG(editingLog.fiberG);
      setSaveAsPreset(false);
      setAiResult(null);
      setPreviewDataUrl(null);
      setBaseSnapshot(null);
      setSuggestions([]);
      setShowSuggestions(false);
      setAutoError(null);
    } else {
      setEntryMode(initialMode);
      setDate(defaultDate || getLocalDateStr());
      setMealType('lunch');
      setName('');
      setServingNote('');
      setCalories(0);
      setProteinG(0);
      setCarbsG(0);
      setFatG(0);
      setFiberG(0);
      setSaveAsPreset(false);
      setPresetSearch('');
      setPresetScale(1);
      setLoggedPresetNotice(null);
      setAiNote('');
      setAiResult(null);
      setAiError(null);
      setPreviewDataUrl(null);
      setPortionMult(1);
      setBaseSnapshot(null);
      setSuggestions([]);
      setShowSuggestions(false);
      setAutoError(null);
    }
  }, [isOpen, editingLog, defaultDate, initialMode]);

  useEffect(() => {
    return () => {
      stopCamera();
      abortRef.current?.abort();
    };
  }, []);

  const matchingPresetSuggestions = useMemo<MealAutocompleteSuggestion[]>(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 2) return [];
    return foodPresets
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.servingNote.toLowerCase().includes(q)
      )
      .slice(0, 4)
      .map((p) => ({
        mealName: p.name,
        suggestedMealType: p.mealType,
        servingNote: p.servingNote ? `Preset · ${p.servingNote}` : 'Saved preset',
        totalCalories: p.calories,
        proteinG: p.proteinG,
        carbsG: p.carbsG,
        fatG: p.fatG,
        fiberG: p.fiberG,
      }));
  }, [foodPresets, name]);

  const fetchAutocomplete = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const cacheKey = trimmed.toLowerCase().replace(/\s+/g, ' ');
    const cached = autocompleteCacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setShowSuggestions(cached.length > 0);
      setAutoError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAutoLoading(true);
    setAutoError(null);
    try {
      const res = await fetch('/api/autocomplete-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load meal suggestions.');
      }
      const list = Array.isArray(data.suggestions)
        ? (data.suggestions as MealAutocompleteSuggestion[])
        : [];
      autocompleteCacheRef.current.set(cacheKey, list);
      setSuggestions(list);
      setShowSuggestions(list.length > 0);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setAutoError(
        err instanceof Error ? err.message : 'Autocomplete failed.'
      );
    } finally {
      if (abortRef.current === controller) {
        setAutoLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  const startCamera = async (nextFacing: 'environment' | 'user' = facingMode) => {
    stopCamera();
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 50);
    } catch {
      setCameraError(
        'Camera access unavailable or denied. You can upload or drop a meal photo instead.'
      );
      setCameraActive(false);
    }
  };

  const captureFromVideo = async () => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth || 1024;
    const h = video.videoHeight || 768;
    const maxDim = 1024;
    let targetW = w;
    let targetH = h;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        targetH = Math.round((h * maxDim) / w);
        targetW = maxDim;
      } else {
        targetW = Math.round((w * maxDim) / h);
        targetH = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, targetW, targetH);
    const dataUrl = await compressImageToDataUrl(canvas);
    stopCamera();
    setPreviewDataUrl(dataUrl);
    setAiResult(null);
    setAiError(null);
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setAiError(null);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      stopCamera();
      setPreviewDataUrl(dataUrl);
      setAiResult(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to load photo.');
    }
  };

  const runAiAnalysis = async () => {
    if (!previewDataUrl) return;
    setAnalyzing(true);
    setAiError(null);
    try {
      const res = await fetch('/api/analyze-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: previewDataUrl,
          mimeType: 'image/jpeg',
          note: aiNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze food photo.');
      }
      const analysis = data as AiFoodAnalysis;
      setAiResult(analysis);
      setName(analysis.mealName || 'Scanned Meal');
      setMealType(analysis.suggestedMealType || 'lunch');
      setServingNote(analysis.servingNote || '');
      const base = {
        calories: Math.round(analysis.totalCalories || 0),
        proteinG: Number((analysis.proteinG || 0).toFixed(1)),
        carbsG: Number((analysis.carbsG || 0).toFixed(1)),
        fatG: Number((analysis.fatG || 0).toFixed(1)),
        fiberG: Number((analysis.fiberG || 0).toFixed(1)),
      };
      setBaseSnapshot(base);
      setPortionMult(1);
      setCalories(base.calories);
      setProteinG(base.proteinG);
      setCarbsG(base.carbsG);
      setFatG(base.fatG);
      setFiberG(base.fiberG);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI photo analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const applyMultiplier = (mult: number) => {
    setPortionMult(mult);
    if (!baseSnapshot) return;
    setCalories(Math.round(baseSnapshot.calories * mult));
    setProteinG(Number((baseSnapshot.proteinG * mult).toFixed(1)));
    setCarbsG(Number((baseSnapshot.carbsG * mult).toFixed(1)));
    setFatG(Number((baseSnapshot.fatG * mult).toFixed(1)));
    setFiberG(Number((baseSnapshot.fiberG * mult).toFixed(1)));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const summary = aiResult
        ? aiResult.items
            .map((i) => `${i.name} (${i.estimatedPortion}, ${Math.round(i.calories)} kcal)`)
            .join('; ')
        : editingLog?.aiItemsSummary || '';

      await onSave(
        {
          date,
          mealType,
          name: name.trim(),
          servingNote: servingNote.trim(),
          calories,
          proteinG,
          carbsG,
          fatG,
          fiberG,
          source: aiResult ? 'ai_photo' : editingLog?.source || 'manual',
          aiConfidence: aiResult ? aiResult.confidence : editingLog?.aiConfidence || '',
          aiItemsSummary: summary,
        },
        editingLog?.id
      );

      if (!editingLog && saveAsPreset) {
        await onCreatePreset({
          name: name.trim(),
          mealType,
          servingNote: servingNote.trim(),
          calories,
          proteinG,
          carbsG,
          fatG,
          fiberG,
        });
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleQuickLogPreset = async (preset: FoodPreset) => {
    setLoggingPresetId(preset.id);
    setLoggedPresetNotice(null);
    try {
      await onLogPreset(preset, date, presetScale);
      setLoggedPresetNotice(`Logged "${preset.name}" (${presetScale}x) to ${date}.`);
    } finally {
      setLoggingPresetId(null);
    }
  };

  const loadPresetIntoManualForm = (preset: FoodPreset) => {
    setName(preset.name);
    setMealType(preset.mealType);
    setServingNote(preset.servingNote);
    const base = {
      calories: preset.calories,
      proteinG: preset.proteinG,
      carbsG: preset.carbsG,
      fatG: preset.fatG,
      fiberG: preset.fiberG,
    };
    setBaseSnapshot(base);
    setPortionMult(presetScale);
    setCalories(Math.round(base.calories * presetScale));
    setProteinG(Number((base.proteinG * presetScale).toFixed(1)));
    setCarbsG(Number((base.carbsG * presetScale).toFixed(1)));
    setFatG(Number((base.fatG * presetScale).toFixed(1)));
    setFiberG(Number((base.fiberG * presetScale).toFixed(1)));
    setSaveAsPreset(false);
    setEntryMode('manual');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {editingLog ? 'Edit Food Entry' : 'Log Food Intake'}
            </h2>
            <p className="text-xs text-slate-500">
              {editingLog
                ? 'Update nutrition values or meal details'
                : 'Snap a meal photo or type a meal for instant AI autocomplete & macro estimates'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {!editingLog && (
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setEntryMode('ai')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  entryMode === 'ai'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                AI Camera &amp; Photo
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setEntryMode('manual');
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  entryMode === 'manual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Type &amp; AI Autocomplete
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setEntryMode('presets');
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  entryMode === 'presets'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daily Presets ({foodPresets.length})
              </button>
            </div>
          )}

          {entryMode === 'presets' && !editingLog && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600">Date</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => e.target.value && setDate(e.target.value)}
                      className="px-2 py-1 text-xs font-mono border border-slate-200 rounded bg-white text-slate-800"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500 mr-1">Portion:</span>
                    {[0.5, 0.75, 1, 1.5, 2].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPresetScale(m)}
                        className={`px-2 py-1 text-xs font-mono rounded ${
                          presetScale === m
                            ? 'bg-slate-900 text-white'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {m}x
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSaveAsPreset(true);
                    setEntryMode('manual');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-white border border-slate-200 rounded-lg hover:bg-emerald-50 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Preset
                </button>
              </div>

              {loggedPresetNotice && (
                <div className="px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-3 text-xs text-emerald-800">
                  <span>{loggedPresetNotice}</span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="font-semibold text-emerald-900 hover:underline whitespace-nowrap"
                  >
                    Done
                  </button>
                </div>
              )}

              {foodPresets.length > 3 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={presetSearch}
                    onChange={(e) => setPresetSearch(e.target.value)}
                    placeholder="Filter saved presets…"
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
              )}

              {foodPresets.length === 0 ? (
                <div className="border border-dashed border-slate-300 rounded-xl p-8 bg-slate-50/60 text-center space-y-3">
                  <div className="w-9 h-9 mx-auto rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                    <Bookmark className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      No saved daily food presets yet
                    </p>
                    <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                      Save meals you eat every day (like breakfast oats, eggs, or protein
                      shakes) so you can log them with a single tap.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSaveAsPreset(true);
                      setEntryMode('manual');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create First Preset
                  </button>
                </div>
              ) : filteredPresets.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  No presets match &ldquo;{presetSearch}&rdquo;.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {filteredPresets.map((preset) => {
                    const scaledCal = Math.round(preset.calories * presetScale);
                    const scaledProt = Number((preset.proteinG * presetScale).toFixed(1));
                    const isLogging = loggingPresetId === preset.id;
                    return (
                      <div
                        key={preset.id}
                        className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/70"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {preset.name}
                          </div>
                          <div className="text-xs text-slate-500 capitalize truncate">
                            {preset.mealType}
                            {preset.servingNote ? ` · ${preset.servingNote}` : ''}
                            {presetScale !== 1 ? ` · ${presetScale}x` : ''}
                          </div>
                          <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-600">
                            <span className="font-semibold text-slate-900">
                              {scaledCal} kcal
                            </span>{' '}
                            ·{' '}
                            <span className="text-emerald-700 font-medium">
                              {scaledProt}g P
                            </span>{' '}
                            · {(preset.carbsG * presetScale).toFixed(0)}g C ·{' '}
                            {(preset.fatG * presetScale).toFixed(0)}g F
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => loadPresetIntoManualForm(preset)}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-white hover:text-slate-900 whitespace-nowrap"
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            disabled={isLogging}
                            onClick={() => void handleQuickLogPreset(preset)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {isLogging ? 'Logging…' : 'Log'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeletePreset(preset.id)}
                            aria-label={`Delete preset ${preset.name}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {entryMode === 'ai' && !editingLog && (
            <div className="space-y-4">
              {cameraActive ? (
                <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-200">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full max-h-72 object-cover"
                  />
                  <div className="p-3 bg-slate-900/90 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const next = facingMode === 'environment' ? 'user' : 'environment';
                        setFacingMode(next);
                        void startCamera(next);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-800"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Flip Camera
                    </button>
                    <button
                      type="button"
                      onClick={captureFromVideo}
                      className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-500"
                    >
                      <Camera className="w-4 h-4" />
                      Click Photo
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : previewDataUrl ? (
                <div className="grid sm:grid-cols-12 gap-4 items-start">
                  <div className="sm:col-span-5 relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                    <img
                      src={previewDataUrl}
                      alt="Captured meal preview"
                      className="w-full h-44 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewDataUrl(null);
                        setAiResult(null);
                      }}
                      className="mt-2 w-full py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border-t border-slate-200"
                    >
                      Retake or Choose Another Photo
                    </button>
                  </div>
                  <div className="sm:col-span-7 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Optional Ingredient / Portion Context
                      </label>
                      <input
                        type="text"
                        maxLength={200}
                        value={aiNote}
                        onChange={(e) => setAiNote(e.target.value)}
                        placeholder="e.g. 200g chicken breast, 1 tbsp olive oil, brown rice"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={runAiAnalysis}
                      disabled={analyzing}
                      className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      {analyzing ? 'Analyzing Meal Photo…' : 'Analyze Calories & Macros with AI'}
                    </button>
                    {aiError && (
                      <p className="text-xs text-red-600">{aiError}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-300 rounded-xl p-6 bg-slate-50/60 text-center space-y-4">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      Take a photo of your plate or upload an image
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      AI estimates individual food items, calories, protein, carbs, fat, and fiber
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => void startCamera('environment')}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      Open Camera
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Upload / Choose Photo
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => void handleFileChange(e.target.files?.[0])}
                    />
                  </div>
                  {cameraError && (
                    <p className="text-xs text-amber-700">{cameraError}</p>
                  )}
                </div>
              )}

              {aiResult && (
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">AI Breakdown</span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span>Confidence: {aiResult.confidence}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500 mr-1">Portion scale:</span>
                      {[0.5, 0.75, 1, 1.5, 2].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => applyMultiplier(m)}
                          className={`px-2 py-1 text-xs font-mono rounded ${
                            portionMult === m
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {m}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {aiResult.items.length > 0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium">Detected Item</th>
                            <th className="text-left py-2 px-3 font-medium">Portion</th>
                            <th className="text-right py-2 px-3 font-medium">kcal</th>
                            <th className="text-right py-2 px-3 font-medium">Protein</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {aiResult.items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="py-1.5 px-3 text-slate-800 font-medium">{item.name}</td>
                              <td className="py-1.5 px-3 text-slate-500">{item.estimatedPortion}</td>
                              <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-700">
                                {Math.round(item.calories * portionMult)}
                              </td>
                              <td className="py-1.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                                {(item.proteinG * portionMult).toFixed(1)}g
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {aiResult.nutritionNote && (
                    <p className="text-xs text-slate-600">{aiResult.nutritionNote}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {(entryMode === 'manual' || aiResult || editingLog) && (
            <form onSubmit={handleSave} className="space-y-4 border-t border-slate-200 pt-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700">
                      Meal / Food Name
                    </label>
                    {entryMode === 'manual' && (
                      <span className="text-[11px] text-slate-400">
                        {autoLoading
                          ? 'Finding AI matches…'
                          : 'Click AI Fill to estimate macros'}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (autoError) setAutoError(null);
                      }}
                      onFocus={() => {
                        if (
                          (suggestions.length > 0 || matchingPresetSuggestions.length > 0) &&
                          entryMode === 'manual'
                        ) {
                          setShowSuggestions(true);
                        }
                      }}
                      placeholder="e.g. 2 boiled eggs and avocado toast"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                    />
                    {entryMode === 'manual' && (
                      <button
                        type="button"
                        onClick={() => void fetchAutocomplete(name)}
                        disabled={autoLoading || name.trim().length < 2}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        <Search className="w-3.5 h-3.5" />
                        {autoLoading ? 'Estimating…' : 'AI Fill'}
                      </button>
                    )}
                  </div>

                  {autoError && entryMode === 'manual' && (
                    <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                      {autoError}
                    </p>
                  )}

                  {entryMode === 'manual' &&
                    ((showSuggestions && suggestions.length > 0) ||
                      matchingPresetSuggestions.length > 0) && (
                      <div className="mt-1.5 border border-slate-200 rounded-lg bg-white divide-y divide-slate-100 shadow-sm overflow-hidden">
                        <div className="px-3 py-1.5 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            {showSuggestions && suggestions.length > 0
                              ? 'AI Meal Suggestions (click to fill)'
                              : 'Matching Daily Presets (click to fill)'}
                          </span>
                          {showSuggestions && suggestions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowSuggestions(false)}
                              className="text-slate-400 hover:text-slate-700"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                        {(showSuggestions && suggestions.length > 0
                          ? suggestions
                          : matchingPresetSuggestions
                        ).map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setName(item.mealName.slice(0, 120));
                              setMealType(item.suggestedMealType || 'lunch');
                              setServingNote(
                                item.servingNote.replace(/^Preset · /, '').slice(0, 120)
                              );
                              const base = {
                                calories: Math.round(item.totalCalories || 0),
                                proteinG: Number((item.proteinG || 0).toFixed(1)),
                                carbsG: Number((item.carbsG || 0).toFixed(1)),
                                fatG: Number((item.fatG || 0).toFixed(1)),
                                fiberG: Number((item.fiberG || 0).toFixed(1)),
                              };
                              setBaseSnapshot(base);
                              setPortionMult(1);
                              setCalories(base.calories);
                              setProteinG(base.proteinG);
                              setCarbsG(base.carbsG);
                              setFatG(base.fatG);
                              setFiberG(base.fiberG);
                              setSuggestions([]);
                              setShowSuggestions(false);
                            }}
                            className="w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-900 truncate">
                                {item.mealName}
                              </div>
                              <div className="text-[11px] text-slate-500 capitalize truncate">
                                {item.suggestedMealType} · {item.servingNote}
                              </div>
                            </div>
                            <div className="text-right font-mono tabular-nums shrink-0 text-[11px]">
                              <div className="font-semibold text-slate-900">
                                {Math.round(item.totalCalories)} kcal
                              </div>
                              <div className="text-emerald-700">
                                {item.proteinG.toFixed(1)}g P · {item.carbsG.toFixed(0)}g C ·{' '}
                                {item.fatG.toFixed(0)}g F
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                  {entryMode === 'manual' && baseSnapshot && (
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-[11px] text-slate-500 mr-1">Portion scale:</span>
                      {[0.5, 0.75, 1, 1.5, 2].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => applyMultiplier(m)}
                          className={`px-2 py-0.5 text-[11px] font-mono rounded ${
                            portionMult === m
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {m}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Meal Type
                  </label>
                  <select
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value as MealType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  >
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Serving Description
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={servingNote}
                    onChange={(e) => setServingNote(e.target.value)}
                    placeholder="e.g. 1 bowl (~400g)"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Calories (kcal)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={15000}
                    value={calories}
                    onChange={(e) => setCalories(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-700 mb-1">
                    Protein (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    min={0}
                    max={1000}
                    value={proteinG}
                    onChange={(e) => setProteinG(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Carbs (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    min={0}
                    max={1500}
                    value={carbsG}
                    onChange={(e) => setCarbsG(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Fat (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    min={0}
                    max={1000}
                    value={fatG}
                    onChange={(e) => setFatG(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Fiber (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    min={0}
                    max={500}
                    value={fiberG}
                    onChange={(e) => setFiberG(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              {!editingLog && (
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={saveAsPreset}
                    onChange={(e) => setSaveAsPreset(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>Also save as a reusable daily preset</span>
                </label>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? 'Saving…' : editingLog ? 'Save Changes' : 'Save to Food Log'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
