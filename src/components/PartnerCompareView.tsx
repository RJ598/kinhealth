import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, UserPlus, Users } from 'lucide-react';
import { MultiTrendChart, ProgressBar, SERIES_COLORS } from './Charts';
import type { ChartSeries } from './Charts';
import type {
  ActivityLog,
  BodyLog,
  FoodLog,
  Household,
  MemberProfile,
  WeightLog,
  WorkoutLog,
} from '../types';
import {
  BLUEPRINT_LIMITS,
  buildCombinedWeightTimeline,
  getLocalDateStr,
  shiftDateStr,
} from '../types';

interface PartnerCompareViewProps {
  household: Household;
  myProfile: MemberProfile;
  members: MemberProfile[];
  otherMembers: MemberProfile[];
  foodLogs: FoodLog[];
  bodyLogs: BodyLog[];
  weightLogs: WeightLog[];
  activityLogs: ActivityLog[];
  workoutLogs: WorkoutLog[];
  selectedDate: string;
  actionError: string | null;
  onSwitchToGroup: (code: string) => Promise<void>;
}

type CompareChartMode =
  | 'proteinPct'
  | 'caloriePct'
  | 'steps'
  | 'activeCalories'
  | 'weightKg'
  | 'muscleMassKg'
  | 'bodyFatPct'
  | 'bmi'
  | 'ffmi';

export const PartnerCompareView: React.FC<PartnerCompareViewProps> = ({
  household,
  myProfile,
  members,
  otherMembers,
  foodLogs,
  bodyLogs,
  weightLogs,
  activityLogs,
  workoutLogs,
  selectedDate,
  actionError,
  onSwitchToGroup,
}) => {
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [chartMode, setChartMode] = useState<CompareChartMode>('proteinPct');
  const [hiddenMemberUids, setHiddenMemberUids] = useState<string[]>([]);
  const [feedMemberFilter, setFeedMemberFilter] = useState<string>('all');

  const orderedMembers = useMemo(() => {
    const others = [...members]
      .filter((m) => m.uid !== myProfile.uid)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    return [myProfile, ...others];
  }, [members, myProfile]);

  const memberColorMap = useMemo(() => {
    const map = new Map<string, string>();
    orderedMembers.forEach((m, idx) => {
      map.set(m.uid, SERIES_COLORS[idx % SERIES_COLORS.length]);
    });
    return map;
  }, [orderedMembers]);

  const shareUrl = `${window.location.origin}/?join=${household.inviteCode}`;

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      await onSwitchToGroup(joinCode);
    } finally {
      setJoining(false);
    }
  };

  const memberStats = useMemo(() => {
    const today = getLocalDateStr();
    const last7Dates = Array.from({ length: 7 }, (_, i) => shiftDateStr(today, -i));

    return orderedMembers.map((member, idx) => {
      const dayTotals = foodLogs
        .filter((f) => f.uid === member.uid && f.date === selectedDate)
        .reduce(
          (acc, f) => ({
            calories: acc.calories + f.calories,
            proteinG: acc.proteinG + f.proteinG,
            carbsG: acc.carbsG + f.carbsG,
            fatG: acc.fatG + f.fatG,
            count: acc.count + 1,
          }),
          { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, count: 0 }
        );

      const proteinHits7d = last7Dates.filter((d) => {
        const dayProt = foodLogs
          .filter((f) => f.uid === member.uid && f.date === d)
          .reduce((s, f) => s + f.proteinG, 0);
        return dayProt >= member.proteinTargetG * 0.9;
      }).length;

      const memberBodies = bodyLogs.filter((b) => b.uid === member.uid);
      const memberWeights = weightLogs.filter((w) => w.uid === member.uid);
      const dayActivity =
        activityLogs.find((a) => a.uid === member.uid && a.date === selectedDate) ?? null;
      const daySteps = dayActivity?.steps ?? 0;
      const stepsTarget = member.stepsTarget ?? BLUEPRINT_LIMITS.STEPS_TARGET_DEFAULT;
      const workouts7d = workoutLogs.filter(
        (w) => w.uid === member.uid && last7Dates.includes(w.date)
      ).length;
      const weightTimeline = buildCombinedWeightTimeline(
        memberWeights,
        memberBodies,
        member.heightCm
      );
      const latestWeightEntry = weightTimeline[0] ?? null;
      const latestBody = memberBodies[0] ?? null;
      const firstBody = memberBodies[memberBodies.length - 1] ?? null;

      return {
        member,
        color: SERIES_COLORS[idx % SERIES_COLORS.length],
        isMe: member.uid === myProfile.uid,
        dayTotals,
        calPct: Math.round(
          (dayTotals.calories / Math.max(1, member.calorieTarget)) * 100
        ),
        protPct: Math.round(
          (dayTotals.proteinG / Math.max(1, member.proteinTargetG)) * 100
        ),
        proteinHits7d,
        daySteps,
        stepsTarget,
        workouts7d,
        latestWeightEntry,
        latestBody,
        bmiDelta:
          latestBody && firstBody
            ? Number((latestBody.bmi - firstBody.bmi).toFixed(1))
            : null,
        fatDelta:
          latestBody && firstBody
            ? Number((latestBody.bodyFatPct - firstBody.bodyFatPct).toFixed(1))
            : null,
        muscleDelta:
          latestBody && firstBody
            ? Number((latestBody.muscleMassKg - firstBody.muscleMassKg).toFixed(1))
            : null,
      };
    });
  }, [
    orderedMembers,
    foodLogs,
    bodyLogs,
    weightLogs,
    activityLogs,
    workoutLogs,
    selectedDate,
    myProfile.uid,
  ]);

  const toggleMemberVisibility = (uid: string) => {
    setHiddenMemberUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const chartConfig = useMemo(() => {
    const today = getLocalDateStr();
    const last14 = Array.from({ length: 14 }, (_, i) => shiftDateStr(today, i - 13));
    const visibleMembers = orderedMembers.filter(
      (m) => !hiddenMemberUids.includes(m.uid)
    );

    if (chartMode === 'proteinPct' || chartMode === 'caloriePct') {
      const series: ChartSeries[] = visibleMembers.map((member) => {
        const data = last14
          .map((date) => {
            const dayLogs = foodLogs.filter(
              (f) => f.uid === member.uid && f.date === date
            );
            if (dayLogs.length === 0) return null;
            const total = dayLogs.reduce(
              (s, f) => s + (chartMode === 'proteinPct' ? f.proteinG : f.calories),
              0
            );
            const target =
              chartMode === 'proteinPct'
                ? member.proteinTargetG
                : member.calorieTarget;
            return {
              date,
              label: date,
              value: Math.round((total / Math.max(1, target)) * 100),
            };
          })
          .filter((x): x is { date: string; label: string; value: number } => x !== null);

        return {
          id: member.uid,
          name: member.uid === myProfile.uid ? `${member.displayName} (You)` : member.displayName,
          color: memberColorMap.get(member.uid) || SERIES_COLORS[0],
          data,
        };
      });

      return {
        series,
        unit: '%',
        targetValue: 100,
        title:
          chartMode === 'proteinPct'
            ? 'Protein Target Adherence (%)'
            : 'Calorie Target Adherence (%)',
      };
    }

    const unitMap: Record<
      Exclude<CompareChartMode, 'proteinPct' | 'caloriePct'>,
      { unit: string; title: string }
    > = {
      steps: { unit: 'steps', title: 'Daily Steps Comparison (14d)' },
      activeCalories: { unit: 'kcal', title: 'Active Calories Burned Comparison (14d)' },
      weightKg: { unit: 'kg', title: 'Weight Comparison (kg)' },
      muscleMassKg: { unit: 'kg', title: 'Skeletal Muscle Mass Comparison (kg)' },
      bodyFatPct: { unit: '%', title: 'Body Fat % Comparison' },
      bmi: { unit: 'kg/m²', title: 'BMI Comparison' },
      ffmi: { unit: 'kg/m²', title: 'FFMI Comparison' },
    };

    const meta = unitMap[chartMode];
    const series: ChartSeries[] = visibleMembers.map((member) => {
      if (chartMode === 'steps' || chartMode === 'activeCalories') {
        const last14Set = new Set(last14);
        return {
          id: member.uid,
          name: member.uid === myProfile.uid ? `${member.displayName} (You)` : member.displayName,
          color: memberColorMap.get(member.uid) || SERIES_COLORS[0],
          data: activityLogs
            .filter((a) => a.uid === member.uid && last14Set.has(a.date))
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((a) => ({
              date: a.date,
              label: a.date,
              value: chartMode === 'steps' ? a.steps : a.activeCalories,
            })),
        };
      }

      if (chartMode === 'weightKg' || chartMode === 'bmi') {
        const combined = buildCombinedWeightTimeline(
          weightLogs.filter((w) => w.uid === member.uid),
          bodyLogs.filter((b) => b.uid === member.uid),
          member.heightCm
        );
        const byDate = new Map<string, (typeof combined)[number]>();
        for (const item of combined) {
          if (!byDate.has(item.date)) {
            byDate.set(item.date, item);
          }
        }
        return {
          id: member.uid,
          name: member.uid === myProfile.uid ? `${member.displayName} (You)` : member.displayName,
          color: memberColorMap.get(member.uid) || SERIES_COLORS[0],
          data: Array.from(byDate.values())
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((item) => ({
              date: item.date,
              label: item.date,
              value: chartMode === 'weightKg' ? item.weightKg : item.bmi,
            })),
        };
      }

      return {
        id: member.uid,
        name: member.uid === myProfile.uid ? `${member.displayName} (You)` : member.displayName,
        color: memberColorMap.get(member.uid) || SERIES_COLORS[0],
        data: [...bodyLogs]
          .filter((b) => b.uid === member.uid)
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((b) => ({
            date: b.date,
            label: b.date,
            value: b[chartMode],
          })),
      };
    });

    return {
      series,
      unit: meta.unit,
      targetValue: undefined,
      title: meta.title,
    };
  }, [
    orderedMembers,
    hiddenMemberUids,
    chartMode,
    foodLogs,
    bodyLogs,
    weightLogs,
    activityLogs,
    myProfile.uid,
    memberColorMap,
  ]);

  const combinedDayMeals = useMemo(() => {
    return foodLogs.filter((f) => {
      if (f.date !== selectedDate) return false;
      if (feedMemberFilter !== 'all' && f.uid !== feedMemberFilter) return false;
      return true;
    });
  }, [foodLogs, selectedDate, feedMemberFilter]);

  if (otherMembers.length === 0) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Solo Mode · Optional Partner or Group Comparison
          </h2>
          <p className="text-xs text-slate-500">
            You can log solo forever in {household.name}, or invite a partner or group (up
            to 10 members) whenever you want to compare numbers.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Option A: Invite others to this workspace */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Invite a Partner or Group
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Share this code or link with your partner, friends, or training group (up to
                10 people). When they join, your calorie percentages, protein streaks, and
                body indexes compare side by side.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div>
                <div className="text-[11px] text-slate-500">Group Invite Code</div>
                <div className="text-2xl font-mono font-bold tracking-widest text-slate-900">
                  {household.inviteCode}
                </div>
              </div>
              <div className="text-xs text-slate-500 truncate">{shareUrl}</div>
              <button
                type="button"
                onClick={() => void copyShare()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    Invite Link Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Invite Link
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Option B: Join someone else's existing group */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Join an Existing Group
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Already have an invite code from your partner or group? Enter it below to
                move into their group. Your current calorie targets, food logs, and body
                entries are preserved automatically.
              </p>
            </div>

            <form onSubmit={handleJoinSubmit} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Enter Group Invite Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. KIN7X9M2"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2.5 text-sm font-mono uppercase tracking-wider border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>

              {actionError && (
                <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {actionError}
                </div>
              )}

              <button
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {joining ? 'Joining Group…' : 'Join Group & Keep My Logs'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            {household.name} · {orderedMembers.length} Members Comparison
          </h2>
          <p className="text-xs text-slate-500">
            Normalized by each member&apos;s personal calorie and protein targets for{' '}
            {selectedDate}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-200 rounded-lg text-slate-800">
            {household.inviteCode} · {orderedMembers.length}/10
          </span>
          <button
            type="button"
            onClick={() => void copyShare()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Invite More
              </>
            )}
          </button>
        </div>
      </div>

      {/* Member Cards Grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {memberStats.map((stat) => (
          <div
            key={stat.member.uid}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <div
                  className="text-xs font-semibold truncate"
                  style={{ color: stat.color }}
                >
                  {stat.member.roleLabel} {stat.isMe ? '· You' : ''}
                </div>
                <h3 className="font-display text-base font-semibold text-slate-900 truncate">
                  {stat.member.displayName}
                </h3>
              </div>
              <div className="text-right font-mono tabular-nums shrink-0">
                <div className="text-[11px] text-slate-500">7d protein hits</div>
                <div className="text-sm font-semibold text-slate-900">
                  {stat.proteinHits7d} / 7
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Calories ({stat.calPct}%)</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {Math.round(stat.dayTotals.calories)} / {stat.member.calorieTarget} kcal
                </span>
              </div>
              <ProgressBar
                value={stat.dayTotals.calories}
                target={stat.member.calorieTarget}
                colorClass={stat.isMe ? 'bg-emerald-600' : 'bg-blue-600'}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Protein ({stat.protPct}%)</span>
                <span
                  className="font-mono tabular-nums font-medium"
                  style={{ color: stat.color }}
                >
                  {stat.dayTotals.proteinG.toFixed(1)} / {stat.member.proteinTargetG}g
                </span>
              </div>
              <ProgressBar
                value={stat.dayTotals.proteinG}
                target={stat.member.proteinTargetG}
                colorClass={stat.isMe ? 'bg-emerald-600' : 'bg-blue-600'}
              />
            </div>

            <div className="pt-2 border-t border-slate-100 grid grid-cols-4 gap-2 text-xs font-mono tabular-nums">
              <div>
                <div className="text-slate-500 font-sans">Weight</div>
                <div className="font-semibold text-slate-900">
                  {stat.latestWeightEntry ? `${stat.latestWeightEntry.weightKg.toFixed(1)} kg` : '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 font-sans">Body Fat</div>
                <div className="font-semibold text-slate-900">
                  {stat.latestBody ? `${stat.latestBody.bodyFatPct.toFixed(1)}%` : '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 font-sans">Steps</div>
                <div className="font-semibold text-slate-900">
                  {stat.daySteps > 0 ? stat.daySteps.toLocaleString() : '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 font-sans">7d Wrkts</div>
                <div className="font-semibold text-slate-900">
                  {stat.workouts7d}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Multi-Member Metrics Matrix Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Body Indexes &amp; Nutrition Comparison Matrix
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Member</th>
                <th className="text-right py-2.5 px-4 font-medium">Calorie Target · Today</th>
                <th className="text-right py-2.5 px-4 font-medium">Protein Target · Today</th>
                <th className="text-right py-2.5 px-4 font-medium">BMI (Δ)</th>
                <th className="text-right py-2.5 px-4 font-medium">Body Fat (Δ)</th>
                <th className="text-right py-2.5 px-4 font-medium">Muscle (Δ)</th>
                <th className="text-right py-2.5 px-4 font-medium">Est. Weight</th>
                <th className="text-right py-2.5 px-4 font-medium">SMI</th>
                <th className="text-right py-2.5 px-4 font-medium">FFMI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {memberStats.map((stat) => (
                <tr key={stat.member.uid} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-4 font-sans">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: stat.color }}
                      />
                      <span className="font-medium text-slate-900">
                        {stat.member.displayName}
                        {stat.isMe ? ' (You)' : ''}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900">
                    {stat.member.calorieTarget} · {stat.calPct}%
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900">
                    {stat.member.proteinTargetG}g · {stat.protPct}%
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900">
                    {stat.latestBody
                      ? `${stat.latestBody.bmi.toFixed(1)} (${
                          stat.bmiDelta !== null
                            ? `${stat.bmiDelta >= 0 ? '+' : ''}${stat.bmiDelta}`
                            : '0.0'
                        })`
                      : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900">
                    {stat.latestBody
                      ? `${stat.latestBody.bodyFatPct.toFixed(1)}% (${
                          stat.fatDelta !== null
                            ? `${stat.fatDelta >= 0 ? '+' : ''}${stat.fatDelta}%`
                            : '0.0%'
                        })`
                      : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900">
                    {stat.latestBody
                      ? `${stat.latestBody.muscleMassKg.toFixed(1)} (${
                          stat.muscleDelta !== null
                            ? `${stat.muscleDelta >= 0 ? '+' : ''}${stat.muscleDelta}`
                            : '0.0'
                        })`
                      : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-600">
                    {stat.latestWeightEntry ? `${stat.latestWeightEntry.weightKg.toFixed(1)} kg` : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900">
                    {stat.latestBody ? stat.latestBody.smi.toFixed(1) : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900">
                    {stat.latestBody ? stat.latestBody.ffmi.toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Member Overlay Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'proteinPct', label: 'Protein % (14d)' },
                { id: 'caloriePct', label: 'Calories % (14d)' },
                { id: 'steps', label: 'Steps (14d)' },
                { id: 'activeCalories', label: 'Active kcal (14d)' },
                { id: 'weightKg', label: 'Weight (kg)' },
                { id: 'bmi', label: 'BMI' },
                { id: 'bodyFatPct', label: 'Body Fat %' },
                { id: 'muscleMassKg', label: 'Muscle (kg)' },
                { id: 'ffmi', label: 'FFMI' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setChartMode(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  chartMode === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {hiddenMemberUids.length > 0 && (
              <button
                type="button"
                onClick={() => setHiddenMemberUids([])}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Show All
              </button>
            )}
            {orderedMembers.map((member) => {
              const checked = !hiddenMemberUids.includes(member.uid);
              const color = memberColorMap.get(member.uid) || SERIES_COLORS[0];
              return (
                <label
                  key={member.uid}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMemberVisibility(member.uid)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span>{member.displayName}</span>
                </label>
              );
            })}
          </div>
        </div>

        <MultiTrendChart
          title={chartConfig.title}
          unit={chartConfig.unit}
          series={chartConfig.series}
          targetValue={chartConfig.targetValue}
        />
      </div>

      {/* Shared Day Meal Feed */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Group Meals on {selectedDate}
            </h3>
            <span className="text-xs text-slate-500">
              {combinedDayMeals.length} entries shown
            </span>
          </div>

          <select
            value={feedMemberFilter}
            onChange={(e) => setFeedMemberFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-emerald-600"
          >
            <option value="all">All Group Members</option>
            {orderedMembers.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.displayName}
                {m.uid === myProfile.uid ? ' (You)' : ''}
              </option>
            ))}
          </select>
        </div>
        {combinedDayMeals.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No group meals logged for {selectedDate} matching this filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {combinedDayMeals.map((m) => (
              <div
                key={m.id}
                className="px-5 py-3 flex items-center justify-between gap-4 text-xs"
              >
                <div className="min-w-0">
                  <div className="text-slate-500 capitalize">
                    <strong className="text-slate-800">{m.authorName}</strong> · {m.mealType}
                    {m.servingNote ? ` · ${m.servingNote}` : ''}
                  </div>
                  <div className="text-sm font-medium text-slate-900 truncate">{m.name}</div>
                </div>
                <div className="text-right font-mono tabular-nums shrink-0">
                  <div className="font-semibold text-slate-900">{m.calories} kcal</div>
                  <div className="text-emerald-700">{m.proteinG.toFixed(1)}g protein</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
