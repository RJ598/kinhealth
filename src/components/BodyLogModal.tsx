import React, { useEffect, useMemo, useState } from 'react';
import { Check, Scale, Sparkles, X } from 'lucide-react';
import type { CreateBodyInput, CreateWeightInput } from '../hooks/useHouseholdData';
import type { BodyLog, WeightLog } from '../types';
import {
  buildCombinedWeightTimeline,
  computeBmiFromWeight,
  computeBodyIndexes,
  daysBetweenDates,
  getLocalDateStr,
} from '../types';

export type BodyModalMode = 'weight' | 'composition';

interface BodyLogModalProps {
  isOpen: boolean;
  initialMode?: BodyModalMode;
  defaultDate?: string;
  heightCm: number;
  targetWeightKg: number;
  latestBodyLog: BodyLog | null;
  latestWeightLog: WeightLog | null;
  onClose: () => void;
  onSaveWeight: (input: CreateWeightInput) => Promise<void>;
  onSaveComposition: (input: CreateBodyInput) => Promise<void>;
}

export const BodyLogModal: React.FC<BodyLogModalProps> = ({
  isOpen,
  initialMode = 'weight',
  defaultDate,
  heightCm,
  targetWeightKg,
  latestBodyLog,
  latestWeightLog,
  onClose,
  onSaveWeight,
  onSaveComposition,
}) => {
  const latestCombined = useMemo(() => {
    const timeline = buildCombinedWeightTimeline(
      latestWeightLog ? [latestWeightLog] : [],
      latestBodyLog ? [latestBodyLog] : [],
      heightCm
    );
    return timeline[0] ?? null;
  }, [latestWeightLog, latestBodyLog, heightCm]);

  const [mode, setMode] = useState<BodyModalMode>(initialMode);
  const [date, setDate] = useState(defaultDate || getLocalDateStr());
  const [weightKg, setWeightKg] = useState<number>(
    latestCombined?.weightKg || targetWeightKg || 70
  );
  const [bodyFatPct, setBodyFatPct] = useState<number>(latestBodyLog?.bodyFatPct || 18);
  const [muscleMassKg, setMuscleMassKg] = useState<number>(
    latestBodyLog?.muscleMassKg || 34
  );
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setDate(defaultDate || getLocalDateStr());
    setWeightKg(latestCombined?.weightKg || targetWeightKg || 70);
    setBodyFatPct(latestBodyLog?.bodyFatPct || 18);
    setMuscleMassKg(latestBodyLog?.muscleMassKg || 34);
    setNotes('');
  }, [isOpen, initialMode, defaultDate, latestCombined?.weightKg, targetWeightKg, latestBodyLog]);

  const weightPreview = useMemo(
    () => computeBmiFromWeight(weightKg, heightCm),
    [weightKg, heightCm]
  );

  const compPreview = useMemo(
    () => computeBodyIndexes(weightKg, muscleMassKg, bodyFatPct, heightCm),
    [weightKg, muscleMassKg, bodyFatPct, heightCm]
  );

  const daysSinceComp = useMemo(() => {
    if (!latestBodyLog) return null;
    return daysBetweenDates(latestBodyLog.date, getLocalDateStr());
  }, [latestBodyLog]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (mode === 'weight') {
        await onSaveWeight({
          date,
          weightKg,
          notes,
        });
      } else {
        await onSaveComposition({
          date,
          weightKg,
          muscleMassKg,
          bodyFatPct,
          notes,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const weightDeltaToGoal = Number((weightPreview.weightKg - targetWeightKg).toFixed(1));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {mode === 'weight' ? 'Log Body Weight' : 'Weekly Fat & Muscle Check-in'}
            </h2>
            <p className="text-xs text-slate-500">
              {mode === 'weight'
                ? 'Quick weigh-in · fat & muscle indexes are logged once a week'
                : 'Weekly scan · records fat %, muscle mass, weight, BMI, SMI & FFMI'}
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

        {/* Mode Tabs */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('weight')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                mode === 'weight'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              Body Weight
            </button>
            <button
              type="button"
              onClick={() => setMode('composition')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                mode === 'composition'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Weekly Fat &amp; Muscle
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Date
              </label>
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
                Body Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                required
                min={20}
                max={400}
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
          </div>

          {mode === 'composition' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Body Fat (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  min={2}
                  max={75}
                  value={bodyFatPct}
                  onChange={(e) => setBodyFatPct(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-emerald-700 mb-1">
                  Muscle Mass (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  min={5}
                  max={200}
                  value={muscleMassKg}
                  onChange={(e) => setMuscleMassKg(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>
            </div>
          )}

          {mode === 'weight' ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <p className="text-xs font-medium text-slate-500">
                Weight Preview (from {heightCm} cm height · Goal {targetWeightKg} kg)
              </p>
              <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
                <div>
                  <div className="text-[11px] text-slate-500">Weight</div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                    {weightPreview.weightKg.toFixed(1)} kg
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {weightDeltaToGoal === 0
                      ? 'At goal weight'
                      : `${weightDeltaToGoal > 0 ? '+' : ''}${weightDeltaToGoal.toFixed(1)} kg vs goal`}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Derived BMI</div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                    {weightPreview.bmi.toFixed(1)}
                  </div>
                  <div className="text-[11px] text-slate-500">{weightPreview.bmiLabel}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Weekly Scan</div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                    {daysSinceComp === null
                      ? 'Not yet'
                      : daysSinceComp === 0
                        ? 'Today'
                        : `${daysSinceComp}d ago`}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {daysSinceComp !== null && daysSinceComp >= 7 ? 'Weekly scan due' : 'Once a week'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-medium text-slate-500 mb-2">
                Derived Body Indexes (from {weightPreview.weightKg.toFixed(1)} kg · {heightCm} cm)
              </p>
              <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
                <div>
                  <div className="text-[11px] text-slate-500">BMI</div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                    {compPreview.bmi.toFixed(1)}
                  </div>
                  <div className="text-[11px] text-slate-500">{compPreview.bmiLabel}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Lean Mass</div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                    {compPreview.leanMassKg.toFixed(1)} kg
                  </div>
                  <div className="text-[11px] text-slate-500">{compPreview.musclePct}% muscle</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">FFMI / SMI</div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                    {compPreview.ffmi.toFixed(1)} / {compPreview.smi.toFixed(1)}
                  </div>
                  <div className="text-[11px] text-slate-500">kg/m²</div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Notes (optional)
            </label>
            <input
              type="text"
              maxLength={240}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                mode === 'weight' ? 'e.g. Morning fasted weigh-in' : 'e.g. Weekly smart scale scan'
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3">
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
              {saving
                ? 'Saving…'
                : mode === 'weight'
                  ? 'Save Weight'
                  : 'Save Weekly Scan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
