/**
 * Security TDD Specification & Adversarial Payload Cases for KinHealth Firestore Rules.
 * Maps each of the Dirty Dozen payloads in security_spec.md to its expected PERMISSION_DENIED invariant.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  expectedOutcome: 'PERMISSION_DENIED';
  violatedPillar: string;
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write',
    operation: 'create',
    path: 'users/userA',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Master Gate / Authentication',
    payload: { uid: 'userA', email: 'a@example.com', displayName: 'A', householdId: '' },
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    operation: 'create',
    path: 'households/h1',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Verified User Gate',
    payload: { id: 'h1', name: 'Home', inviteCode: 'KIN1234', ownerId: 'userA', memberIds: ['userA'] },
  },
  {
    id: 3,
    name: 'PII Cross-Read',
    operation: 'get',
    path: 'users/userA',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 6: PII Isolation',
  },
  {
    id: 4,
    name: 'User Directory Enumeration',
    operation: 'list',
    path: 'users',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 6 & 8: PII Isolation & Query Enforcer',
  },
  {
    id: 5,
    name: 'Invite Code Enumeration',
    operation: 'list',
    path: 'householdInvites',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 8: Secure List Queries',
  },
  {
    id: 6,
    name: 'Shadow Field Injection',
    operation: 'create',
    path: 'households/h1/foodLogs/f1',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 2: Validation Blueprints (hasOnly)',
    payload: { id: 'f1', uid: 'userA', isAdmin: true, calories: 500 },
  },
  {
    id: 7,
    name: 'UID Spoofing',
    operation: 'create',
    path: 'households/h1/foodLogs/f2',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 2: Identity Integrity',
    payload: { id: 'f2', uid: 'userA', calories: 400 },
  },
  {
    id: 8,
    name: 'Group Member Cap Overflow (>10)',
    operation: 'update',
    path: 'households/h1',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 1: Bounded Array (<= 10)',
    payload: { memberIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11'] },
  },
  {
    id: 9,
    name: 'ID Poisoning',
    operation: 'create',
    path: 'households/h1/foodLogs/' + 'x'.repeat(200),
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 3: Path Variable Hardening',
  },
  {
    id: 10,
    name: 'Client Timestamp Tampering',
    operation: 'create',
    path: 'households/h1/bodyLogs/b1',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Temporal Integrity (request.time)',
    payload: { id: 'b1', uid: 'userA', createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 11,
    name: 'Cross-Member Edit',
    operation: 'update',
    path: 'households/h1/foodPresets/p1',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 4: Tiered Identity Logic',
    payload: { calories: 9999 },
  },
  {
    id: 12,
    name: 'Blanket Group Preset List Query',
    operation: 'list',
    path: 'households/h1/foodPresets',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 8: Secure List Queries (resource.data.sharedUids)',
  },
];
