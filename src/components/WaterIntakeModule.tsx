import React, { useEffect, useMemo, useState } from 'react';
import { Check, Droplets, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { ProgressBar } from './Charts';
import type { CreateWaterInput } from '../hooks/useHouseholdData';
import type { WaterLog } from '../types';
import { BLUEPRINT_LIMITS, clampNum, formatReadableDate } from '../types';

interface WaterIntakeModuleProps {
  uid: string;
  selectedDate: string;
  waterLogs: WaterLog[];
  onAddWaterLog: (input: CreateWaterInput) => Promise<void>;
  onDeleteWaterLog: (id: string) => Promise<void>;
}

const DEFAULT_WATER_GOAL_ML = 2500;
const GOAL_PRESETS_ML = [1500, 2000, 2500, 3000, 3500];
const QUICK_AMOUNTS = [
  { amountMl: 200, label: 'Small cup' },
  { amountMl: 250, label: 'Glass' },
  { amountMl: 500, label: 'Bottle' },
  { amountMl: 750, label: 'Shaker' },
];

function loadSavedWaterGoal(uid: string): number {
  try {
    const raw = window.localStorage.getItem(`kinhealth:waterGoalMl:${uid}`);
    if (!raw) return DEFAULT_WATER_GOAL_ML;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_WATER_GOAL_ML;
    return clampNum(Math.round(parsed), 500, 6000);
  } catch {
    return DEFAULT_WATER_GOAL_ML;
  }
}

export const WaterIntakeModule: React.FC<WaterIntakeModuleProps> = ({
  uid,
  selectedDate,
  waterLogs,
  onAddWaterLog,
  onDeleteWaterLog,
}) => {
  const [goalMl, setGoalMl] = useState<number>(() => loadSavedWaterGoal(uid));
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState<string>(() =>
    String(loadSavedWaterGoal(uid))
  );
  const [customMlInput, setCustomMlInput] = useState<string>('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAllLogs, setShowAllLogs] = useState(false);

  useEffect(() => {
    const loaded = loadSavedWaterGoal(uid);
    setGoalMl(loaded);
    setGoalInput(String(loaded));
  }, [uid]);

  useEffect(() => {
    setShowAllLogs(false);
  }, [selectedDate]);

  const myDayLogs = useMemo(
    () => waterLogs.filter((w) => w.uid === uid && w.date === selectedDate),
    [waterLogs, uid, selectedDate]
  );

  const totalMl = useMemo(
    () => myDayLogs.reduce((sum, entry) => sum + entry.amountMl, 0),
    [myDayLogs]
  );

  const pct = Math.round((totalMl / Math.max(1, goalMl)) * 100);
  const remainingMl = goalMl - totalMl;
  const goalReached = totalMl >= goalMl;
  const visibleLogs = showAllLogs ? myDayLogs : myDayLogs.slice(0, 4);

  const persistGoal = (nextMl: number) => {
    const safe = clampNum(Math.round(nextMl), 500, 6000);
    setGoalMl(safe);
    setGoalInput(String(safe));
    try {
      window.localStorage.setItem(`kinhealth:waterGoalMl:${uid}`, String(safe));
    } catch {
      // Ignore storage failures in restricted contexts
    }
  };

  const handleQuickAdd = async (amountMl: number, label: string) => {
    const key = `quick_${amountMl}`;
    setBusyKey(key);
    try {
      await onAddWaterLog({
        date: selectedDate,
        amountMl,
        label,
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(customMlInput);
    if (!Number.isFinite(parsed) || parsed < BLUEPRINT_LIMITS.WATER_ML_MIN) return;
    const clamped = clampNum(
      Math.round(parsed),
      BLUEPRINT_LIMITS.WATER_ML_MIN,
      BLUEPRINT_LIMITS.WATER_ML_MAX
    );
    setBusyKey('custom');
    try {
      await onAddWaterLog({
        date: selectedDate,
        amountMl: clamped,
        label: 'Custom pour',
      });
      setCustomMlInput('');
    } finally {
      setBusyKey(null);
    }
  };

  const handleGoalFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(goalInput);
    if (Number.isFinite(parsed) && parsed >= 500) {
      persistGoal(parsed);
    }
    setEditingGoal(false);
  };

  const handleUndoLatest = async () => {
    const latest = myDayLogs[0];
    if (!latest) return;
    setDeletingId(latest.id);
    try {
      await onDeleteWaterLog(latest.id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteWaterLog(id);
    } finally {
      setDeletingId(null);
    }
  };

  const formatEntryTime = (entry: WaterLog): string => {
    const ms = entry.createdAt?.toMillis?.();
    if (!ms) return 'Just now';
    return new Date(ms).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <section
      aria-label="Daily Water Intake"
      className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-sky-600 shrink-0" />
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Daily Water Intake
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {totalMl.toLocaleString()} ml
            </span>{' '}
            <span aria-hidden="true">/</span>{' '}
            <span className="font-mono tabular-nums">
              {goalMl.toLocaleString()} ml
            </span>{' '}
            ({(totalMl / 1000).toFixed(2)} L · {pct}%) ·{' '}
            {formatReadableDate(selectedDate)}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {myDayLogs.length > 0 && (
            <button
              type="button"
              disabled={deletingId === myDayLogs[0].id}
              onClick={() => void handleUndoLatest()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditingGoal((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3 h-3 text-slate-500" />
            Goal {(goalMl / 1000).toFixed(1)} L
          </button>
        </div>
      </div>

      {/* Inline Daily Goal Configurator */}
      {editingGoal && (
        <form
          onSubmit={handleGoalFormSubmit}
          className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-600 mr-1">
              Daily goal:
            </span>
            {GOAL_PRESETS_ML.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  persistGoal(preset);
                  setEditingGoal(false);
                }}
                className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md whitespace-nowrap transition-colors ${
                  goalMl === preset
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {(preset / 1000).toFixed(1)} L
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={500}
              max={6000}
              step={50}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              aria-label="Custom daily water goal in ml"
              className="w-24 px-2.5 py-1 text-xs font-mono tabular-nums border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
            />
            <span className="text-xs text-slate-500">ml</span>
            <button
              type="submit"
              className="px-3 py-1 text-xs font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 whitespace-nowrap"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {/* Progress Track */}
      <div className="space-y-1.5">
        <ProgressBar
          value={totalMl}
          target={goalMl}
          colorClass={goalReached ? 'bg-emerald-600' : 'bg-sky-600'}
        />
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-mono tabular-nums">
            {goalReached ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium font-sans">
                <Check className="w-3.5 h-3.5" />
                Daily hydration goal reached
                {remainingMl < 0
                  ? ` (+${Math.abs(remainingMl).toLocaleString()} ml)`
                  : ''}
              </span>
            ) : (
              `${remainingMl.toLocaleString()} ml remaining to reach goal`
            )}
          </span>
          <span className="font-mono tabular-nums">
            {myDayLogs.length} {myDayLogs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>

      {/* Quick-Add Buttons + Custom Amount */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_AMOUNTS.map((item) => {
            const isBusy = busyKey === `quick_${item.amountMl}`;
            return (
              <button
                key={item.amountMl}
                type="button"
                disabled={busyKey !== null}
                onClick={() => void handleQuickAdd(item.amountMl, item.label)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg hover:bg-sky-600 hover:text-white hover:border-sky-600 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="font-mono tabular-nums">+{item.amountMl} ml</span>
                <span className="font-normal opacity-80 hidden sm:inline">
                  {isBusy ? '…' : item.label}
                </span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleCustomSubmit} className="flex items-center gap-1.5">
          <input
            type="number"
            min={BLUEPRINT_LIMITS.WATER_ML_MIN}
            max={BLUEPRINT_LIMITS.WATER_ML_MAX}
            step={10}
            placeholder="Custom ml"
            value={customMlInput}
            onChange={(e) => setCustomMlInput(e.target.value)}
            aria-label="Custom water amount in milliliters"
            className="w-28 px-2.5 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
          />
          <button
            type="submit"
            disabled={
              busyKey !== null ||
              !customMlInput.trim() ||
              Number(customMlInput) < BLUEPRINT_LIMITS.WATER_ML_MIN
            }
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            {busyKey === 'custom' ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>

      {/* Today's Entries List */}
      {myDayLogs.length > 0 && (
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Hydration log · {formatReadableDate(selectedDate)}</span>
            {myDayLogs.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllLogs((prev) => !prev)}
                className="font-medium text-sky-700 hover:text-sky-800"
              >
                {showAllLogs ? 'Show recent' : `Show all (${myDayLogs.length})`}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {visibleLogs.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50/70 rounded-lg text-xs"
              >
                <div className="min-w-0 truncate">
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    +{entry.amountMl} ml
                  </span>
                  <span className="text-slate-500">
                    {' '}
                    · {entry.label || 'Water'} · {formatEntryTime(entry)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={deletingId === entry.id}
                  onClick={() => void handleDeleteEntry(entry.id)}
                  aria-label={`Delete ${entry.amountMl} ml water entry`}
                  className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
