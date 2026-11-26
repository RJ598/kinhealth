# KinHealth Security Specification

## 1. Data Invariants
1. **PII Isolation**: User email addresses reside exclusively in `/users/{userId}` and are readable/writable only by `request.auth.uid == userId`. `list` is disabled on `/users`.
2. **Bounded Group Membership**: A `/households/{householdId}` document supports solo tracking (1 member) or shared groups of up to 10 members (`memberIds.size() <= 10`), verified on create and join.
3. **Master Gate**: Subcollection writes (`/members`, `/foodLogs`, `/bodyLogs`) require `request.auth.uid` to be an active member of `/households/{householdId}`, and `uid` in the payload must match `request.auth.uid`.
4. **Immutable Authorship & Timestamps**: `uid`, `ownerId`, and `createdAt` cannot be modified after creation. All `createdAt`/`updatedAt` fields must equal `request.time`.
5. **Query Security Without `get()`**: `allow list` on `foodLogs`, `bodyLogs`, and `members` checks `request.auth.uid in resource.data.sharedUids`, forcing `array-contains` queries with zero `get()` calls.
6. **Non-Enumerable Invites**: `/householdInvites/{inviteCode}` permits `get` by authenticated users who know the code, and disables `list`.
7. **Shared Group & Legacy Personal Presets**: `/households/{householdId}/foodPresets/{presetId}` shares saved meals across active household members via `sharedUids` (`array-contains` list enforcement without `get()`), while only the creator (`existing().uid == request.auth.uid`) can edit or delete a preset. `/users/{userId}/foodPresets/{presetId}` remains strictly owner-only for legacy reads and migration cleanup.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Creating `/users/u1` with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Creating `/households/h1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **PII Cross-Read**: User B reading `/users/userA` -> `PERMISSION_DENIED`.
4. **User Directory Enumeration**: Listing `/users` -> `PERMISSION_DENIED`.
5. **Invite Enumeration**: Listing `/householdInvites` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: Creating a `FoodLog` or `GroupFoodPreset` with an extra `{ isAdmin: true }` field -> `PERMISSION_DENIED`.
7. **UID Spoofing**: User B creating a `FoodLog` under `/households/h1/foodLogs/f1` with `uid: "userA"` -> `PERMISSION_DENIED`.
8. **11th Member Overflow**: User trying to join `/households/h1` beyond the 10-member cap -> `PERMISSION_DENIED`.
9. **ID Poisoning**: Creating `/households/h1/foodLogs/` with a 200-char or invalid-character doc ID -> `PERMISSION_DENIED`.
10. **Client Timestamp Tampering**: Creating a `BodyLog` with `createdAt` set to a past client timestamp instead of `request.time` -> `PERMISSION_DENIED`.
11. **Cross-Member Edit/Delete**: Member B updating/deleting Member A's `FoodLog` or `GroupFoodPreset` -> `PERMISSION_DENIED`.
12. **Blanket List Query**: Listing `/households/h1/foodLogs` or `/households/h1/foodPresets` without filtering `sharedUids` containing `request.auth.uid` -> `PERMISSION_DENIED`.
