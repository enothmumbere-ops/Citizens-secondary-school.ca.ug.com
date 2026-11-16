# CSS-SIMS Security Specification (Phase 0)

## 1. Data Invariants
1. **Strict Role Separation**: Users can only obtain `admin`, `teacher`, or `student` privileges via the bootstrapped administrator (`enothmumbere@gmail.com` with `email_verified == true`), an entry in `/admins/{uid}`, or an admin-issued `/userInvites/{inviteId}` matching their verified Google email. Self-elevation during profile creation or update is forbidden.
2. **Term, Class, and Academic Year Isolation**: Every `assessmentRecord`, `studentTermSummary`, `attendance`, `feesRecord`, and `reportCard` must belong to an explicit `academicYearId`, `termId`, and `classCode`. Cross-term or cross-class queries are strictly isolated.
3. **Teacher Scoping**: Teachers can only read students, assessments, summaries, and attendance records where their verified `request.auth.uid` is listed in `authorizedTeacherUids` (derived from their `teacherAssignments`). Teachers can never read or modify `feesRecords`, `excelImports`, `schoolSettings`, or `approved` assessment records.
4. **Student Isolation**: Students can only read their own `students`, `assessmentRecords`, `studentTermSummaries`, `attendance`, `feesRecords`, and **published** `reportCards` (`resource.data.published == true && resource.data.studentAuthUid == request.auth.uid`). Students have zero write access to any academic, attendance, fee, or report card collection.
5. **Approved Result Locking**: Once an `assessmentRecord` reaches `status == 'approved'`, teachers cannot modify marks or status; only an `admin` can amend or unapprove it.
6. **Temporal & Schema Integrity**: All `createdAt` / `updatedAt` timestamps on client writes must match `request.time`, all document IDs must match `^[a-zA-Z0-9_\-]+$` (max 128 chars), and every write must pass `isValid[Entity](incoming())` with strict `keys().hasAll(...)` / `keys().hasOnly(...)` / `affectedKeys().hasOnly(...)` gates.
7. **Zero `get()`/`exists()` in `allow list`**: Every `allow list` rule evaluates `resource.data` or verified token claims directly to prevent O(n) read amplification.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Self-Admin Elevation**: Uninvited user creates `/users/{uid}` with `{ role: 'admin', status: 'active' }`. -> Denied (no matching `userInvites` and not bootstrapped admin).
2. **Shadow Field Injection**: Authenticated teacher updates `/assessmentRecords/{id}` adding `{ isVerifiedByHeadTeacher: true }`. -> Denied (`affectedKeys().hasOnly(...)` rejects unknown keys).
3. **Post-Approval Mark Tampering**: Teacher updates an `assessmentRecord` where `existing().status == 'approved'` to raise `summativeScore`. -> Denied (terminal state lock for non-admins).
4. **Cross-Class Student Snooping**: Teacher A (`authorizedTeacherUids: ['uidA']`) attempts `get` or `list` on S.2 `students` assigned only to Teacher B. -> Denied.
5. **Student Viewing Draft Report Card**: Student attempts `get` on `/reportCards/{id}` where `published == false`. -> Denied (`resource.data.published == true` required for students).
6. **Student Self-Grade Mutation**: Student sends `update` to `/assessmentRecords/{id}` changing `totalScore: 99`. -> Denied.
7. **Teacher Accessing Bursar Fees**: Teacher attempts `get` or `list` on `/feesRecords/{id}`. -> Denied.
8. **ID Poisoning**: Attacker sends `create` to `/students/../../../evil_1500_char_id`. -> Denied (`isValidId` regex + max 128 chars).
9. **Score Out-of-Range Poisoning**: Teacher sends `cumulativeAiScore: 5` (max 3) or `summativeScore: -10` (min 0) or `summativeScore: 95` (max 80). -> Denied (`isValidAssessmentRecord`).
10. **Email Spoofing Without Verification**: Auth token has `email: 'enothmumbere@gmail.com'` and `email_verified: false`. -> Denied (`isVerified()` enforces `email_verified == true`).
11. **Timestamp Forgery**: Write includes `createdAt` backdated to 2020 instead of `request.time`. -> Denied (`incoming().createdAt == request.time`).
12. **Audit Log Deletion/Tampering**: Any user (even admin) attempts `update` or `delete` on `/auditLogs/{id}`. -> Denied (immutable append-only audit log).
