import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  clampNum,
  computeBmiFromWeight,
  computeBodyIndexes,
  computeBodyIndexesFromBmi,
  makeSafeId,
} from '../types';
import type {
  ActivityLog,
  BodyLog,
  FoodLog,
  FoodPreset,
  HealthSource,
  Household,
  MemberProfile,
  UserProfile,
  WaterLog,
  WeightLog,
  WorkoutLog,
  WorkoutType,
} from '../types';
import type { AppleHealthParseResult } from '../utils/appleHealthImport';

export interface SetupMemberInput {
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
}

export interface CreateFoodInput {
  date: string;
  mealType: FoodLog['mealType'];
  name: string;
  servingNote: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  source: FoodLog['source'];
  aiConfidence: FoodLog['aiConfidence'];
  aiItemsSummary: string;
}

export interface CreateFoodPresetInput {
  name: string;
  mealType: FoodPreset['mealType'];
  servingNote: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface CreateBodyInput {
  date: string;
  weightKg?: number;
  bmi?: number;
  muscleMassKg: number;
  bodyFatPct: number;
  notes: string;
}

export interface CreateWeightInput {
  date: string;
  weightKg: number;
  notes: string;
}

export interface CreateWaterInput {
  date: string;
  amountMl: number;
  label: string;
}

export interface CreateActivityInput {
  date: string;
  steps: number;
  activeCalories: number;
  distanceKm: number;
  exerciseMinutes: number;
  source: HealthSource;
  notes: string;
}

export interface CreateWorkoutInput {
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

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'KIN';
  for (let i = 0; i < 5; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

const ALLOWED_MEAL_TYPES = new Set<FoodPreset['mealType']>([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
]);

function sanitizeMealType(raw: unknown): FoodPreset['mealType'] {
  if (typeof raw === 'string' && ALLOWED_MEAL_TYPES.has(raw as FoodPreset['mealType'])) {
    return raw as FoodPreset['mealType'];
  }
  return 'lunch';
}

function buildGroupPresetFields(params: {
  id: string;
  uid: string;
  authorName: string;
  name: unknown;
  mealType: unknown;
  servingNote: unknown;
  calories: unknown;
  proteinG: unknown;
  carbsG: unknown;
  fatG: unknown;
  fiberG: unknown;
  sharedUids: string[];
}) {
  const safeAuthor =
    params.authorName.trim().slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';
  const safeName =
    (typeof params.name === 'string' ? params.name : '')
      .trim()
      .slice(0, BLUEPRINT_LIMITS.FOOD_NAME_MAX) || 'Daily Meal';
  const safeServingNote =
    (typeof params.servingNote === 'string' ? params.servingNote : '')
      .trim()
      .slice(0, BLUEPRINT_LIMITS.SERVING_NOTE_MAX);
  const safeSharedUids = Array.from(
    new Set([params.uid, ...params.sharedUids].filter((id) => typeof id === 'string' && id.length > 0))
  ).slice(0, 10);

  return {
    id: params.id,
    uid: params.uid,
    authorName: safeAuthor,
    name: safeName,
    mealType: sanitizeMealType(params.mealType),
    servingNote: safeServingNote,
    calories: clampNum(Math.round(Number(params.calories) || 0), 0, 15000),
    proteinG: clampNum(Number((Number(params.proteinG) || 0).toFixed(1)), 0, 1000),
    carbsG: clampNum(Number((Number(params.carbsG) || 0).toFixed(1)), 0, 1500),
    fatG: clampNum(Number((Number(params.fatG) || 0).toFixed(1)), 0, 1000),
    fiberG: clampNum(Number((Number(params.fiberG) || 0).toFixed(1)), 0, 500),
    sharedUids: safeSharedUids,
  };
}

export function useHouseholdData() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [foodPresets, setFoodPresets] = useState<FoodPreset[]>([]);
  const [bodyLogs, setBodyLogs] = useState<BodyLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  // 1. Auth listener + private UserProfile bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setUserProfile(null);
        setHousehold(null);
        setMembers([]);
        setFoodLogs([]);
        setFoodPresets([]);
        setBodyLogs([]);
        setWeightLogs([]);
        setWaterLogs([]);
        setActivityLogs([]);
        setWorkoutLogs([]);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const userPath = `users/${nextUser.uid}`;
      const userRef = doc(db, 'users', nextUser.uid);

      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const fallbackName = (nextUser.displayName || nextUser.email?.split('@')[0] || 'Member')
            .trim()
            .slice(0, 80);
          await setDoc(userRef, {
            uid: nextUser.uid,
            email: (nextUser.email || 'user@example.com').slice(0, 254),
            displayName: fallbackName || 'Member',
            householdId: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, userPath);
      }
    });

    return () => unsub();
  }, []);

  // 2. Listen to private UserProfile
  useEffect(() => {
    if (!authReady || !user) return;
    const path = `users/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        }
        setProfileLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, path);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  const householdId = userProfile?.householdId || '';

  // 3. Listen to active Workspace / Group
  useEffect(() => {
    if (!authReady || !user || !householdId) {
      setHousehold(null);
      return;
    }
    const path = `households/${householdId}`;
    const unsub = onSnapshot(
      doc(db, 'households', householdId),
      (snap) => {
        if (snap.exists()) {
          setHousehold(snap.data() as Household);
        } else {
          setHousehold(null);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, path);
      }
    );
    return () => unsub();
  }, [authReady, user, householdId]);

  // 4. Listen to all MemberProfiles in the workspace/group (up to 10)
  useEffect(() => {
    if (!authReady || !user || !household || household.memberIds.length === 0) {
      setMembers([]);
      return;
    }

    const memberMap = new Map<string, MemberProfile>();
    const unsubs = household.memberIds.slice(0, 10).map((memberUid) => {
      const path = `households/${household.id}/members/${memberUid}`;
      return onSnapshot(
        doc(db, 'households', household.id, 'members', memberUid),
        (snap) => {
          if (snap.exists()) {
            memberMap.set(memberUid, snap.data() as MemberProfile);
          } else {
            memberMap.delete(memberUid);
          }
          setMembers(Array.from(memberMap.values()));
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, path);
        }
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, household]);

  // 5. Listen to FoodLogs
  useEffect(() => {
    if (!authReady || !user || !householdId) {
      setFoodLogs([]);
      return;
    }
    const path = `households/${householdId}/foodLogs`;
    const q = query(
      collection(db, 'households', householdId, 'foodLogs'),
      where('sharedUids', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as FoodLog);
        items.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setFoodLogs(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [authReady, user, householdId]);

  // 6. Listen to BodyLogs
  useEffect(() => {
    if (!authReady || !user || !householdId) {
      setBodyLogs([]);
      return;
    }
    const path = `households/${householdId}/bodyLogs`;
    const q = query(
      collection(db, 'households', householdId, 'bodyLogs'),
      where('sharedUids', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as BodyLog);
        items.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setBodyLogs(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [authReady, user, householdId]);

  // 6a-weight. Listen to Daily Weight Logs
  useEffect(() => {
    if (!authReady || !user || !householdId) {
      setWeightLogs([]);
      return;
    }
    const path = `households/${householdId}/weightLogs`;
    const q = query(
      collection(db, 'households', householdId, 'weightLogs'),
      where('sharedUids', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as WeightLog);
        items.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setWeightLogs(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [authReady, user, householdId]);

  // 6a-water. Listen to Daily Water Intake Logs
  useEffect(() => {
    if (!authReady || !user || !householdId) {
      setWaterLogs([]);
      return;
    }
    const path = `households/${householdId}/waterLogs`;
    const q = query(
      collection(db, 'households', householdId, 'waterLogs'),
      where('sharedUids', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as WaterLog);
        items.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setWaterLogs(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [authReady, user, householdId]);

  // 6a-activity. Listen to Daily Activity & Steps Logs
  useEffect(() => {
    if (!authReady || !user || !householdId) {
      setActivityLogs([]);
      return;
    }
    const path = `households/${householdId}/activityLogs`;
    const q = query(
      collection(db, 'households', householdId, 'activityLogs'),
      where('sharedUids', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as ActivityLog);
        items.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          const ta = a.updatedAt?.toMillis?.() ?? 0;
          const tb = b.updatedAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setActivityLogs(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [authReady, user, householdId]);

  // 6a-workout. Listen to Workout Session Logs
  useEffect(() => {
    if (!authReady || !user || !householdId) {
      setWorkoutLogs([]);
      return;
    }
    const path = `households/${householdId}/workoutLogs`;
    const q = query(
      collection(db, 'households', householdId, 'workoutLogs'),
      where('sharedUids', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as WorkoutLog);
        items.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setWorkoutLogs(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [authReady, user, householdId]);

  // 6b. Listen to Shared Group Daily Food Presets
  useEffect(() => {
    if (!authReady || !user || !householdId) {
      setFoodPresets([]);
      return;
    }
    const path = `households/${householdId}/foodPresets`;
    const q = query(
      collection(db, 'households', householdId, 'foodPresets'),
      where('sharedUids', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as FoodPreset);
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          if (tb !== ta) return tb - ta;
          return a.name.localeCompare(b.name);
        });
        setFoodPresets(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [authReady, user, householdId]);

  // 6c. Seamless migration of legacy personal presets into the active group
  useEffect(() => {
    if (
      !authReady ||
      !user ||
      !household ||
      household.memberIds.length === 0 ||
      !household.memberIds.includes(user.uid)
    ) {
      return;
    }

    let cancelled = false;
    const currentMember = members.find((m) => m.uid === user.uid);
    const authorName =
      (currentMember?.displayName || userProfile?.displayName || 'Member')
        .trim()
        .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';
    const sharedUids = Array.from(
      new Set([user.uid, ...household.memberIds])
    ).slice(0, 10);

    const migrateLegacyPresets = async () => {
      try {
        const legacyQuery = query(
          collection(db, 'users', user.uid, 'foodPresets'),
          where('uid', '==', user.uid)
        );
        const snap = await getDocs(legacyQuery);
        if (cancelled || snap.empty) return;

        const existingIds = new Set(foodPresets.map((p) => p.id));

        for (const legacyDoc of snap.docs.slice(0, 100)) {
          if (cancelled) return;
          try {
            if (!existingIds.has(legacyDoc.id)) {
              const data = legacyDoc.data() as Partial<FoodPreset>;
              const targetRef = doc(db, 'households', household.id, 'foodPresets', legacyDoc.id);
              const existingTarget = await getDoc(targetRef);
              if (!existingTarget.exists()) {
                await setDoc(targetRef, {
                  ...buildGroupPresetFields({
                    id: legacyDoc.id,
                    uid: user.uid,
                    authorName,
                    name: data.name,
                    mealType: data.mealType,
                    servingNote: data.servingNote,
                    calories: data.calories,
                    proteinG: data.proteinG,
                    carbsG: data.carbsG,
                    fatG: data.fatG,
                    fiberG: data.fiberG,
                    sharedUids,
                  }),
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              }
            }
            await deleteDoc(legacyDoc.ref);
          } catch (docErr) {
            console.error(`Legacy preset migration failed for ${legacyDoc.id}:`, docErr);
          }
        }
      } catch (err) {
        console.error('Legacy preset migration query error:', err);
      }
    };

    void migrateLegacyPresets();
    return () => {
      cancelled = true;
    };
  }, [authReady, user, household, members, userProfile?.displayName]);

  // 7. Auto-sync sharedUids on current user's docs when group membership changes
  useEffect(() => {
    if (
      !user ||
      !household ||
      household.memberIds.length === 0 ||
      !household.memberIds.includes(user.uid)
    ) {
      return;
    }
    const expected = Array.from(new Set(household.memberIds)).slice(0, 10);
    const hasMismatch = (arr: string[]) =>
      expected.some((id) => !arr.includes(id)) || arr.some((id) => !expected.includes(id));

    const needsSyncFood = foodLogs.filter(
      (f) => f.uid === user.uid && hasMismatch(f.sharedUids)
    );
    const needsSyncPresets = foodPresets.filter(
      (p) => p.uid === user.uid && hasMismatch(p.sharedUids ?? [])
    );
    const needsSyncBody = bodyLogs.filter(
      (b) => b.uid === user.uid && hasMismatch(b.sharedUids)
    );
    const needsSyncWeight = weightLogs.filter(
      (w) => w.uid === user.uid && hasMismatch(w.sharedUids)
    );
    const needsSyncWater = waterLogs.filter(
      (w) => w.uid === user.uid && hasMismatch(w.sharedUids)
    );
    const needsSyncActivity = activityLogs.filter(
      (a) => a.uid === user.uid && hasMismatch(a.sharedUids)
    );
    const needsSyncWorkouts = workoutLogs.filter(
      (w) => w.uid === user.uid && hasMismatch(w.sharedUids)
    );
    const myMember = members.find((m) => m.uid === user.uid);
    const needsSyncMember = Boolean(myMember && hasMismatch(myMember.sharedUids));

    if (
      !needsSyncMember &&
      needsSyncFood.length === 0 &&
      needsSyncPresets.length === 0 &&
      needsSyncBody.length === 0 &&
      needsSyncWeight.length === 0 &&
      needsSyncWater.length === 0 &&
      needsSyncActivity.length === 0 &&
      needsSyncWorkouts.length === 0
    ) {
      return;
    }

    const fallbackAuthor =
      (myMember?.displayName || userProfile?.displayName || 'Member')
        .trim()
        .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';

    const syncDocsSafely = async (
      updates: Array<{
        ref: ReturnType<typeof doc>;
        data: Record<string, unknown>;
      }>
    ) => {
      if (updates.length === 0) return;
      try {
        const batch = writeBatch(db);
        for (const u of updates) {
          batch.update(u.ref, u.data);
        }
        await batch.commit();
      } catch {
        // Fallback per-doc so one legacy schema anomaly never blocks sibling docs
        for (const u of updates) {
          try {
            await updateDoc(u.ref, u.data);
          } catch (docErr) {
            console.error('Background doc sync failed:', u.ref.path, docErr);
          }
        }
      }
    };

    const runSync = async () => {
      const presetUpdates = needsSyncPresets.slice(0, 120).map((item) => ({
        ref: doc(db, 'households', household.id, 'foodPresets', item.id),
        data: {
          sharedUids: expected,
          ...(item.authorName?.trim() ? {} : { authorName: fallbackAuthor }),
          updatedAt: serverTimestamp(),
        },
      }));

      const memberUpdates = needsSyncMember
        ? [
            {
              ref: doc(db, 'households', household.id, 'members', user.uid),
              data: {
                sharedUids: expected,
                updatedAt: serverTimestamp(),
              },
            },
          ]
        : [];

      const foodUpdates = needsSyncFood.slice(0, 120).map((item) => ({
        ref: doc(db, 'households', household.id, 'foodLogs', item.id),
        data: {
          sharedUids: expected,
          updatedAt: serverTimestamp(),
        },
      }));

      const bodyUpdates = needsSyncBody.slice(0, 120).map((item) => ({
        ref: doc(db, 'households', household.id, 'bodyLogs', item.id),
        data: {
          sharedUids: expected,
          updatedAt: serverTimestamp(),
        },
      }));

      const weightUpdates = needsSyncWeight.slice(0, 120).map((item) => ({
        ref: doc(db, 'households', household.id, 'weightLogs', item.id),
        data: {
          sharedUids: expected,
          updatedAt: serverTimestamp(),
        },
      }));

      const waterUpdates = needsSyncWater.slice(0, 120).map((item) => ({
        ref: doc(db, 'households', household.id, 'waterLogs', item.id),
        data: {
          sharedUids: expected,
          updatedAt: serverTimestamp(),
        },
      }));

      const activityUpdates = needsSyncActivity.slice(0, 120).map((item) => ({
        ref: doc(db, 'households', household.id, 'activityLogs', item.id),
        data: {
          sharedUids: expected,
          updatedAt: serverTimestamp(),
        },
      }));

      const workoutUpdates = needsSyncWorkouts.slice(0, 120).map((item) => ({
        ref: doc(db, 'households', household.id, 'workoutLogs', item.id),
        data: {
          sharedUids: expected,
          updatedAt: serverTimestamp(),
        },
      }));

      await Promise.all([
        syncDocsSafely(presetUpdates),
        syncDocsSafely(memberUpdates),
        syncDocsSafely(foodUpdates),
        syncDocsSafely(bodyUpdates),
        syncDocsSafely(weightUpdates),
        syncDocsSafely(waterUpdates),
        syncDocsSafely(activityUpdates),
        syncDocsSafely(workoutUpdates),
      ]);
    };

    void runSync();
  }, [
    user,
    household,
    members,
    foodLogs,
    foodPresets,
    bodyLogs,
    weightLogs,
    waterLogs,
    activityLogs,
    workoutLogs,
    userProfile?.displayName,
  ]);

  const myProfile = useMemo(
    () => members.find((m) => m.uid === user?.uid) ?? null,
    [members, user?.uid]
  );

  const otherMembers = useMemo(
    () => members.filter((m) => m.uid !== user?.uid),
    [members, user?.uid]
  );

  const partnerProfile = otherMembers[0] ?? null;

  const createHousehold = useCallback(
    async (householdName: string, setup: SetupMemberInput) => {
      if (!user) return;
      setActionError(null);
      const newHouseholdId = makeSafeId('grp');
      const inviteCode = generateInviteCode();
      const safeHouseholdName =
        householdName.trim().slice(0, BLUEPRINT_LIMITS.HOUSEHOLD_NAME_MAX) ||
        'My Health Space';
      const safeDisplayName =
        setup.displayName.trim().slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
        'Member';

      const batch = writeBatch(db);
      batch.set(doc(db, 'households', newHouseholdId), {
        id: newHouseholdId,
        name: safeHouseholdName,
        inviteCode,
        ownerId: user.uid,
        memberIds: [user.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'householdInvites', inviteCode), {
        inviteCode,
        householdId: newHouseholdId,
        householdName: safeHouseholdName,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', user.uid), {
        displayName: safeDisplayName,
        householdId: newHouseholdId,
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `households/${newHouseholdId}`);
      }

      const memberPath = `households/${newHouseholdId}/members/${user.uid}`;
      try {
        await setDoc(doc(db, 'households', newHouseholdId, 'members', user.uid), {
          uid: user.uid,
          displayName: safeDisplayName,
          roleLabel:
            setup.roleLabel.trim().slice(0, BLUEPRINT_LIMITS.ROLE_LABEL_MAX) ||
            'Personal',
          calorieTarget: clampNum(
            Math.round(setup.calorieTarget),
            BLUEPRINT_LIMITS.CALORIE_MIN,
            BLUEPRINT_LIMITS.CALORIE_MAX
          ),
          proteinTargetG: clampNum(
            Math.round(setup.proteinTargetG),
            BLUEPRINT_LIMITS.PROTEIN_MIN,
            BLUEPRINT_LIMITS.PROTEIN_MAX
          ),
          carbsTargetG: clampNum(Math.round(setup.carbsTargetG), 0, 1000),
          fatTargetG: clampNum(Math.round(setup.fatTargetG), 0, 500),
          heightCm: clampNum(
            Math.round(setup.heightCm),
            BLUEPRINT_LIMITS.HEIGHT_MIN,
            BLUEPRINT_LIMITS.HEIGHT_MAX
          ),
          targetWeightKg: clampNum(Number(setup.targetWeightKg.toFixed(1)), 25, 350),
          targetMuscleMassKg: clampNum(
            Number(setup.targetMuscleMassKg.toFixed(1)),
            10,
            150
          ),
          stepsTarget: clampNum(
            Math.round(setup.stepsTarget ?? BLUEPRINT_LIMITS.STEPS_TARGET_DEFAULT),
            BLUEPRINT_LIMITS.STEPS_TARGET_MIN,
            BLUEPRINT_LIMITS.STEPS_TARGET_MAX
          ),
          sharedUids: [user.uid],
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, memberPath);
      }
    },
    [user]
  );

  const joinHouseholdByCode = useCallback(
    async (
      rawCode: string,
      setup: SetupMemberInput,
      migrateFoodLogs: FoodLog[] = [],
      migrateBodyLogs: BodyLog[] = [],
      migrateFoodPresets: FoodPreset[] = [],
      migrateWaterLogs: WaterLog[] = [],
      migrateWeightLogs: WeightLog[] = [],
      migrateActivityLogs: ActivityLog[] = [],
      migrateWorkoutLogs: WorkoutLog[] = []
    ) => {
      if (!user) return;
      setActionError(null);
      const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 6 || code.length > 12) {
        setActionError('Please enter a valid invite code (6–12 characters).');
        return;
      }

      const invitePath = `householdInvites/${code}`;
      let targetHouseholdId = '';
      let ownerId = '';
      try {
        const inviteSnap = await getDoc(doc(db, 'householdInvites', code));
        if (!inviteSnap.exists()) {
          setActionError('Invite code not found. Double-check the code and try again.');
          return;
        }
        const inviteData = inviteSnap.data();
        targetHouseholdId = String(inviteData.householdId || '');
        ownerId = String(inviteData.ownerId || '');
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, invitePath);
      }

      if (!targetHouseholdId || !ownerId) {
        setActionError('Invite data is incomplete.');
        return;
      }

      if (ownerId === user.uid || targetHouseholdId === household?.id) {
        setActionError('You are already a member of this group.');
        return;
      }

      const safeDisplayName =
        setup.displayName.trim().slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
        'Member';

      try {
        await updateDoc(doc(db, 'households', targetHouseholdId), {
          memberIds: arrayUnion(user.uid),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
          setActionError(
            'Unable to join this group — it may have reached the 10-member limit or you already belong to it.'
          );
          return;
        }
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `households/${targetHouseholdId}`
        );
      }

      // Now we are in memberIds, read the full memberIds array
      let fullMemberIds = [ownerId, user.uid];
      try {
        const hhSnap = await getDoc(doc(db, 'households', targetHouseholdId));
        if (hhSnap.exists()) {
          const hhData = hhSnap.data() as Household;
          if (Array.isArray(hhData.memberIds) && hhData.memberIds.length > 0) {
            fullMemberIds = hhData.memberIds.slice(0, 10);
          }
        }
      } catch {
        // Fallback to [ownerId, user.uid]
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', user.uid), {
          displayName: safeDisplayName,
          householdId: targetHouseholdId,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'households', targetHouseholdId, 'members', user.uid), {
          uid: user.uid,
          displayName: safeDisplayName,
          roleLabel:
            setup.roleLabel.trim().slice(0, BLUEPRINT_LIMITS.ROLE_LABEL_MAX) ||
            'Member',
          calorieTarget: clampNum(
            Math.round(setup.calorieTarget),
            BLUEPRINT_LIMITS.CALORIE_MIN,
            BLUEPRINT_LIMITS.CALORIE_MAX
          ),
          proteinTargetG: clampNum(
            Math.round(setup.proteinTargetG),
            BLUEPRINT_LIMITS.PROTEIN_MIN,
            BLUEPRINT_LIMITS.PROTEIN_MAX
          ),
          carbsTargetG: clampNum(Math.round(setup.carbsTargetG), 0, 1000),
          fatTargetG: clampNum(Math.round(setup.fatTargetG), 0, 500),
          heightCm: clampNum(
            Math.round(setup.heightCm),
            BLUEPRINT_LIMITS.HEIGHT_MIN,
            BLUEPRINT_LIMITS.HEIGHT_MAX
          ),
          targetWeightKg: clampNum(Number(setup.targetWeightKg.toFixed(1)), 25, 350),
          targetMuscleMassKg: clampNum(
            Number(setup.targetMuscleMassKg.toFixed(1)),
            10,
            150
          ),
          stepsTarget: clampNum(
            Math.round(setup.stepsTarget ?? BLUEPRINT_LIMITS.STEPS_TARGET_DEFAULT),
            BLUEPRINT_LIMITS.STEPS_TARGET_MIN,
            BLUEPRINT_LIMITS.STEPS_TARGET_MAX
          ),
          sharedUids: fullMemberIds,
          updatedAt: serverTimestamp(),
        });

        // Preserve existing solo logs when joining a group
        for (const f of migrateFoodLogs.filter((x) => x.uid === user.uid).slice(0, 100)) {
          batch.set(doc(db, 'households', targetHouseholdId, 'foodLogs', f.id), {
            id: f.id,
            uid: user.uid,
            authorName: safeDisplayName,
            date: f.date,
            mealType: f.mealType,
            name: f.name,
            servingNote: f.servingNote,
            calories: f.calories,
            proteinG: f.proteinG,
            carbsG: f.carbsG,
            fatG: f.fatG,
            fiberG: f.fiberG,
            source: f.source,
            aiConfidence: f.aiConfidence,
            aiItemsSummary: f.aiItemsSummary,
            sharedUids: fullMemberIds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        for (const p of migrateFoodPresets.filter((x) => x.uid === user.uid).slice(0, 100)) {
          batch.set(doc(db, 'households', targetHouseholdId, 'foodPresets', p.id), {
            ...buildGroupPresetFields({
              id: p.id,
              uid: user.uid,
              authorName: safeDisplayName,
              name: p.name,
              mealType: p.mealType,
              servingNote: p.servingNote,
              calories: p.calories,
              proteinG: p.proteinG,
              carbsG: p.carbsG,
              fatG: p.fatG,
              fiberG: p.fiberG,
              sharedUids: fullMemberIds,
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        for (const b of migrateBodyLogs.filter((x) => x.uid === user.uid).slice(0, 100)) {
          batch.set(doc(db, 'households', targetHouseholdId, 'bodyLogs', b.id), {
            id: b.id,
            uid: user.uid,
            authorName: safeDisplayName,
            date: b.date,
            weightKg: b.weightKg,
            muscleMassKg: b.muscleMassKg,
            bodyFatPct: b.bodyFatPct,
            visceralFatIndex: b.visceralFatIndex,
            waistCm: b.waistCm,
            bmi: b.bmi,
            smi: b.smi,
            ffmi: b.ffmi,
            notes: b.notes,
            sharedUids: fullMemberIds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        for (const w of migrateWaterLogs.filter((x) => x.uid === user.uid).slice(0, 100)) {
          batch.set(doc(db, 'households', targetHouseholdId, 'waterLogs', w.id), {
            id: w.id,
            uid: user.uid,
            authorName: safeDisplayName,
            date: w.date,
            amountMl: clampNum(
              Math.round(w.amountMl),
              BLUEPRINT_LIMITS.WATER_ML_MIN,
              BLUEPRINT_LIMITS.WATER_ML_MAX
            ),
            label: (w.label || '')
              .trim()
              .slice(0, BLUEPRINT_LIMITS.WATER_LABEL_MAX),
            sharedUids: fullMemberIds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        for (const w of migrateWeightLogs.filter((x) => x.uid === user.uid).slice(0, 60)) {
          batch.set(doc(db, 'households', targetHouseholdId, 'weightLogs', w.id), {
            id: w.id,
            uid: user.uid,
            authorName: safeDisplayName,
            date: w.date,
            weightKg: clampNum(Number(w.weightKg.toFixed(1)), 20, 400),
            bmi: clampNum(Number(w.bmi.toFixed(1)), 5, 100),
            notes: (w.notes || '').trim().slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
            sharedUids: fullMemberIds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        for (const a of migrateActivityLogs.filter((x) => x.uid === user.uid).slice(0, 60)) {
          batch.set(doc(db, 'households', targetHouseholdId, 'activityLogs', a.id), {
            id: a.id,
            uid: user.uid,
            authorName: safeDisplayName,
            date: a.date,
            steps: clampNum(Math.round(a.steps), 0, BLUEPRINT_LIMITS.STEPS_MAX),
            activeCalories: clampNum(Math.round(a.activeCalories), 0, BLUEPRINT_LIMITS.ACTIVE_CAL_MAX),
            distanceKm: clampNum(Number(a.distanceKm.toFixed(1)), 0, BLUEPRINT_LIMITS.DISTANCE_KM_MAX),
            exerciseMinutes: clampNum(Math.round(a.exerciseMinutes), 0, 1440),
            source: a.source,
            notes: (a.notes || '').trim().slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
            sharedUids: fullMemberIds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        for (const wk of migrateWorkoutLogs.filter((x) => x.uid === user.uid).slice(0, 60)) {
          batch.set(doc(db, 'households', targetHouseholdId, 'workoutLogs', wk.id), {
            id: wk.id,
            uid: user.uid,
            authorName: safeDisplayName,
            date: wk.date,
            workoutType: wk.workoutType,
            title: (wk.title || 'Workout').trim().slice(0, BLUEPRINT_LIMITS.WORKOUT_TITLE_MAX),
            durationMin: clampNum(Math.round(wk.durationMin), 1, 1440),
            caloriesBurned: clampNum(Math.round(wk.caloriesBurned), 0, BLUEPRINT_LIMITS.WORKOUT_CAL_MAX),
            distanceKm: clampNum(Number(wk.distanceKm.toFixed(1)), 0, BLUEPRINT_LIMITS.DISTANCE_KM_MAX),
            avgHeartRate: clampNum(Math.round(wk.avgHeartRate), 0, 260),
            source: wk.source,
            notes: (wk.notes || '').trim().slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
            sharedUids: fullMemberIds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `households/${targetHouseholdId}/members/${user.uid}`
        );
      }
    },
    [user, household?.id]
  );

  const switchToGroupByCode = useCallback(
    async (rawCode: string) => {
      if (!myProfile) return;
      await joinHouseholdByCode(
        rawCode,
        {
          displayName: myProfile.displayName,
          roleLabel: myProfile.roleLabel,
          calorieTarget: myProfile.calorieTarget,
          proteinTargetG: myProfile.proteinTargetG,
          carbsTargetG: myProfile.carbsTargetG,
          fatTargetG: myProfile.fatTargetG,
          heightCm: myProfile.heightCm,
          targetWeightKg: myProfile.targetWeightKg,
          targetMuscleMassKg: myProfile.targetMuscleMassKg,
          stepsTarget: myProfile.stepsTarget,
        },
        foodLogs,
        bodyLogs,
        foodPresets,
        waterLogs,
        weightLogs,
        activityLogs,
        workoutLogs
      );
    },
    [
      myProfile,
      joinHouseholdByCode,
      foodLogs,
      bodyLogs,
      foodPresets,
      waterLogs,
      weightLogs,
      activityLogs,
      workoutLogs,
    ]
  );

  const updateMyTargets = useCallback(
    async (setup: SetupMemberInput, newHouseholdName?: string) => {
      if (!user || !household) return;
      setActionError(null);
      const safeDisplayName =
        setup.displayName.trim().slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
        myProfile?.displayName ||
        'Member';

      const sharedUids =
        household.memberIds.length > 0 ? household.memberIds.slice(0, 10) : [user.uid];

      try {
        await updateDoc(doc(db, 'households', household.id, 'members', user.uid), {
          displayName: safeDisplayName,
          roleLabel:
            setup.roleLabel.trim().slice(0, BLUEPRINT_LIMITS.ROLE_LABEL_MAX) ||
            'Personal',
          calorieTarget: clampNum(
            Math.round(setup.calorieTarget),
            BLUEPRINT_LIMITS.CALORIE_MIN,
            BLUEPRINT_LIMITS.CALORIE_MAX
          ),
          proteinTargetG: clampNum(
            Math.round(setup.proteinTargetG),
            BLUEPRINT_LIMITS.PROTEIN_MIN,
            BLUEPRINT_LIMITS.PROTEIN_MAX
          ),
          carbsTargetG: clampNum(Math.round(setup.carbsTargetG), 0, 1000),
          fatTargetG: clampNum(Math.round(setup.fatTargetG), 0, 500),
          heightCm: clampNum(
            Math.round(setup.heightCm),
            BLUEPRINT_LIMITS.HEIGHT_MIN,
            BLUEPRINT_LIMITS.HEIGHT_MAX
          ),
          targetWeightKg: clampNum(Number(setup.targetWeightKg.toFixed(1)), 25, 350),
          targetMuscleMassKg: clampNum(
            Number(setup.targetMuscleMassKg.toFixed(1)),
            10,
            150
          ),
          stepsTarget: clampNum(
            Math.round(
              setup.stepsTarget ??
                myProfile?.stepsTarget ??
                BLUEPRINT_LIMITS.STEPS_TARGET_DEFAULT
            ),
            BLUEPRINT_LIMITS.STEPS_TARGET_MIN,
            BLUEPRINT_LIMITS.STEPS_TARGET_MAX
          ),
          sharedUids,
          updatedAt: serverTimestamp(),
        });

        if (
          newHouseholdName &&
          household.ownerId === user.uid &&
          newHouseholdName.trim() !== household.name
        ) {
          await updateDoc(doc(db, 'households', household.id), {
            name: newHouseholdName
              .trim()
              .slice(0, BLUEPRINT_LIMITS.HOUSEHOLD_NAME_MAX),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `households/${household.id}/members/${user.uid}`
        );
      }
    },
    [user, household, myProfile?.displayName, myProfile?.stepsTarget]
  );

  const addFoodLog = useCallback(
    async (input: CreateFoodInput) => {
      if (!user || !household) return;
      const logId = makeSafeId('food');
      const path = `households/${household.id}/foodLogs/${logId}`;
      const sharedUids =
        household.memberIds.length > 0 ? household.memberIds.slice(0, 10) : [user.uid];
      const authorName =
        (myProfile?.displayName || userProfile?.displayName || 'Member')
          .trim()
          .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';

      try {
        await setDoc(doc(db, 'households', household.id, 'foodLogs', logId), {
          id: logId,
          uid: user.uid,
          authorName,
          date: input.date,
          mealType: input.mealType,
          name: input.name.trim().slice(0, BLUEPRINT_LIMITS.FOOD_NAME_MAX) || 'Meal',
          servingNote: input.servingNote
            .trim()
            .slice(0, BLUEPRINT_LIMITS.SERVING_NOTE_MAX),
          calories: clampNum(Math.round(input.calories), 0, 15000),
          proteinG: clampNum(Number(input.proteinG.toFixed(1)), 0, 1000),
          carbsG: clampNum(Number(input.carbsG.toFixed(1)), 0, 1500),
          fatG: clampNum(Number(input.fatG.toFixed(1)), 0, 1000),
          fiberG: clampNum(Number(input.fiberG.toFixed(1)), 0, 500),
          source: input.source,
          aiConfidence: input.aiConfidence,
          aiItemsSummary: input.aiItemsSummary
            .trim()
            .slice(0, BLUEPRINT_LIMITS.AI_SUMMARY_MAX),
          sharedUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, household, myProfile?.displayName, userProfile?.displayName]
  );

  const updateFoodLog = useCallback(
    async (logId: string, input: CreateFoodInput) => {
      if (!user || !household) return;
      const path = `households/${household.id}/foodLogs/${logId}`;
      const sharedUids =
        household.memberIds.length > 0 ? household.memberIds.slice(0, 10) : [user.uid];
      const authorName =
        (myProfile?.displayName || userProfile?.displayName || 'Member')
          .trim()
          .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';

      try {
        await updateDoc(doc(db, 'households', household.id, 'foodLogs', logId), {
          authorName,
          date: input.date,
          mealType: input.mealType,
          name: input.name.trim().slice(0, BLUEPRINT_LIMITS.FOOD_NAME_MAX) || 'Meal',
          servingNote: input.servingNote
            .trim()
            .slice(0, BLUEPRINT_LIMITS.SERVING_NOTE_MAX),
          calories: clampNum(Math.round(input.calories), 0, 15000),
          proteinG: clampNum(Number(input.proteinG.toFixed(1)), 0, 1000),
          carbsG: clampNum(Number(input.carbsG.toFixed(1)), 0, 1500),
          fatG: clampNum(Number(input.fatG.toFixed(1)), 0, 1000),
          fiberG: clampNum(Number(input.fiberG.toFixed(1)), 0, 500),
          source: input.source,
          aiConfidence: input.aiConfidence,
          aiItemsSummary: input.aiItemsSummary
            .trim()
            .slice(0, BLUEPRINT_LIMITS.AI_SUMMARY_MAX),
          sharedUids,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user, household, myProfile?.displayName, userProfile?.displayName]
  );

  const deleteFoodLog = useCallback(
    async (logId: string) => {
      if (!user || !household) return;
      const path = `households/${household.id}/foodLogs/${logId}`;
      try {
        await deleteDoc(doc(db, 'households', household.id, 'foodLogs', logId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user, household]
  );

  const addFoodPreset = useCallback(
    async (input: CreateFoodPresetInput) => {
      if (!user || !household) return;
      const presetId = makeSafeId('preset');
      const path = `households/${household.id}/foodPresets/${presetId}`;
      const sharedUids = Array.from(
        new Set([user.uid, ...household.memberIds])
      ).slice(0, 10);
      const authorName =
        (myProfile?.displayName || userProfile?.displayName || 'Member')
          .trim()
          .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';
      try {
        await setDoc(doc(db, 'households', household.id, 'foodPresets', presetId), {
          ...buildGroupPresetFields({
            id: presetId,
            uid: user.uid,
            authorName,
            name: input.name,
            mealType: input.mealType,
            servingNote: input.servingNote,
            calories: input.calories,
            proteinG: input.proteinG,
            carbsG: input.carbsG,
            fatG: input.fatG,
            fiberG: input.fiberG,
            sharedUids,
          }),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, household, myProfile?.displayName, userProfile?.displayName]
  );

  const deleteFoodPreset = useCallback(
    async (presetId: string) => {
      if (!user || !household) return;
      const path = `households/${household.id}/foodPresets/${presetId}`;
      try {
        await deleteDoc(doc(db, 'households', household.id, 'foodPresets', presetId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user, household]
  );

  const logFromPreset = useCallback(
    async (preset: FoodPreset, date: string, multiplier = 1) => {
      const mult = clampNum(multiplier, 0.25, 5);
      const scaledNote =
        mult === 1
          ? preset.servingNote
          : [preset.servingNote, `${mult}x`].filter(Boolean).join(' · ');
      await addFoodLog({
        date,
        mealType: preset.mealType,
        name: preset.name,
        servingNote: scaledNote,
        calories: Math.round(preset.calories * mult),
        proteinG: Number((preset.proteinG * mult).toFixed(1)),
        carbsG: Number((preset.carbsG * mult).toFixed(1)),
        fatG: Number((preset.fatG * mult).toFixed(1)),
        fiberG: Number((preset.fiberG * mult).toFixed(1)),
        source: 'preset',
        aiConfidence: '',
        aiItemsSummary: '',
      });
    },
    [addFoodLog]
  );

  const addBodyLog = useCallback(
    async (input: CreateBodyInput) => {
      if (!user || !household) return;
      const logId = makeSafeId('body');
      const path = `households/${household.id}/bodyLogs/${logId}`;
      const sharedUids =
        household.memberIds.length > 0 ? household.memberIds.slice(0, 10) : [user.uid];
      const authorName =
        (myProfile?.displayName || userProfile?.displayName || 'Member')
          .trim()
          .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';
      const heightCm = myProfile?.heightCm || 172;
      const useDirectWeight =
        typeof input.weightKg === 'number' && Number.isFinite(input.weightKg);
      const indexes = useDirectWeight
        ? {
            ...computeBodyIndexes(
              input.weightKg!,
              input.muscleMassKg,
              input.bodyFatPct,
              heightCm
            ),
            weightKg: clampNum(Number(input.weightKg!.toFixed(1)), 20, 400),
          }
        : computeBodyIndexesFromBmi(
            input.bmi ?? 22.5,
            input.muscleMassKg,
            input.bodyFatPct,
            heightCm
          );

      try {
        await setDoc(doc(db, 'households', household.id, 'bodyLogs', logId), {
          id: logId,
          uid: user.uid,
          authorName,
          date: input.date,
          weightKg: indexes.weightKg,
          muscleMassKg: clampNum(Number(input.muscleMassKg.toFixed(1)), 5, 200),
          bodyFatPct: clampNum(Number(input.bodyFatPct.toFixed(1)), 2, 75),
          visceralFatIndex: 0,
          waistCm: 0,
          bmi: indexes.bmi,
          smi: indexes.smi,
          ffmi: indexes.ffmi,
          notes: input.notes.trim().slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
          sharedUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, household, myProfile, userProfile?.displayName]
  );

  const deleteBodyLog = useCallback(
    async (logId: string) => {
      if (!user || !household) return;
      const path = `households/${household.id}/bodyLogs/${logId}`;
      try {
        await deleteDoc(doc(db, 'households', household.id, 'bodyLogs', logId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user, household]
  );

  const addWeightLog = useCallback(
    async (input: CreateWeightInput) => {
      if (!user || !household) return;
      const logId = makeSafeId('weight');
      const path = `households/${household.id}/weightLogs/${logId}`;
      const sharedUids = Array.from(
        new Set([user.uid, ...household.memberIds])
      ).slice(0, 10);
      const authorName =
        (myProfile?.displayName || userProfile?.displayName || 'Member')
          .trim()
          .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';
      const heightCm = myProfile?.heightCm || 172;
      const derived = computeBmiFromWeight(input.weightKg, heightCm);

      try {
        await setDoc(doc(db, 'households', household.id, 'weightLogs', logId), {
          id: logId,
          uid: user.uid,
          authorName,
          date: input.date,
          weightKg: derived.weightKg,
          bmi: derived.bmi,
          notes: input.notes.trim().slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
          sharedUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, household, myProfile, userProfile?.displayName]
  );

  const deleteWeightLog = useCallback(
    async (logId: string) => {
      if (!user || !household) return;
      const path = `households/${household.id}/weightLogs/${logId}`;
      try {
        await deleteDoc(doc(db, 'households', household.id, 'weightLogs', logId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user, household]
  );

  const addWaterLog = useCallback(
    async (input: CreateWaterInput) => {
      if (!user || !household) return;
      const logId = makeSafeId('water');
      const path = `households/${household.id}/waterLogs/${logId}`;
      const sharedUids = Array.from(
        new Set([user.uid, ...household.memberIds])
      ).slice(0, 10);
      const authorName =
        (myProfile?.displayName || userProfile?.displayName || 'Member')
          .trim()
          .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';
      const safeAmount = clampNum(
        Math.round(input.amountMl),
        BLUEPRINT_LIMITS.WATER_ML_MIN,
        BLUEPRINT_LIMITS.WATER_ML_MAX
      );
      const safeLabel = (input.label || '')
        .trim()
        .slice(0, BLUEPRINT_LIMITS.WATER_LABEL_MAX);

      try {
        await setDoc(doc(db, 'households', household.id, 'waterLogs', logId), {
          id: logId,
          uid: user.uid,
          authorName,
          date: input.date,
          amountMl: safeAmount,
          label: safeLabel,
          sharedUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, household, myProfile?.displayName, userProfile?.displayName]
  );

  const deleteWaterLog = useCallback(
    async (logId: string) => {
      if (!user || !household) return;
      const path = `households/${household.id}/waterLogs/${logId}`;
      try {
        await deleteDoc(doc(db, 'households', household.id, 'waterLogs', logId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user, household]
  );

  const upsertDailyActivity = useCallback(
    async (input: CreateActivityInput) => {
      if (!user || !household) return;
      const logId = `act_${user.uid}_${input.date}`;
      const path = `households/${household.id}/activityLogs/${logId}`;
      const docRef = doc(db, 'households', household.id, 'activityLogs', logId);
      const sharedUids = Array.from(
        new Set([user.uid, ...household.memberIds])
      ).slice(0, 10);
      const authorName =
        (myProfile?.displayName || userProfile?.displayName || 'Member')
          .trim()
          .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';

      const payload = {
        authorName,
        date: input.date,
        steps: clampNum(Math.round(input.steps), 0, BLUEPRINT_LIMITS.STEPS_MAX),
        activeCalories: clampNum(Math.round(input.activeCalories), 0, BLUEPRINT_LIMITS.ACTIVE_CAL_MAX),
        distanceKm: clampNum(Number(input.distanceKm.toFixed(1)), 0, BLUEPRINT_LIMITS.DISTANCE_KM_MAX),
        exerciseMinutes: clampNum(Math.round(input.exerciseMinutes), 0, 1440),
        source: input.source,
        notes: (input.notes || '').trim().slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
        sharedUids,
        updatedAt: serverTimestamp(),
      };

      try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          await updateDoc(docRef, payload);
        } else {
          await setDoc(docRef, {
            id: logId,
            uid: user.uid,
            ...payload,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [user, household, myProfile?.displayName, userProfile?.displayName]
  );

  const deleteActivityLog = useCallback(
    async (logId: string) => {
      if (!user || !household) return;
      const path = `households/${household.id}/activityLogs/${logId}`;
      try {
        await deleteDoc(doc(db, 'households', household.id, 'activityLogs', logId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user, household]
  );

  const addWorkoutLog = useCallback(
    async (input: CreateWorkoutInput) => {
      if (!user || !household) return;
      const logId = makeSafeId('wkt');
      const path = `households/${household.id}/workoutLogs/${logId}`;
      const sharedUids = Array.from(
        new Set([user.uid, ...household.memberIds])
      ).slice(0, 10);
      const authorName =
        (myProfile?.displayName || userProfile?.displayName || 'Member')
          .trim()
          .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';

      try {
        await setDoc(doc(db, 'households', household.id, 'workoutLogs', logId), {
          id: logId,
          uid: user.uid,
          authorName,
          date: input.date,
          workoutType: input.workoutType,
          title: input.title.trim().slice(0, BLUEPRINT_LIMITS.WORKOUT_TITLE_MAX) || 'Workout',
          durationMin: clampNum(
            Math.round(input.durationMin),
            BLUEPRINT_LIMITS.WORKOUT_DURATION_MIN,
            BLUEPRINT_LIMITS.WORKOUT_DURATION_MAX
          ),
          caloriesBurned: clampNum(Math.round(input.caloriesBurned), 0, BLUEPRINT_LIMITS.WORKOUT_CAL_MAX),
          distanceKm: clampNum(Number(input.distanceKm.toFixed(1)), 0, BLUEPRINT_LIMITS.DISTANCE_KM_MAX),
          avgHeartRate: clampNum(Math.round(input.avgHeartRate), 0, 260),
          source: input.source,
          notes: (input.notes || '').trim().slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
          sharedUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, household, myProfile?.displayName, userProfile?.displayName]
  );

  const deleteWorkoutLog = useCallback(
    async (logId: string) => {
      if (!user || !household) return;
      const path = `households/${household.id}/workoutLogs/${logId}`;
      try {
        await deleteDoc(doc(db, 'households', household.id, 'workoutLogs', logId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user, household]
  );

  const importAppleHealthBatch = useCallback(
    async (
      parsed: AppleHealthParseResult,
      options: { includeWeights?: boolean } = {}
    ): Promise<{ activitiesImported: number; workoutsImported: number; weightsImported: number }> => {
      if (!user || !household) {
        return { activitiesImported: 0, workoutsImported: 0, weightsImported: 0 };
      }
      const sharedUids = Array.from(
        new Set([user.uid, ...household.memberIds])
      ).slice(0, 10);
      const authorName =
        (myProfile?.displayName || userProfile?.displayName || 'Member')
          .trim()
          .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Member';
      const heightCm = myProfile?.heightCm || 172;

      const existingActivityIds = new Set(activityLogs.map((a) => a.id));
      const existingWorkoutIds = new Set(workoutLogs.map((w) => w.id));
      const existingWeightDates = new Set(
        weightLogs.filter((w) => w.uid === user.uid).map((w) => w.date)
      );

      type BatchOp = {
        kind: 'set' | 'update';
        ref: ReturnType<typeof doc>;
        data: Record<string, unknown>;
      };
      const ops: BatchOp[] = [];
      let activitiesImported = 0;
      let workoutsImported = 0;
      let weightsImported = 0;

      for (const act of parsed.activities.slice(0, 90)) {
        const logId = `act_${user.uid}_${act.date}`;
        const ref = doc(db, 'households', household.id, 'activityLogs', logId);
        const common = {
          authorName,
          date: act.date,
          steps: clampNum(Math.round(act.steps), 0, BLUEPRINT_LIMITS.STEPS_MAX),
          activeCalories: clampNum(Math.round(act.activeCalories), 0, BLUEPRINT_LIMITS.ACTIVE_CAL_MAX),
          distanceKm: clampNum(Number(act.distanceKm.toFixed(1)), 0, BLUEPRINT_LIMITS.DISTANCE_KM_MAX),
          exerciseMinutes: clampNum(Math.round(act.exerciseMinutes), 0, 1440),
          source: act.source,
          notes: (act.notes || '').trim().slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
          sharedUids,
          updatedAt: serverTimestamp(),
        };
        if (existingActivityIds.has(logId)) {
          ops.push({ kind: 'update', ref, data: common });
        } else {
          ops.push({
            kind: 'set',
            ref,
            data: {
              id: logId,
              uid: user.uid,
              ...common,
              createdAt: serverTimestamp(),
            },
          });
        }
        activitiesImported += 1;
      }

      for (const wk of parsed.workouts.slice(0, 120)) {
        const logId = `wkt_${user.uid.slice(0, 12)}_${wk.externalKey}`;
        if (existingWorkoutIds.has(logId)) continue;
        const ref = doc(db, 'households', household.id, 'workoutLogs', logId);
        ops.push({
          kind: 'set',
          ref,
          data: {
            id: logId,
            uid: user.uid,
            authorName,
            date: wk.date,
            workoutType: wk.workoutType,
            title: wk.title.trim().slice(0, BLUEPRINT_LIMITS.WORKOUT_TITLE_MAX) || 'Workout',
            durationMin: clampNum(Math.round(wk.durationMin), 1, 1440),
            caloriesBurned: clampNum(Math.round(wk.caloriesBurned), 0, BLUEPRINT_LIMITS.WORKOUT_CAL_MAX),
            distanceKm: clampNum(Number(wk.distanceKm.toFixed(1)), 0, BLUEPRINT_LIMITS.DISTANCE_KM_MAX),
            avgHeartRate: clampNum(Math.round(wk.avgHeartRate), 0, 260),
            source: wk.source,
            notes: (wk.notes || '').trim().slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
            sharedUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });
        workoutsImported += 1;
      }

      if (options.includeWeights) {
        for (const wt of parsed.weights.slice(0, 90)) {
          if (existingWeightDates.has(wt.date)) continue;
          const logId = `weight_ah_${user.uid.slice(0, 12)}_${wt.date}`;
          const ref = doc(db, 'households', household.id, 'weightLogs', logId);
          const derived = computeBmiFromWeight(wt.weightKg, heightCm);
          ops.push({
            kind: 'set',
            ref,
            data: {
              id: logId,
              uid: user.uid,
              authorName,
              date: wt.date,
              weightKg: derived.weightKg,
              bmi: derived.bmi,
              notes: (wt.notes || 'Apple Health').trim().slice(0, BLUEPRINT_LIMITS.BODY_NOTES_MAX),
              sharedUids,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          });
          weightsImported += 1;
        }
      }

      try {
        for (let i = 0; i < ops.length; i += 350) {
          const chunk = ops.slice(i, i + 350);
          const batch = writeBatch(db);
          for (const op of chunk) {
            if (op.kind === 'update') {
              batch.update(op.ref, op.data);
            } else {
              batch.set(op.ref, op.data);
            }
          }
          await batch.commit();
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `households/${household.id}/activityLogs`);
      }

      return { activitiesImported, workoutsImported, weightsImported };
    },
    [
      user,
      household,
      myProfile?.displayName,
      myProfile?.heightCm,
      userProfile?.displayName,
      activityLogs,
      workoutLogs,
      weightLogs,
    ]
  );

  const leaveHousehold = useCallback(async () => {
    if (!user || !household || household.ownerId === user.uid) return;
    try {
      // Clear userProfile.householdId first so active workspace listeners detach cleanly
      // before removing membership from the household document.
      await updateDoc(doc(db, 'users', user.uid), {
        householdId: '',
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'households', household.id), {
        memberIds: arrayRemove(user.uid),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `households/${household.id}`);
    }
  }, [user, household]);

  return {
    user,
    authReady,
    userProfile,
    profileLoading,
    household,
    members,
    otherMembers,
    myProfile,
    partnerProfile,
    foodLogs,
    foodPresets,
    bodyLogs,
    weightLogs,
    waterLogs,
    activityLogs,
    workoutLogs,
    actionError,
    setActionError,
    createHousehold,
    joinHouseholdByCode,
    switchToGroupByCode,
    updateMyTargets,
    addFoodLog,
    updateFoodLog,
    deleteFoodLog,
    addFoodPreset,
    deleteFoodPreset,
    logFromPreset,
    addBodyLog,
    deleteBodyLog,
    addWeightLog,
    deleteWeightLog,
    addWaterLog,
    deleteWaterLog,
    upsertDailyActivity,
    deleteActivityLog,
    addWorkoutLog,
    deleteWorkoutLog,
    importAppleHealthBatch,
    leaveHousehold,
  };
}
