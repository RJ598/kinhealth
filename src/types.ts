import type { Timestamp } from 'firebase/firestore';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodSource = 'ai_photo' | 'manual' | 'preset';
export type HealthSource = 'manual' | 'apple_health' | 'apple_shortcut';
export type WorkoutType =
  | 'strength'
  | 'running'
  | 'walking'
  | 'cycling'
  | 'hiit'
  | 'yoga'
  | 'swimming'
  | 'other';
export type AiConfidence = '' | 'high' | 'medium' | 'low';
export type ActiveTab = 'overview' | 'food' | 'activity' | 'body' | 'compare' | 'targets';

export const BLUEPRINT_LIMITS = {
  DISPLAY_NAME_MAX: 60,
  HOUSEHOLD_NAME_MAX: 80,
  ROLE_LABEL_MAX: 30,
  FOOD_NAME_MAX: 120,
  SERVING_NOTE_MAX: 120,
  AI_SUMMARY_MAX: 500,
  BODY_NOTES_MAX: 240,
  CALORIE_MIN: 500,
  CALORIE_MAX: 10000,
  PROTEIN_MIN: 20,
  PROTEIN_MAX: 600,
  HEIGHT_MIN: 80,
  HEIGHT_MAX: 250,
  WEIGHT_MIN: 20,
  WEIGHT_MAX: 400,
  MUSCLE_MIN: 5,
  MUSCLE_MAX: 200,
  BODY_FAT_MIN: 2,
  BODY_FAT_MAX: 75,
  WATER_LABEL_MAX: 60,
  WATER_ML_MIN: 10,
  WATER_ML_MAX: 5000,
  STEPS_TARGET_MIN: 1000,
  STEPS_TARGET_MAX: 50000,
  STEPS_TARGET_DEFAULT: 10000,
  STEPS_MAX: 200000,
  ACTIVE_CAL_MAX: 15000,
  DISTANCE_KM_MAX: 500,
  WORKOUT_TITLE_MAX: 120,
  WORKOUT_DURATION_MIN: 1,
  WORKOUT_DURATION_MAX: 1440,
  WORKOUT_CAL_MAX: 10000,
} as const;

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  householdId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  memberIds: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MemberProfile {
  uid: string;
  displayName: string;
  roleLabel: string;
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  heightCm: number;
  targetWeightKg: number;
  targetMuscleMassKg: number;
  stepsTarget?: number;
  sharedUids: string[];
  updatedAt?: Timestamp;
}

export interface FoodLog {
  id: string;
  uid: string;
  authorName: string;
  date: string;
  mealType: MealType;
  name: string;
  servingNote: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  source: FoodSource;
  aiConfidence: AiConfidence;
  aiItemsSummary: string;
  sharedUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FoodPreset {
  id: string;
  uid: string;
  authorName?: string;
  name: string;
  mealType: MealType;
  servingNote: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sharedUids?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BodyLog {
  id: string;
  uid: string;
  authorName: string;
  date: string;
  weightKg: number;
  muscleMassKg: number;
  bodyFatPct: number;
  visceralFatIndex: number;
  waistCm: number;
  bmi: number;
  smi: number;
  ffmi: number;
  notes: string;
  sharedUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WaterLog {
  id: string;
  uid: string;
  authorName: string;
  date: string;
  amountMl: number;
  label: string;
  sharedUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WeightLog {
  id: string;
  uid: string;
  authorName: string;
  date: string;
  weightKg: number;
  bmi: number;
  notes: string;
  sharedUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ActivityLog {
  id: string;
  uid: string;
  authorName: string;
  date: string;
  steps: number;
  activeCalories: number;
  distanceKm: number;
  exerciseMinutes: number;
  source: HealthSource;
  notes: string;
  sharedUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WorkoutLog {
  id: string;
  uid: string;
  authorName: string;
  date: string;
  workoutType: WorkoutType;
  title: string;
  durationMin: number;
  caloriesBurned: number;
  distanceKm: number;
  avgHeartRate: number;
  source: HealthSource;
  notes: string;
  sharedUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  strength: 'Strength Training',
  running: 'Run',
  walking: 'Walk',
  cycling: 'Cycling',
  hiit: 'HIIT / Conditioning',
  yoga: 'Yoga / Mobility',
  swimming: 'Swim',
  other: 'Workout',
};

export interface AiFoodItem {
  name: string;
  estimatedPortion: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface AiFoodAnalysis {
  mealName: string;
  suggestedMealType: MealType;
  servingNote: string;
  totalCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  confidence: 'high' | 'medium' | 'low';
  nutritionNote: string;
  items: AiFoodItem[];
}

export interface MealAutocompleteSuggestion {
  mealName: string;
  suggestedMealType: MealType;
  servingNote: string;
  totalCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface WeeklyInsightDayBreakdown {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  mealCount: number;
  topMeals: string[];
}

export interface WeeklyNutritionInsight {
  headline: string;
  proteinAssessment: string;
  calorieAssessment: string;
  highlights: string[];
  actionItems: string[];
  generatedAt: string;
}

export interface ComputedBodyIndexes {
  bmi: number;
  smi: number;
  ffmi: number;
  leanMassKg: number;
  musclePct: number;
  bmiLabel: string;
}

export function clampNum(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function computeBodyIndexes(
  weightKg: number,
  muscleMassKg: number,
  bodyFatPct: number,
  heightCm: number
): ComputedBodyIndexes {
  const safeWeight = clampNum(weightKg, 20, 400);
  const safeMuscle = clampNum(muscleMassKg, 5, 200);
  const safeFat = clampNum(bodyFatPct, 2, 75);
  const safeHeightM = clampNum(heightCm, 80, 250) / 100;
  const h2 = safeHeightM * safeHeightM;

  const bmi = clampNum(round1(safeWeight / h2), 5, 100);
  const smi = clampNum(round1(safeMuscle / h2), 0, 50);
  const leanMassKg = round1(safeWeight * (1 - safeFat / 100));
  const ffmi = clampNum(round1(leanMassKg / h2), 0, 50);
  const musclePct = round1((safeMuscle / safeWeight) * 100);

  let bmiLabel = 'Normal range';
  if (bmi < 18.5) bmiLabel = 'Underweight';
  else if (bmi >= 25 && bmi < 30) bmiLabel = 'Overweight';
  else if (bmi >= 30) bmiLabel = 'Obese range';

  return { bmi, smi, ffmi, leanMassKg, musclePct, bmiLabel };
}

export function computeBodyIndexesFromBmi(
  bmiInput: number,
  muscleMassKg: number,
  bodyFatPct: number,
  heightCm: number
): ComputedBodyIndexes & { weightKg: number } {
  const safeBmi = clampNum(round1(bmiInput), 5, 100);
  const safeHeightM = clampNum(heightCm, 80, 250) / 100;
  const h2 = safeHeightM * safeHeightM;
  const weightKg = clampNum(round1(safeBmi * h2), 20, 400);
  const derived = computeBodyIndexes(weightKg, muscleMassKg, bodyFatPct, heightCm);
  return {
    ...derived,
    bmi: safeBmi,
    bmiLabel:
      safeBmi < 18.5
        ? 'Underweight'
        : safeBmi < 25
          ? 'Normal range'
          : safeBmi < 30
            ? 'Overweight'
            : 'Obese range',
    weightKg,
  };
}

export function computeBmiFromWeight(
  weightKg: number,
  heightCm: number
): { weightKg: number; bmi: number; bmiLabel: string } {
  const safeWeight = clampNum(round1(weightKg), 20, 400);
  const safeHeightM = clampNum(heightCm, 80, 250) / 100;
  const h2 = safeHeightM * safeHeightM;
  const bmi = clampNum(round1(safeWeight / h2), 5, 100);
  let bmiLabel = 'Normal range';
  if (bmi < 18.5) bmiLabel = 'Underweight';
  else if (bmi >= 25 && bmi < 30) bmiLabel = 'Overweight';
  else if (bmi >= 30) bmiLabel = 'Obese range';
  return { weightKg: safeWeight, bmi, bmiLabel };
}

export interface CombinedWeightEntry {
  id: string;
  date: string;
  weightKg: number;
  bmi: number;
  source: 'weight' | 'composition';
  notes: string;
  createdAtMs: number;
}

export function buildCombinedWeightTimeline(
  weightLogs: WeightLog[],
  bodyLogs: BodyLog[],
  heightCm: number
): CombinedWeightEntry[] {
  const entries: CombinedWeightEntry[] = [
    ...weightLogs.map((w) => ({
      id: w.id,
      date: w.date,
      weightKg: round1(w.weightKg),
      bmi: computeBmiFromWeight(w.weightKg, heightCm).bmi,
      source: 'weight' as const,
      notes: w.notes,
      createdAtMs: w.createdAt?.toMillis?.() ?? 0,
    })),
    ...bodyLogs.map((b) => ({
      id: b.id,
      date: b.date,
      weightKg: round1(b.weightKg),
      bmi: b.bmi,
      source: 'composition' as const,
      notes: b.notes,
      createdAtMs: b.createdAt?.toMillis?.() ?? 0,
    })),
  ];

  // Newest first; prefer weight log if same date & timestamp tie
  entries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
    if (a.source !== b.source) return a.source === 'weight' ? -1 : 1;
    return 0;
  });
  return entries;
}

export function daysBetweenDates(earlierDateStr: string, laterDateStr: string): number {
  const parseUtc = (ds: string) => {
    const [y, m, d] = ds.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((parseUtc(laterDateStr) - parseUtc(earlierDateStr)) / 86400000);
}

export function getLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateStr(dt);
}

export function formatReadableDate(dateStr: string): string {
  const today = getLocalDateStr();
  if (dateStr === today) return 'Today';
  if (dateStr === shiftDateStr(today, -1)) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}
