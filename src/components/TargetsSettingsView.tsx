import React, { useState } from 'react';
import { ArrowRight, Check, Copy } from 'lucide-react';
import type { SetupMemberInput } from '../hooks/useHouseholdData';
import type { Household, MemberProfile } from '../types';

interface TargetsSettingsViewProps {
  household: Household;
  myProfile: MemberProfile;
  members: MemberProfile[];
  otherMembers: MemberProfile[];
  isOwner: boolean;
  actionError: string | null;
  onSaveTargets: (setup: SetupMemberInput, newHouseholdName?: string) => Promise<void>;
  onSwitchToGroup: (code: string) => Promise<void>;
  onLeaveHousehold: () => Promise<void>;
}

export const TargetsSettingsView: React.FC<TargetsSettingsViewProps> = ({
  household,
  myProfile,
  members,
  otherMembers,
  isOwner,
  actionError,
  onSaveTargets,
  onSwitchToGroup,
  onLeaveHousehold,
}) => {
  const [householdName, setHouseholdName] = useState(household.name);
  const [displayName, setDisplayName] = useState(myProfile.displayName);
  const [roleLabel, setRoleLabel] = useState(myProfile.roleLabel);
  const [calorieTarget, setCalorieTarget] = useState(myProfile.calorieTarget);
  const [proteinTargetG, setProteinTargetG] = useState(myProfile.proteinTargetG);
  const [carbsTargetG, setCarbsTargetG] = useState(myProfile.carbsTargetG);
  const [fatTargetG, setFatTargetG] = useState(myProfile.fatTargetG);
  const [heightCm, setHeightCm] = useState(myProfile.heightCm);
  const [targetWeightKg, setTargetWeightKg] = useState(myProfile.targetWeightKg);
  const [targetMuscleMassKg, setTargetMuscleMassKg] = useState(
    myProfile.targetMuscleMassKg
  );
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const autoBalanceMacros = () => {
    const proteinCal = proteinTargetG * 4;
    const rem = Math.max(0, calorieTarget - proteinCal);
    setCarbsTargetG(Math.round((rem * 0.55) / 4));
    setFatTargetG(Math.round((rem * 0.45) / 9));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onSaveTargets(
        {
          displayName,
          roleLabel,
          calorieTarget,
          proteinTargetG,
          carbsTargetG,
          fatTargetG,
          heightCm,
          targetWeightKg,
          targetMuscleMassKg,
        },
        isOwner ? householdName : undefined
      );
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
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

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?join=${household.inviteCode}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  const macroCalories =
    proteinTargetG * 4 + carbsTargetG * 4 + fatTargetG * 9;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900">
          Daily Targets &amp; Group Settings
        </h2>
        <p className="text-xs text-slate-500">
          Define your personal total calories, protein target, macro split, body goals,
          and optional group sharing
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Your Display Name
            </label>
            <input
              type="text"
              required
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Profile Tag
            </label>
            <select
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            >
              <option value="Personal">Personal</option>
              <option value="Athlete">Athlete</option>
              <option value="Partner">Partner</option>
              <option value="Husband">Husband</option>
              <option value="Wife">Wife</option>
              <option value="Friend">Friend</option>
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Calorie &amp; Protein Targets
            </h3>
            <button
              type="button"
              onClick={autoBalanceMacros}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Auto-balance carbs &amp; fat from calories
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Total Calories Target (kcal/day)
              </label>
              <input
                type="number"
                required
                min={500}
                max={10000}
                value={calorieTarget}
                onChange={(e) => setCalorieTarget(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-emerald-700 mb-1">
                Protein Target (g/day)
              </label>
              <input
                type="number"
                required
                min={20}
                max={600}
                value={proteinTargetG}
                onChange={(e) => setProteinTargetG(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Carbs Target (g/day)
              </label>
              <input
                type="number"
                required
                min={0}
                max={1000}
                value={carbsTargetG}
                onChange={(e) => setCarbsTargetG(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Fat Target (g/day)
              </label>
              <input
                type="number"
                required
                min={0}
                max={500}
                value={fatTargetG}
                onChange={(e) => setFatTargetG(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
          </div>

          <p className="text-xs font-mono tabular-nums text-slate-500">
            Macro sum: {macroCalories} kcal ({proteinTargetG}g P · {carbsTargetG}g C ·{' '}
            {fatTargetG}g F)
          </p>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Height &amp; Body Composition Goals
          </h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Height (cm)
              </label>
              <input
                type="number"
                required
                min={80}
                max={250}
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Goal Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                required
                min={25}
                max={350}
                value={targetWeightKg}
                onChange={(e) => setTargetWeightKg(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Goal Muscle Mass (kg)
              </label>
              <input
                type="number"
                step="0.1"
                required
                min={10}
                max={150}
                value={targetMuscleMassKg}
                onChange={(e) => setTargetMuscleMassKg(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="pt-4 border-t border-slate-100">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Workspace / Group Name
            </label>
            <input
              type="text"
              required
              maxLength={80}
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
          </div>
        )}

        <div className="pt-2 flex items-center justify-between gap-4">
          <div className="text-xs text-emerald-700 font-medium">
            {savedNotice ? 'Targets and profile saved.' : ''}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save Targets'}
          </button>
        </div>
      </form>

      {/* Group & Sharing Settings */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-600 space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              Workspace &amp; Group Sharing ({members.length} / 10 members)
            </h3>
            <div>
              Space: <strong className="text-slate-900">{household.name}</strong>
              {otherMembers.length === 0 ? ' · Solo mode' : ''}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 text-xs font-mono font-semibold bg-slate-100 rounded-lg text-slate-900">
              {household.inviteCode}
            </span>
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Invite Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Active Members List */}
        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs font-medium text-slate-700 mb-2">Active Members</div>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {members.map((m) => (
              <div
                key={m.uid}
                className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900">{m.displayName}</span>
                  <span className="text-slate-500">
                    {' '}
                    · {m.roleLabel}
                    {m.uid === myProfile.uid ? ' (You)' : ''}
                    {m.uid === household.ownerId ? ' · Owner' : ''}
                  </span>
                </div>
                <div className="font-mono tabular-nums text-slate-600">
                  {m.calorieTarget} kcal · {m.proteinTargetG}g P
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Solo users can switch into an existing group and bring their logs */}
        {members.length === 1 && (
          <form
            onSubmit={handleJoinSubmit}
            className="pt-4 border-t border-slate-100 space-y-2.5"
          >
            <div className="text-xs font-medium text-slate-700">
              Join someone else&apos;s group instead (keeps your targets &amp; logs)
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Enter invite code (e.g. KIN7X9M2)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="flex-1 min-w-48 px-3 py-2 text-xs font-mono uppercase tracking-wider border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
              <button
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {joining ? 'Joining…' : 'Join Group'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {actionError && (
              <p className="text-xs text-red-600">{actionError}</p>
            )}
          </form>
        )}

        {!isOwner && (
          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={() => void onLeaveHousehold()}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              Leave Group
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
