import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { Camera, Scale, Users, ArrowRight } from 'lucide-react';
import { signInWithGoogle, signOutUser } from '../firebase';
import type { SetupMemberInput } from '../hooks/useHouseholdData';

interface AuthGateProps {
  user: User | null;
  authReady: boolean;
  profileLoading: boolean;
  actionError: string | null;
  initialInviteCode: string;
  onCreateHousehold: (householdName: string, setup: SetupMemberInput) => Promise<void>;
  onJoinHousehold: (inviteCode: string, setup: SetupMemberInput) => Promise<void>;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  user,
  authReady,
  profileLoading,
  actionError,
  initialInviteCode,
  onCreateHousehold,
  onJoinHousehold,
}) => {
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'join'>(
    initialInviteCode ? 'join' : 'create'
  );
  const [submitting, setSubmitting] = useState(false);

  const [householdName, setHouseholdName] = useState('My Health Space');
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [displayName, setDisplayName] = useState(
    user?.displayName?.split(' ')[0] || ''
  );
  const [roleLabel, setRoleLabel] = useState('Personal');
  const [calorieTarget, setCalorieTarget] = useState(2200);
  const [proteinTargetG, setProteinTargetG] = useState(160);
  const [heightCm, setHeightCm] = useState(176);
  const [targetWeightKg, setTargetWeightKg] = useState(74);
  const [targetMuscleMassKg, setTargetMuscleMassKg] = useState(35);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthPending(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Could not sign in with Google.'
      );
    } finally {
      setAuthPending(false);
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const remainingCal = Math.max(0, calorieTarget - proteinTargetG * 4);
    const carbsTargetG = Math.round((remainingCal * 0.55) / 4);
    const fatTargetG = Math.round((remainingCal * 0.45) / 9);

    const setup: SetupMemberInput = {
      displayName: displayName || user?.displayName?.split(' ')[0] || 'Member',
      roleLabel,
      calorieTarget,
      proteinTargetG,
      carbsTargetG,
      fatTargetG,
      heightCm,
      targetWeightKg,
      targetMuscleMassKg,
    };

    try {
      if (mode === 'create') {
        await onCreateHousehold(householdName, setup);
      } else {
        await onJoinHousehold(inviteCode, setup);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!authReady || (user && profileLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500 font-medium">Loading KinHealth…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            KinHealth
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline whitespace-nowrap">
            Personal, Partner &amp; Group Nutrition Ledger
          </span>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={authPending}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {authPending ? 'Signing in…' : 'Sign In'}
          </button>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 lg:py-20 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <p className="text-xs font-medium text-emerald-700 tracking-wide">
              Solo Tracking · Optional Partner &amp; Group Comparison
            </p>
            <h1 className="mt-3 font-display text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12] [text-wrap:balance]">
              Track calories, hit protein targets, and watch your companion evolve with your body indexes.
            </h1>
            <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-xl">
              Log meals for yourself with AI camera capture or meal autocomplete, monitor
              weight, muscle mass, BMI, SMI, and FFMI, and optionally invite your partner
              or a group of friends to compare numbers.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authPending}
                className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap disabled:opacity-60"
              >
                <span>{authPending ? 'Connecting Google Account…' : 'Continue with Google'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-500">
                Start solo immediately · Invite a partner or group anytime
              </span>
            </div>

            {authError && (
              <p className="mt-4 text-sm text-red-600">{authError}</p>
            )}
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
            <div className="p-5 flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-700">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  AI Meal Photo &amp; Autocomplete
                </h2>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Snap a meal photo or type a few words for instant calorie, protein,
                  carbs, fat, and fiber estimates.
                </p>
              </div>
            </div>

            <div className="p-5 flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-700">
                <Scale className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Animated Companion &amp; Body Indexes
                </h2>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Track weight, skeletal muscle mass, BMI, SMI, and FFMI—and watch your
                  animated KinBuddy morph as your body indexes change.
                </p>
              </div>
            </div>

            <div className="p-5 flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-700">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Solo-First or Group Comparison
                </h2>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Track privately on your own or pair with a partner, family, or training
                  group (up to 10 people) via invite code.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between gap-8">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          KinHealth
        </span>
        <span className="text-xs text-slate-500 truncate">
          Signed in as {user.email}
        </span>
        <button
          type="button"
          onClick={() => void signOutUser()}
          className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          Sign Out
        </button>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-10">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Set up your health profile
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Start tracking solo right away (you can invite a partner or group later), or
          join an existing group with an invite code.
        </p>

        <div className="mt-6 inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              mode === 'create'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Start Solo / New Group
          </button>
          <button
            type="button"
            onClick={() => setMode('join')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              mode === 'join'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Join Existing Group
          </button>
        </div>

        <form
          onSubmit={handleSetupSubmit}
          className="mt-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          {mode === 'create' ? (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Workspace or Group Name
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g. My Health Space or Weekend Lifting Crew"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Group / Partner Invite Code
              </label>
              <input
                type="text"
                required
                maxLength={12}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. KIN7X92A"
                className="w-full px-3 py-2 text-sm font-mono uppercase tracking-wider border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Your Name
              </label>
              <input
                type="text"
                required
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Rohan"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
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

          <div className="pt-2 border-t border-slate-100">
            <h2 className="text-xs font-semibold text-slate-900 mb-3">
              Daily Nutrition Targets &amp; Baseline Body Stats
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
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
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
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
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Height (cm) — for BMI &amp; Muscle Index
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
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
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Goal Muscle (kg)
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
          </div>

          {actionError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {actionError}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {submitting
                ? 'Setting up…'
                : mode === 'create'
                ? 'Start Tracking'
                : 'Join Group & Continue'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};
