# KinHealth Security Specification

## 1. Data Invariants
1. **PII Isolation**: User email addresses reside exclusively in `/users/{userId}` and are readable/writable only by `request.auth.uid == userId`. `list` is disabled on `/users`.
2. **Bounded Group Membership**: A `/households/{householdId}` document supports solo tracking (1 member) or shared groups of up to 10 members (`memberIds.size() <= 10`), verified on create and join.
3. **Master Gate**: Subcollection writes (`/members`, `/foodLogs`, `/bodyLogs`) require `request.auth.uid` to be an active member of `/households/{householdId}`, and `uid` in the payload must match `request.auth.uid`.
4. **Immutable Authorship & Timestamps**: `uid`, `ownerId`, and `createdAt` cannot be modified after creation. All `createdAt`/`updatedAt` fields must equal `request.time`.
5. **Query Security Without `get()`**: `allow list` on `foodLogs`, `bodyLogs`, and `members` checks `request.auth.uid in resource.data.sharedUids`, forcing `array-contains` queries with zero `get()` calls.
6. **Non-Enumerable Invites**: `/householdInvites/{inviteCode}` permits `get` by authenticated users who know the code, and disables `list`.
7. **Owner-Only Food Presets**: `/users/{userId}/foodPresets/{presetId}` is readable, listable, and writable strictly by `isOwner(userId)` (`request.auth.uid == userId`), keeping daily presets portable even when switching groups.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Creating `/users/u1` with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Creating `/households/h1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **PII Cross-Read**: User B reading `/users/userA` -> `PERMISSION_DENIED`.
4. **User Directory Enumeration**: Listing `/users` -> `PERMISSION_DENIED`.
5. **Invite Enumeration**: Listing `/householdInvites` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: Creating a `FoodLog` with an extra `{ isAdmin: true }` field -> `PERMISSION_DENIED`.
7. **UID Spoofing**: User B creating a `FoodLog` under `/households/h1/foodLogs/f1` with `uid: "userA"` -> `PERMISSION_DENIED`.
8. **3rd Member Overflow**: User C attempting to join `/households/h1` when `memberIds.size() == 2` -> `PERMISSION_DENIED`.
9. **ID Poisoning**: Creating `/households/h1/foodLogs/` with a 200-char or invalid-character doc ID -> `PERMISSION_DENIED`.
10. **Client Timestamp Tampering**: Creating a `BodyLog` with `createdAt` set to a past client timestamp instead of `request.time` -> `PERMISSION_DENIED`.
11. **Cross-Partner Edit**: Partner B updating Partner A's `FoodLog` calories -> `PERMISSION_DENIED`.
12. **Blanket List Query**: Listing `/households/h1/foodLogs` without filtering `sharedUids` containing `request.auth.uid` -> `PERMISSION_DENIED`.
