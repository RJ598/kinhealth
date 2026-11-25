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
  computeBodyIndexesFromBmi,
  makeSafeId,
} from '../types';
import type {
  BodyLog,
  FoodLog,
  FoodPreset,
  Household,
  MemberProfile,
  UserProfile,
} from '../types';

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
  bmi: number;
  muscleMassKg: number;
  bodyFatPct: number;
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

  // 6b. Listen to Personal Daily Food Presets (owner-only, portable across groups)
  useEffect(() => {
    if (!authReady || !user) {
      setFoodPresets([]);
      return;
    }
    const path = `users/${user.uid}/foodPresets`;
    const q = query(
      collection(db, 'users', user.uid, 'foodPresets'),
      where('uid', '==', user.uid)
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
  }, [authReady, user]);

  // 7. Auto-sync sharedUids on current user's docs when group membership changes
  useEffect(() => {
    if (!user || !household || household.memberIds.length === 0) return;
    const expected = [...household.memberIds].slice(0, 10);
    const hasMismatch = (arr: string[]) =>
      expected.some((id) => !arr.includes(id)) || arr.some((id) => !expected.includes(id));

    const needsSyncFood = foodLogs.filter(
      (f) => f.uid === user.uid && hasMismatch(f.sharedUids)
    );
    const needsSyncBody = bodyLogs.filter(
      (b) => b.uid === user.uid && hasMismatch(b.sharedUids)
    );
    const myMember = members.find((m) => m.uid === user.uid);
    const needsSyncMember = myMember && hasMismatch(myMember.sharedUids);

    if (!needsSyncMember && needsSyncFood.length === 0 && needsSyncBody.length === 0) {
      return;
    }

    const runSync = async () => {
      try {
        const batch = writeBatch(db);
        let ops = 0;
        if (needsSyncMember) {
          batch.update(doc(db, 'households', household.id, 'members', user.uid), {
            sharedUids: expected,
            updatedAt: serverTimestamp(),
          });
          ops += 1;
        }
        for (const item of needsSyncFood.slice(0, 150)) {
          batch.update(doc(db, 'households', household.id, 'foodLogs', item.id), {
            sharedUids: expected,
            updatedAt: serverTimestamp(),
          });
          ops += 1;
        }
        for (const item of needsSyncBody.slice(0, 150)) {
          batch.update(doc(db, 'households', household.id, 'bodyLogs', item.id), {
            sharedUids: expected,
            updatedAt: serverTimestamp(),
          });
          ops += 1;
        }
        if (ops > 0) {
          await batch.commit();
        }
      } catch (err) {
        console.error('Background group sync error:', err);
      }
    };

    void runSync();
  }, [user, household, members, foodLogs, bodyLogs]);

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
      migrateBodyLogs: BodyLog[] = []
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
            'Unable to join this group — it may have reached the 10-member limit.'
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
        },
        foodLogs,
        bodyLogs
      );
    },
    [myProfile, joinHouseholdByCode, foodLogs, bodyLogs]
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
    [user, household, myProfile?.displayName]
  );

  const addFoodLog = useCallback(
    async (input: CreateFoodInput) => {
      if (!user || !household) return;
      const logId = makeSafeId('food');
      const path = `households/${household.id}/foodLogs/${logId}`;
      const sharedUids =
        household.memberIds.length > 0 ? household.memberIds.slice(0, 10) : [user.uid];
      const authorName = (myProfile?.displayName || userProfile?.displayName || 'Member')
        .trim()
        .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);

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
      const authorName = (myProfile?.displayName || userProfile?.displayName || 'Member')
        .trim()
        .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);

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
      if (!user) return;
      const presetId = makeSafeId('preset');
      const path = `users/${user.uid}/foodPresets/${presetId}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'foodPresets', presetId), {
          id: presetId,
          uid: user.uid,
          name: input.name.trim().slice(0, BLUEPRINT_LIMITS.FOOD_NAME_MAX) || 'Daily Meal',
          mealType: input.mealType,
          servingNote: input.servingNote
            .trim()
            .slice(0, BLUEPRINT_LIMITS.SERVING_NOTE_MAX),
          calories: clampNum(Math.round(input.calories), 0, 15000),
          proteinG: clampNum(Number(input.proteinG.toFixed(1)), 0, 1000),
          carbsG: clampNum(Number(input.carbsG.toFixed(1)), 0, 1500),
          fatG: clampNum(Number(input.fatG.toFixed(1)), 0, 1000),
          fiberG: clampNum(Number(input.fiberG.toFixed(1)), 0, 500),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user]
  );

  const deleteFoodPreset = useCallback(
    async (presetId: string) => {
      if (!user) return;
      const path = `users/${user.uid}/foodPresets/${presetId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'foodPresets', presetId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user]
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
      const authorName = (myProfile?.displayName || userProfile?.displayName || 'Member')
        .trim()
        .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
      const heightCm = myProfile?.heightCm || 172;
      const indexes = computeBodyIndexesFromBmi(
        input.bmi,
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

  const leaveHousehold = useCallback(async () => {
    if (!user || !household || household.ownerId === user.uid) return;
    try {
      await updateDoc(doc(db, 'households', household.id), {
        memberIds: arrayRemove(user.uid),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', user.uid), {
        householdId: '',
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
    leaveHousehold,
  };
}
