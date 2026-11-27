import { unzipSync } from 'fflate';
import type { HealthSource, WorkoutType } from '../types';
import { BLUEPRINT_LIMITS, clampNum, getLocalDateStr, round1, shiftDateStr } from '../types';

export interface ParsedActivityDay {
  date: string;
  steps: number;
  activeCalories: number;
  distanceKm: number;
  exerciseMinutes: number;
  source: HealthSource;
  notes: string;
}

export interface ParsedWorkoutEntry {
  externalKey: string;
  date: string;
  workoutType: WorkoutType;
  title: string;
  durationMin: number;
  caloriesBurned: number;
  distanceKm: number;
  avgHeartRate: number;
  source: HealthSource;
  notes: string;
}

export interface ParsedWeightEntry {
  date: string;
  weightKg: number;
  notes: string;
}

export interface AppleHealthParseResult {
  activities: ParsedActivityDay[];
  workouts: ParsedWorkoutEntry[];
  weights: ParsedWeightEntry[];
  detectedFormat: 'apple_health_zip' | 'apple_health_xml' | 'health_auto_export_json' | 'shortcut_json';
  warnings: string[];
}

function isValidIsoDate(val: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(val);
}

function normalizeDatePrefix(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match && isValidIsoDate(match[1])) {
    return match[1];
  }
  const dt = new Date(trimmed);
  if (!Number.isNaN(dt.getTime())) {
    return getLocalDateStr(dt);
  }
  return null;
}

function stableShortHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function mapAppleWorkoutType(rawType: string): { workoutType: WorkoutType; defaultTitle: string } {
  const lower = rawType.toLowerCase();
  if (lower.includes('run') || lower.includes('jog')) {
    return { workoutType: 'running', defaultTitle: 'Run' };
  }
  if (lower.includes('walk') || lower.includes('hike')) {
    return { workoutType: 'walking', defaultTitle: lower.includes('hike') ? 'Hike' : 'Walk' };
  }
  if (lower.includes('cycl') || lower.includes('bik') || lower.includes('spin')) {
    return { workoutType: 'cycling', defaultTitle: 'Cycling' };
  }
  if (lower.includes('strength') || lower.includes('weight') || lower.includes('lift') || lower.includes('core')) {
    return { workoutType: 'strength', defaultTitle: 'Strength Training' };
  }
  if (lower.includes('highintensity') || lower.includes('hiit') || lower.includes('cross') || lower.includes('cardio')) {
    return { workoutType: 'hiit', defaultTitle: 'HIIT Workout' };
  }
  if (lower.includes('yoga') || lower.includes('pilates') || lower.includes('flexibility') || lower.includes('mind')) {
    return { workoutType: 'yoga', defaultTitle: lower.includes('pilates') ? 'Pilates' : 'Yoga' };
  }
  if (lower.includes('swim')) {
    return { workoutType: 'swimming', defaultTitle: 'Swim' };
  }
  const cleaned = rawType
    .replace(/^HKWorkoutActivityType/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return {
    workoutType: 'other',
    defaultTitle: cleaned ? cleaned.slice(0, BLUEPRINT_LIMITS.WORKOUT_TITLE_MAX) : 'Apple Health Workout',
  };
}

function parseXmlAttributes(tagText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tagText)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function convertDistanceToKm(val: number, unit: string): number {
  const u = unit.toLowerCase().trim();
  if (u === 'mi' || u === 'mile' || u === 'miles') return val * 1.60934;
  if (u === 'm' || u === 'meter' || u === 'meters') return val / 1000;
  return val;
}

function convertEnergyToKcal(val: number, unit: string): number {
  const u = unit.toLowerCase().trim();
  if (u === 'kj') return val / 4.184;
  return val;
}

function convertWeightToKg(val: number, unit: string): number {
  const u = unit.toLowerCase().trim();
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return val * 0.45359237;
  return val;
}

function pickPrimaryDailyTotal(sourceTotals: Map<string, number>): number {
  if (sourceTotals.size === 0) return 0;
  let watchBest = 0;
  let overallBest = 0;
  for (const [src, sum] of sourceTotals.entries()) {
    if (sum > overallBest) overallBest = sum;
    if (src.toLowerCase().includes('watch') && sum > watchBest) {
      watchBest = sum;
    }
  }
  return watchBest > 0 ? watchBest : overallBest;
}

export function parseAppleHealthXmlBuffer(
  xmlBytes: Uint8Array,
  lookbackDays = 30
): AppleHealthParseResult {
  const today = getLocalDateStr();
  const cutoffDate = shiftDateStr(today, -Math.max(0, lookbackDays - 1));

  // Per date -> Map<sourceName, accumulatedValue> so Watch + iPhone don't double count
  const stepsByDateSource = new Map<string, Map<string, number>>();
  const kcalByDateSource = new Map<string, Map<string, number>>();
  const distByDateSource = new Map<string, Map<string, number>>();
  const exerciseByDateSource = new Map<string, Map<string, number>>();
  const weightByDate = new Map<string, { weightKg: number; timestamp: string; source: string }>();
  const workouts: ParsedWorkoutEntry[] = [];
  const seenWorkoutKeys = new Set<string>();

  const addSourceSample = (
    bucket: Map<string, Map<string, number>>,
    date: string,
    source: string,
    delta: number
  ) => {
    if (!Number.isFinite(delta) || delta <= 0) return;
    let srcMap = bucket.get(date);
    if (!srcMap) {
      srcMap = new Map<string, number>();
      bucket.set(date, srcMap);
    }
    srcMap.set(source, (srcMap.get(source) ?? 0) + delta);
  };

  interface ActiveWorkoutCtx {
    date: string;
    startDateRaw: string;
    rawType: string;
    workoutType: WorkoutType;
    title: string;
    durationMin: number;
    caloriesBurned: number;
    distanceKm: number;
    avgHeartRate: number;
    sourceName: string;
  }
  let openWorkout: ActiveWorkoutCtx | null = null;

  const finalizeWorkout = (ctx: ActiveWorkoutCtx) => {
    const durationMin = clampNum(
      Math.round(ctx.durationMin),
      BLUEPRINT_LIMITS.WORKOUT_DURATION_MIN,
      BLUEPRINT_LIMITS.WORKOUT_DURATION_MAX
    );
    const keySeed = `${ctx.startDateRaw}|${ctx.rawType}|${durationMin}`;
    const externalKey = stableShortHash(keySeed);
    if (seenWorkoutKeys.has(externalKey)) return;
    seenWorkoutKeys.add(externalKey);

    workouts.push({
      externalKey,
      date: ctx.date,
      workoutType: ctx.workoutType,
      title: ctx.title.slice(0, BLUEPRINT_LIMITS.WORKOUT_TITLE_MAX),
      durationMin,
      caloriesBurned: clampNum(Math.round(ctx.caloriesBurned), 0, BLUEPRINT_LIMITS.WORKOUT_CAL_MAX),
      distanceKm: clampNum(round1(ctx.distanceKm), 0, BLUEPRINT_LIMITS.DISTANCE_KM_MAX),
      avgHeartRate: clampNum(Math.round(ctx.avgHeartRate), 0, 260),
      source: 'apple_health',
      notes: ctx.sourceName ? `Synced from ${ctx.sourceName}`.slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX) : 'Apple Health export',
    });
  };

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (openWorkout) {
      if (trimmed.startsWith('</Workout>')) {
        finalizeWorkout(openWorkout);
        openWorkout = null;
        return;
      }
      if (trimmed.startsWith('<WorkoutStatistics ')) {
        const attrs = parseXmlAttributes(trimmed);
        const statType = attrs.type || '';
        if (statType === 'HKQuantityTypeIdentifierActiveEnergyBurned' && openWorkout.caloriesBurned <= 0) {
          const sum = Number(attrs.sum || 0);
          if (sum > 0) openWorkout.caloriesBurned = convertEnergyToKcal(sum, attrs.unit || 'kcal');
        } else if (
          (statType === 'HKQuantityTypeIdentifierDistanceWalkingRunning' ||
            statType === 'HKQuantityTypeIdentifierDistanceCycling' ||
            statType === 'HKQuantityTypeIdentifierDistanceSwimming') &&
          openWorkout.distanceKm <= 0
        ) {
          const sum = Number(attrs.sum || 0);
          if (sum > 0) openWorkout.distanceKm = convertDistanceToKm(sum, attrs.unit || 'km');
        } else if (statType === 'HKQuantityTypeIdentifierHeartRate' && openWorkout.avgHeartRate <= 0) {
          const avg = Number(attrs.average || 0);
          if (avg > 0) openWorkout.avgHeartRate = avg;
        }
        return;
      }
    }

    if (trimmed.startsWith('<Record ')) {
      // Fast filter on Record types we care about before parsing full attributes
      const isStep = trimmed.includes('HKQuantityTypeIdentifierStepCount"');
      const isEnergy = trimmed.includes('HKQuantityTypeIdentifierActiveEnergyBurned"');
      const isDist = trimmed.includes('HKQuantityTypeIdentifierDistanceWalkingRunning"');
      const isExercise = trimmed.includes('HKQuantityTypeIdentifierAppleExerciseTime"');
      const isWeight = trimmed.includes('HKQuantityTypeIdentifierBodyMass"');
      if (!isStep && !isEnergy && !isDist && !isExercise && !isWeight) return;

      const startMatch = trimmed.match(/startDate="(\d{4}-\d{2}-\d{2})/);
      if (!startMatch) return;
      const date = startMatch[1];
      if (date < cutoffDate || date > today) return;

      const attrs = parseXmlAttributes(trimmed);
      const val = Number(attrs.value);
      if (!Number.isFinite(val) || val <= 0) return;
      const src = (attrs.sourceName || 'Apple Health').trim() || 'Apple Health';
      const unit = attrs.unit || '';

      if (isStep) {
        addSourceSample(stepsByDateSource, date, src, val);
      } else if (isEnergy) {
        addSourceSample(kcalByDateSource, date, src, convertEnergyToKcal(val, unit));
      } else if (isDist) {
        addSourceSample(distByDateSource, date, src, convertDistanceToKm(val, unit));
      } else if (isExercise) {
        addSourceSample(exerciseByDateSource, date, src, val);
      } else if (isWeight) {
        const kg = round1(convertWeightToKg(val, unit));
        if (kg >= BLUEPRINT_LIMITS.WEIGHT_MIN && kg <= BLUEPRINT_LIMITS.WEIGHT_MAX) {
          const ts = attrs.startDate || date;
          const prev = weightByDate.get(date);
          if (!prev || ts > prev.timestamp) {
            weightByDate.set(date, { weightKg: kg, timestamp: ts, source: src });
          }
        }
      }
      return;
    }

    if (trimmed.startsWith('<Workout ')) {
      const startMatch = trimmed.match(/startDate="(\d{4}-\d{2}-\d{2})/);
      if (!startMatch) return;
      const date = startMatch[1];
      if (date < cutoffDate || date > today) return;

      const attrs = parseXmlAttributes(trimmed);
      const rawType = attrs.workoutActivityType || 'HKWorkoutActivityTypeOther';
      const { workoutType, defaultTitle } = mapAppleWorkoutType(rawType);
      let durationMin = Number(attrs.duration || 0);
      if ((attrs.durationUnit || '').toLowerCase() === 's') {
        durationMin /= 60;
      } else if ((attrs.durationUnit || '').toLowerCase() === 'hr') {
        durationMin *= 60;
      }
      if (!Number.isFinite(durationMin) || durationMin < 1) {
        durationMin = 15;
      }
      const caloriesBurned = convertEnergyToKcal(
        Number(attrs.totalEnergyBurned || 0),
        attrs.totalEnergyBurnedUnit || 'kcal'
      );
      const distanceKm = convertDistanceToKm(
        Number(attrs.totalDistance || 0),
        attrs.totalDistanceUnit || 'km'
      );

      const ctx: ActiveWorkoutCtx = {
        date,
        startDateRaw: attrs.startDate || `${date}-${workouts.length}`,
        rawType,
        workoutType,
        title: defaultTitle,
        durationMin,
        caloriesBurned: Number.isFinite(caloriesBurned) ? caloriesBurned : 0,
        distanceKm: Number.isFinite(distanceKm) ? distanceKm : 0,
        avgHeartRate: 0,
        sourceName: attrs.sourceName || 'Apple Health',
      };

      if (trimmed.endsWith('/>')) {
        finalizeWorkout(ctx);
      } else {
        openWorkout = ctx;
      }
    }
  };

  // Decode in 4 MB chunks so 100MB+ Apple Health XML files do not exhaust browser string length limits
  const decoder = new TextDecoder('utf-8');
  const CHUNK_SIZE = 4 * 1024 * 1024;
  let carry = '';
  for (let offset = 0; offset < xmlBytes.length; offset += CHUNK_SIZE) {
    const slice = xmlBytes.subarray(offset, Math.min(offset + CHUNK_SIZE, xmlBytes.length));
    const isLast = offset + CHUNK_SIZE >= xmlBytes.length;
    const text = carry + decoder.decode(slice, { stream: !isLast });
    const lastNewline = text.lastIndexOf('\n');
    const completeBlock = isLast ? text : lastNewline >= 0 ? text.slice(0, lastNewline) : '';
    carry = isLast ? '' : lastNewline >= 0 ? text.slice(lastNewline + 1) : text;

    let start = 0;
    while (start < completeBlock.length) {
      const end = completeBlock.indexOf('\n', start);
      if (end === -1) {
        processLine(completeBlock.slice(start));
        break;
      }
      processLine(completeBlock.slice(start, end));
      start = end + 1;
    }
  }
  if (openWorkout) {
    finalizeWorkout(openWorkout);
  }

  const allDates = new Set<string>([
    ...stepsByDateSource.keys(),
    ...kcalByDateSource.keys(),
    ...distByDateSource.keys(),
    ...exerciseByDateSource.keys(),
  ]);

  const activities: ParsedActivityDay[] = Array.from(allDates)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const steps = clampNum(
        Math.round(pickPrimaryDailyTotal(stepsByDateSource.get(date) ?? new Map())),
        0,
        BLUEPRINT_LIMITS.STEPS_MAX
      );
      const activeCalories = clampNum(
        Math.round(pickPrimaryDailyTotal(kcalByDateSource.get(date) ?? new Map())),
        0,
        BLUEPRINT_LIMITS.ACTIVE_CAL_MAX
      );
      const distanceKm = clampNum(
        round1(pickPrimaryDailyTotal(distByDateSource.get(date) ?? new Map())),
        0,
        BLUEPRINT_LIMITS.DISTANCE_KM_MAX
      );
      const exerciseMinutes = clampNum(
        Math.round(pickPrimaryDailyTotal(exerciseByDateSource.get(date) ?? new Map())),
        0,
        1440
      );
      return {
        date,
        steps,
        activeCalories,
        distanceKm,
        exerciseMinutes,
        source: 'apple_health' as HealthSource,
        notes: 'Imported from Apple Health export',
      };
    })
    .filter((a) => a.steps > 0 || a.activeCalories > 0 || a.distanceKm > 0 || a.exerciseMinutes > 0);

  const weights: ParsedWeightEntry[] = Array.from(weightByDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, info]) => ({
      date,
      weightKg: info.weightKg,
      notes: `Apple Health (${info.source})`.slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
    }));

  const warnings: string[] = [];
  if (activities.length === 0 && workouts.length === 0 && weights.length === 0) {
    warnings.push(`No steps, workouts, or weight records found in the last ${lookbackDays} days.`);
  }

  return {
    activities,
    workouts: workouts.sort((a, b) => b.date.localeCompare(a.date)),
    weights,
    detectedFormat: 'apple_health_xml',
    warnings,
  };
}

export function parseHealthJsonPayload(
  rawInput: unknown,
  defaultSource: HealthSource = 'apple_shortcut'
): AppleHealthParseResult {
  const payload = typeof rawInput === 'string' ? (JSON.parse(rawInput) as Record<string, unknown>) : (rawInput as Record<string, unknown>);
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid JSON health payload.');
  }

  const today = getLocalDateStr();
  const warnings: string[] = [];
  const activityByDate = new Map<string, ParsedActivityDay>();
  const workouts: ParsedWorkoutEntry[] = [];
  const weights: ParsedWeightEntry[] = [];

  const ensureDay = (date: string): ParsedActivityDay => {
    let entry = activityByDate.get(date);
    if (!entry) {
      entry = {
        date,
        steps: 0,
        activeCalories: 0,
        distanceKm: 0,
        exerciseMinutes: 0,
        source: defaultSource,
        notes:
          defaultSource === 'apple_shortcut'
            ? 'Synced via Apple Shortcut'
            : 'Imported from Health JSON',
      };
      activityByDate.set(date, entry);
    }
    return entry;
  };

  // Format A: Health Auto Export JSON ({ data: { metrics: [...], workouts: [...] } })
  const nestedData = payload.data as Record<string, unknown> | undefined;
  if (nestedData && (Array.isArray(nestedData.metrics) || Array.isArray(nestedData.workouts))) {
    const metrics = Array.isArray(nestedData.metrics) ? nestedData.metrics : [];
    for (const metric of metrics) {
      if (!metric || typeof metric !== 'object') continue;
      const m = metric as Record<string, unknown>;
      const name = String(m.name || '').toLowerCase();
      const units = String(m.units || '');
      const samples = Array.isArray(m.data) ? m.data : [];
      for (const s of samples) {
        if (!s || typeof s !== 'object') continue;
        const sample = s as Record<string, unknown>;
        const date = normalizeDatePrefix(sample.date || sample.startDate) || today;
        const qty = Number(sample.qty ?? sample.avg ?? sample.value ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        if (name.includes('step')) {
          const day = ensureDay(date);
          day.steps = clampNum(Math.round(day.steps + qty), 0, BLUEPRINT_LIMITS.STEPS_MAX);
        } else if (name.includes('active_energy') || name.includes('active_calories')) {
          const day = ensureDay(date);
          day.activeCalories = clampNum(
            Math.round(day.activeCalories + convertEnergyToKcal(qty, units)),
            0,
            BLUEPRINT_LIMITS.ACTIVE_CAL_MAX
          );
        } else if (name.includes('walking_running_distance') || name.includes('distance')) {
          const day = ensureDay(date);
          day.distanceKm = clampNum(
            round1(day.distanceKm + convertDistanceToKm(qty, units)),
            0,
            BLUEPRINT_LIMITS.DISTANCE_KM_MAX
          );
        } else if (name.includes('exercise_time') || name.includes('exercise_minutes')) {
          const day = ensureDay(date);
          day.exerciseMinutes = clampNum(Math.round(day.exerciseMinutes + qty), 0, 1440);
        } else if (name.includes('weight') || name.includes('body_mass')) {
          const kg = round1(convertWeightToKg(qty, units));
          if (kg >= BLUEPRINT_LIMITS.WEIGHT_MIN && kg <= BLUEPRINT_LIMITS.WEIGHT_MAX) {
            weights.push({ date, weightKg: kg, notes: 'Health Auto Export' });
          }
        }
      }
    }

    const rawWorkouts = Array.isArray(nestedData.workouts) ? nestedData.workouts : [];
    for (const w of rawWorkouts) {
      if (!w || typeof w !== 'object') continue;
      const wk = w as Record<string, unknown>;
      const date = normalizeDatePrefix(wk.start || wk.startDate || wk.date) || today;
      const rawName = String(wk.name || wk.workoutActivityType || wk.type || 'Workout');
      const mapped = mapAppleWorkoutType(rawName);
      let durationMin = Number(wk.duration ?? wk.durationMin ?? 0);
      if (durationMin > 300 && !wk.durationMin) {
        // Health Auto Export reports workout duration in seconds
        durationMin /= 60;
      }
      const calObj = wk.activeEnergyBurned as Record<string, unknown> | undefined;
      const distObj = wk.distance as Record<string, unknown> | undefined;
      const kcal = Number(calObj?.qty ?? wk.caloriesBurned ?? wk.calories ?? 0);
      const dist = distObj
        ? convertDistanceToKm(Number(distObj.qty ?? 0), String(distObj.units || 'km'))
        : Number(wk.distanceKm ?? 0);
      const externalKey = stableShortHash(`${wk.start || date}|${rawName}|${Math.round(durationMin)}`);
      workouts.push({
        externalKey,
        date,
        workoutType: mapped.workoutType,
        title: rawName.slice(0, BLUEPRINT_LIMITS.WORKOUT_TITLE_MAX) || mapped.defaultTitle,
        durationMin: clampNum(Math.round(durationMin || 20), 1, 1440),
        caloriesBurned: clampNum(Math.round(kcal || 0), 0, BLUEPRINT_LIMITS.WORKOUT_CAL_MAX),
        distanceKm: clampNum(round1(dist || 0), 0, BLUEPRINT_LIMITS.DISTANCE_KM_MAX),
        avgHeartRate: clampNum(Math.round(Number(wk.avgHeartRate ?? 0) || 0), 0, 260),
        source: defaultSource,
        notes: 'Synced from Health Auto Export',
      });
    }

    return {
      activities: Array.from(activityByDate.values()).sort((a, b) => b.date.localeCompare(a.date)),
      workouts: workouts.sort((a, b) => b.date.localeCompare(a.date)),
      weights,
      detectedFormat: 'health_auto_export_json',
      warnings,
    };
  }

  // Format B: Compact Apple Shortcut JSON (single day object or `{ days: [...], workouts: [...] }`)
  const daysList = Array.isArray(payload.days)
    ? payload.days
    : [payload];

  for (const item of daysList) {
    if (!item || typeof item !== 'object') continue;
    const d = item as Record<string, unknown>;
    const date = normalizeDatePrefix(d.date) || today;
    const steps = Number(d.steps ?? d.stepCount ?? 0);
    const activeCalories = Number(d.activeCalories ?? d.activeEnergy ?? d.kcal ?? 0);
    const distanceKm = Number(d.distanceKm ?? d.distance ?? 0);
    const exerciseMinutes = Number(d.exerciseMinutes ?? d.exerciseMin ?? 0);
    const weightKg = Number(d.weightKg ?? d.weight ?? 0);

    if (steps > 0 || activeCalories > 0 || distanceKm > 0 || exerciseMinutes > 0) {
      const day = ensureDay(date);
      if (Number.isFinite(steps) && steps > 0) {
        day.steps = clampNum(Math.round(steps), 0, BLUEPRINT_LIMITS.STEPS_MAX);
      }
      if (Number.isFinite(activeCalories) && activeCalories > 0) {
        day.activeCalories = clampNum(Math.round(activeCalories), 0, BLUEPRINT_LIMITS.ACTIVE_CAL_MAX);
      }
      if (Number.isFinite(distanceKm) && distanceKm > 0) {
        day.distanceKm = clampNum(round1(distanceKm), 0, BLUEPRINT_LIMITS.DISTANCE_KM_MAX);
      }
      if (Number.isFinite(exerciseMinutes) && exerciseMinutes > 0) {
        day.exerciseMinutes = clampNum(Math.round(exerciseMinutes), 0, 1440);
      }
    }

    if (Number.isFinite(weightKg) && weightKg >= BLUEPRINT_LIMITS.WEIGHT_MIN && weightKg <= BLUEPRINT_LIMITS.WEIGHT_MAX) {
      weights.push({
        date,
        weightKg: round1(weightKg),
        notes: 'Synced via Apple Shortcut',
      });
    }
  }

  const shortcutWorkouts = Array.isArray(payload.workouts) ? payload.workouts : [];
  for (const w of shortcutWorkouts) {
    if (!w || typeof w !== 'object') continue;
    const wk = w as Record<string, unknown>;
    const date = normalizeDatePrefix(wk.date || wk.startDate) || normalizeDatePrefix(payload.date) || today;
    const rawTitle = String(wk.title || wk.name || wk.type || wk.workoutType || 'Workout');
    const mapped = mapAppleWorkoutType(String(wk.workoutType || wk.type || rawTitle));
    const durationMin = Number(wk.durationMin ?? wk.duration ?? 30);
    const caloriesBurned = Number(wk.caloriesBurned ?? wk.calories ?? 0);
    const distanceKm = Number(wk.distanceKm ?? wk.distance ?? 0);
    const avgHeartRate = Number(wk.avgHeartRate ?? 0);
    const externalKey = stableShortHash(`${date}|${rawTitle}|${Math.round(durationMin)}|${Math.round(caloriesBurned)}`);
    workouts.push({
      externalKey,
      date,
      workoutType: mapped.workoutType,
      title: rawTitle.slice(0, BLUEPRINT_LIMITS.WORKOUT_TITLE_MAX) || mapped.defaultTitle,
      durationMin: clampNum(Math.round(durationMin || 20), 1, 1440),
      caloriesBurned: clampNum(Math.round(caloriesBurned || 0), 0, BLUEPRINT_LIMITS.WORKOUT_CAL_MAX),
      distanceKm: clampNum(round1(distanceKm || 0), 0, BLUEPRINT_LIMITS.DISTANCE_KM_MAX),
      avgHeartRate: clampNum(Math.round(avgHeartRate || 0), 0, 260),
      source: defaultSource,
      notes: 'Synced via Apple Shortcut',
    });
  }

  const activities = Array.from(activityByDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  if (activities.length === 0 && workouts.length === 0 && weights.length === 0) {
    warnings.push('No recognizable steps, workouts, or weight fields found in JSON.');
  }

  return {
    activities,
    workouts,
    weights,
    detectedFormat: 'shortcut_json',
    warnings,
  };
}

export async function parseAppleHealthFile(
  file: File,
  lookbackDays = 30
): Promise<AppleHealthParseResult> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.json')) {
    const text = await file.text();
    return parseHealthJsonPayload(text, 'apple_health');
  }

  if (lowerName.endsWith('.xml')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return parseAppleHealthXmlBuffer(bytes, lookbackDays);
  }

  if (lowerName.endsWith('.zip')) {
    const zipBytes = new Uint8Array(await file.arrayBuffer());
    const entries = unzipSync(zipBytes, {
      filter: (entry) => entry.name.toLowerCase().endsWith('export.xml'),
    });
    const xmlEntryKey = Object.keys(entries).find((k) =>
      k.toLowerCase().endsWith('export.xml')
    );
    if (!xmlEntryKey || !entries[xmlEntryKey]) {
      throw new Error(
        'Could not find export.xml inside this .zip archive. Please upload Apple Health’s export.zip, export.xml, or JSON file.'
      );
    }
    const parsed = parseAppleHealthXmlBuffer(entries[xmlEntryKey], lookbackDays);
    return {
      ...parsed,
      detectedFormat: 'apple_health_zip',
    };
  }

  throw new Error('Unsupported file type. Please upload export.zip, export.xml, or .json.');
}

export function parseHealthSyncQueryParam(search: string): AppleHealthParseResult | null {
  const params = new URLSearchParams(search);
  const raw = params.get('healthSync');
  if (!raw || !raw.trim()) return null;

  const trimmed = raw.trim();
  const candidates: string[] = [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    candidates.push(trimmed);
  } else {
    try {
      const normalizedB64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
      const pad = normalizedB64.length % 4 === 0 ? '' : '='.repeat(4 - (normalizedB64.length % 4));
      candidates.push(atob(normalizedB64 + pad));
    } catch {
      // ignore invalid base64
    }
    candidates.push(trimmed);
  }

  for (const jsonText of candidates) {
    try {
      return parseHealthJsonPayload(jsonText, 'apple_shortcut');
    } catch {
      // try next candidate
    }
  }
  return null;
}
