import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  AcademicYear,
  AssessmentRecord,
  AttendanceRecord,
  AuditLog,
  ClassCode,
  ExcelImportRecord,
  FeesRecord,
  ReportCard,
  SchoolClass,
  SchoolSettings,
  Student,
  StudentTermSummary,
  Subject,
  Teacher,
  TeacherAssignment,
  Term,
  TermName,
  UserAccount,
  UserInvite,
} from '../types/sims';
import { DEFAULT_GRADING_CONFIG, DEFAULT_SUBJECTS } from '../utils/grading';

export function toSafeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return (cleaned || 'doc').slice(0, 110);
}

export function emailToInviteId(email: string): string {
  return `inv_${toSafeId(email.trim().toLowerCase())}`.slice(0, 120);
}

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.slice(0, 120);
}

export async function getActiveAdminUids(fallbackUid?: string): Promise<string[]> {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    const ids = snap.docs.map((d) => d.id);
    if (fallbackUid && !ids.includes(fallbackUid)) ids.push(fallbackUid);
    if (auth.currentUser?.uid && !ids.includes(auth.currentUser.uid)) {
      ids.push(auth.currentUser.uid);
    }
    return ids.slice(0, 15);
  } catch {
    const uid = fallbackUid || auth.currentUser?.uid;
    return uid ? [uid] : [];
  }
}

export async function logAudit(
  actorRole: 'admin' | 'teacher' | 'student',
  action: string,
  entityType: string,
  entityId: string,
  details: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const id = makeId('log');
  const adminUids = await getActiveAdminUids(user.uid);
  try {
    await setDoc(doc(db, 'auditLogs', id), {
      id,
      actorUid: user.uid,
      actorEmail: user.email || '',
      actorRole,
      action: action.slice(0, 120),
      entityType: entityType.slice(0, 64),
      entityId: toSafeId(entityId),
      details: details.slice(0, 1000),
      adminUids,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Audit log write skipped:', err);
  }
}

export async function initializeSchoolDefaults(adminUid: string): Promise<void> {
  try {
    const settingsRef = doc(db, 'schoolSettings', 'main');
    const settingsSnap = await getDoc(settingsRef);

    const yearId = 'yr_2026';
    const term1Id = 'term_2026_1';
    const term2Id = 'term_2026_2';
    const term3Id = 'term_2026_3';

    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        id: 'main',
        schoolCode: 'CSS_KASESE',
        schoolName: "CITIZENS' SECONDARY SCHOOL - KASESE",
        motto: 'STRIVE TO EXCEL',
        address: 'P.O. Box 263, Kasese, Uganda',
        phones: '0777296961 / 0703825306',
        email: 'citizens263@gmail.com',
        headTeacherName: '',
        bursarName: '',
        bursarInitials: '',
        currentAcademicYearId: yearId,
        currentTermId: term3Id,
        thisTermHas: '',
        nextTermBegins: '',
        gradingConfig: DEFAULT_GRADING_CONFIG,
        updatedAt: serverTimestamp(),
      });
    }

    const yearsSnap = await getDocs(
      query(collection(db, 'academicYears'), where('schoolCode', '==', 'CSS_KASESE'))
    );
    if (yearsSnap.empty) {
      await setDoc(doc(db, 'academicYears', yearId), {
        id: yearId,
        schoolCode: 'CSS_KASESE',
        name: '2026',
        isCurrent: true,
        status: 'active',
        createdAt: serverTimestamp(),
      });

      const defaultTerms: Array<{ id: string; name: TermName; isCurrent: boolean }> = [
        { id: term1Id, name: 'Term I', isCurrent: false },
        { id: term2Id, name: 'Term II', isCurrent: false },
        { id: term3Id, name: 'Term III', isCurrent: true },
      ];
      for (const t of defaultTerms) {
        await setDoc(doc(db, 'terms', t.id), {
          id: t.id,
          schoolCode: 'CSS_KASESE',
          academicYearId: yearId,
          name: t.name,
          startDate: '',
          endDate: '',
          nextTermBegins: '',
          isCurrent: t.isCurrent,
          createdAt: serverTimestamp(),
        });
      }
    }

    const classesSnap = await getDocs(
      query(collection(db, 'classes'), where('schoolCode', '==', 'CSS_KASESE'))
    );
    if (classesSnap.empty) {
      const classList: Array<{ code: ClassCode; name: string; level: 'O-Level' | 'A-Level' }> = [
        { code: 'S.1', name: 'Senior One', level: 'O-Level' },
        { code: 'S.2', name: 'Senior Two', level: 'O-Level' },
        { code: 'S.3', name: 'Senior Three', level: 'O-Level' },
        { code: 'S.4', name: 'Senior Four', level: 'O-Level' },
        { code: 'S.5', name: 'Senior Five', level: 'A-Level' },
        { code: 'S.6', name: 'Senior Six', level: 'A-Level' },
      ];
      for (const cls of classList) {
        const cId = `cls_${toSafeId(cls.code)}`;
        await setDoc(doc(db, 'classes', cId), {
          id: cId,
          schoolCode: 'CSS_KASESE',
          code: cls.code,
          name: cls.name,
          level: cls.level,
          streams: ['Main'],
          classTeacherId: '',
          classTeacherName: '',
          classTeacherInitials: '',
          createdAt: serverTimestamp(),
        });
      }
    }

    const subjectsSnap = await getDocs(
      query(collection(db, 'subjects'), where('schoolCode', '==', 'CSS_KASESE'))
    );
    if (subjectsSnap.empty) {
      for (const subj of DEFAULT_SUBJECTS) {
        const sId = `subj_${toSafeId(subj.code)}`;
        await setDoc(doc(db, 'subjects', sId), {
          id: sId,
          schoolCode: 'CSS_KASESE',
          name: subj.name,
          code: subj.code,
          allowedClasses: subj.allowedClasses,
          isCompulsory: subj.isCompulsory,
          createdAt: serverTimestamp(),
        });
      }
    }

    const adminRef = doc(db, 'admins', adminUid);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists() && auth.currentUser) {
      await setDoc(adminRef, {
        uid: adminUid,
        email: auth.currentUser.email || '',
        fullName: auth.currentUser.displayName || 'System Administrator',
        grantedBy: 'system_bootstrap',
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'schoolSettings/bootstrap');
  }
}

export async function fetchSchoolSettings(): Promise<SchoolSettings | null> {
  try {
    const snap = await getDoc(doc(db, 'schoolSettings', 'main'));
    return snap.exists() ? (snap.data() as SchoolSettings) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'schoolSettings/main');
  }
}

export async function updateSchoolSettings(data: Partial<SchoolSettings>): Promise<void> {
  try {
    await updateDoc(doc(db, 'schoolSettings', 'main'), {
      ...data,
      schoolCode: 'CSS_KASESE',
      updatedAt: serverTimestamp(),
    });
    await logAudit('admin', 'Update School Settings', 'schoolSettings', 'main', 'Updated school settings or grading rules.');
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'schoolSettings/main');
  }
}

export async function fetchStructuralCatalog(): Promise<{
  years: AcademicYear[];
  terms: Term[];
  classes: SchoolClass[];
  subjects: Subject[];
}> {
  try {
    const [ySnap, tSnap, cSnap, sSnap] = await Promise.all([
      getDocs(query(collection(db, 'academicYears'), where('schoolCode', '==', 'CSS_KASESE'))),
      getDocs(query(collection(db, 'terms'), where('schoolCode', '==', 'CSS_KASESE'))),
      getDocs(query(collection(db, 'classes'), where('schoolCode', '==', 'CSS_KASESE'))),
      getDocs(query(collection(db, 'subjects'), where('schoolCode', '==', 'CSS_KASESE'))),
    ]);
    return {
      years: ySnap.docs.map((d) => d.data() as AcademicYear).sort((a, b) => a.name.localeCompare(b.name)),
      terms: tSnap.docs.map((d) => d.data() as Term).sort((a, b) => a.name.localeCompare(b.name)),
      classes: cSnap.docs.map((d) => d.data() as SchoolClass).sort((a, b) => a.code.localeCompare(b.code)),
      subjects: sSnap.docs.map((d) => d.data() as Subject).sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'structuralCatalog');
  }
}

export async function createAcademicYear(name: string, isCurrent: boolean): Promise<AcademicYear> {
  const id = `yr_${toSafeId(name)}`;
  try {
    const payload = {
      id,
      schoolCode: 'CSS_KASESE' as const,
      name: name.trim(),
      isCurrent,
      status: 'active' as const,
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'academicYears', id), payload);
    const termNames: TermName[] = ['Term I', 'Term II', 'Term III'];
    for (let i = 0; i < termNames.length; i++) {
      const termId = `term_${toSafeId(name)}_${i + 1}`;
      await setDoc(doc(db, 'terms', termId), {
        id: termId,
        schoolCode: 'CSS_KASESE',
        academicYearId: id,
        name: termNames[i],
        startDate: '',
        endDate: '',
        nextTermBegins: '',
        isCurrent: isCurrent && i === 0,
        createdAt: serverTimestamp(),
      });
    }
    await logAudit('admin', 'Create Academic Year', 'academicYears', id, `Created academic year ${name}`);
    return { ...payload, createdAt: new Date() };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `academicYears/${id}`);
  }
}

export async function updateTermDetails(termId: string, data: Partial<Term>): Promise<void> {
  try {
    await updateDoc(doc(db, 'terms', termId), data);
    await logAudit('admin', 'Update Term', 'terms', termId, `Updated term ${termId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `terms/${termId}`);
  }
}

export async function saveSchoolClass(cls: SchoolClass): Promise<void> {
  const id = cls.id || `cls_${toSafeId(cls.code)}`;
  try {
    const existing = await getDoc(doc(db, 'classes', id));
    if (existing.exists()) {
      await updateDoc(doc(db, 'classes', id), {
        name: cls.name,
        level: cls.level,
        streams: cls.streams,
        classTeacherId: cls.classTeacherId || '',
        classTeacherName: cls.classTeacherName || '',
        classTeacherInitials: cls.classTeacherInitials || '',
      });
    } else {
      await setDoc(doc(db, 'classes', id), {
        ...cls,
        id,
        schoolCode: 'CSS_KASESE',
        createdAt: serverTimestamp(),
      });
    }
    await logAudit('admin', 'Save Class', 'classes', id, `Saved class ${cls.code}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `classes/${id}`);
  }
}

export async function saveSubject(subj: Subject): Promise<void> {
  const id = subj.id || `subj_${toSafeId(subj.code || subj.name)}`;
  try {
    const existing = await getDoc(doc(db, 'subjects', id));
    if (existing.exists()) {
      await updateDoc(doc(db, 'subjects', id), {
        name: subj.name,
        code: subj.code || '',
        allowedClasses: subj.allowedClasses,
        isCompulsory: subj.isCompulsory,
      });
    } else {
      await setDoc(doc(db, 'subjects', id), {
        ...subj,
        id,
        schoolCode: 'CSS_KASESE',
        createdAt: serverTimestamp(),
      });
    }
    await logAudit('admin', 'Save Subject', 'subjects', id, `Saved subject ${subj.name}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `subjects/${id}`);
  }
}

export async function fetchTeachers(userRole: string, uid: string): Promise<Teacher[]> {
  try {
    const col = collection(db, 'teachers');
    const q =
      userRole === 'admin'
        ? query(col, where('adminUids', 'array-contains', uid))
        : query(col, where('authUid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Teacher).sort((a, b) => a.fullName.localeCompare(b.fullName));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'teachers');
  }
}

export async function saveTeacher(teacher: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt' | 'adminUids'> & { id?: string }): Promise<string> {
  const id = teacher.id || makeId('tch');
  const adminUids = await getActiveAdminUids();
  try {
    const ref = doc(db, 'teachers', id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        staffNumber: teacher.staffNumber,
        fullName: teacher.fullName,
        initials: teacher.initials,
        email: teacher.email.trim().toLowerCase(),
        phone: teacher.phone || '',
        gender: teacher.gender || 'M',
        authUid: teacher.authUid || '',
        assignedClasses: teacher.assignedClasses,
        assignedSubjects: teacher.assignedSubjects,
        adminUids,
        status: teacher.status,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...teacher,
        id,
        email: teacher.email.trim().toLowerCase(),
        adminUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (teacher.email.trim()) {
      const invId = emailToInviteId(teacher.email);
      const invRef = doc(db, 'userInvites', invId);
      const invSnap = await getDoc(invRef);
      if (!invSnap.exists()) {
        await setDoc(invRef, {
          id: invId,
          email: teacher.email.trim().toLowerCase(),
          role: 'teacher',
          linkedEntityId: id,
          fullName: teacher.fullName,
          initials: teacher.initials,
          status: 'pending',
          adminUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await logAudit('admin', 'Save Teacher', 'teachers', id, `Saved teacher ${teacher.fullName} (${teacher.initials})`);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `teachers/${id}`);
  }
}

export async function deleteTeacher(teacher: Teacher): Promise<void> {
  const adminUid = auth.currentUser?.uid || '';
  try {
    await deleteDoc(doc(db, 'teachers', teacher.id));

    if (adminUid) {
      const assignSnap = await getDocs(
        query(
          collection(db, 'teacherAssignments'),
          where('adminUids', 'array-contains', adminUid),
          where('teacherId', '==', teacher.id)
        )
      );

      const affectedClasses = new Set<ClassCode>();
      for (const d of assignSnap.docs) {
        const data = d.data() as TeacherAssignment;
        affectedClasses.add(data.classCode);
        await deleteDoc(d.ref);
      }

      for (const classCode of affectedClasses) {
        await syncAuthorizedTeachersForClass(classCode, adminUid);
      }
    }

    if (teacher.email.trim()) {
      const invId = emailToInviteId(teacher.email);
      const invRef = doc(db, 'userInvites', invId);
      const invSnap = await getDoc(invRef);
      if (invSnap.exists()) {
        const invData = invSnap.data() as UserInvite;
        if (invData.status === 'pending' && invData.role === 'teacher') {
          await deleteDoc(invRef);
        }
      }
    }

    const classSnap = await getDocs(
      query(
        collection(db, 'classes'),
        where('schoolCode', '==', 'CSS_KASESE'),
        where('classTeacherId', '==', teacher.id)
      )
    );
    for (const clsDoc of classSnap.docs) {
      await updateDoc(clsDoc.ref, {
        classTeacherId: '',
        classTeacherName: '',
        classTeacherInitials: '',
      });
    }

    await logAudit(
      'admin',
      'Delete Teacher',
      'teachers',
      teacher.id,
      `Deleted teacher ${teacher.fullName} (${teacher.staffNumber})`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `teachers/${teacher.id}`);
  }
}

export async function fetchTeacherAssignments(userRole: string, uid: string): Promise<TeacherAssignment[]> {
  try {
    const col = collection(db, 'teacherAssignments');
    const q =
      userRole === 'admin'
        ? query(col, where('adminUids', 'array-contains', uid))
        : query(col, where('teacherUid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as TeacherAssignment);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'teacherAssignments');
  }
}

export async function syncAuthorizedTeachersForClass(classCode: ClassCode, adminUid: string): Promise<void> {
  try {
    const assignSnap = await getDocs(
      query(
        collection(db, 'teacherAssignments'),
        where('adminUids', 'array-contains', adminUid),
        where('classCode', '==', classCode)
      )
    );
    const teacherUids = Array.from(
      new Set(
        assignSnap.docs
          .map((d) => (d.data() as TeacherAssignment).teacherUid || '')
          .filter((u) => u.length > 0)
      )
    ).slice(0, 35);

    const [studSnap, assessSnap, sumSnap] = await Promise.all([
      getDocs(query(collection(db, 'students'), where('adminUids', 'array-contains', adminUid), where('classCode', '==', classCode))),
      getDocs(query(collection(db, 'assessmentRecords'), where('adminUids', 'array-contains', adminUid), where('classCode', '==', classCode))),
      getDocs(query(collection(db, 'studentTermSummaries'), where('adminUids', 'array-contains', adminUid), where('classCode', '==', classCode))),
    ]);

    const batch = writeBatch(db);
    studSnap.docs.forEach((d) => batch.update(d.ref, { authorizedTeacherUids: teacherUids, updatedAt: serverTimestamp() }));
    assessSnap.docs.forEach((d) => batch.update(d.ref, { authorizedTeacherUids: teacherUids, updatedAt: serverTimestamp() }));
    sumSnap.docs.forEach((d) => batch.update(d.ref, { authorizedTeacherUids: teacherUids, updatedAt: serverTimestamp() }));
    await batch.commit();
  } catch (err) {
    console.warn('Teacher UID sync warning:', err);
  }
}

export async function saveTeacherAssignment(
  assignment: Omit<TeacherAssignment, 'id' | 'createdAt' | 'adminUids'>
): Promise<void> {
  const id = `ta_${toSafeId(assignment.teacherId)}_${toSafeId(assignment.classCode)}_${toSafeId(assignment.subjectId)}_${toSafeId(assignment.termId)}`;
  const adminUids = await getActiveAdminUids();
  try {
    await setDoc(doc(db, 'teacherAssignments', id), {
      ...assignment,
      id,
      adminUids,
      createdAt: serverTimestamp(),
    });
    if (auth.currentUser) {
      await syncAuthorizedTeachersForClass(assignment.classCode, auth.currentUser.uid);
    }
    await logAudit(
      'admin',
      'Assign Teacher',
      'teacherAssignments',
      id,
      `Assigned ${assignment.teacherName} to ${assignment.classCode} - ${assignment.subjectName}`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `teacherAssignments/${id}`);
  }
}

export async function deleteTeacherAssignment(id: string, classCode: ClassCode): Promise<void> {
  try {
    await deleteDoc(doc(db, 'teacherAssignments', id));
    if (auth.currentUser) {
      await syncAuthorizedTeachersForClass(classCode, auth.currentUser.uid);
    }
    await logAudit('admin', 'Remove Teacher Assignment', 'teacherAssignments', id, `Removed assignment ${id}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `teacherAssignments/${id}`);
  }
}

export async function fetchStudents(userRole: string, uid: string): Promise<Student[]> {
  try {
    const col = collection(db, 'students');
    const q =
      userRole === 'admin'
        ? query(col, where('adminUids', 'array-contains', uid))
        : userRole === 'teacher'
        ? query(col, where('authorizedTeacherUids', 'array-contains', uid))
        : query(col, where('studentAuthUid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Student).sort((a, b) => a.fullName.localeCompare(b.fullName));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'students');
  }
}

export async function saveStudent(
  student: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'adminUids' | 'authorizedTeacherUids'> & { id?: string; authorizedTeacherUids?: string[] }
): Promise<string> {
  const id = student.id || makeId('stu');
  const adminUids = await getActiveAdminUids();
  try {
    const ref = doc(db, 'students', id);
    const existing = await getDoc(ref);
    const authorizedTeacherUids = student.authorizedTeacherUids || [];

    if (existing.exists()) {
      await updateDoc(ref, {
        studentNumber: student.studentNumber,
        fullName: student.fullName,
        gender: student.gender,
        schoolPayCode: student.schoolPayCode,
        dateOfBirth: student.dateOfBirth || '',
        admissionDate: student.admissionDate || '',
        classCode: student.classCode,
        stream: student.stream || 'Main',
        academicYearId: student.academicYearId,
        status: student.status,
        email: (student.email || '').trim().toLowerCase(),
        studentAuthUid: student.studentAuthUid || '',
        photoUrl: (student.photoUrl || '').slice(0, 100000),
        authorizedTeacherUids,
        adminUids,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...student,
        id,
        stream: student.stream || 'Main',
        email: (student.email || '').trim().toLowerCase(),
        photoUrl: (student.photoUrl || '').slice(0, 100000),
        authorizedTeacherUids,
        adminUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (student.email && student.email.trim()) {
      const invId = emailToInviteId(student.email);
      await setDoc(
        doc(db, 'userInvites', invId),
        {
          id: invId,
          email: student.email.trim().toLowerCase(),
          role: 'student',
          linkedEntityId: id,
          fullName: student.fullName,
          schoolPayCode: student.schoolPayCode,
          status: 'pending',
          adminUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      ).catch(() => undefined);
    }

    await logAudit('admin', 'Save Student', 'students', id, `Saved student ${student.fullName} (${student.classCode})`);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `students/${id}`);
  }
}

export async function fetchAssessments(
  userRole: string,
  uid: string,
  filters?: { academicYearId?: string; termId?: string; classCode?: ClassCode }
): Promise<AssessmentRecord[]> {
  try {
    const col = collection(db, 'assessmentRecords');
    const constraints = [];
    if (userRole === 'admin') {
      constraints.push(where('adminUids', 'array-contains', uid));
    } else if (userRole === 'teacher') {
      constraints.push(where('authorizedTeacherUids', 'array-contains', uid));
    } else {
      constraints.push(where('studentAuthUid', '==', uid));
    }
    if (filters?.academicYearId) constraints.push(where('academicYearId', '==', filters.academicYearId));
    if (filters?.termId) constraints.push(where('termId', '==', filters.termId));
    if (filters?.classCode) constraints.push(where('classCode', '==', filters.classCode));

    const snap = await getDocs(query(col, ...constraints));
    return snap.docs.map((d) => d.data() as AssessmentRecord);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'assessmentRecords');
  }
}

export async function saveAssessmentRecord(
  rec: Omit<AssessmentRecord, 'id' | 'createdAt' | 'updatedAt' | 'adminUids'> & { id?: string },
  actorRole: 'admin' | 'teacher'
): Promise<string> {
  const id =
    rec.id ||
    `ar_${toSafeId(rec.studentId)}_${toSafeId(rec.subjectId)}_${toSafeId(rec.academicYearId)}_${toSafeId(rec.termId)}`;
  const adminUids = await getActiveAdminUids();
  try {
    const ref = doc(db, 'assessmentRecords', id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        cumulativeAiScore: rec.cumulativeAiScore ?? null,
        identifier: rec.identifier ?? null,
        aiDescriptor: rec.aiDescriptor || '',
        formativeScore: rec.formativeScore ?? null,
        summativeScore: rec.summativeScore ?? null,
        totalScore: rec.totalScore ?? null,
        grade: rec.grade || '',
        descriptor: rec.descriptor || '',
        teacherInitials: rec.teacherInitials || '',
        teacherComment: rec.teacherComment || '',
        teacherUid: rec.teacherUid || auth.currentUser?.uid || '',
        status: rec.status,
        ...(actorRole === 'admin' && rec.approvedBy ? { approvedBy: rec.approvedBy } : {}),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...rec,
        id,
        adminUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await logAudit(
      actorRole,
      'Save Assessment Score',
      'assessmentRecords',
      id,
      `${rec.studentName} · ${rec.subjectName} (${rec.classCode}): AI=${rec.cumulativeAiScore ?? '—'}, Summ=${rec.summativeScore ?? '—'}, Total=${rec.totalScore ?? '—'}, Grade=${rec.grade || '—'} [${rec.status}]`
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `assessmentRecords/${id}`);
  }
}

export async function fetchStudentSummaries(
  userRole: string,
  uid: string,
  filters?: { academicYearId?: string; termId?: string; classCode?: ClassCode }
): Promise<StudentTermSummary[]> {
  try {
    const col = collection(db, 'studentTermSummaries');
    const constraints = [];
    if (userRole === 'admin') {
      constraints.push(where('adminUids', 'array-contains', uid));
    } else if (userRole === 'teacher') {
      constraints.push(where('authorizedTeacherUids', 'array-contains', uid));
    } else {
      constraints.push(where('studentAuthUid', '==', uid));
    }
    if (filters?.academicYearId) constraints.push(where('academicYearId', '==', filters.academicYearId));
    if (filters?.termId) constraints.push(where('termId', '==', filters.termId));
    if (filters?.classCode) constraints.push(where('classCode', '==', filters.classCode));

    const snap = await getDocs(query(col, ...constraints));
    return snap.docs.map((d) => d.data() as StudentTermSummary);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'studentTermSummaries');
  }
}

export async function saveStudentTermSummary(
  sum: Omit<StudentTermSummary, 'id' | 'createdAt' | 'updatedAt' | 'adminUids'> & { id?: string },
  actorRole: 'admin' | 'teacher'
): Promise<string> {
  const id =
    sum.id ||
    `sum_${toSafeId(sum.studentId)}_${toSafeId(sum.academicYearId)}_${toSafeId(sum.termId)}`;
  const adminUids = await getActiveAdminUids();
  try {
    const ref = doc(db, 'studentTermSummaries', id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const updatePayload: Record<string, unknown> = {
        classTeacherComment: sum.classTeacherComment || '',
        classTeacherName: sum.classTeacherName || '',
        classTeacherInitials: sum.classTeacherInitials || '',
        projectSubject: sum.projectSubject || 'Art & Design',
        projectTitle: sum.projectTitle || '',
        projectPhase: sum.projectPhase || '',
        projectScore: sum.projectScore ?? null,
        projectRemarks: sum.projectRemarks || '',
        projectSupervisor: sum.projectSupervisor || '',
        updatedAt: serverTimestamp(),
      };
      if (actorRole === 'admin') {
        Object.assign(updatePayload, {
          averageAiIdentifier: sum.averageAiIdentifier ?? null,
          averageAiDescriptor: sum.averageAiDescriptor || '',
          averageTotalScore: sum.averageTotalScore ?? null,
          averageGrade: sum.averageGrade || '',
          averageFinal: sum.averageFinal ?? null,
          level: sum.level || '',
          position: sum.position || '',
          result: sum.result || '',
          bursarComment: sum.bursarComment || '',
          bursarName: sum.bursarName || '',
          bursarInitials: sum.bursarInitials || '',
          headTeacherComment: sum.headTeacherComment || '',
          headTeacherName: sum.headTeacherName || '',
          status: sum.status,
        });
      }
      await updateDoc(ref, updatePayload);
    } else {
      await setDoc(ref, {
        ...sum,
        id,
        adminUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `studentTermSummaries/${id}`);
  }
}

export async function fetchAttendance(
  userRole: string,
  uid: string,
  filters?: { academicYearId?: string; termId?: string; classCode?: ClassCode }
): Promise<AttendanceRecord[]> {
  try {
    const col = collection(db, 'attendance');
    const constraints = [];
    if (userRole === 'admin') {
      constraints.push(where('adminUids', 'array-contains', uid));
    } else if (userRole === 'teacher') {
      constraints.push(where('authorizedTeacherUids', 'array-contains', uid));
    } else {
      constraints.push(where('studentAuthUid', '==', uid));
    }
    if (filters?.academicYearId) constraints.push(where('academicYearId', '==', filters.academicYearId));
    if (filters?.termId) constraints.push(where('termId', '==', filters.termId));
    if (filters?.classCode) constraints.push(where('classCode', '==', filters.classCode));

    const snap = await getDocs(query(col, ...constraints));
    return snap.docs.map((d) => d.data() as AttendanceRecord);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'attendance');
  }
}

export async function saveAttendanceBatch(
  records: Array<Omit<AttendanceRecord, 'id' | 'createdAt' | 'adminUids'>>
): Promise<void> {
  const adminUids = await getActiveAdminUids();
  try {
    for (const rec of records) {
      const id = `att_${toSafeId(rec.studentId)}_${toSafeId(rec.date)}_${toSafeId(rec.termId)}`;
      const ref = doc(db, 'attendance', id);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        await updateDoc(ref, {
          status: rec.status,
          recordedByUid: rec.recordedByUid,
          recordedByName: rec.recordedByName || '',
        });
      } else {
        await setDoc(ref, {
          ...rec,
          id,
          adminUids,
          createdAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'attendance');
  }
}

export async function fetchFeesRecords(
  userRole: string,
  uid: string,
  filters?: { academicYearId?: string; termId?: string; classCode?: ClassCode }
): Promise<FeesRecord[]> {
  if (userRole === 'teacher') return [];
  try {
    const col = collection(db, 'feesRecords');
    const constraints = [];
    if (userRole === 'admin') {
      constraints.push(where('adminUids', 'array-contains', uid));
    } else {
      constraints.push(where('studentAuthUid', '==', uid));
    }
    if (filters?.academicYearId) constraints.push(where('academicYearId', '==', filters.academicYearId));
    if (filters?.termId) constraints.push(where('termId', '==', filters.termId));
    if (filters?.classCode) constraints.push(where('classCode', '==', filters.classCode));

    const snap = await getDocs(query(col, ...constraints));
    return snap.docs.map((d) => d.data() as FeesRecord);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'feesRecords');
  }
}

export async function saveFeesRecord(
  fee: Omit<FeesRecord, 'id' | 'createdAt' | 'updatedAt' | 'adminUids'> & { id?: string }
): Promise<string> {
  const id = fee.id || `fee_${toSafeId(fee.studentId)}_${toSafeId(fee.academicYearId)}_${toSafeId(fee.termId)}`;
  const adminUids = await getActiveAdminUids();
  try {
    const ref = doc(db, 'feesRecords', id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        feesRequired: fee.feesRequired,
        amountPaid: fee.amountPaid,
        balance: fee.balance,
        bursarComment: fee.bursarComment || '',
        bursarName: fee.bursarName || '',
        bursarInitials: fee.bursarInitials || '',
        paymentHistory: (fee.paymentHistory || []).slice(-30),
        adminUids,
        updatedByUid: auth.currentUser?.uid || '',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...fee,
        id,
        adminUids,
        updatedByUid: auth.currentUser?.uid || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await logAudit(
      'admin',
      'Update Fees Record',
      'feesRecords',
      id,
      `${fee.studentName}: Required UGX ${fee.feesRequired}, Paid UGX ${fee.amountPaid}, Balance UGX ${fee.balance}`
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `feesRecords/${id}`);
  }
}

export async function fetchReportCards(
  userRole: string,
  uid: string,
  filters?: { academicYearId?: string; termId?: string; classCode?: ClassCode }
): Promise<ReportCard[]> {
  try {
    const col = collection(db, 'reportCards');
    const constraints = [];
    if (userRole === 'admin') {
      constraints.push(where('adminUids', 'array-contains', uid));
    } else if (userRole === 'student') {
      constraints.push(where('studentAuthUid', '==', uid), where('published', '==', true));
    } else {
      return [];
    }
    if (filters?.academicYearId) constraints.push(where('academicYearId', '==', filters.academicYearId));
    if (filters?.termId) constraints.push(where('termId', '==', filters.termId));
    if (filters?.classCode) constraints.push(where('classCode', '==', filters.classCode));

    const snap = await getDocs(query(col, ...constraints));
    return snap.docs.map((d) => d.data() as ReportCard);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'reportCards');
  }
}

export async function saveReportCard(
  card: Omit<ReportCard, 'id' | 'generatedAt' | 'updatedAt' | 'adminUids'> & { id?: string }
): Promise<string> {
  const id = card.id || `rc_${toSafeId(card.studentId)}_${toSafeId(card.academicYearId)}_${toSafeId(card.termId)}`;
  const adminUids = await getActiveAdminUids();
  try {
    const ref = doc(db, 'reportCards', id);
    const existing = await getDoc(ref);
    const sanitizedPhotoUrl = (card.photoUrl || '').slice(0, 100000);
    if (existing.exists()) {
      await updateDoc(ref, {
        ...card,
        id,
        photoUrl: sanitizedPhotoUrl,
        adminUids,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...card,
        id,
        photoUrl: sanitizedPhotoUrl,
        adminUids,
        generatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await logAudit(
      'admin',
      card.published ? 'Publish Report Card' : 'Generate Report Card Draft',
      'reportCards',
      id,
      `${card.studentName} (${card.classCode} · ${card.termName || card.termId})`
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `reportCards/${id}`);
  }
}

export async function fetchExcelImports(uid: string): Promise<ExcelImportRecord[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'excelImports'), where('adminUids', 'array-contains', uid))
    );
    return snap.docs.map((d) => d.data() as ExcelImportRecord);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'excelImports');
  }
}

export async function saveExcelImportRecord(
  rec: Omit<ExcelImportRecord, 'id' | 'createdAt' | 'adminUids'>
): Promise<string> {
  const id = makeId('imp');
  const adminUids = await getActiveAdminUids();
  try {
    await setDoc(doc(db, 'excelImports', id), {
      ...rec,
      id,
      rawPreviewRows: (rec.rawPreviewRows || []).slice(0, 50),
      warnings: (rec.warnings || []).slice(0, 100),
      conflictFlags: (rec.conflictFlags || []).slice(0, 100),
      adminUids,
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `excelImports/${id}`);
  }
}

export async function fetchAuditLogs(uid: string): Promise<AuditLog[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'auditLogs'), where('adminUids', 'array-contains', uid))
    );
    return snap.docs.map((d) => d.data() as AuditLog);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'auditLogs');
  }
}

export async function fetchUsersAndInvites(uid: string): Promise<{
  users: UserAccount[];
  invites: UserInvite[];
}> {
  try {
    const [uSnap, iSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('adminUids', 'array-contains', uid))),
      getDocs(query(collection(db, 'userInvites'), where('adminUids', 'array-contains', uid))),
    ]);
    return {
      users: uSnap.docs.map((d) => d.data() as UserAccount),
      invites: iSnap.docs.map((d) => d.data() as UserInvite),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }
}

export async function createUserInvite(invite: {
  email: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
  linkedEntityId?: string;
  schoolPayCode?: string;
  initials?: string;
}): Promise<void> {
  const emailLower = invite.email.trim().toLowerCase();
  const id = emailToInviteId(emailLower);
  const adminUids = await getActiveAdminUids();
  try {
    await setDoc(doc(db, 'userInvites', id), {
      id,
      email: emailLower,
      role: invite.role,
      fullName: invite.fullName.trim(),
      linkedEntityId: invite.linkedEntityId || '',
      schoolPayCode: invite.schoolPayCode || '',
      initials: invite.initials || '',
      status: 'pending',
      adminUids,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await logAudit('admin', 'Create User Invite', 'userInvites', id, `Invited ${emailLower} as ${invite.role}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `userInvites/${id}`);
  }
}

export async function updateUserRoleOrStatus(
  userUid: string,
  updates: Partial<Pick<UserAccount, 'role' | 'status' | 'linkedEntityId' | 'initials' | 'schoolPayCode'>>
): Promise<void> {
  const adminUids = await getActiveAdminUids();
  try {
    await updateDoc(doc(db, 'users', userUid), {
      ...updates,
      adminUids,
      updatedAt: serverTimestamp(),
    });
    if (updates.role === 'admin' && updates.status === 'active') {
      const uSnap = await getDoc(doc(db, 'users', userUid));
      const uData = uSnap.data() as UserAccount | undefined;
      if (uData) {
        await setDoc(doc(db, 'admins', userUid), {
          uid: userUid,
          email: uData.email,
          fullName: uData.displayName,
          grantedBy: auth.currentUser?.uid || 'admin',
          createdAt: serverTimestamp(),
        });
      }
    }
    await logAudit('admin', 'Update User Account', 'users', userUid, `Updated user role/status: ${JSON.stringify(updates)}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${userUid}`);
  }
}

export async function syncClaimedAccountLinks(adminUid: string): Promise<number> {
  let synced = 0;
  try {
    const [uSnap, tSnap, sSnap, taSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('adminUids', 'array-contains', adminUid))),
      getDocs(query(collection(db, 'teachers'), where('adminUids', 'array-contains', adminUid))),
      getDocs(query(collection(db, 'students'), where('adminUids', 'array-contains', adminUid))),
      getDocs(query(collection(db, 'teacherAssignments'), where('adminUids', 'array-contains', adminUid))),
    ]);

    const allUsers = uSnap.docs.map((d) => d.data() as UserAccount);
    const allTeachers = tSnap.docs.map((d) => d.data() as Teacher);
    const allStudents = sSnap.docs.map((d) => d.data() as Student);
    const allAssignments = taSnap.docs.map((d) => d.data() as TeacherAssignment);

    for (const u of allUsers) {
      if (u.status !== 'active') continue;
      if (u.role === 'teacher') {
        const matchedTeacher = allTeachers.find(
          (t) => t.id === u.linkedEntityId || t.email.toLowerCase() === u.email.toLowerCase()
        );
        if (matchedTeacher && matchedTeacher.authUid !== u.uid) {
          await updateDoc(doc(db, 'teachers', matchedTeacher.id), {
            authUid: u.uid,
            updatedAt: serverTimestamp(),
          });
          const tAssigns = allAssignments.filter((a) => a.teacherId === matchedTeacher.id);
          for (const a of tAssigns) {
            await updateDoc(doc(db, 'teacherAssignments', a.id), { teacherUid: u.uid });
            await syncAuthorizedTeachersForClass(a.classCode, adminUid);
          }
          synced++;
        }
      } else if (u.role === 'student') {
        const matchedStudent = allStudents.find(
          (s) =>
            s.id === u.linkedEntityId ||
            (s.email && s.email.toLowerCase() === u.email.toLowerCase()) ||
            (u.schoolPayCode && s.schoolPayCode === u.schoolPayCode)
        );
        if (matchedStudent && matchedStudent.studentAuthUid !== u.uid) {
          await updateDoc(doc(db, 'students', matchedStudent.id), {
            studentAuthUid: u.uid,
            updatedAt: serverTimestamp(),
          });
          synced++;
        }
      }
    }
    return synced;
  } catch (err) {
    console.warn('Account link sync warning:', err);
    return synced;
  }
}

