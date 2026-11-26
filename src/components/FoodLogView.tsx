import React, { useMemo, useState } from 'react';
import { BookmarkPlus, Check, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { FoodLog, FoodPreset, MealType, MemberProfile } from '../types';
import { getLocalDateStr, shiftDateStr } from '../types';

interface FoodLogViewProps {
  myProfile: MemberProfile;
  members: MemberProfile[];
  foodLogs: FoodLog[];
  foodPresets: FoodPreset[];
  selectedDate: string;
  onOpenFoodModal: (
    editLog?: FoodLog,
    initialMode?: 'ai' | 'manual' | 'presets'
  ) => void;
  onDeleteFoodLog: (id: string) => Promise<void>;
  onLogPreset: (preset: FoodPreset, date: string) => Promise<void>;
  onDeletePreset: (presetId: string) => Promise<void>;
  onSaveLogAsPreset: (log: FoodLog) => Promise<void>;
}

export const FoodLogView: React.FC<FoodLogViewProps> = ({
  myProfile,
  members,
  foodLogs,
  foodPresets,
  selectedDate,
  onOpenFoodModal,
  onDeleteFoodLog,
  onLogPreset,
  onDeletePreset,
  onSaveLogAsPreset,
}) => {
  const [search, setSearch] = useState('');
  const [whoFilter, setWhoFilter] = useState<string>(myProfile.uid);
  const [mealFilter, setMealFilter] = useState<'all' | MealType>('all');
  const [rangeFilter, setRangeFilter] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [loggingPresetId, setLoggingPresetId] = useState<string | null>(null);
  const [justLoggedPresetId, setJustLoggedPresetId] = useState<string | null>(null);
  const [savedPresetFromLogId, setSavedPresetFromLogId] = useState<string | null>(null);

  const today = getLocalDateStr();
  const minDate = useMemo(() => {
    if (rangeFilter === 'today') return today;
    if (rangeFilter === '7d') return shiftDateStr(today, -6);
    if (rangeFilter === '30d') return shiftDateStr(today, -29);
    return '';
  }, [rangeFilter, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return foodLogs.filter((log) => {
      if (whoFilter !== 'all' && log.uid !== whoFilter) return false;
      if (mealFilter !== 'all' && log.mealType !== mealFilter) return false;
      if (minDate && log.date < minDate) return false;
      if (
        q &&
        !log.name.toLowerCase().includes(q) &&
        !log.aiItemsSummary.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [foodLogs, whoFilter, mealFilter, minDate, search]);

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, l) => ({
        calories: acc.calories + l.calories,
        proteinG: acc.proteinG + l.proteinG,
        carbsG: acc.carbsG + l.carbsG,
        fatG: acc.fatG + l.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    );
  }, [filtered]);

  const handleQuickLogPreset = async (preset: FoodPreset) => {
    setLoggingPresetId(preset.id);
    try {
      await onLogPreset(preset, selectedDate);
      setJustLoggedPresetId(preset.id);
      setTimeout(() => {
        setJustLoggedPresetId((curr) => (curr === preset.id ? null : curr));
      }, 1500);
    } finally {
      setLoggingPresetId(null);
    }
  };

  const handleSaveAsPreset = async (log: FoodLog) => {
    await onSaveLogAsPreset(log);
    setSavedPresetFromLogId(log.id);
    setTimeout(() => {
      setSavedPresetFromLogId((curr) => (curr === log.id ? null : curr));
    }, 1800);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Food &amp; Calorie Ledger
          </h2>
          <p className="text-xs text-slate-500">
            Search, filter, and review all logged meals from camera AI, presets,
            autocomplete, and manual entries
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenFoodModal(undefined, 'presets')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Daily Presets ({foodPresets.length})
          </button>
          <button
            type="button"
            onClick={() => onOpenFoodModal(undefined, 'manual')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Type Meal
          </button>
        </div>
      </div>

      {/* Saved Daily Presets Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              {members.length > 1 ? 'Shared Group Presets' : 'Saved Daily Presets'}
            </h3>
            <p className="text-xs text-slate-500">
              {members.length > 1
                ? `Shared across all group members · tap Log to add to ${selectedDate}, or bookmark any row below`
                : `Tap Log to add a saved meal to ${selectedDate}, or bookmark any row below to reuse it daily`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenFoodModal(undefined, 'presets')}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
          >
            + New Preset
          </button>
        </div>

        {foodPresets.length === 0 ? (
          <div className="py-3 text-xs text-slate-500">
            No presets saved yet. Save any meal from the table below or create one in the
            Daily Presets tab.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {foodPresets.map((preset) => {
              const isBusy = loggingPresetId === preset.id;
              const wasLogged = justLoggedPresetId === preset.id;
              const isMine = preset.uid === myProfile.uid;
              return (
                <div
                  key={preset.id}
                  className="px-3.5 py-2.5 bg-slate-50/70 rounded-lg flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {preset.name}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 truncate">
                      <span className="capitalize font-sans">{preset.mealType}</span> ·{' '}
                      {preset.calories} kcal · {preset.proteinG}g P
                      {members.length > 1 && preset.authorName && (
                        <span className="font-sans">
                          {' '}
                          · by {isMine ? 'You' : preset.authorName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleQuickLogPreset(preset)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        wasLogged
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-white border border-slate-200 text-slate-800 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'
                      }`}
                    >
                      {wasLogged ? (
                        <>
                          <Check className="w-3 h-3" />
                          Logged
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          Log
                        </>
                      )}
                    </button>
                    {isMine && (
                      <button
                        type="button"
                        onClick={() => void onDeletePreset(preset.id)}
                        aria-label={`Delete preset ${preset.name}`}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search foods or ingredients…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['today', '7d', '30d', 'all'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRangeFilter(r)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                  rangeFilter === r
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r === 'today' ? 'Today' : r === 'all' ? 'All Time' : r.toUpperCase()}
              </button>
            ))}
          </div>

          <select
            value={mealFilter}
            onChange={(e) => setMealFilter(e.target.value as 'all' | MealType)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
          >
            <option value="all">All Meals</option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
        </div>

        {members.length > 1 && (
          <select
            value={whoFilter}
            onChange={(e) => setWhoFilter(e.target.value)}
            aria-label="Filter by group member"
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
          >
            <option value={myProfile.uid}>{myProfile.displayName} (You)</option>
            <option value="all">All Group Members ({members.length})</option>
            {members
              .filter((m) => m.uid !== myProfile.uid)
              .map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.displayName}
                </option>
              ))}
          </select>
        )}
      </div>

      {/* Filtered Totals Strip */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
        <span className="text-slate-500">
          Showing{' '}
          <strong className="text-slate-900 font-mono tabular-nums">{filtered.length}</strong>{' '}
          entries
        </span>
        <div className="flex flex-wrap items-center gap-5 font-mono tabular-nums">
          <span className="text-slate-900 font-semibold">
            {Math.round(summary.calories)} kcal
          </span>
          <span className="text-emerald-700 font-semibold">
            {summary.proteinG.toFixed(1)}g Protein
          </span>
          <span className="text-slate-600">{summary.carbsG.toFixed(1)}g Carbs</span>
          <span className="text-slate-600">{summary.fatG.toFixed(1)}g Fat</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-700">No matching meals found.</p>
            <p className="mt-1 text-xs text-slate-500">
              Try expanding your date range or snap a meal photo to log a new entry.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Date</th>
                  <th className="text-left py-2.5 px-4 font-medium">Meal</th>
                  {members.length > 1 && (
                    <th className="text-left py-2.5 px-4 font-medium">Member</th>
                  )}
                  <th className="text-right py-2.5 px-4 font-medium">Calories</th>
                  <th className="text-right py-2.5 px-4 font-medium">Protein</th>
                  <th className="text-right py-2.5 px-4 font-medium">Carbs</th>
                  <th className="text-right py-2.5 px-4 font-medium">Fat</th>
                  <th className="text-right py-2.5 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((log) => {
                  const isMine = log.uid === myProfile.uid;
                  const justSaved = savedPresetFromLogId === log.id;
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {log.date}
                      </td>
                      <td className="py-2.5 px-4 max-w-xs">
                        <div className="font-medium text-slate-900 truncate">{log.name}</div>
                        <div className="text-[11px] text-slate-500 capitalize truncate">
                          {log.mealType} ·{' '}
                          {log.source === 'ai_photo'
                            ? 'AI Photo'
                            : log.source === 'preset'
                              ? 'Preset'
                              : 'Logged'}
                          {log.servingNote ? ` · ${log.servingNote}` : ''}
                        </div>
                      </td>
                      {members.length > 1 && (
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                          {log.authorName}
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {log.calories}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                        {log.proteinG.toFixed(1)}g
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {log.carbsG.toFixed(1)}g
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {log.fatG.toFixed(1)}g
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleSaveAsPreset(log)}
                            title="Save as daily preset"
                            aria-label={`Save ${log.name} as daily preset`}
                            className={`p-1 rounded ${
                              justSaved
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-slate-400 hover:text-emerald-700'
                            }`}
                          >
                            {justSaved ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <BookmarkPlus className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {isMine && (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenFoodModal(log)}
                                aria-label={`Edit ${log.name}`}
                                className="p-1 text-slate-400 hover:text-slate-700"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void onDeleteFoodLog(log.id)}
                                aria-label={`Delete ${log.name}`}
                                className="p-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
