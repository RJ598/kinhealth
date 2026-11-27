import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { ProgressBar } from './Charts';
import type {
  FoodLog,
  MemberProfile,
  WeeklyInsightDayBreakdown,
  WeeklyNutritionInsight,
} from '../types';
import { shiftDateStr } from '../types';

interface WeeklyInsightsCardProps {
  myProfile: MemberProfile;
  foodLogs: FoodLog[];
  selectedDate: string;
}

const SESSION_CACHE_PREFIX = 'kinhealth_weekly_insights_v1:';

function formatShortDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatRangeLabel(startDate: string, endDate: string): string {
  const parse = (ds: string) => {
    const [y, m, d] = ds.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const s = parse(startDate);
  const e = parse(endDate);
  const sTxt = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const eTxt = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${sTxt} – ${eTxt}`;
}

function readCachedInsight(key: string): WeeklyNutritionInsight | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeeklyNutritionInsight;
    if (!parsed || typeof parsed.headline !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedInsight(key: string, data: WeeklyNutritionInsight): void {
  try {
    sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export const WeeklyInsightsCard: React.FC<WeeklyInsightsCardProps> = ({
  myProfile,
  foodLogs,
  selectedDate,
}) => {
  const startDate = useMemo(() => shiftDateStr(selectedDate, -6), [selectedDate]);
  const endDate = selectedDate;

  const { dailyBreakdown, stats, signature } = useMemo(() => {
    const dates: string[] = [];
    for (let i = -6; i <= 0; i++) {
      dates.push(shiftDateStr(selectedDate, i));
    }

    const myLogsInWindow = foodLogs.filter(
      (l) => l.uid === myProfile.uid && l.date >= startDate && l.date <= endDate
    );

    const byDate = new Map<string, FoodLog[]>();
    for (const log of myLogsInWindow) {
      const existing = byDate.get(log.date);
      if (existing) existing.push(log);
      else byDate.set(log.date, [log]);
    }

    const breakdown: WeeklyInsightDayBreakdown[] = dates.map((date) => {
      const logs = byDate.get(date) ?? [];
      const totals = logs.reduce(
        (acc, l) => ({
          calories: acc.calories + l.calories,
          proteinG: acc.proteinG + l.proteinG,
          carbsG: acc.carbsG + l.carbsG,
          fatG: acc.fatG + l.fatG,
          fiberG: acc.fiberG + l.fiberG,
        }),
        { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }
      );
      const topMeals = [...logs]
        .sort((a, b) => b.calories - a.calories)
        .slice(0, 4)
        .map((l) => l.name);

      return {
        date,
        calories: Math.round(totals.calories),
        proteinG: Math.round(totals.proteinG * 10) / 10,
        carbsG: Math.round(totals.carbsG * 10) / 10,
        fatG: Math.round(totals.fatG * 10) / 10,
        fiberG: Math.round(totals.fiberG * 10) / 10,
        mealCount: logs.length,
        topMeals,
      };
    });

    const loggedDays = breakdown.filter((d) => d.mealCount > 0);
    const loggedCount = loggedDays.length;

    const avgCalories =
      loggedCount > 0
        ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedCount)
        : 0;
    const avgProteinG =
      loggedCount > 0
        ? Math.round((loggedDays.reduce((s, d) => s + d.proteinG, 0) / loggedCount) * 10) / 10
        : 0;
    const avgCarbsG =
      loggedCount > 0
        ? Math.round((loggedDays.reduce((s, d) => s + d.carbsG, 0) / loggedCount) * 10) / 10
        : 0;
    const avgFatG =
      loggedCount > 0
        ? Math.round((loggedDays.reduce((s, d) => s + d.fatG, 0) / loggedCount) * 10) / 10
        : 0;
    const avgFiberG =
      loggedCount > 0
        ? Math.round((loggedDays.reduce((s, d) => s + d.fiberG, 0) / loggedCount) * 10) / 10
        : 0;

    const proteinPct = Math.round(
      (avgProteinG / Math.max(1, myProfile.proteinTargetG)) * 100
    );
    const caloriePct = Math.round(
      (avgCalories / Math.max(1, myProfile.calorieTarget)) * 100
    );
    const proteinHitDays = loggedDays.filter(
      (d) => d.proteinG >= myProfile.proteinTargetG * 0.9
    ).length;

    const totalMeals = myLogsInWindow.length;
    const totalCalSum = loggedDays.reduce((s, d) => s + d.calories, 0);
    const totalProtSum = Math.round(loggedDays.reduce((s, d) => s + d.proteinG, 0));
    const sig = [
      myProfile.uid,
      startDate,
      endDate,
      myProfile.calorieTarget,
      myProfile.proteinTargetG,
      totalMeals,
      totalCalSum,
      totalProtSum,
    ].join(':');

    return {
      dailyBreakdown: breakdown,
      stats: {
        loggedCount,
        totalMeals,
        avgCalories,
        avgProteinG,
        avgCarbsG,
        avgFatG,
        avgFiberG,
        proteinPct,
        caloriePct,
        proteinHitDays,
        proteinDelta: Math.round(avgProteinG - myProfile.proteinTargetG),
        calorieDelta: Math.round(avgCalories - myProfile.calorieTarget),
      },
      signature: sig,
    };
  }, [foodLogs, myProfile.uid, myProfile.calorieTarget, myProfile.proteinTargetG, selectedDate, startDate, endDate]);

  const [insight, setInsight] = useState<WeeklyNutritionInsight | null>(() =>
    readCachedInsight(signature)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptedSignatureRef = useRef<string | null>(null);

  const fetchInsights = useCallback(
    async (forceRefresh: boolean) => {
      if (stats.loggedCount === 0) return;
      if (!forceRefresh) {
        const cached = readCachedInsight(signature);
        if (cached) {
          setInsight(cached);
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/weekly-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate,
            endDate,
            forceRefresh,
            targets: {
              calorieTarget: myProfile.calorieTarget,
              proteinTargetG: myProfile.proteinTargetG,
              carbsTargetG: myProfile.carbsTargetG,
              fatTargetG: myProfile.fatTargetG,
            },
            dailyBreakdown,
          }),
        });

        const payload = (await res.json()) as Partial<WeeklyNutritionInsight> & {
          error?: string;
        };

        if (!res.ok) {
          throw new Error(payload.error || 'Failed to generate weekly nutrition insights.');
        }

        const normalized: WeeklyNutritionInsight = {
          headline: payload.headline ?? '',
          proteinAssessment: payload.proteinAssessment ?? '',
          calorieAssessment: payload.calorieAssessment ?? '',
          highlights: Array.isArray(payload.highlights) ? payload.highlights : [],
          actionItems: Array.isArray(payload.actionItems) ? payload.actionItems : [],
          generatedAt: payload.generatedAt ?? new Date().toISOString(),
        };

        writeCachedInsight(signature, normalized);
        setInsight(normalized);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to reach AI insights right now.'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      stats.loggedCount,
      signature,
      startDate,
      endDate,
      myProfile.calorieTarget,
      myProfile.proteinTargetG,
      myProfile.carbsTargetG,
      myProfile.fatTargetG,
      dailyBreakdown,
    ]
  );

  useEffect(() => {
    if (stats.loggedCount === 0) {
      setInsight(null);
      setError(null);
      return;
    }

    const cached = readCachedInsight(signature);
    if (cached) {
      setInsight(cached);
      setError(null);
      attemptedSignatureRef.current = signature;
      return;
    }

    if (attemptedSignatureRef.current === signature) {
      return;
    }
    attemptedSignatureRef.current = signature;
    void fetchInsights(false);
  }, [signature, stats.loggedCount, fetchInsights]);

  const rangeLabel = useMemo(
    () => formatRangeLabel(startDate, endDate),
    [startDate, endDate]
  );

  const proteinColorClass =
    stats.proteinPct >= 90
      ? 'text-emerald-700'
      : stats.proteinPct >= 70
        ? 'text-amber-700'
        : 'text-slate-700';

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Weekly Nutrition Summary
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {rangeLabel} · {stats.loggedCount} of 7 days logged · {stats.totalMeals}{' '}
            {stats.totalMeals === 1 ? 'meal' : 'meals'}
          </p>
        </div>

        {stats.loggedCount > 0 && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchInsights(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Analyzing…' : 'Refresh AI'}
          </button>
        )}
      </div>

      {stats.loggedCount === 0 ? (
        <div className="p-4 bg-slate-50/70 rounded-lg text-xs text-slate-600 leading-relaxed">
          No meals logged between {rangeLabel}. Log at least one meal in this 7-day window to
          unlock weekly protein vs. goal averages and AI-powered nutrition coaching.
        </div>
      ) : (
        <>
          {/* Deterministic 7-Day Averages vs Targets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50/70 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Avg Protein vs Goal</span>
                <span className={`font-mono tabular-nums font-semibold ${proteinColorClass}`}>
                  {stats.proteinPct}%
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
                <span className="text-lg font-semibold text-slate-900">
                  {stats.avgProteinG}g
                </span>
                <span className="text-xs text-slate-500">
                  / {myProfile.proteinTargetG}g
                </span>
              </div>
              <ProgressBar
                value={stats.avgProteinG}
                target={myProfile.proteinTargetG}
                colorClass={
                  stats.proteinPct >= 90
                    ? 'bg-emerald-600'
                    : stats.proteinPct >= 70
                      ? 'bg-amber-500'
                      : 'bg-slate-500'
                }
              />
              <div className="text-[11px] font-mono tabular-nums text-slate-500">
                {stats.proteinDelta >= 0
                  ? `+${stats.proteinDelta}g/day above goal`
                  : `${Math.abs(stats.proteinDelta)}g/day below goal`}
              </div>
            </div>

            <div className="p-3.5 bg-slate-50/70 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Avg Calories vs Target</span>
                <span className="font-mono tabular-nums font-medium text-slate-700">
                  {stats.caloriePct}%
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
                <span className="text-lg font-semibold text-slate-900">
                  {stats.avgCalories}
                </span>
                <span className="text-xs text-slate-500">
                  / {myProfile.calorieTarget} kcal
                </span>
              </div>
              <ProgressBar
                value={stats.avgCalories}
                target={myProfile.calorieTarget}
                colorClass="bg-slate-900"
              />
              <div className="text-[11px] font-mono tabular-nums text-slate-500">
                {stats.calorieDelta >= 0
                  ? `+${stats.calorieDelta} kcal/day over target`
                  : `${Math.abs(stats.calorieDelta)} kcal/day under target`}
              </div>
            </div>

            <div className="p-3.5 bg-slate-50/70 rounded-lg flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>7-Day Consistency</span>
                <span className="font-mono tabular-nums font-medium text-emerald-700">
                  {stats.proteinHitDays}/{stats.loggedCount} goal days
                </span>
              </div>
              <div className="flex items-end gap-1.5 h-10 pt-1" aria-label="7-day protein intake bars">
                {dailyBreakdown.map((day) => {
                  const pct = Math.min(
                    120,
                    Math.round((day.proteinG / Math.max(1, myProfile.proteinTargetG)) * 100)
                  );
                  const barHeightClass =
                    day.mealCount === 0
                      ? 'h-1'
                      : pct >= 100
                        ? 'h-7'
                        : pct >= 85
                          ? 'h-6'
                          : pct >= 65
                            ? 'h-5'
                            : pct >= 45
                              ? 'h-4'
                              : pct >= 25
                                ? 'h-3'
                                : 'h-2';
                  const barColor =
                    day.mealCount === 0
                      ? 'bg-slate-200'
                      : day.proteinG >= myProfile.proteinTargetG * 0.9
                        ? 'bg-emerald-600'
                        : 'bg-amber-400';
                  return (
                    <div
                      key={day.date}
                      title={`${day.date}: ${day.proteinG}g protein · ${day.calories} kcal (${day.mealCount} meals)`}
                      className="flex-1 flex flex-col items-center justify-end gap-1 h-full"
                    >
                      <div className="w-full flex items-end justify-center flex-1">
                        <div
                          className={`w-full max-w-[18px] rounded-t transition-all ${barHeightClass} ${barColor}`}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 leading-none">
                        {formatShortDay(day.date).slice(0, 1)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 truncate">
                Avg {stats.avgCarbsG}g C · {stats.avgFatG}g F · {stats.avgFiberG}g fiber
              </div>
            </div>
          </div>

          {/* AI Weekly Insights Body */}
          {loading && !insight ? (
            <div className="flex items-center gap-2.5 p-4 bg-slate-50/70 rounded-lg text-xs text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-700 shrink-0" />
              <span>Analyzing your 7-day protein, calorie, and meal trends…</span>
            </div>
          ) : error && !insight ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => void fetchInsights(true)}
                className="px-3 py-1.5 font-semibold text-amber-900 bg-white border border-amber-300 rounded-md hover:bg-amber-100 whitespace-nowrap"
              >
                Retry AI Summary
              </button>
            </div>
          ) : insight ? (
            <div className="space-y-3 pt-1">
              {error && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => void fetchInsights(true)}
                    className="font-semibold underline whitespace-nowrap"
                  >
                    Retry
                  </button>
                </div>
              )}

              <p className="text-sm font-medium text-slate-900 leading-snug">
                {insight.headline}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700 leading-relaxed">
                <div className="p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-lg space-y-1">
                  <div className="font-semibold text-emerald-900">Protein vs. Goal</div>
                  <p>{insight.proteinAssessment}</p>
                </div>
                <div className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-lg space-y-1">
                  <div className="font-semibold text-slate-900">Calorie &amp; Macro Balance</div>
                  <p>{insight.calorieAssessment}</p>
                </div>
              </div>

              {(insight.highlights.length > 0 || insight.actionItems.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-xs">
                  {insight.highlights.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-semibold text-slate-800">What Worked</div>
                      <ul className="space-y-1.5 text-slate-600">
                        {insight.highlights.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 leading-relaxed">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {insight.actionItems.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-semibold text-slate-800">Next Week Focus</div>
                      <ul className="space-y-1.5 text-slate-600">
                        {insight.actionItems.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 leading-relaxed">
                            <ArrowUpRight className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};
