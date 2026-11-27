import React, { useMemo, useState } from 'react';
import { Scale, Trash2 } from 'lucide-react';
import { BuddyCharacter } from './BuddyCharacter';
import { MultiTrendChart, SERIES_COLORS } from './Charts';
import type { ChartSeries } from './Charts';
import type { BodyLog, FoodLog, MemberProfile, WeightLog } from '../types';
import {
  buildCombinedWeightTimeline,
  computeBmiFromWeight,
  computeBodyIndexesFromBmi,
  daysBetweenDates,
  getLocalDateStr,
} from '../types';

interface BodyCompViewProps {
  myProfile: MemberProfile;
  otherMembers: MemberProfile[];
  foodLogs: FoodLog[];
  bodyLogs: BodyLog[];
  weightLogs: WeightLog[];
  justUpdatedBodyTick: number;
  onOpenBodyModal: (mode?: 'weight' | 'composition') => void;
  onDeleteBodyLog: (id: string) => Promise<void>;
  onDeleteWeightLog: (id: string) => Promise<void>;
}

type MetricKey = 'weightKg' | 'bmi' | 'bodyFatPct' | 'muscleMassKg' | 'ffmi' | 'smi';

const METRIC_META: Record<MetricKey, { label: string; unit: string }> = {
  weightKg: { label: 'Weight', unit: 'kg' },
  bmi: { label: 'BMI', unit: 'kg/m²' },
  bodyFatPct: { label: 'Body Fat %', unit: '%' },
  muscleMassKg: { label: 'Muscle Mass', unit: 'kg' },
  ffmi: { label: 'FFMI', unit: 'kg/m²' },
  smi: { label: 'SMI', unit: 'kg/m²' },
};

export const BodyCompView: React.FC<BodyCompViewProps> = ({
  myProfile,
  otherMembers,
  foodLogs,
  bodyLogs,
  weightLogs,
  justUpdatedBodyTick,
  onOpenBodyModal,
  onDeleteBodyLog,
  onDeleteWeightLog,
}) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('weightKg');
  const [includeGroup, setIncludeGroup] = useState(true);

  const myBodyLogs = useMemo(
    () => bodyLogs.filter((b) => b.uid === myProfile.uid),
    [bodyLogs, myProfile.uid]
  );

  const myWeightLogs = useMemo(
    () => weightLogs.filter((w) => w.uid === myProfile.uid),
    [weightLogs, myProfile.uid]
  );

  const myWeightTimeline = useMemo(
    () => buildCombinedWeightTimeline(myWeightLogs, myBodyLogs, myProfile.heightCm),
    [myWeightLogs, myBodyLogs, myProfile.heightCm]
  );

  const latestWeightEntry = myWeightTimeline[0] ?? null;
  const previousWeightEntry = myWeightTimeline[1] ?? null;
  const latestBody = myBodyLogs[0] ?? null;
  const previousBody = myBodyLogs[1] ?? null;
  const latestWeightOnly = myWeightLogs[0] ?? null;

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

  const bmiMeta = useMemo(() => {
    if (!latestWeightEntry) return null;
    return computeBmiFromWeight(latestWeightEntry.weightKg, myProfile.heightCm);
  }, [latestWeightEntry, myProfile.heightCm]);

  const indexes = useMemo(() => {
    if (!latestBody) return null;
    return computeBodyIndexesFromBmi(
      latestBody.bmi,
      latestBody.muscleMassKg,
      latestBody.bodyFatPct,
      myProfile.heightCm
    );
  }, [latestBody, myProfile.heightCm]);

  const daysSinceComp = useMemo(() => {
    if (!latestBody) return null;
    return daysBetweenDates(latestBody.date, today);
  }, [latestBody, today]);

  const allMembersByUid = useMemo(() => {
    const map = new Map<string, MemberProfile>();
    map.set(myProfile.uid, myProfile);
    otherMembers.forEach((m) => map.set(m.uid, m));
    return map;
  }, [myProfile, otherMembers]);

  const chartSeries: ChartSeries[] = useMemo(() => {
    const toPoints = (uid: string) => {
      if (selectedMetric === 'weightKg' || selectedMetric === 'bmi') {
        const height = allMembersByUid.get(uid)?.heightCm ?? 172;
        const combined = buildCombinedWeightTimeline(
          weightLogs.filter((w) => w.uid === uid),
          bodyLogs.filter((b) => b.uid === uid),
          height
        );
        // Keep newest entry per date, then sort chronologically ascending for chart
        const byDate = new Map<string, (typeof combined)[number]>();
        for (const item of combined) {
          if (!byDate.has(item.date)) {
            byDate.set(item.date, item);
          }
        }
        return Array.from(byDate.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((item) => ({
            date: item.date,
            label: item.date,
            value: selectedMetric === 'weightKg' ? item.weightKg : item.bmi,
          }));
      }

      return [...bodyLogs]
        .filter((b) => b.uid === uid)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((l) => ({
          date: l.date,
          label: l.date,
          value: l[selectedMetric],
        }));
    };

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
  }, [
    selectedMetric,
    allMembersByUid,
    weightLogs,
    bodyLogs,
    myProfile,
    includeGroup,
    otherMembers,
  ]);

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
            Weight &amp; Body Composition
          </h2>
          <p className="text-xs text-slate-500">
            Height {myProfile.heightCm} cm · Target weight {myProfile.targetWeightKg} kg · Fat
            &amp; muscle indexes checked once a week
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenBodyModal('weight')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
        >
          <Scale className="w-3.5 h-3.5" />
          Log Weight / Body Check-in
        </button>
      </div>

      {/* Primary KPI Cards */}
      {latestWeightEntry || latestBody ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Body Weight</span>
                <span className="font-mono tabular-nums text-slate-600">
                  Target {myProfile.targetWeightKg} kg
                </span>
              </div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-slate-900">
                {latestWeightEntry ? `${latestWeightEntry.weightKg.toFixed(1)} kg` : '—'}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500">
                {latestWeightEntry && previousWeightEntry
                  ? `${
                      latestWeightEntry.weightKg - previousWeightEntry.weightKg >= 0 ? '+' : ''
                    }${(latestWeightEntry.weightKg - previousWeightEntry.weightKg).toFixed(
                      1
                    )} kg vs previous`
                  : latestWeightEntry
                    ? `Logged ${latestWeightEntry.date}`
                    : 'No weigh-in yet'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>BMI</span>
                <span className="text-slate-600 font-medium">
                  {bmiMeta ? bmiMeta.bmiLabel : 'Height baseline'}
                </span>
              </div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-slate-900">
                {bmiMeta ? bmiMeta.bmi.toFixed(1) : '—'}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500">
                {latestWeightEntry && previousWeightEntry
                  ? `${latestWeightEntry.bmi - previousWeightEntry.bmi >= 0 ? '+' : ''}${(
                      latestWeightEntry.bmi - previousWeightEntry.bmi
                    ).toFixed(1)} vs previous`
                  : `Derived from ${myProfile.heightCm} cm`}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Body Fat (Weekly)</span>
                <span className="font-mono tabular-nums text-slate-600">
                  {indexes ? `Lean ${indexes.leanMassKg.toFixed(1)} kg` : 'Once a week'}
                </span>
              </div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-slate-900">
                {latestBody ? `${latestBody.bodyFatPct.toFixed(1)}%` : '—'}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500">
                {latestBody && previousBody
                  ? `${latestBody.bodyFatPct - previousBody.bodyFatPct >= 0 ? '+' : ''}${(
                      latestBody.bodyFatPct - previousBody.bodyFatPct
                    ).toFixed(1)}% vs prev scan`
                  : daysSinceComp !== null
                    ? daysSinceComp >= 7
                      ? `Weekly scan due (${daysSinceComp}d ago)`
                      : `Last scan ${daysSinceComp === 0 ? 'today' : `${daysSinceComp}d ago`}`
                    : 'Record weekly scan'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Muscle Mass (Weekly)</span>
                <span className="font-mono tabular-nums text-slate-600">
                  Target {myProfile.targetMuscleMassKg} kg
                </span>
              </div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-emerald-700">
                {latestBody ? `${latestBody.muscleMassKg.toFixed(1)} kg` : '—'}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500">
                {latestBody && previousBody
                  ? `${latestBody.muscleMassKg - previousBody.muscleMassKg >= 0 ? '+' : ''}${(
                      latestBody.muscleMassKg - previousBody.muscleMassKg
                    ).toFixed(1)} kg vs prev scan`
                  : indexes
                    ? `${indexes.musclePct.toFixed(1)}% of scan weight`
                    : 'Record weekly scan'}
              </div>
            </div>
          </div>

          {indexes && (
            <div className="px-1 text-xs font-mono tabular-nums text-slate-500">
              Latest weekly indexes ({latestBody?.date}): SMI {indexes.smi.toFixed(1)} · FFMI{' '}
              {indexes.ffmi.toFixed(1)} · Lean mass {indexes.leanMassKg.toFixed(1)} kg
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm font-medium text-slate-700">
            No body weight or weekly composition check-ins recorded yet.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Log your body weight anytime and add your fat % and muscle mass once a week.
          </p>
          <button
            type="button"
            onClick={() => onOpenBodyModal('weight')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
          >
            <Scale className="w-3.5 h-3.5" />
            Log Weight / Body Check-in
          </button>
        </div>
      )}

      {/* Companion + Trend Chart Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-4 flex flex-col">
          <BuddyCharacter
            profile={myProfile}
            latestBody={latestBody}
            previousBody={previousBody}
            latestWeightLog={latestWeightOnly}
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

      {/* Daily Weight Logs History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Body Weight Log History
            </h3>
            <p className="text-xs text-slate-500">Daily weigh-ins · fat &amp; muscle tracked weekly below</p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {myWeightLogs.length} entries
          </span>
        </div>

        {myWeightLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No standalone weight entries yet. Click &ldquo;Log Weight&rdquo; for quick daily
            weigh-ins.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Date</th>
                  <th className="text-right py-2.5 px-4 font-medium">Weight</th>
                  <th className="text-right py-2.5 px-4 font-medium">BMI</th>
                  <th className="text-left py-2.5 px-4 font-medium">Notes</th>
                  <th className="text-right py-2.5 px-4 font-medium">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myWeightLogs.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {w.date}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {w.weightKg.toFixed(1)} kg
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {w.bmi.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 max-w-[220px] truncate">
                      {w.notes || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void onDeleteWeightLog(w.id)}
                        aria-label={`Delete weight entry ${w.date}`}
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

      {/* Weekly Composition History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Weekly Fat &amp; Muscle Check-ins
            </h3>
            <p className="text-xs text-slate-500">Full composition scans taken once a week</p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {myBodyLogs.length} scans
          </span>
        </div>

        {myBodyLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Your weekly fat % and muscle mass scans will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Date</th>
                  <th className="text-right py-2.5 px-4 font-medium">Weight</th>
                  <th className="text-right py-2.5 px-4 font-medium">BMI</th>
                  <th className="text-right py-2.5 px-4 font-medium">Body Fat</th>
                  <th className="text-right py-2.5 px-4 font-medium">Muscle Mass</th>
                  <th className="text-right py-2.5 px-4 font-medium">SMI / FFMI</th>
                  <th className="text-left py-2.5 px-4 font-medium">Notes</th>
                  <th className="text-right py-2.5 px-4 font-medium">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myBodyLogs.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {b.date}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {b.weightKg.toFixed(1)} kg
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {b.bmi.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {b.bodyFatPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                      {b.muscleMassKg.toFixed(1)} kg
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
