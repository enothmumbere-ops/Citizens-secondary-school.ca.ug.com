export type UserRole = 'admin' | 'teacher' | 'student' | 'pending';
export type AccountStatus = 'active' | 'inactive' | 'pending';
export type ClassCode = 'S.1' | 'S.2' | 'S.3' | 'S.4' | 'S.5' | 'S.6';
export type TermName = 'Term I' | 'Term II' | 'Term III';
export type Gender = 'M' | 'F';

export interface GradeBand {
  grade: string;
  minScore: number;
  maxScore: number;
  descriptor: string;
  levelLabel: string;
}

export interface AiDescriptorBand {
  identifier: 1 | 2 | 3;
  minScore: number;
  maxScore: number;
  descriptor: 'Basic' | 'Moderate' | 'Outstanding';
}

export interface GradingConfig {
  formativeWeight: number; // 20
  summativeWeight: number; // 80
  aiMaxScore: number; // 3
  aiBands: AiDescriptorBand[];
  gradeBands: GradeBand[];
  requiresAdminConfirmation: boolean;
  conflictNotes: string[];
}

export interface SchoolSettings {
  id: string;
  schoolCode: 'CSS_KASESE';
  schoolName: string;
  motto: string;
  address: string;
  phones: string;
  email: string;
  headTeacherName: string;
  bursarName: string;
  bursarInitials: string;
  currentAcademicYearId: string;
  currentTermId: string;
  thisTermHas: string;
  nextTermBegins: string;
  gradingConfig: GradingConfig;
  updatedAt?: unknown;
}

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: AccountStatus;
  linkedEntityId?: string;
  schoolPayCode?: string;
  initials?: string;
  inviteId?: string;
  adminUids?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserInvite {
  id: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  linkedEntityId?: string;
  fullName: string;
  schoolPayCode?: string;
  initials?: string;
  status: 'pending' | 'claimed' | 'revoked';
  adminUids?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AcademicYear {
  id: string;
  schoolCode: 'CSS_KASESE';
  name: string;
  isCurrent: boolean;
  status: 'active' | 'archived';
  createdAt?: unknown;
}

export interface Term {
  id: string;
  schoolCode: 'CSS_KASESE';
  academicYearId: string;
  name: TermName;
  startDate?: string;
  endDate?: string;
  nextTermBegins?: string;
  isCurrent: boolean;
  createdAt?: unknown;
}

export interface SchoolClass {
  id: string;
  schoolCode: 'CSS_KASESE';
  code: ClassCode;
  name: string;
  level: 'O-Level' | 'A-Level';
  streams: string[];
  classTeacherId?: string;
  classTeacherName?: string;
  classTeacherInitials?: string;
  createdAt?: unknown;
}

export interface Subject {
  id: string;
  schoolCode: 'CSS_KASESE';
  name: string;
  code?: string;
  allowedClasses: ClassCode[];
  isCompulsory: boolean;
  createdAt?: unknown;
}

export interface Teacher {
  id: string;
  staffNumber: string;
  fullName: string;
  initials: string;
  email: string;
  phone?: string;
  gender?: Gender;
  authUid?: string;
  assignedClasses: ClassCode[];
  assignedSubjects: string[];
  adminUids: string[];
  status: 'active' | 'inactive';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  teacherUid?: string;
  teacherName: string;
  teacherInitials?: string;
  classCode: ClassCode;
  stream?: string;
  subjectId: string;
  subjectName: string;
  academicYearId: string;
  termId: string;
  adminUids: string[];
  createdAt?: unknown;
}

export interface Student {
  id: string;
  studentNumber: string;
  fullName: string;
  gender: Gender;
  schoolPayCode: string;
  dateOfBirth?: string;
  admissionDate?: string;
  classCode: ClassCode;
  stream?: string;
  academicYearId: string;
  status: 'active' | 'inactive' | 'archived' | 'transferred';
  authUid?: string;
  email?: string;
  studentAuthUid?: string;
  photoUrl?: string;
  authorizedTeacherUids: string[];
  adminUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AssessmentRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentAuthUid?: string;
  schoolPayCode?: string;
  classCode: ClassCode;
  stream?: string;
  academicYearId: string;
  termId: string;
  subjectId: string;
  subjectName: string;
  cumulativeAiScore?: number | null;
  identifier?: number | null;
  aiDescriptor?: string;
  formativeScore?: number | null;
  summativeScore?: number | null;
  totalScore?: number | null;
  grade?: string;
  descriptor?: string;
  teacherInitials?: string;
  teacherComment?: string;
  teacherUid?: string;
  authorizedTeacherUids: string[];
  adminUids: string[];
  status: 'draft' | 'submitted' | 'approved';
  approvedBy?: string;
  sourceImportId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentTermSummary {
  id: string;
  studentId: string;
  studentName: string;
  gender?: Gender;
  schoolPayCode?: string;
  studentAuthUid?: string;
  classCode: ClassCode;
  stream?: string;
  academicYearId: string;
  termId: string;
  averageAiIdentifier?: number | null;
  averageAiDescriptor?: string;
  averageTotalScore?: number | null;
  averageGrade?: string;
  averageFinal?: number | null;
  level?: string;
  position?: string;
  result?: string;
  classTeacherComment?: string;
  classTeacherName?: string;
  classTeacherInitials?: string;
  bursarComment?: string;
  bursarName?: string;
  bursarInitials?: string;
  headTeacherComment?: string;
  headTeacherName?: string;
  projectSubject?: string;
  projectTitle?: string;
  projectPhase?: string;
  projectScore?: number | null;
  projectRemarks?: string;
  projectSupervisor?: string;
  authorizedTeacherUids: string[];
  adminUids: string[];
  status: 'draft' | 'ready' | 'published';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentAuthUid?: string;
  classCode: ClassCode;
  stream?: string;
  academicYearId: string;
  termId: string;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent';
  recordedByUid: string;
  recordedByName?: string;
  authorizedTeacherUids: string[];
  adminUids: string[];
  createdAt?: unknown;
}

export interface PaymentEntry {
  id: string;
  amount: number;
  date: string;
  reference: string;
  recordedBy: string;
}

export interface FeesRecord {
  id: string;
  studentId: string;
  studentName: string;
  schoolPayCode: string;
  studentAuthUid?: string;
  classCode: ClassCode;
  stream?: string;
  academicYearId: string;
  termId: string;
  feesRequired: number;
  amountPaid: number;
  balance: number;
  bursarComment?: string;
  bursarName?: string;
  bursarInitials?: string;
  paymentHistory?: PaymentEntry[];
  adminUids: string[];
  updatedByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReportCardSubjectRow {
  subjectId: string;
  subjectName: string;
  cumulativeAiScore: number | null;
  identifier: number | null;
  aiDescriptor: string;
  formativeScore: number | null;
  summativeScore: number | null;
  totalScore: number | null;
  grade: string;
  descriptor: string;
  teacherInitials: string;
  status: 'draft' | 'submitted' | 'approved' | 'missing';
}

export interface ReportCard {
  id: string;
  studentId: string;
  studentName: string;
  studentAuthUid?: string;
  photoUrl?: string;
  gender?: Gender;
  schoolPayCode?: string;
  classCode: ClassCode;
  stream?: string;
  academicYearId: string;
  academicYearName?: string;
  termId: string;
  termName?: string;
  subjectResults: ReportCardSubjectRow[];
  attendance?: {
    daysPresent: number;
    daysAbsent: number;
    totalDays: number;
  };
  fees?: {
    feesRequired: number | null;
    amountPaid: number | null;
    balance: number | null;
    bursarComment: string;
  };
  summary?: {
    averageAiIdentifier: number | null;
    averageAiDescriptor: string;
    averageTotalScore: number | null;
    averageGrade: string;
    averageFinal: number | null;
    level: string;
    position: string;
    result: string;
    classTeacherComment: string;
    classTeacherName: string;
    classTeacherInitials: string;
    bursarComment: string;
    bursarName: string;
    bursarInitials: string;
    headTeacherComment: string;
    headTeacherName: string;
  };
  project?: {
    subject: string;
    title: string;
    phase: string;
    score: number | null;
    remarks: string;
    supervisorName: string;
  };
  thisTermHas?: string;
  nextTermBegins?: string;
  published: boolean;
  publishedBy?: string;
  missingFields?: string[];
  adminUids: string[];
  generatedAt?: unknown;
  updatedAt?: unknown;
}

export interface ExcelImportRecord {
  id: string;
  fileName: string;
  academicYearId: string;
  termId: string;
  classCode: ClassCode;
  stream?: string;
  sheetsFound: string[];
  rowCount: number;
  importedCount: number;
  warnings?: string[];
  conflictFlags?: string[];
  rawPreviewRows?: Record<string, unknown>[];
  uploadedByUid: string;
  uploadedByEmail?: string;
  adminUids: string[];
  createdAt?: unknown;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole: 'admin' | 'teacher' | 'student';
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  adminUids: string[];
  createdAt?: unknown;
}
