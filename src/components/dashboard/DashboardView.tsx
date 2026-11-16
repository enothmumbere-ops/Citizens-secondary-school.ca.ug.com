import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAssessments,
  fetchAttendance,
  fetchFeesRecords,
  fetchReportCards,
  fetchStudents,
  fetchTeacherAssignments,
  fetchTeachers,
} from '../../services/firestoreService';
import {
  AssessmentRecord,
  AttendanceRecord,
  FeesRecord,
  ReportCard,
  Student,
  Teacher,
  TeacherAssignment,
} from '../../types/sims';
import { formatUgx } from '../../utils/grading';
import { NavSectionId } from '../layout/AppShell';

interface DashboardViewProps {
  onNavigate: (id: NavSectionId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { userAccount, schoolSettings, years, terms, classes, subjects } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fees, setFees] = useState<FeesRecord[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);

  const role = userAccount?.role || 'pending';
  const uid = userAccount?.uid || '';
  const currentYearId = schoolSettings?.currentAcademicYearId || years.find((y) => y.isCurrent)?.id || '';
  const currentTermId = schoolSettings?.currentTermId || terms.find((t) => t.isCurrent)?.id || '';

  useEffect(() => {
    if (!uid || role === 'pending') return;
    let active = true;
    setLoading(true);

    Promise.all([
      fetchStudents(role, uid),
      role === 'admin' || role === 'teacher' ? fetchTeachers(role, uid) : Promise.resolve([]),
      role === 'admin' || role === 'teacher' ? fetchTeacherAssignments(role, uid) : Promise.resolve([]),
      fetchAssessments(role, uid, currentYearId && currentTermId ? { academicYearId: currentYearId, termId: currentTermId } : undefined),
      fetchAttendance(role, uid, currentYearId && currentTermId ? { academicYearId: currentYearId, termId: currentTermId } : undefined),
      role === 'admin' || role === 'student'
        ? fetchFeesRecords(role, uid, currentYearId && currentTermId ? { academicYearId: currentYearId, termId: currentTermId } : undefined)
        : Promise.resolve([]),
      role === 'admin' || role === 'student'
        ? fetchReportCards(role, uid, currentYearId && currentTermId ? { academicYearId: currentYearId, termId: currentTermId } : undefined)
        : Promise.resolve([]),
    ])
      .then(([st, tc, asg, ar, att, fe, rc]) => {
        if (!active) return;
        setStudents(st);
        setTeachers(tc);
        setAssignments(asg);
        setAssessments(ar);
        setAttendance(att);
        setFees(fe);
        setReportCards(rc);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [uid, role, currentYearId, currentTermId]);

  const currentYear = years.find((y) => y.id === currentYearId);
  const currentTerm = terms.find((t) => t.id === currentTermId);

  const stats = useMemo(() => {
    const activeStudents = students.filter((s) => s.status === 'active');
    const approvedAssessments = assessments.filter((a) => a.status === 'approved').length;
    const submittedAssessments = assessments.filter((a) => a.status === 'submitted').length;
    const aiEntered = assessments.filter((a) => a.cumulativeAiScore !== null && a.cumulativeAiScore !== undefined).length;
    const summativeEntered = assessments.filter((a) => a.summativeScore !== null && a.summativeScore !== undefined).length;
    const initialsEntered = assessments.filter((a) => Boolean(a.teacherInitials?.trim())).length;
    const publishedReports = reportCards.filter((r) => r.published).length;

    const daysPresent = attendance.filter((a) => a.status === 'present').length;
    const daysAbsent = attendance.filter((a) => a.status === 'absent').length;
    const totalFeesRequired = fees.reduce((acc, f) => acc + (f.feesRequired || 0), 0);
    const totalFeesBalance = fees.reduce((acc, f) => acc + (f.balance || 0), 0);

    return {
      activeStudents: activeStudents.length,
      totalTeachers: teachers.length,
      approvedAssessments,
      submittedAssessments,
      totalAssessments: assessments.length,
      aiEntered,
      summativeEntered,
      initialsEntered,
      publishedReports,
      daysPresent,
      daysAbsent,
      totalFeesRequired,
      totalFeesBalance,
    };
  }, [students, teachers, assessments, reportCards, attendance, fees]);

  const classPerformance = useMemo(() => {
    return classes.map((cls) => {
      const clsStudents = students.filter((s) => s.classCode === cls.code && s.status === 'active');
      const clsAssess = assessments.filter((a) => a.classCode === cls.code && a.totalScore !== null && a.totalScore !== undefined);
      const avg =
        clsAssess.length > 0
          ? Math.round((clsAssess.reduce((acc, r) => acc + (r.totalScore || 0), 0) / clsAssess.length) * 10) / 10
          : null;
      return {
        code: cls.code,
        name: cls.name,
        studentCount: clsStudents.length,
        recordedCount: clsAssess.length,
        averageScore: avg,
      };
    });
  }, [classes, students, assessments]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-72 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">
            {role === 'admin'
              ? 'Administration Overview'
              : role === 'teacher'
              ? 'Teacher Academic Workspace'
              : 'Student Academic Portal'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Citizens’ Secondary School – Kasese · {currentYear?.name || '2026'} · {currentTerm?.name || 'Term III'}
          </p>
        </div>

        {role === 'admin' && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('excel-import')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-navy-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-sky-600" />
              Import School Excel
            </button>
            <button
              type="button"
              onClick={() => onNavigate('report-cards')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Generate Report Cards
            </button>
          </div>
        )}
      </div>

      {/* ADMINISTRATOR DASHBOARD */}
      {role === 'admin' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Active Students</span>
                <GraduationCap className="w-4 h-4 text-sky-600" />
              </div>
              <p className="mt-3 text-3xl font-bold text-navy-900 tabular-nums">{stats.activeStudents}</p>
              <p className="mt-1 text-xs text-slate-500">Across {classes.length} senior classes</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Teaching Staff &amp; Subjects</span>
                <Users className="w-4 h-4 text-sky-600" />
              </div>
              <p className="mt-3 text-3xl font-bold text-navy-900 tabular-nums">{stats.totalTeachers}</p>
              <p className="mt-1 text-xs text-slate-500">{subjects.length} approved subjects configured</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Assessment Completion</span>
                <ClipboardCheck className="w-4 h-4 text-sky-600" />
              </div>
              <p className="mt-3 text-3xl font-bold text-navy-900 tabular-nums">
                {stats.approvedAssessments}
                <span className="text-base font-medium text-slate-400"> / {stats.totalAssessments}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {stats.submittedAssessments} pending admin approval
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Outstanding Fees Balance</span>
                <Wallet className="w-4 h-4 text-sky-600" />
              </div>
              <p className="mt-3 text-2xl font-bold text-navy-900 tabular-nums">
                {fees.length > 0 ? formatUgx(stats.totalFeesBalance) : 'UGX 0'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {stats.publishedReports} report cards published
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-navy-900">Class Enrolment &amp; Academic Performance</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Term-isolated performance summary for {currentYear?.name || '2026'} · {currentTerm?.name || 'Term III'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('students')}
                  className="text-xs font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Manage Students <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-6 py-3">Class</th>
                      <th className="px-6 py-3 text-right">Active Students</th>
                      <th className="px-6 py-3 text-right">Subject Marks</th>
                      <th className="px-6 py-3 text-right">Mean Total (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {classPerformance.map((row) => (
                      <tr key={row.code} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3 font-medium text-navy-900">
                          {row.code} <span className="text-slate-500 font-normal">· {row.name}</span>
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums">{row.studentCount}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{row.recordedCount}</td>
                        <td className="px-6 py-3 text-right font-semibold tabular-nums text-navy-900">
                          {row.averageScore !== null ? `${row.averageScore.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-base font-bold text-navy-900">Attendance &amp; Workflow Summary</h2>
                <p className="text-xs text-slate-500 mt-0.5">Live records from Firestore database</p>
              </div>
              <div className="space-y-3 text-sm divide-y divide-slate-100">
                <div className="flex items-center justify-between pt-2">
                  <span className="text-slate-600">Recorded Days Present</span>
                  <span className="font-semibold tabular-nums text-emerald-700">{stats.daysPresent}</span>
                </div>
                <div className="flex items-center justify-between pt-3">
                  <span className="text-slate-600">Recorded Days Absent</span>
                  <span className="font-semibold tabular-nums text-amber-700">{stats.daysAbsent}</span>
                </div>
                <div className="flex items-center justify-between pt-3">
                  <span className="text-slate-600">Total Fees Required</span>
                  <span className="font-semibold tabular-nums text-navy-900">{formatUgx(stats.totalFeesRequired)}</span>
                </div>
                <div className="flex items-center justify-between pt-3">
                  <span className="text-slate-600">Published Report Cards</span>
                  <span className="font-semibold tabular-nums text-navy-900">{stats.publishedReports}</span>
                </div>
              </div>

              {stats.activeStudents === 0 && (
                <div className="p-4 bg-sky-50 border border-sky-200 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-navy-900">Initial Data Setup</p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    No student records have been added yet. Import your official school Excel workbook (DATA SOURCE FOR TERM 3 ONLY S.1-S.4.xlsx) or register students individually.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('excel-import')}
                    className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
                  >
                    Open Excel Import Wizard <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* TEACHER DASHBOARD */}
      {role === 'teacher' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Assigned Subjects</span>
                <BookOpen className="w-4 h-4 text-sky-600" />
              </div>
              <p className="mt-3 text-3xl font-bold text-navy-900 tabular-nums">{assignments.length}</p>
              <p className="mt-1 text-xs text-slate-500">Authorized class/subject slots</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Assigned Students</span>
                <GraduationCap className="w-4 h-4 text-sky-600" />
              </div>
              <p className="mt-3 text-3xl font-bold text-navy-900 tabular-nums">{students.length}</p>
              <p className="mt-1 text-xs text-slate-500">In your assigned classes</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>AI (x/3) &amp; EOY (80%) Entered</span>
                <ClipboardCheck className="w-4 h-4 text-sky-600" />
              </div>
              <p className="mt-3 text-3xl font-bold text-navy-900 tabular-nums">
                {stats.aiEntered} <span className="text-sm font-normal text-slate-400">AI</span> · {stats.summativeEntered}{' '}
                <span className="text-sm font-normal text-slate-400">EOY</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">Initials entered: {stats.initialsEntered}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Attendance Records</span>
                <CalendarCheck className="w-4 h-4 text-sky-600" />
              </div>
              <p className="mt-3 text-3xl font-bold text-navy-900 tabular-nums">{attendance.length}</p>
              <p className="mt-1 text-xs text-slate-500">Recorded this term</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-navy-900">Your Class &amp; Subject Assignments</h2>
                <p className="text-xs text-slate-500">You may enter Cumulative AI (0–3), Summative (80%), and Teacher Initials for these subjects only.</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('assessments')}
                className="px-4 py-2 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Mark Sheet
              </button>
            </div>
            {assignments.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No classes or subjects have been assigned to your account yet. Contact the School Administrator.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-6 py-3">Class</th>
                    <th className="px-6 py-3">Stream</th>
                    <th className="px-6 py-3">Subject</th>
                    <th className="px-6 py-3 text-right">Records Entered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {assignments.map((a) => {
                    const count = assessments.filter((r) => r.classCode === a.classCode && r.subjectId === a.subjectId).length;
                    return (
                      <tr key={a.id}>
                        <td className="px-6 py-3 font-semibold text-navy-900">{a.classCode}</td>
                        <td className="px-6 py-3 text-slate-600">{a.stream || 'All Streams'}</td>
                        <td className="px-6 py-3 text-slate-900">{a.subjectName}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* STUDENT DASHBOARD */}
      {role === 'student' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Student Profile</p>
              <p className="mt-2 text-lg font-bold text-navy-900 truncate">
                {students[0]?.fullName || userAccount?.displayName}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {students[0]?.classCode || '—'} · Pay Code: {students[0]?.schoolPayCode || userAccount?.schoolPayCode || '—'}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Approved Subject Results</p>
              <p className="mt-2 text-3xl font-bold text-navy-900 tabular-nums">{stats.approvedAssessments}</p>
              <p className="mt-1 text-xs text-slate-500">Published this term</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Attendance Summary</p>
              <p className="mt-2 text-3xl font-bold text-navy-900 tabular-nums">
                {stats.daysPresent} <span className="text-sm font-normal text-slate-500">Present</span> · {stats.daysAbsent}{' '}
                <span className="text-sm font-normal text-slate-500">Absent</span>
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Published Report Cards</p>
              <p className="mt-2 text-3xl font-bold text-navy-900 tabular-nums">{stats.publishedReports}</p>
              <button
                type="button"
                onClick={() => onNavigate('report-cards')}
                className="mt-1 text-xs font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
              >
                View Report Card →
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-navy-900">Your Termly Subject Performance</h2>
              <p className="text-xs text-slate-500">Only verified and published assessment records appear below.</p>
            </div>
            {assessments.filter((a) => a.status === 'approved').length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No approved subject results have been published for this term yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-6 py-3">Subject</th>
                      <th className="px-6 py-3 text-right">Cum. AI (0-3)</th>
                      <th className="px-6 py-3 text-right">Formative (20%)</th>
                      <th className="px-6 py-3 text-right">Summative (80%)</th>
                      <th className="px-6 py-3 text-right">Total (100%)</th>
                      <th className="px-6 py-3 text-center">Grade</th>
                      <th className="px-6 py-3">Descriptor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {assessments
                      .filter((a) => a.status === 'approved')
                      .map((r) => (
                        <tr key={r.id}>
                          <td className="px-6 py-3 font-medium text-navy-900">{r.subjectName}</td>
                          <td className="px-6 py-3 text-right tabular-nums">{r.cumulativeAiScore ?? '—'}</td>
                          <td className="px-6 py-3 text-right tabular-nums">{r.formativeScore ?? '—'}</td>
                          <td className="px-6 py-3 text-right tabular-nums">{r.summativeScore ?? '—'}</td>
                          <td className="px-6 py-3 text-right font-semibold tabular-nums">{r.totalScore ?? '—'}</td>
                          <td className="px-6 py-3 text-center font-bold text-navy-900">{r.grade || '—'}</td>
                          <td className="px-6 py-3 text-slate-600">{r.descriptor || '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
