import React, { useMemo, useState } from 'react';
import {
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Plus,
  Trash2,
} from 'lucide-react';
import { MultiTrendChart, ProgressBar, SERIES_COLORS } from './Charts';
import type { ChartSeries } from './Charts';
import type { ActivityModalMode } from './ActivityWorkoutModal';
import type {
  ActivityLog,
  MemberProfile,
  WorkoutLog,
} from '../types';
import {
  BLUEPRINT_LIMITS,
  formatReadableDate,
  getLocalDateStr,
  shiftDateStr,
  WORKOUT_TYPE_LABELS,
} from '../types';

interface ActivityViewProps {
  myProfile: MemberProfile;
  otherMembers: MemberProfile[];
  activityLogs: ActivityLog[];
  workoutLogs: WorkoutLog[];
  selectedDate: string;
  onOpenActivityModal: (mode?: ActivityModalMode) => void;
  onOpenAppleHealthSync: () => void;
  onDeleteActivityLog: (id: string) => Promise<void>;
  onDeleteWorkoutLog: (id: string) => Promise<void>;
}

type ActivityChartMetric = 'steps' | 'activeCalories' | 'distanceKm';

export const ActivityView: React.FC<ActivityViewProps> = ({
  myProfile,
  otherMembers,
  activityLogs,
  workoutLogs,
  selectedDate,
  onOpenActivityModal,
  onOpenAppleHealthSync,
  onDeleteActivityLog,
  onDeleteWorkoutLog,
}) => {
  const [chartMetric, setChartMetric] = useState<ActivityChartMetric>('steps');

  const stepsTarget = myProfile.stepsTarget ?? BLUEPRINT_LIMITS.STEPS_TARGET_DEFAULT;

  const myActivities = useMemo(
    () => activityLogs.filter((a) => a.uid === myProfile.uid),
    [activityLogs, myProfile.uid]
  );

  const myWorkouts = useMemo(
    () => workoutLogs.filter((w) => w.uid === myProfile.uid),
    [workoutLogs, myProfile.uid]
  );

  const dayActivity = useMemo(
    () => myActivities.find((a) => a.date === selectedDate) ?? null,
    [myActivities, selectedDate]
  );

  const dayWorkouts = useMemo(
    () => myWorkouts.filter((w) => w.date === selectedDate),
    [myWorkouts, selectedDate]
  );

  const dayWorkoutBurn = useMemo(
    () => dayWorkouts.reduce((s, w) => s + w.caloriesBurned, 0),
    [dayWorkouts]
  );

  const daySteps = dayActivity?.steps ?? 0;
  const dayActiveCal = Math.max(dayActivity?.activeCalories ?? 0, dayWorkoutBurn);
  const dayDistanceKm = dayActivity?.distanceKm ?? 0;

  const stats7d = useMemo(() => {
    const today = getLocalDateStr();
    const dates = new Set(Array.from({ length: 7 }, (_, i) => shiftDateStr(today, -i)));
    const weekActs = myActivities.filter((a) => dates.has(a.date));
    const weekWorkouts = myWorkouts.filter((w) => dates.has(w.date));
    const totalSteps = weekActs.reduce((s, a) => s + a.steps, 0);
    const avgSteps = weekActs.length > 0 ? Math.round(totalSteps / weekActs.length) : 0;
    const goalDays = weekActs.filter((a) => a.steps >= stepsTarget).length;
    const totalWorkoutMin = weekWorkouts.reduce((s, w) => s + w.durationMin, 0);
    const totalWorkoutKcal = weekWorkouts.reduce((s, w) => s + w.caloriesBurned, 0);
    return {
      avgSteps,
      goalDays,
      workoutCount: weekWorkouts.length,
      totalWorkoutMin,
      totalWorkoutKcal,
    };
  }, [myActivities, myWorkouts, stepsTarget]);

  const chartSeries: ChartSeries[] = useMemo(() => {
    const today = getLocalDateStr();
    const last14 = new Set(Array.from({ length: 14 }, (_, i) => shiftDateStr(today, -i)));

    const memberList = [myProfile, ...otherMembers.slice(0, 4)];
    return memberList.map((member, idx) => {
      const points = activityLogs
        .filter((a) => a.uid === member.uid && last14.has(a.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((a) => ({
          date: a.date,
          label: a.date,
          value: a[chartMetric],
        }));

      return {
        id: member.uid,
        name: member.uid === myProfile.uid ? `${member.displayName} (You)` : member.displayName,
        color: SERIES_COLORS[idx % SERIES_COLORS.length],
        data: points,
      };
    });
  }, [activityLogs, myProfile, otherMembers, chartMetric]);

  const chartMeta: Record<ActivityChartMetric, { title: string; unit: string; target?: number }> = {
    steps: { title: 'Daily Steps (14d)', unit: 'steps', target: stepsTarget },
    activeCalories: { title: 'Active Calories Burned (14d)', unit: 'kcal' },
    distanceKm: { title: 'Walking & Running Distance (14d)', unit: 'km' },
  };

  const formatSourceBadge = (source: ActivityLog['source']) => {
    if (source === 'apple_health') return 'Apple Health';
    if (source === 'apple_shortcut') return 'Apple Shortcut';
    return 'Manual';
  };

  return (
    <div className="space-y-6">
      {/* Header & Triggers */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Steps, Workouts &amp; Apple Health
          </h2>
          <p className="text-xs text-slate-500">
            Showing {formatReadableDate(selectedDate)} · Daily step goal {stepsTarget.toLocaleString()} steps
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenAppleHealthSync}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <HeartPulse className="w-3.5 h-3.5 text-rose-600" />
            Sync Apple Health
          </button>
          <button
            type="button"
            onClick={() => onOpenActivityModal('steps')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Steps / Workout
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-emerald-700" />
                Steps · {formatReadableDate(selectedDate)}
              </span>
              <span className="font-mono tabular-nums text-emerald-700 font-medium">
                {Math.round((daySteps / Math.max(1, stepsTarget)) * 100)}%
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-semibold tabular-nums text-slate-900">
                {daySteps.toLocaleString()}
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                / {stepsTarget.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <ProgressBar value={daySteps} target={stepsTarget} colorClass="bg-emerald-600" />
            <div className="text-xs font-mono tabular-nums text-slate-500">
              {dayDistanceKm > 0 ? `${dayDistanceKm.toFixed(1)} km distance` : 'Log or sync Apple Health'}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-600" />
              Active Energy
            </span>
            <span>{formatReadableDate(selectedDate)}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-semibold tabular-nums text-slate-900">
              {dayActiveCal}
            </span>
            <span className="text-xs font-mono text-slate-500">kcal burned</span>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            {dayActivity?.exerciseMinutes
              ? `${dayActivity.exerciseMinutes} exercise min`
              : `${dayWorkouts.length} workout${dayWorkouts.length === 1 ? '' : 's'} logged today`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-500">7-Day Steps Average</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-semibold tabular-nums text-slate-900">
              {stats7d.avgSteps.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">steps/day</span>
          </div>
          <div className="mt-3 text-xs font-mono tabular-nums text-emerald-700 font-medium">
            {stats7d.goalDays} / 7 days hit target
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Dumbbell className="w-3.5 h-3.5 text-slate-700" />
              7-Day Workouts
            </span>
            <button
              type="button"
              onClick={() => onOpenActivityModal('workout')}
              className="text-emerald-700 hover:text-emerald-800 font-medium"
            >
              + Add
            </button>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-semibold tabular-nums text-slate-900">
              {stats7d.workoutCount}
            </span>
            <span className="text-xs text-slate-500">sessions</span>
          </div>
          <div className="mt-3 text-xs font-mono tabular-nums text-slate-500">
            {stats7d.totalWorkoutMin} min · {stats7d.totalWorkoutKcal.toLocaleString()} kcal
          </div>
        </div>
      </div>

      {/* 14-day Trend Chart */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            {chartMeta[chartMetric].title}
          </h3>
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'steps', label: 'Steps' },
                { id: 'activeCalories', label: 'Active kcal' },
                { id: 'distanceKm', label: 'Distance (km)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setChartMetric(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                  chartMetric === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <MultiTrendChart
          title={chartMeta[chartMetric].title}
          unit={chartMeta[chartMetric].unit}
          series={chartSeries}
          targetValue={chartMeta[chartMetric].target}
        />
      </section>

      {/* Split Lists: Workouts & Daily Steps History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Workout Sessions
              </h3>
              <p className="text-xs text-slate-500">
                {myWorkouts.length} total recorded workouts
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenActivityModal('workout')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              + Log workout
            </button>
          </div>

          {myWorkouts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <p>No workouts logged yet.</p>
              <p>Log a session manually or import your Apple Watch workouts from Apple Health.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {myWorkouts.slice(0, 20).map((wk) => (
                <div
                  key={wk.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-medium text-emerald-700">
                        {WORKOUT_TYPE_LABELS[wk.workoutType]}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{wk.date}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatSourceBadge(wk.source)}</span>
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                      {wk.title}
                    </div>
                    {wk.notes && (
                      <div className="text-xs text-slate-500 truncate">{wk.notes}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right font-mono tabular-nums text-xs">
                      <div className="font-semibold text-slate-900">
                        {wk.durationMin} min · {wk.caloriesBurned} kcal
                      </div>
                      <div className="text-slate-500">
                        {wk.distanceKm > 0 ? `${wk.distanceKm.toFixed(1)} km` : ''}
                        {wk.distanceKm > 0 && wk.avgHeartRate > 0 ? ' · ' : ''}
                        {wk.avgHeartRate > 0 ? `${wk.avgHeartRate} bpm` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onDeleteWorkoutLog(wk.id)}
                      aria-label={`Delete ${wk.title}`}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Daily Steps &amp; Move Ledger
              </h3>
              <p className="text-xs text-slate-500">
                {myActivities.length} recorded activity days
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenActivityModal('steps')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              + Update steps
            </button>
          </div>

          {myActivities.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <p>No daily step records yet.</p>
              <p>Sync Apple Health or log today&apos;s step count to start tracking movement.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {myActivities.slice(0, 20).map((act) => {
                const hit = act.steps >= stepsTarget;
                return (
                  <div
                    key={act.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-mono font-semibold text-slate-800">
                          {act.date}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatSourceBadge(act.source)}</span>
                        {hit && (
                          <span className="text-emerald-700 font-semibold">· Goal Hit</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-sm font-mono font-semibold tabular-nums text-slate-900">
                        {act.steps.toLocaleString()} steps
                      </div>
                      {act.notes && (
                        <div className="text-xs text-slate-500 truncate">{act.notes}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right font-mono tabular-nums text-xs">
                        <div className="font-semibold text-slate-900">
                          {act.activeCalories} kcal
                        </div>
                        <div className="text-slate-500">
                          {act.distanceKm.toFixed(1)} km
                          {act.exerciseMinutes > 0 ? ` · ${act.exerciseMinutes}m` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onDeleteActivityLog(act.id)}
                        aria-label={`Delete activity log for ${act.date}`}
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
        </section>
      </div>
    </div>
  );
};
