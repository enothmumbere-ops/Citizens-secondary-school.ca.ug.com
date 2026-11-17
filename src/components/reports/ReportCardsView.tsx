import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Eye, FileText, Printer, Send, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAssessments,
  fetchAttendance,
  fetchFeesRecords,
  fetchReportCards,
  fetchStudents,
  fetchStudentSummaries,
  saveReportCard,
} from '../../services/firestoreService';
import {
  AssessmentRecord,
  AttendanceRecord,
  ClassCode,
  FeesRecord,
  ReportCard,
  ReportCardSubjectRow,
  SchoolSettings,
  Student,
  StudentTermSummary,
} from '../../types/sims';
import { formatUgx, sortReportCardRows, sortSubjectsForReport } from '../../utils/grading';
import { downloadBulkReportCardsPdf, downloadSingleReportCardPdf } from '../../utils/reportCardPdf';
import { SchoolCrest } from '../common/SchoolCrest';
import { useToast } from '../common/Toast';

export const ReportCardsView: React.FC = () => {
  const { userAccount, schoolSettings, years, terms, classes, subjects } = useAuth();
  const { showToast } = useToast();

  const role = userAccount?.role || 'pending';
  const uid = userAccount?.uid || '';
  const isAdmin = role === 'admin';
  const isStudent = role === 'student';

  const [selectedYearId, setSelectedYearId] = useState(
    schoolSettings?.currentAcademicYearId || years[0]?.id || 'yr_2026'
  );
  const [selectedTermId, setSelectedTermId] = useState(
    schoolSettings?.currentTermId || terms[0]?.id || 'term_2026_3'
  );
  const [selectedClass, setSelectedClass] = useState<ClassCode>('S.1');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('ALL');

  const [students, setStudents] = useState<Student[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [summaries, setSummaries] = useState<StudentTermSummary[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fees, setFees] = useState<FeesRecord[]>([]);
  const [savedCards, setSavedCards] = useState<ReportCard[]>([]);
  const [previewCards, setPreviewCards] = useState<ReportCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const scope = isStudent
        ? { academicYearId: selectedYearId, termId: selectedTermId }
        : { academicYearId: selectedYearId, termId: selectedTermId, classCode: selectedClass };

      const [stList, arList, sumList, attList, feeList, rcList] = await Promise.all([
        fetchStudents(role, uid),
        fetchAssessments(role, uid, scope),
        fetchStudentSummaries(role, uid, scope),
        fetchAttendance(role, uid, scope),
        fetchFeesRecords(role, uid, scope),
        fetchReportCards(role, uid, scope),
      ]);
      setStudents(stList);
      setAssessments(arList);
      setSummaries(sumList);
      setAttendance(attList);
      setFees(feeList);
      setSavedCards(rcList);
      if (isStudent) {
        setPreviewCards(rcList.filter((c) => c.published));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load report card data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [uid, role, isStudent, selectedYearId, selectedTermId, selectedClass, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const classStudents = useMemo(
    () => students.filter((s) => s.classCode === selectedClass && s.status === 'active'),
    [students, selectedClass]
  );

  const currentYearName = years.find((y) => y.id === selectedYearId)?.name || selectedYearId;
  const currentTermObj = terms.find((t) => t.id === selectedTermId);
  const currentTermName = currentTermObj?.name || selectedTermId;

  const buildReportCardForStudent = useCallback(
    (st: Student): Omit<ReportCard, 'id' | 'generatedAt' | 'updatedAt' | 'adminUids'> => {
      // Strictly isolate to selected student, class, year, and term
      const stAssess = assessments.filter(
        (a) =>
          a.studentId === st.id &&
          a.classCode === selectedClass &&
          a.academicYearId === selectedYearId &&
          a.termId === selectedTermId
      );
      const stSum = summaries.find(
        (s) =>
          s.studentId === st.id &&
          s.classCode === selectedClass &&
          s.academicYearId === selectedYearId &&
          s.termId === selectedTermId
      );
      const stAtt = attendance.filter(
        (a) =>
          a.studentId === st.id &&
          a.classCode === selectedClass &&
          a.academicYearId === selectedYearId &&
          a.termId === selectedTermId
      );
      const stFee = fees.find(
        (f) =>
          f.studentId === st.id &&
          f.classCode === selectedClass &&
          f.academicYearId === selectedYearId &&
          f.termId === selectedTermId
      );
      const existingRc = savedCards.find((c) => c.studentId === st.id);

      const classSubjects = sortSubjectsForReport(
        subjects.filter((s) => s.allowedClasses.includes(selectedClass))
      );
      const missingFields: string[] = [];

      const subjectResults: ReportCardSubjectRow[] = classSubjects.map((subj) => {
        const rec = stAssess.find((a) => a.subjectId === subj.id || a.subjectName === subj.name);
        if (!rec) {
          if (subj.isCompulsory) {
            missingFields.push(`${subj.name} (no assessment record)`);
          }
          return {
            subjectId: subj.id,
            subjectName: subj.name,
            cumulativeAiScore: null,
            identifier: null,
            aiDescriptor: '',
            formativeScore: null,
            summativeScore: null,
            totalScore: null,
            grade: '',
            descriptor: '',
            teacherInitials: '',
            status: 'missing',
          };
        }

        if (rec.status !== 'approved') {
          missingFields.push(`${subj.name} (status: ${rec.status} — awaiting approval)`);
        }
        if (rec.cumulativeAiScore === null || rec.cumulativeAiScore === undefined) {
          missingFields.push(`${subj.name} (missing Cumulative AI score)`);
        }
        if (rec.summativeScore === null || rec.summativeScore === undefined) {
          missingFields.push(`${subj.name} (missing Summative 80% score)`);
        }

        return {
          subjectId: subj.id,
          subjectName: subj.name,
          cumulativeAiScore: rec.cumulativeAiScore ?? null,
          identifier: rec.identifier ?? null,
          aiDescriptor: rec.aiDescriptor || '',
          formativeScore: rec.formativeScore ?? null,
          summativeScore: rec.summativeScore ?? null,
          totalScore: rec.totalScore ?? null,
          grade: rec.grade || '',
          descriptor: rec.descriptor || '',
          teacherInitials: rec.teacherInitials || '',
          status: rec.status,
        };
      });

      const daysPresent = stAtt.filter((a) => a.status === 'present').length;
      const daysAbsent = stAtt.filter((a) => a.status === 'absent').length;
      if (stAtt.length === 0) {
        missingFields.push('Attendance (no daily records recorded)');
      }

      const clsObj = classes.find((c) => c.code === selectedClass);

      return {
        studentId: st.id,
        studentName: st.fullName,
        studentAuthUid: st.studentAuthUid || '',
        photoUrl: st.photoUrl || '',
        gender: st.gender,
        schoolPayCode: st.schoolPayCode,
        classCode: st.classCode,
        stream: st.stream || 'Main',
        academicYearId: selectedYearId,
        academicYearName: currentYearName,
        termId: selectedTermId,
        termName: currentTermName,
        subjectResults,
        attendance: {
          daysPresent,
          daysAbsent,
          totalDays: stAtt.length,
        },
        fees: {
          feesRequired: stFee?.feesRequired ?? null,
          amountPaid: stFee?.amountPaid ?? null,
          balance: stFee?.balance ?? null,
          bursarComment: stFee?.bursarComment || stSum?.bursarComment || '',
        },
        summary: {
          averageAiIdentifier: stSum?.averageAiIdentifier ?? null,
          averageAiDescriptor: stSum?.averageAiDescriptor || '',
          averageTotalScore: stSum?.averageTotalScore ?? null,
          averageGrade: stSum?.averageGrade || '',
          averageFinal: stSum?.averageFinal ?? null,
          level: stSum?.level || '',
          position: stSum?.position || '',
          result: stSum?.result || '',
          classTeacherComment: stSum?.classTeacherComment || '',
          classTeacherName: stSum?.classTeacherName || clsObj?.classTeacherName || '',
          classTeacherInitials: stSum?.classTeacherInitials || clsObj?.classTeacherInitials || '',
          bursarComment: stFee?.bursarComment || stSum?.bursarComment || '',
          bursarName: stFee?.bursarName || stSum?.bursarName || schoolSettings?.bursarName || '',
          bursarInitials: stFee?.bursarInitials || stSum?.bursarInitials || schoolSettings?.bursarInitials || '',
          headTeacherComment: stSum?.headTeacherComment || '',
          headTeacherName: stSum?.headTeacherName || schoolSettings?.headTeacherName || '',
        },
        project: {
          subject: stSum?.projectSubject || 'Art & Design',
          title: stSum?.projectTitle || '',
          phase: stSum?.projectPhase || '',
          score: stSum?.projectScore ?? null,
          remarks: stSum?.projectRemarks || '',
          supervisorName: stSum?.projectSupervisor || '',
        },
        thisTermHas: currentTermObj?.endDate || schoolSettings?.thisTermHas || '',
        nextTermBegins: currentTermObj?.nextTermBegins || schoolSettings?.nextTermBegins || '',
        published: existingRc?.published || false,
        missingFields,
      };
    },
    [
      assessments,
      summaries,
      attendance,
      fees,
      savedCards,
      subjects,
      classes,
      selectedClass,
      selectedYearId,
      selectedTermId,
      currentYearName,
      currentTermName,
      currentTermObj,
      schoolSettings,
    ]
  );

  const handleGeneratePreview = () => {
    const targets =
      selectedStudentId === 'ALL'
        ? classStudents
        : classStudents.filter((s) => s.id === selectedStudentId);

    if (targets.length === 0) {
      showToast('No active students found in the selected class.', 'error');
      return;
    }

    const built: ReportCard[] = targets.map((st) => ({
      id: `rc_${st.id}_${selectedYearId}_${selectedTermId}`,
      ...buildReportCardForStudent(st),
      adminUids: [uid],
    }));
    setPreviewCards(built);
  };

  const handlePublishSelected = async (forceAllowIncomplete: boolean) => {
    if (!isAdmin || previewCards.length === 0) return;
    const incomplete = previewCards.filter((c) => (c.missingFields?.length || 0) > 0);
    if (incomplete.length > 0 && !forceAllowIncomplete) {
      showToast(
        `${incomplete.length} report card(s) have incomplete or unapproved marks. Review warnings or use "Publish With Admin Override".`,
        'error'
      );
      return;
    }
    setBusy(true);
    try {
      for (const card of previewCards) {
        await saveReportCard({
          ...card,
          published: true,
          publishedBy: uid,
        });
      }
      showToast(`Published ${previewCards.length} report card(s) for ${selectedClass}.`, 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Publishing failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleLoadReprints = () => {
    if (savedCards.length === 0) {
      showToast('No previously generated report cards found for this class and term.', 'info');
      return;
    }
    const filtered =
      selectedStudentId === 'ALL'
        ? savedCards
        : savedCards.filter((c) => c.studentId === selectedStudentId);
    setPreviewCards(filtered);
  };

  const defaultSettings: SchoolSettings = schoolSettings || {
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
    currentAcademicYearId: selectedYearId,
    currentTermId: selectedTermId,
    thisTermHas: '',
    nextTermBegins: '',
    gradingConfig: {
      formativeWeight: 20,
      summativeWeight: 80,
      aiMaxScore: 3,
      aiBands: [],
      gradeBands: [],
      requiresAdminConfirmation: true,
      conflictNotes: [],
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">
            {isStudent ? 'My Progressive Termly Report Card' : 'Automated Report Card Generation'}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {isStudent
              ? 'View your official published termly report card. Downloading and printing are disabled for student accounts.'
              : 'Generate, preview, publish, print, and export official Citizens’ SS Progressive Termly Report Forms.'}
          </p>
        </div>

        {isAdmin && previewCards.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-navy-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-sky-600" />
              Print ({previewCards.length})
            </button>
            <button
              type="button"
              onClick={() => {
                const withPhotos = previewCards.map((c) => ({
                  ...c,
                  photoUrl: c.photoUrl || students.find((s) => s.id === c.studentId)?.photoUrl || '',
                }));
                if (withPhotos.length === 1) {
                  void downloadSingleReportCardPdf(withPhotos[0], defaultSettings, subjects);
                } else {
                  void downloadBulkReportCardsPdf(withPhotos, defaultSettings, `${selectedClass}_${currentTermName}`, subjects);
                }
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {previewCards.length === 1 ? 'Download PDF' : `Bulk Download PDF (${previewCards.length})`}
            </button>
          </div>
        )}
      </div>

      {/* Scope Selection */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Academic Year</label>
            <select
              value={selectedYearId}
              onChange={(e) => setSelectedYearId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Term</label>
            <select
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {terms
                .filter((t) => t.academicYearId === selectedYearId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
          {!isStudent && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Class</label>
                <select
                  value={selectedClass}
                  onChange={(e) => {
                    setSelectedClass(e.target.value as ClassCode);
                    setSelectedStudentId('ALL');
                    setPreviewCards([]);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Target Student(s)</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">Entire {selectedClass} Class ({classStudents.length})</option>
                  {classStudents.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={handleGeneratePreview}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              Generate &amp; Preview
            </button>
            <button
              type="button"
              onClick={handleLoadReprints}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-navy-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Load Saved / Reprints ({savedCards.length})
            </button>
            {previewCards.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handlePublishSelected(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  Publish Final Report Card(s)
                </button>
                {previewCards.some((c) => (c.missingFields?.length || 0) > 0) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handlePublishSelected(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300 hover:bg-amber-200 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    Publish With Admin Override
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rendered Official Report Cards */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Loading report cards...
        </div>
      ) : previewCards.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2 no-print">
          <p className="text-sm font-semibold text-slate-800">
            {isStudent
              ? 'No published report card is available for the selected term yet.'
              : 'Select a Class and click "Generate & Preview" to inspect progressive termly report cards.'}
          </p>
          <p className="text-xs text-slate-500">
            Each report card strictly enforces Class, Term, and Academic Year isolation. Missing marks are never displayed as zero.
          </p>
        </div>
      ) : (
        <div className="space-y-8 print-only-container">
          {previewCards.map((card) => (
            <div key={card.id} className="space-y-2">
              {/* Incomplete Data Warning (Admin only, non-printing) */}
              {isAdmin && card.missingFields && card.missingFields.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2 no-print">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      Incomplete or Unapproved Data Detected for {card.studentName} ({card.missingFields.length} item(s)):
                    </p>
                    <p className="mt-0.5 text-amber-800">
                      {card.missingFields.slice(0, 6).join(' · ')}
                      {card.missingFields.length > 6 ? ` · +${card.missingFields.length - 6} more` : ''}
                    </p>
                  </div>
                </div>
              )}

              {/* Non-printing status bar */}
              <div className="flex items-center justify-between text-xs text-slate-600 px-1 no-print">
                <span className="font-semibold text-navy-900">
                  {card.studentName} · <span className="font-mono">{card.classCode}</span>
                </span>
                {card.published ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Published
                  </span>
                ) : (
                  <span className="font-semibold text-amber-700">Draft Preview</span>
                )}
              </div>

              {/* Official Citizens' Secondary School Report Card Sheet */}
              <article className="report-card-page bg-white border-2 border-navy-900 rounded-lg p-6 sm:p-8 text-slate-900">
                {/* Official School Header */}
                <header className="grid grid-cols-[96px_1fr_96px] sm:grid-cols-[110px_1fr_110px] items-center gap-3 sm:gap-4 pb-4 border-b-2 border-navy-900">
                  <SchoolCrest
                    fitContainer
                    className="w-[96px] h-[116px] sm:w-[110px] sm:h-[132px]"
                  />
                  <div className="text-center min-w-0">
                    <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight text-navy-900 uppercase">
                      {defaultSettings.schoolName}
                    </h2>
                    <p className="text-xs font-bold tracking-widest text-sky-700 uppercase mt-0.5">
                      MOTTO: “{defaultSettings.motto}”
                    </p>
                    <p className="text-[11px] sm:text-xs text-slate-600 mt-1">
                      {defaultSettings.address} · Tel: {defaultSettings.phones} · Email: {defaultSettings.email}
                    </p>
                  </div>
                  {(() => {
                    const photoSrc =
                      card.photoUrl || students.find((s) => s.id === card.studentId)?.photoUrl || '';
                    if (photoSrc) {
                      return (
                        <div
                          aria-label={`${card.studentName} passport photo`}
                          className="w-[96px] h-[116px] sm:w-[110px] sm:h-[132px] border-2 border-navy-900 rounded overflow-hidden bg-white shrink-0 ml-auto"
                        >
                          <img
                            src={photoSrc}
                            alt={card.studentName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      );
                    }
                    return (
                      <div
                        aria-label="Student passport photo space"
                        className="w-[96px] h-[116px] sm:w-[110px] sm:h-[132px] border-2 border-dashed border-navy-900/60 bg-slate-50/70 rounded flex flex-col items-center justify-center text-center p-2 shrink-0 ml-auto select-none"
                      >
                        <div className="w-9 h-9 rounded-full border border-slate-300 bg-white flex items-center justify-center mb-1.5">
                          <User className="w-5 h-5 text-slate-400" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-navy-900 leading-tight">
                          Student Photo
                        </span>
                        <span className="text-[9px] text-slate-500 leading-tight mt-0.5">
                          Passport Size
                        </span>
                      </div>
                    );
                  })()}
                </header>

                <div className="py-2.5 text-center border-b border-slate-300 bg-navy-900 text-white my-3 rounded-sm">
                  <h3 className="text-sm font-bold tracking-wider uppercase">
                    PROGRESSIVE TERMLY REPORT FORM
                  </h3>
                </div>

                {/* Student Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded text-xs mb-4">
                  <div>
                    <span className="font-semibold text-slate-600">Student Name: </span>
                    <span className="font-bold text-navy-900">{card.studentName}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-600">Gender: </span>
                    <span className="font-semibold">{card.gender || '—'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-600">School Pay Code: </span>
                    <span className="font-mono font-semibold">{card.schoolPayCode || '—'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-600">Class: </span>
                    <span className="font-bold text-navy-900">
                      {card.classCode}
                      {card.stream ? ` (${card.stream})` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-600">Term: </span>
                    <span className="font-semibold">{card.termName || card.termId}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-600">Academic Year: </span>
                    <span className="font-semibold">{card.academicYearName || card.academicYearId}</span>
                  </div>
                </div>

                {/* Subject Assessment Table */}
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-left text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-navy-900 text-white">
                        <th className="border border-slate-400 px-2.5 py-2">Subject</th>
                        <th className="border border-slate-400 px-2 py-2 text-right">Cum. AI (0-3)</th>
                        <th className="border border-slate-400 px-2 py-2 text-center">Identifier</th>
                        <th className="border border-slate-400 px-2 py-2">AI Descriptor</th>
                        <th className="border border-slate-400 px-2 py-2 text-right">Formative (20%)</th>
                        <th className="border border-slate-400 px-2 py-2 text-right">Summative (80%)</th>
                        <th className="border border-slate-400 px-2 py-2 text-right">Total (100%)</th>
                        <th className="border border-slate-400 px-2 py-2 text-center">Grade</th>
                        <th className="border border-slate-400 px-2 py-2">Descriptor</th>
                        <th className="border border-slate-400 px-2 py-2 text-center">Tr. Initials</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortReportCardRows(card.subjectResults, subjects).map((row) => (
                        <tr key={row.subjectId} className="even:bg-slate-50/70">
                          <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-navy-900">
                            {row.subjectName}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">
                            {row.cumulativeAiScore !== null ? row.cumulativeAiScore.toFixed(1) : 'Pending'}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">
                            {row.identifier ?? '—'}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5">{row.aiDescriptor || '—'}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">
                            {row.formativeScore !== null ? row.formativeScore.toFixed(1) : '—'}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">
                            {row.summativeScore !== null ? row.summativeScore.toFixed(1) : 'Pending'}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right font-bold tabular-nums">
                            {row.totalScore !== null ? row.totalScore.toFixed(1) : '—'}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-center font-bold text-navy-900">
                            {row.grade || '—'}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5">{row.descriptor || '—'}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                            {row.teacherInitials || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Attendance & Performance Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-xs">
                  <div className="border border-slate-300 rounded p-3 bg-slate-50 space-y-1">
                    <p className="font-bold text-navy-900 uppercase text-[11px]">Attendance Record</p>
                    <p>
                      Days Present: <span className="font-bold tabular-nums">{card.attendance?.daysPresent ?? 0}</span> ·
                      Days Absent: <span className="font-bold tabular-nums">{card.attendance?.daysAbsent ?? 0}</span> ·
                      Total Days: <span className="font-bold tabular-nums">{card.attendance?.totalDays ?? 0}</span>
                    </p>
                  </div>
                  <div className="border border-slate-300 rounded p-3 bg-slate-50 space-y-1">
                    <p className="font-bold text-navy-900 uppercase text-[11px]">Overall Performance</p>
                    <p>
                      Avg. Total:{' '}
                      <span className="font-bold tabular-nums">
                        {card.summary?.averageTotalScore !== null && card.summary?.averageTotalScore !== undefined
                          ? `${card.summary.averageTotalScore}%`
                          : '—'}
                      </span>{' '}
                      · Grade Average: <span className="font-bold">{card.summary?.averageGrade || '—'}</span> · Position:{' '}
                      <span className="font-bold">{card.summary?.position || '—'}</span> · Level:{' '}
                      <span className="font-semibold">{card.summary?.level || '—'}</span> · Result:{' '}
                      <span className="font-bold text-navy-900">{card.summary?.result || '—'}</span>
                    </p>
                  </div>
                </div>

                {/* Project Scores */}
                <div className="border border-slate-300 rounded p-3 mb-4 text-xs space-y-1">
                  <p className="font-bold text-navy-900 uppercase text-[11px]">Project Work Assessment</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div>
                      <span className="text-slate-500">Subject: </span>
                      <span className="font-medium">{card.project?.subject || 'Art & Design'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Project Title: </span>
                      <span className="font-medium">{card.project?.title || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Phase: </span>
                      <span className="font-medium">{card.project?.phase || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Score: </span>
                      <span className="font-bold tabular-nums">
                        {card.project?.score !== null && card.project?.score !== undefined ? card.project.score : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Supervisor: </span>
                      <span className="font-medium">{card.project?.supervisorName || '—'}</span>
                    </div>
                  </div>
                  {card.project?.remarks && (
                    <p>
                      <span className="text-slate-500">Remarks: </span>
                      {card.project.remarks}
                    </p>
                  )}
                </div>

                {/* Comments, Fees & Approvals */}
                <div className="border border-slate-300 rounded divide-y divide-slate-200 text-xs mb-4">
                  <div className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p>
                      <span className="font-bold text-navy-900">Class Teacher&apos;s Comment: </span>
                      {card.summary?.classTeacherComment || '—'}
                    </p>
                    <p className="text-slate-600 shrink-0">
                      Name &amp; Initial: <span className="font-semibold">{card.summary?.classTeacherName || '—'}</span> (
                      {card.summary?.classTeacherInitials || '—'})
                    </p>
                  </div>
                  <div className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p>
                      <span className="font-bold text-navy-900">Bursar&apos;s Comment: </span>
                      {card.summary?.bursarComment || card.fees?.bursarComment || '—'} · Fees Required:{' '}
                      <span className="font-semibold tabular-nums">{formatUgx(card.fees?.feesRequired)}</span> · Balance:{' '}
                      <span className="font-bold tabular-nums text-navy-900">{formatUgx(card.fees?.balance)}</span>
                    </p>
                    <p className="text-slate-600 shrink-0">
                      Bursar: <span className="font-semibold">{card.summary?.bursarName || '—'}</span> (
                      {card.summary?.bursarInitials || '—'})
                    </p>
                  </div>
                  <div className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p>
                      <span className="font-bold text-navy-900">Head Teacher&apos;s Comment: </span>
                      {card.summary?.headTeacherComment || '—'}
                    </p>
                    <p className="text-slate-600 shrink-0">
                      Head Teacher: <span className="font-semibold">{card.summary?.headTeacherName || '—'}</span> · Signature: ____________
                    </p>
                  </div>
                </div>

                {/* Footer: Term Dates, Validity Notice & Official Stamp Area */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center pt-2 text-xs">
                  <div className="sm:col-span-2 space-y-1.5">
                    <p>
                      <span className="font-bold text-navy-900">This Term Has: </span>
                      {card.thisTermHas || '—'} · <span className="font-bold text-navy-900">Next Term Begins: </span>
                      {card.nextTermBegins || '—'}
                    </p>
                    <p className="font-bold text-navy-900">
                      This result form is invalid without the official stamp of the Head Teacher or Deputy Head Teacher.
                    </p>
                    <p className="text-[11px] text-slate-500 italic">
                      Overleaf: Grade Scale (A: 80–100, B: 65–79, C: 50–64, D: 35–49, E: 0–34) · AI Identifiers: 1=Basic, 2=Moderate, 3=Outstanding.
                    </p>
                  </div>
                  <div className="border-2 border-dashed border-slate-400 rounded p-4 text-center text-[11px] font-semibold text-slate-500 uppercase">
                    Official School Stamp
                  </div>
                </div>
              </article>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
