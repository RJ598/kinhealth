import React, { useEffect, useState } from 'react';
import { Activity, Check, Dumbbell, Flame, Footprints, X } from 'lucide-react';
import type { CreateActivityInput, CreateWorkoutInput } from '../hooks/useHouseholdData';
import type { ActivityLog, WorkoutType } from '../types';
import { getLocalDateStr, WORKOUT_TYPE_LABELS } from '../types';

export type ActivityModalMode = 'steps' | 'workout';

interface ActivityWorkoutModalProps {
  isOpen: boolean;
  initialMode?: ActivityModalMode;
  defaultDate?: string;
  stepsTarget: number;
  existingDayActivity: ActivityLog | null;
  onClose: () => void;
  onSaveDailyActivity: (input: CreateActivityInput) => Promise<void>;
  onAddWorkout: (input: CreateWorkoutInput) => Promise<void>;
}

const WORKOUT_TYPES: WorkoutType[] = [
  'strength',
  'running',
  'walking',
  'cycling',
  'hiit',
  'yoga',
  'swimming',
  'other',
];

export const ActivityWorkoutModal: React.FC<ActivityWorkoutModalProps> = ({
  isOpen,
  initialMode = 'steps',
  defaultDate,
  stepsTarget,
  existingDayActivity,
  onClose,
  onSaveDailyActivity,
  onAddWorkout,
}) => {
  const [mode, setMode] = useState<ActivityModalMode>(initialMode);
  const [date, setDate] = useState(defaultDate || getLocalDateStr());

  // Steps & Daily Move fields
  const [steps, setSteps] = useState<number>(existingDayActivity?.steps ?? 0);
  const [activeCalories, setActiveCalories] = useState<number>(
    existingDayActivity?.activeCalories ?? 0
  );
  const [distanceKm, setDistanceKm] = useState<number>(
    existingDayActivity?.distanceKm ?? 0
  );
  const [exerciseMinutes, setExerciseMinutes] = useState<number>(
    existingDayActivity?.exerciseMinutes ?? 0
  );
  const [activityNotes, setActivityNotes] = useState<string>(
    existingDayActivity?.notes ?? ''
  );

  // Workout fields
  const [workoutType, setWorkoutType] = useState<WorkoutType>('strength');
  const [title, setTitle] = useState('Upper Body Strength');
  const [durationMin, setDurationMin] = useState(45);
  const [caloriesBurned, setCaloriesBurned] = useState(280);
  const [workoutDistanceKm, setWorkoutDistanceKm] = useState(0);
  const [avgHeartRate, setAvgHeartRate] = useState(0);
  const [workoutNotes, setWorkoutNotes] = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setDate(defaultDate || getLocalDateStr());
    setSteps(existingDayActivity?.steps ?? 0);
    setActiveCalories(existingDayActivity?.activeCalories ?? 0);
    setDistanceKm(existingDayActivity?.distanceKm ?? 0);
    setExerciseMinutes(existingDayActivity?.exerciseMinutes ?? 0);
    setActivityNotes(existingDayActivity?.notes ?? '');
    setWorkoutType('strength');
    setTitle('Strength Session');
    setDurationMin(45);
    setCaloriesBurned(280);
    setWorkoutDistanceKm(0);
    setAvgHeartRate(0);
    setWorkoutNotes('');
  }, [isOpen, initialMode, defaultDate, existingDayActivity]);

  if (!isOpen) return null;

  const handleSelectWorkoutType = (nextType: WorkoutType) => {
    setWorkoutType(nextType);
    const defaults: Record<WorkoutType, { title: string; kcal: number; dist: number }> = {
      strength: { title: 'Strength Training', kcal: 280, dist: 0 },
      running: { title: 'Outdoor Run', kcal: 420, dist: 5.0 },
      walking: { title: 'Brisk Walk', kcal: 180, dist: 3.5 },
      cycling: { title: 'Cycling Ride', kcal: 360, dist: 14.0 },
      hiit: { title: 'HIIT Conditioning', kcal: 350, dist: 0 },
      yoga: { title: 'Yoga & Mobility', kcal: 140, dist: 0 },
      swimming: { title: 'Pool Swim', kcal: 380, dist: 1.5 },
      other: { title: 'Workout Session', kcal: 240, dist: 0 },
    };
    const preset = defaults[nextType];
    setTitle(preset.title);
    setCaloriesBurned(preset.kcal);
    setWorkoutDistanceKm(preset.dist);
  };

  const applyStepsEstimate = (nextSteps: number) => {
    const safeSteps = Math.max(0, Math.round(nextSteps));
    setSteps(safeSteps);
    // Helpful default estimate if active calories / distance weren't manually set
    if (activeCalories === 0 || existingDayActivity?.steps !== safeSteps) {
      setActiveCalories(Math.round(safeSteps * 0.04));
      setDistanceKm(Number((safeSteps * 0.00075).toFixed(1)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (mode === 'steps') {
        await onSaveDailyActivity({
          date,
          steps,
          activeCalories,
          distanceKm,
          exerciseMinutes,
          source: 'manual',
          notes: activityNotes,
        });
      } else {
        await onAddWorkout({
          date,
          workoutType,
          title,
          durationMin,
          caloriesBurned,
          distanceKm: workoutDistanceKm,
          avgHeartRate,
          source: 'manual',
          notes: workoutNotes,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const stepPct = Math.round((steps / Math.max(1, stepsTarget)) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {mode === 'steps' ? 'Daily Steps & Active Move' : 'Log Workout Session'}
            </h2>
            <p className="text-xs text-slate-500">
              {mode === 'steps'
                ? 'Track steps, active energy, walking distance & exercise minutes'
                : 'Record strength, cardio, or mobility sessions'}
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

        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('steps')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                mode === 'steps'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Footprints className="w-3.5 h-3.5" />
              Daily Steps &amp; Move
            </button>
            <button
              type="button"
              onClick={() => setMode('workout')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                mode === 'workout'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Dumbbell className="w-3.5 h-3.5" />
              Log Workout
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {mode === 'steps' ? (
            <>
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
                    Steps ({stepPct}% of {stepsTarget.toLocaleString()})
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={200000}
                    value={steps}
                    onChange={(e) => setSteps(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-500">Quick add:</span>
                {[2500, 5000, 8000, 10000, 12000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyStepsEstimate(preset)}
                    className="px-2.5 py-1 text-[11px] font-mono font-medium bg-slate-100 text-slate-700 rounded-md hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Active kcal
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15000}
                    value={activeCalories}
                    onChange={(e) => setActiveCalories(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Distance (km)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={500}
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Exercise (min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={exerciseMinutes}
                    onChange={(e) => setExerciseMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={activityNotes}
                  onChange={(e) => setActivityNotes(e.target.value)}
                  placeholder="e.g. Evening walk around the park"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Workout Type
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {WORKOUT_TYPES.map((wt) => (
                    <button
                      key={wt}
                      type="button"
                      onClick={() => handleSelectWorkoutType(wt)}
                      className={`px-2 py-1.5 text-[11px] font-medium rounded-lg border transition-colors truncate ${
                        workoutType === wt
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {WORKOUT_TYPE_LABELS[wt].split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

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
                    Workout Title
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Push Day or Morning 5K"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={1440}
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-700 mb-1 flex items-center gap-1">
                    <Flame className="w-3 h-3" /> Burned (kcal)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={caloriesBurned}
                    onChange={(e) => setCaloriesBurned(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Distance (km)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={500}
                    value={workoutDistanceKm}
                    onChange={(e) => setWorkoutDistanceKm(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Avg HR
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={260}
                    value={avgHeartRate}
                    onChange={(e) => setAvgHeartRate(Number(e.target.value))}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={workoutNotes}
                  onChange={(e) => setWorkoutNotes(e.target.value)}
                  placeholder="e.g. Felt strong on squats, zone 2 finish"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>
            </>
          )}

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
                : mode === 'steps'
                  ? 'Save Daily Activity'
                  : 'Save Workout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
