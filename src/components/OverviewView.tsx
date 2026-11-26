import React, { useMemo, useState } from 'react';
import {
  BookmarkPlus,
  Camera,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Pencil,
  Plus,
  Scale,
  Trash2,
} from 'lucide-react';
import { BuddyCharacter } from './BuddyCharacter';
import { ProgressBar } from './Charts';
import type { BodyLog, FoodLog, FoodPreset, Household, MemberProfile } from '../types';
import {
  computeBodyIndexesFromBmi,
  formatReadableDate,
  getLocalDateStr,
  shiftDateStr,
} from '../types';

interface OverviewViewProps {
  household: Household;
  myProfile: MemberProfile;
  otherMembers: MemberProfile[];
  foodLogs: FoodLog[];
  foodPresets: FoodPreset[];
  bodyLogs: BodyLog[];
  selectedDate: string;
  justUpdatedBodyTick: number;
  onSelectDate: (date: string) => void;
  onOpenFoodModal: (
    editLog?: FoodLog,
    initialMode?: 'ai' | 'manual' | 'presets'
  ) => void;
  onOpenBodyModal: () => void;
  onDeleteFoodLog: (id: string) => Promise<void>;
  onLogPreset: (preset: FoodPreset, date: string) => Promise<void>;
  onSaveLogAsPreset: (log: FoodLog) => Promise<void>;
  onNavigateTab: (tab: 'food' | 'body' | 'compare' | 'targets') => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  household,
  myProfile,
  otherMembers,
  foodLogs,
  foodPresets,
  bodyLogs,
  selectedDate,
  justUpdatedBodyTick,
  onSelectDate,
  onOpenFoodModal,
  onOpenBodyModal,
  onDeleteFoodLog,
  onLogPreset,
  onSaveLogAsPreset,
  onNavigateTab,
}) => {
  const [copied, setCopied] = useState(false);
  const [loggingPresetId, setLoggingPresetId] = useState<string | null>(null);
  const [justLoggedPresetId, setJustLoggedPresetId] = useState<string | null>(null);
  const [savedPresetFromLogId, setSavedPresetFromLogId] = useState<string | null>(null);

  const myDayLogs = useMemo(
    () => foodLogs.filter((l) => l.uid === myProfile.uid && l.date === selectedDate),
    [foodLogs, myProfile.uid, selectedDate]
  );

  const myTotals = useMemo(() => {
    return myDayLogs.reduce(
      (acc, l) => ({
        calories: acc.calories + l.calories,
        proteinG: acc.proteinG + l.proteinG,
        carbsG: acc.carbsG + l.carbsG,
        fatG: acc.fatG + l.fatG,
        fiberG: acc.fiberG + l.fiberG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }
    );
  }, [myDayLogs]);

  const myBodyHistory = useMemo(
    () => bodyLogs.filter((b) => b.uid === myProfile.uid),
    [bodyLogs, myProfile.uid]
  );

  const myLatestBody = myBodyHistory[0] ?? null;
  const myPreviousBody = myBodyHistory[1] ?? null;

  const myIndexes = useMemo(() => {
    if (!myLatestBody) return null;
    return computeBodyIndexesFromBmi(
      myLatestBody.bmi,
      myLatestBody.muscleMassKg,
      myLatestBody.bodyFatPct,
      myProfile.heightCm
    );
  }, [myLatestBody, myProfile.heightCm]);

  const groupSummaries = useMemo(() => {
    return otherMembers.map((member) => {
      const logs = foodLogs.filter(
        (l) => l.uid === member.uid && l.date === selectedDate
      );
      const totals = logs.reduce(
        (acc, l) => ({
          calories: acc.calories + l.calories,
          proteinG: acc.proteinG + l.proteinG,
        }),
        { calories: 0, proteinG: 0 }
      );
      return { member, totals, mealCount: logs.length };
    });
  }, [otherMembers, foodLogs, selectedDate]);

  const calRemaining = Math.round(myProfile.calorieTarget - myTotals.calories);
  const proteinRemaining = Math.round(myProfile.proteinTargetG - myTotals.proteinG);

  const copyInviteCode = async () => {
    const shareUrl = `${window.location.origin}/?join=${household.inviteCode}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleQuickPresetLog = async (preset: FoodPreset) => {
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
    <div className="space-y-6">
      {/* Date Strip & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectDate(shiftDateStr(selectedDate, -1))}
            aria-label="Previous day"
            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            <span className="text-sm font-semibold text-slate-900">
              {formatReadableDate(selectedDate)}
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && onSelectDate(e.target.value)}
              aria-label="Select date"
              className="text-xs font-mono text-slate-500 bg-transparent focus:outline-none cursor-pointer"
            />
          </div>
          <button
            type="button"
            onClick={() => onSelectDate(shiftDateStr(selectedDate, 1))}
            aria-label="Next day"
            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {selectedDate !== getLocalDateStr() && (
            <button
              type="button"
              onClick={() => onSelectDate(getLocalDateStr())}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Jump to Today
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenBodyModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Scale className="w-3.5 h-3.5" />
            Log Body Check-in
          </button>
          <button
            type="button"
            onClick={() => onOpenFoodModal(undefined, 'manual')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Type / Log Meal
          </button>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Total Calories</span>
              <button
                type="button"
                onClick={() => onNavigateTab('targets')}
                className="text-slate-400 hover:text-slate-700 font-medium"
              >
                Edit target
              </button>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-semibold tabular-nums text-slate-900">
                {Math.round(myTotals.calories)}
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                / {myProfile.calorieTarget} kcal
              </span>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <ProgressBar
              value={myTotals.calories}
              target={myProfile.calorieTarget}
              colorClass="bg-slate-900"
            />
            <div className="text-xs font-mono tabular-nums text-slate-500">
              {calRemaining >= 0
                ? `${calRemaining} kcal remaining`
                : `${Math.abs(calRemaining)} kcal over target`}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Protein Intake</span>
              <span className="font-mono tabular-nums text-emerald-700 font-medium">
                {Math.round((myTotals.proteinG / Math.max(1, myProfile.proteinTargetG)) * 100)}%
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-semibold tabular-nums text-emerald-700">
                {myTotals.proteinG.toFixed(1)}g
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                / {myProfile.proteinTargetG}g
              </span>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <ProgressBar
              value={myTotals.proteinG}
              target={myProfile.proteinTargetG}
              colorClass="bg-emerald-600"
            />
            <div className="text-xs font-mono tabular-nums text-slate-500">
              {proteinRemaining >= 0
                ? `${proteinRemaining}g remaining to target`
                : `${Math.abs(proteinRemaining)}g above target`}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-500">Carbs, Fat &amp; Fiber</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div>
              <div className="text-[11px] text-slate-500">Carbs</div>
              <div className="text-lg font-mono font-semibold tabular-nums text-slate-900">
                {Math.round(myTotals.carbsG)}g
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-400">
                / {myProfile.carbsTargetG}g
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Fat</div>
              <div className="text-lg font-mono font-semibold tabular-nums text-slate-900">
                {Math.round(myTotals.fatG)}g
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-400">
                / {myProfile.fatTargetG}g
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Fiber</div>
              <div className="text-lg font-mono font-semibold tabular-nums text-slate-900">
                {Math.round(myTotals.fiberG)}g
              </div>
              <div className="text-[11px] text-slate-400">Daily</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Latest Body Composition</span>
            <button
              type="button"
              onClick={() => onNavigateTab('body')}
              className="text-slate-400 hover:text-slate-700 font-medium"
            >
              View trends
            </button>
          </div>
          {myLatestBody && myIndexes ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-mono font-semibold tabular-nums text-slate-900">
                  BMI {myIndexes.bmi.toFixed(1)}
                </span>
                <span className="text-xs font-mono tabular-nums text-emerald-700 font-semibold">
                  {myLatestBody.muscleMassKg.toFixed(1)} kg muscle
                </span>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500">
                Fat {myLatestBody.bodyFatPct.toFixed(1)}% · Est. {myIndexes.weightKg.toFixed(1)} kg ·
                FFMI {myIndexes.ffmi.toFixed(1)}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-xs text-slate-500">No body weigh-in logged yet.</p>
              <button
                type="button"
                onClick={onOpenBodyModal}
                className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Log first weigh-in
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Split: Presets + Today's Meals (8 cols) + Animated Companion & Group Snapshot (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Quick Daily Presets Card */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  {otherMembers.length > 0 ? 'Shared Group Presets' : 'Daily Food Presets'}
                </h2>
                <p className="text-xs text-slate-500">
                  {foodPresets.length > 0
                    ? otherMembers.length > 0
                      ? `Shared with your group · one-click log to ${formatReadableDate(selectedDate)}`
                      : `One-click log recurring meals to ${formatReadableDate(selectedDate)}`
                    : 'Save foods you eat every day for instant one-tap logging'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenFoodModal(undefined, 'presets')}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
              >
                {foodPresets.length > 0
                  ? `Manage all (${foodPresets.length})`
                  : 'Create preset'}
              </button>
            </div>

            {foodPresets.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {foodPresets.slice(0, 6).map((preset) => {
                  const isBusy = loggingPresetId === preset.id;
                  const wasJustLogged = justLoggedPresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-50/70 rounded-lg"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {preset.name}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 truncate">
                          <span className="capitalize font-sans">{preset.mealType}</span> ·{' '}
                          {preset.calories} kcal · {preset.proteinG}g P
                          {otherMembers.length > 0 && preset.authorName && (
                            <span className="font-sans">
                              {' '}
                              · by {preset.uid === myProfile.uid ? 'You' : preset.authorName}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleQuickPresetLog(preset)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          wasJustLogged
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-white border border-slate-200 text-slate-800 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'
                        }`}
                      >
                        {wasJustLogged ? (
                          <>
                            <Check className="w-3 h-3" />
                            Logged
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            {isBusy ? '…' : 'Log'}
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                Tip: click the bookmark icon on any logged meal below, or open Daily Presets
                to save your staples.
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Your Meals · {formatReadableDate(selectedDate)}
                </h2>
                <p className="text-xs text-slate-500">
                  {myDayLogs.length} {myDayLogs.length === 1 ? 'entry' : 'entries'} logged
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('food')}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                View full history
              </button>
            </div>

            {myDayLogs.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-medium text-slate-700">
                  No meals logged for {formatReadableDate(selectedDate)}.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Snap a meal photo, pick a saved preset, or type a meal for AI autocomplete
                  against your {myProfile.calorieTarget} kcal and {myProfile.proteinTargetG}g
                  protein targets.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenFoodModal()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Log First Meal
                  </button>
                  {foodPresets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenFoodModal(undefined, 'presets')}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      Use Saved Preset
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {myDayLogs.map((log) => {
                  const justSaved = savedPresetFromLogId === log.id;
                  return (
                    <div
                      key={log.id}
                      className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500 capitalize">
                          <span>{log.mealType}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {log.source === 'ai_photo'
                              ? 'AI Photo'
                              : log.source === 'preset'
                                ? 'Preset'
                                : 'Logged'}
                          </span>
                          {log.servingNote && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{log.servingNote}</span>
                            </>
                          )}
                        </div>
                        <div className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                          {log.name}
                        </div>
                        {log.aiItemsSummary && (
                          <p className="mt-0.5 text-xs text-slate-500 truncate">
                            {log.aiItemsSummary}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-sm font-semibold text-slate-900">
                            {log.calories} kcal
                          </div>
                          <div className="text-xs text-slate-500">
                            <span className="text-emerald-700 font-medium">
                              {log.proteinG}g P
                            </span>{' '}
                            · {log.carbsG}g C · {log.fatG}g F
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleSaveAsPreset(log)}
                            title="Save as daily preset"
                            aria-label={`Save ${log.name} as daily preset`}
                            className={`p-1.5 rounded ${
                              justSaved
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-slate-400 hover:text-emerald-700 hover:bg-slate-100'
                            }`}
                          >
                            {justSaved ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <BookmarkPlus className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenFoodModal(log)}
                            aria-label={`Edit ${log.name}`}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteFoodLog(log.id)}
                            aria-label={`Delete ${log.name}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="lg:col-span-4 space-y-6">
          <BuddyCharacter
            profile={myProfile}
            latestBody={myLatestBody}
            previousBody={myPreviousBody}
            caloriesToday={myTotals.calories}
            proteinToday={myTotals.proteinG}
            justUpdatedTick={justUpdatedBodyTick}
            compact
          />

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                {otherMembers.length > 0 ? 'Group Snapshot' : 'Compare with Others'}
              </h2>
              <button
                type="button"
                onClick={() => onNavigateTab('compare')}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {otherMembers.length > 0 ? 'Compare all' : 'Pair / Join'}
              </button>
            </div>

            {groupSummaries.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {groupSummaries.slice(0, 4).map(({ member, totals }) => (
                  <div key={member.uid} className="py-3 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium text-slate-800">
                        {member.displayName} ·{' '}
                        <span className="text-slate-500 font-normal">
                          {member.roleLabel}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-700">
                        {Math.round(totals.calories)} kcal · {totals.proteinG.toFixed(0)}g P
                      </span>
                    </div>
                    <ProgressBar
                      value={totals.proteinG}
                      target={member.proteinTargetG}
                      colorClass="bg-blue-600"
                    />
                  </div>
                ))}
                {groupSummaries.length > 4 && (
                  <div className="pt-2 text-xs text-slate-500">
                    +{groupSummaries.length - 4} more members in Compare view
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  You&apos;re logging solo right now. Share this invite code anytime if
                  you want a partner, friend, or group (up to 10) to compare numbers.
                </p>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-slate-500">Group Invite Code</div>
                    <div className="text-sm font-mono font-semibold tracking-wider text-slate-900">
                      {household.inviteCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyInviteCode()}
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
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
