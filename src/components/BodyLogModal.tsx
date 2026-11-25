import React, { useEffect, useMemo, useState } from 'react';
import { X, Check } from 'lucide-react';
import type { CreateBodyInput } from '../hooks/useHouseholdData';
import type { BodyLog } from '../types';
import { computeBodyIndexesFromBmi, getLocalDateStr } from '../types';

interface BodyLogModalProps {
  isOpen: boolean;
  heightCm: number;
  latestBodyLog: BodyLog | null;
  onClose: () => void;
  onSave: (input: CreateBodyInput) => Promise<void>;
}

export const BodyLogModal: React.FC<BodyLogModalProps> = ({
  isOpen,
  heightCm,
  latestBodyLog,
  onClose,
  onSave,
}) => {
  const [date, setDate] = useState(getLocalDateStr());
  const [bmi, setBmi] = useState(latestBodyLog?.bmi || 22.5);
  const [bodyFatPct, setBodyFatPct] = useState(latestBodyLog?.bodyFatPct || 18);
  const [muscleMassKg, setMuscleMassKg] = useState(latestBodyLog?.muscleMassKg || 34);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDate(getLocalDateStr());
    setBmi(latestBodyLog?.bmi || 22.5);
    setBodyFatPct(latestBodyLog?.bodyFatPct || 18);
    setMuscleMassKg(latestBodyLog?.muscleMassKg || 34);
    setNotes('');
  }, [isOpen, latestBodyLog]);

  const preview = useMemo(
    () => computeBodyIndexesFromBmi(bmi, muscleMassKg, bodyFatPct, heightCm),
    [bmi, muscleMassKg, bodyFatPct, heightCm]
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        date,
        bmi,
        muscleMassKg,
        bodyFatPct,
        notes,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Log Body Composition
            </h2>
            <p className="text-xs text-slate-500">
              Enter BMI, Body Fat %, and Muscle Mass — your KinBuddy updates right away
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Check-in Date
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                BMI
              </label>
              <input
                type="number"
                step="0.1"
                required
                min={10}
                max={60}
                value={bmi}
                onChange={(e) => setBmi(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>

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

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">
              Summary &amp; Derived Estimates (from {heightCm} cm height)
            </p>
            <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
              <div>
                <div className="text-[11px] text-slate-500">BMI Range</div>
                <div className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                  {preview.bmi.toFixed(1)}
                </div>
                <div className="text-[11px] text-slate-500">{preview.bmiLabel}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Est. Weight</div>
                <div className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                  {preview.weightKg.toFixed(1)} kg
                </div>
                <div className="text-[11px] text-slate-500">{preview.musclePct}% muscle</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">FFMI / SMI</div>
                <div className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                  {preview.ffmi.toFixed(1)} / {preview.smi.toFixed(1)}
                </div>
                <div className="text-[11px] text-slate-500">kg/m²</div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Notes (optional)
            </label>
            <input
              type="text"
              maxLength={240}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Morning check-in"
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
              {saving ? 'Saving…' : 'Save Check-in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
