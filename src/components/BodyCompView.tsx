import React, { useMemo, useState } from 'react';
import { Scale, Trash2 } from 'lucide-react';
import { BuddyCharacter } from './BuddyCharacter';
import { MultiTrendChart, SERIES_COLORS } from './Charts';
import type { ChartSeries } from './Charts';
import type { BodyLog, FoodLog, MemberProfile } from '../types';
import { computeBodyIndexesFromBmi, getLocalDateStr } from '../types';

interface BodyCompViewProps {
  myProfile: MemberProfile;
  otherMembers: MemberProfile[];
  foodLogs: FoodLog[];
  bodyLogs: BodyLog[];
  justUpdatedBodyTick: number;
  onOpenBodyModal: () => void;
  onDeleteBodyLog: (id: string) => Promise<void>;
}

type MetricKey = 'bmi' | 'bodyFatPct' | 'muscleMassKg' | 'weightKg' | 'ffmi' | 'smi';

const METRIC_META: Record<MetricKey, { label: string; unit: string }> = {
  bmi: { label: 'BMI', unit: 'kg/m²' },
  bodyFatPct: { label: 'Body Fat %', unit: '%' },
  muscleMassKg: { label: 'Muscle Mass', unit: 'kg' },
  weightKg: { label: 'Est. Weight', unit: 'kg' },
  ffmi: { label: 'FFMI', unit: 'kg/m²' },
  smi: { label: 'SMI', unit: 'kg/m²' },
};

export const BodyCompView: React.FC<BodyCompViewProps> = ({
  myProfile,
  otherMembers,
  foodLogs,
  bodyLogs,
  justUpdatedBodyTick,
  onOpenBodyModal,
  onDeleteBodyLog,
}) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('bmi');
  const [includeGroup, setIncludeGroup] = useState(true);

  const myLogs = useMemo(
    () => bodyLogs.filter((b) => b.uid === myProfile.uid),
    [bodyLogs, myProfile.uid]
  );

  const latest = myLogs[0] ?? null;
  const previous = myLogs[1] ?? null;

  const today = getLocalDateStr();
  const todayNutrition = useMemo(() => {
    return foodLogs
      .filter((f) => f.uid === myProfile.uid && f.date === today)
      .reduce(
        (acc, f) => ({
          calories: acc.calories + f.calories,
          proteinG: acc.proteinG + f.proteinG,
        }),
        { calories: 0, proteinG: 0 }
      );
  }, [foodLogs, myProfile.uid, today]);

  const indexes = useMemo(() => {
    if (!latest) return null;
    return computeBodyIndexesFromBmi(
      latest.bmi,
      latest.muscleMassKg,
      latest.bodyFatPct,
      myProfile.heightCm
    );
  }, [latest, myProfile.heightCm]);

  const chartSeries: ChartSeries[] = useMemo(() => {
    const toPoints = (uid: string) =>
      [...bodyLogs]
        .filter((b) => b.uid === uid)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((l) => ({
          date: l.date,
          label: l.date,
          value: l[selectedMetric],
        }));

    const out: ChartSeries[] = [
      {
        id: myProfile.uid,
        name: myProfile.displayName,
        color: SERIES_COLORS[0],
        data: toPoints(myProfile.uid),
      },
    ];

    if (includeGroup) {
      otherMembers.forEach((member, idx) => {
        const pts = toPoints(member.uid);
        if (pts.length > 0) {
          out.push({
            id: member.uid,
            name: member.displayName,
            color: SERIES_COLORS[(idx + 1) % SERIES_COLORS.length],
            data: pts,
          });
        }
      });
    }

    return out;
  }, [bodyLogs, myProfile, otherMembers, selectedMetric, includeGroup]);

  const targetForMetric =
    selectedMetric === 'muscleMassKg'
      ? myProfile.targetMuscleMassKg
      : selectedMetric === 'weightKg'
      ? myProfile.targetWeightKg
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            BMI, Body Fat % &amp; Muscle Mass
          </h2>
          <p className="text-xs text-slate-500">
            Height baseline: {myProfile.heightCm} cm · Target muscle:{' '}
            {myProfile.targetMuscleMassKg} kg
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenBodyModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
        >
          <Scale className="w-3.5 h-3.5" />
          Log Body Check-in
        </button>
      </div>

      {/* Primary 3 Tracked Body Composition Cards */}
      {latest && indexes ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>BMI</span>
                <span className="text-slate-600 font-medium">{indexes.bmiLabel}</span>
              </div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-slate-900">
                {indexes.bmi.toFixed(1)}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500">
                {previous
                  ? `${latest.bmi - previous.bmi >= 0 ? '+' : ''}${(
                      latest.bmi - previous.bmi
                    ).toFixed(1)} vs previous`
                  : 'kg/m² body mass index'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Body Fat</span>
                <span className="font-mono tabular-nums text-slate-600">
                  Lean {indexes.leanMassKg.toFixed(1)} kg
                </span>
              </div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-slate-900">
                {latest.bodyFatPct.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500">
                {previous
                  ? `${latest.bodyFatPct - previous.bodyFatPct >= 0 ? '+' : ''}${(
                      latest.bodyFatPct - previous.bodyFatPct
                    ).toFixed(1)}% vs previous`
                  : 'Body fat percentage'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Muscle Mass</span>
                <span className="font-mono tabular-nums text-slate-600">
                  Target {myProfile.targetMuscleMassKg} kg
                </span>
              </div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-emerald-700">
                {latest.muscleMassKg.toFixed(1)} kg
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500">
                {previous
                  ? `${latest.muscleMassKg - previous.muscleMassKg >= 0 ? '+' : ''}${(
                      latest.muscleMassKg - previous.muscleMassKg
                    ).toFixed(1)} kg vs previous`
                  : `${indexes.musclePct.toFixed(1)}% of est. weight`}
              </div>
            </div>
          </div>

          <div className="px-1 text-xs font-mono tabular-nums text-slate-500">
            Derived estimates ({myProfile.heightCm} cm height): Est. weight{' '}
            {indexes.weightKg.toFixed(1)} kg · SMI {indexes.smi.toFixed(1)} · FFMI{' '}
            {indexes.ffmi.toFixed(1)}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm font-medium text-slate-700">
            No body composition check-ins recorded yet.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Log your BMI, body fat %, and muscle mass to track trends and watch your
            animated KinBuddy react!
          </p>
          <button
            type="button"
            onClick={onOpenBodyModal}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
          >
            <Scale className="w-3.5 h-3.5" />
            Log First Check-in
          </button>
        </div>
      )}

      {/* Companion + Trend Chart Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-4 flex flex-col">
          <BuddyCharacter
            profile={myProfile}
            latestBody={latest}
            previousBody={previous}
            caloriesToday={todayNutrition.calories}
            proteinToday={todayNutrition.proteinG}
            justUpdatedTick={justUpdatedBodyTick}
          />
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(Object.keys(METRIC_META) as MetricKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedMetric(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                    selectedMetric === key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {METRIC_META[key].label}
                </button>
              ))}
            </div>

            {otherMembers.length > 0 && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeGroup}
                  onChange={(e) => setIncludeGroup(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Overlay group trends ({otherMembers.length})
              </label>
            )}
          </div>

          <MultiTrendChart
            title={METRIC_META[selectedMetric].label}
            unit={METRIC_META[selectedMetric].unit}
            series={chartSeries}
            targetValue={targetForMetric}
          />
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Your Body Composition History
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {myLogs.length} entries
          </span>
        </div>

        {myLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Your check-in entries will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Date</th>
                  <th className="text-right py-2.5 px-4 font-medium">BMI</th>
                  <th className="text-right py-2.5 px-4 font-medium">Body Fat</th>
                  <th className="text-right py-2.5 px-4 font-medium">Muscle Mass</th>
                  <th className="text-right py-2.5 px-4 font-medium">Est. Weight</th>
                  <th className="text-right py-2.5 px-4 font-medium">SMI / FFMI</th>
                  <th className="text-left py-2.5 px-4 font-medium">Notes</th>
                  <th className="text-right py-2.5 px-4 font-medium">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myLogs.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {b.date}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {b.bmi.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {b.bodyFatPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                      {b.muscleMassKg.toFixed(1)} kg
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {b.weightKg.toFixed(1)} kg
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {b.smi.toFixed(1)} / {b.ffmi.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 max-w-[180px] truncate">
                      {b.notes || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void onDeleteBodyLog(b.id)}
                        aria-label={`Delete check-in ${b.date}`}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
