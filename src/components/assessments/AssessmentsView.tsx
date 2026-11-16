import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle, Lock, Save, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAssessments,
  fetchStudents,
  fetchStudentSummaries,
  fetchTeacherAssignments,
  saveAssessmentRecord,
  saveStudentTermSummary,
} from '../../services/firestoreService';
import {
  AssessmentRecord,
  ClassCode,
  Student,
  StudentTermSummary,
  TeacherAssignment,
} from '../../types/sims';
import {
  calculateSubjectResult,
  DEFAULT_GRADING_CONFIG,
  roundToOne,
  validateScoreInputs,
} from '../../utils/grading';
import { useToast } from '../common/Toast';

interface DraftScoreRow {
  cumulativeAiScore: string;
  summativeScore: string;
  teacherInitials: string;
  teacherComment: string;
}

export const AssessmentsView: React.FC = () => {
  const { userAccount, schoolSettings, years, terms, classes, subjects } = useAuth();
  const { showToast } = useToast();

  const role = userAccount?.role || 'pending';
  const uid = userAccount?.uid || '';
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const [selectedYearId, setSelectedYearId] = useState(
    schoolSettings?.currentAcademicYearId || years[0]?.id || 'yr_2026'
  );
  const [selectedTermId, setSelectedTermId] = useState(
    schoolSettings?.currentTermId || terms[0]?.id || 'term_2026_3'
  );
  const [selectedClass, setSelectedClass] = useState<ClassCode>('S.1');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'scores' | 'summaries'>('scores');

  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [records, setRecords] = useState<AssessmentRecord[]>([]);
  const [summaries, setSummaries] = useState<StudentTermSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftScoreRow>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const gradingConfig = schoolSettings?.gradingConfig || DEFAULT_GRADING_CONFIG;

  const availableSubjects = useMemo(() => {
    const classSubjects = subjects.filter((s) => s.allowedClasses.includes(selectedClass));
    if (isTeacher) {
      const assignedIds = new Set(
        assignments.filter((a) => a.classCode === selectedClass).map((a) => a.subjectId)
      );
      return classSubjects.filter((s) => assignedIds.has(s.id));
    }
    return classSubjects;
  }, [subjects, selectedClass, isTeacher, assignments]);

  useEffect(() => {
    if (availableSubjects.length > 0 && !availableSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(availableSubjects[0].id);
    }
  }, [availableSubjects, selectedSubjectId]);

  const loadData = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [stList, asgList, recList, sumList] = await Promise.all([
        fetchStudents(role, uid),
        isAdmin || isTeacher ? fetchTeacherAssignments(role, uid) : Promise.resolve([]),
        fetchAssessments(role, uid, {
          academicYearId: selectedYearId,
          termId: selectedTermId,
          ...(isStudent ? {} : { classCode: selectedClass }),
        }),
        fetchStudentSummaries(role, uid, {
          academicYearId: selectedYearId,
          termId: selectedTermId,
          ...(isStudent ? {} : { classCode: selectedClass }),
        }),
      ]);
      setStudents(stList);
      setAssignments(asgList);
      setRecords(recList);
      setSummaries(sumList);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load assessment records.', 'error');
    } finally {
      setLoading(false);
    }
  }, [uid, role, isAdmin, isTeacher, isStudent, selectedYearId, selectedTermId, selectedClass, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const classStudents = useMemo(
    () => students.filter((s) => s.classCode === selectedClass && s.status === 'active'),
    [students, selectedClass]
  );

  // Sync draft state when records or subject changes
  useEffect(() => {
    const nextDrafts: Record<string, DraftScoreRow> = {};
    for (const st of classStudents) {
      const existing = records.find(
        (r) => r.studentId === st.id && r.subjectId === selectedSubjectId
      );
      nextDrafts[st.id] = {
        cumulativeAiScore:
          existing?.cumulativeAiScore !== null && existing?.cumulativeAiScore !== undefined
            ? String(existing.cumulativeAiScore)
            : '',
        summativeScore:
          existing?.summativeScore !== null && existing?.summativeScore !== undefined
            ? String(existing.summativeScore)
            : '',
        teacherInitials: existing?.teacherInitials || userAccount?.initials || '',
        teacherComment: existing?.teacherComment || '',
      };
    }
    setDrafts(nextDrafts);
  }, [classStudents, records, selectedSubjectId, userAccount?.initials]);

  const handleSaveRow = async (
    st: Student,
    targetStatus: 'draft' | 'submitted' | 'approved'
  ) => {
    const subj = subjects.find((s) => s.id === selectedSubjectId);
    if (!subj) return;

    const existing = records.find(
      (r) => r.studentId === st.id && r.subjectId === subj.id
    );
    if (isTeacher && existing?.status === 'approved') {
      showToast('Approved marks are locked and can only be amended by an Administrator.', 'error');
      return;
    }

    const draft = drafts[st.id] || {
      cumulativeAiScore: '',
      summativeScore: '',
      teacherInitials: userAccount?.initials || '',
      teacherComment: '',
    };

    const aiNum = draft.cumulativeAiScore.trim() === '' ? null : Number(draft.cumulativeAiScore);
    const sumNum = draft.summativeScore.trim() === '' ? null : Number(draft.summativeScore);

    const errors = validateScoreInputs(aiNum, sumNum, gradingConfig);
    if (errors.length > 0) {
      showToast(errors[0], 'error');
      return;
    }

    const calc = calculateSubjectResult(aiNum, sumNum, gradingConfig);
    setSavingId(st.id);
    try {
      await saveAssessmentRecord(
        {
          id: existing?.id,
          studentId: st.id,
          studentName: st.fullName,
          studentAuthUid: st.studentAuthUid || '',
          schoolPayCode: st.schoolPayCode,
          classCode: st.classCode,
          stream: st.stream || 'Main',
          academicYearId: selectedYearId,
          termId: selectedTermId,
          subjectId: subj.id,
          subjectName: subj.name,
          cumulativeAiScore: aiNum,
          identifier: calc.identifier,
          aiDescriptor: calc.aiDescriptor,
          formativeScore: calc.formativeScore,
          summativeScore: sumNum,
          totalScore: calc.totalScore,
          grade: calc.grade,
          descriptor: calc.descriptor,
          teacherInitials: draft.teacherInitials.trim().toUpperCase(),
          teacherComment: draft.teacherComment.trim(),
          teacherUid: uid,
          authorizedTeacherUids: st.authorizedTeacherUids,
          status: targetStatus,
          ...(targetStatus === 'approved' ? { approvedBy: uid } : {}),
        },
        isAdmin ? 'admin' : 'teacher'
      );
      showToast(
        `${st.fullName} · ${subj.name} saved (${targetStatus}).`,
        'success'
      );
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleComputePositions = async () => {
    if (!isAdmin) return;
    try {
      const studentTotals = classStudents.map((st) => {
        const stRecs = records.filter(
          (r) => r.studentId === st.id && r.totalScore !== null && r.totalScore !== undefined
        );
        const avgTotal =
          stRecs.length > 0
            ? roundToOne(stRecs.reduce((acc, r) => acc + (r.totalScore || 0), 0) / stRecs.length)
            : null;
        const aiRecs = records.filter(
          (r) => r.studentId === st.id && r.identifier !== null && r.identifier !== undefined
        );
        const avgAiId =
          aiRecs.length > 0
            ? roundToOne(aiRecs.reduce((acc, r) => acc + (r.identifier || 0), 0) / aiRecs.length)
            : null;
        const avgBand =
          avgTotal !== null
            ? gradingConfig.gradeBands.find((b) => avgTotal >= b.minScore && avgTotal <= b.maxScore)
            : undefined;
        return {
          student: st,
          avgTotal,
          avgAiId,
          avgGrade: avgBand?.grade || '',
          level: avgBand?.levelLabel || '',
        };
      });

      const ranked = [...studentTotals].sort((a, b) => (b.avgTotal ?? -1) - (a.avgTotal ?? -1));
      const totalInClass = ranked.filter((r) => r.avgTotal !== null).length;

      for (let i = 0; i < ranked.length; i++) {
        const item = ranked[i];
        const existingSum = summaries.find((s) => s.studentId === item.student.id);
        await saveStudentTermSummary(
          {
            id: existingSum?.id,
            studentId: item.student.id,
            studentName: item.student.fullName,
            gender: item.student.gender,
            schoolPayCode: item.student.schoolPayCode,
            studentAuthUid: item.student.studentAuthUid || '',
            classCode: item.student.classCode,
            stream: item.student.stream || 'Main',
            academicYearId: selectedYearId,
            termId: selectedTermId,
            averageAiIdentifier: item.avgAiId,
            averageAiDescriptor:
              item.avgAiId !== null
                ? item.avgAiId >= 2.5
                  ? 'Outstanding'
                  : item.avgAiId >= 1.5
                  ? 'Moderate'
                  : 'Basic'
                : '',
            averageTotalScore: item.avgTotal,
            averageGrade: item.avgGrade,
            averageFinal: item.avgTotal,
            level: item.level,
            position: item.avgTotal !== null ? `${i + 1} of ${totalInClass}` : '',
            result: item.avgTotal !== null ? (item.avgTotal >= 35 ? 'Promoted / Passed' : 'Needs Support') : '',
            classTeacherComment: existingSum?.classTeacherComment || '',
            classTeacherName: existingSum?.classTeacherName || '',
            classTeacherInitials: existingSum?.classTeacherInitials || '',
            bursarComment: existingSum?.bursarComment || '',
            headTeacherComment: existingSum?.headTeacherComment || '',
            projectSubject: existingSum?.projectSubject || 'Art & Design',
            projectTitle: existingSum?.projectTitle || '',
            projectPhase: existingSum?.projectPhase || '',
            projectScore: existingSum?.projectScore ?? null,
            projectRemarks: existingSum?.projectRemarks || '',
            projectSupervisor: existingSum?.projectSupervisor || '',
            authorizedTeacherUids: item.student.authorizedTeacherUids,
            status: existingSum?.status || 'ready',
          },
          'admin'
        );
      }
      await loadData();
      showToast(`Computed positions and averages for ${totalInClass} ranked students in ${selectedClass}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Position calculation failed.', 'error');
    }
  };

  if (isStudent) {
    const approvedOnly = records.filter((r) => r.status === 'approved');
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">My Academic Assessment Results</h1>
          <p className="text-sm text-slate-600">Approved continuous AI (20%) and end-of-term summative (80%) results.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {approvedOnly.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No approved subject results are available for this term yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3 text-right">Cum. AI (0-3)</th>
                    <th className="px-4 py-3 text-center">ID</th>
                    <th className="px-4 py-3">AI Descriptor</th>
                    <th className="px-4 py-3 text-right">Formative (20%)</th>
                    <th className="px-4 py-3 text-right">Summative (80%)</th>
                    <th className="px-4 py-3 text-right">Total (100%)</th>
                    <th className="px-4 py-3 text-center">Grade</th>
                    <th className="px-4 py-3">Descriptor</th>
                    <th className="px-4 py-3 text-center">Initials</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {approvedOnly.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-semibold text-navy-900">{r.subjectName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.cumulativeAiScore ?? '—'}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{r.identifier ?? '—'}</td>
                      <td className="px-4 py-3">{r.aiDescriptor || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.formativeScore ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.summativeScore ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{r.totalScore ?? '—'}</td>
                      <td className="px-4 py-3 text-center font-bold text-navy-900">{r.grade || '—'}</td>
                      <td className="px-4 py-3">{r.descriptor || '—'}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs">{r.teacherInitials || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Assessments &amp; Mark Entry</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Cumulative AI (0–3 → 20% Formative) + Summative EOY (0–80%) = Total (100%).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveSubTab('scores')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                activeSubTab === 'scores' ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Subject Mark Sheet
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('summaries')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                activeSubTab === 'summaries' ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Projects, Comments &amp; Positions
            </button>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={handleComputePositions}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Award className="w-4 h-4" />
              Compute Positions
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Class</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value as ClassCode)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </div>
        {activeSubTab === 'scores' && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {availableSubjects.length === 0 ? (
                <option value="">No assigned subjects for {selectedClass}</option>
              ) : (
                availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </div>
        )}
      </div>

      {/* Mark Entry Sheet */}
      {activeSubTab === 'scores' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading mark sheet...</div>
          ) : availableSubjects.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              You do not have an assigned subject in {selectedClass}. Contact the Administrator for subject allocation.
            </div>
          ) : classStudents.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No active students found in {selectedClass}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-3 py-3 w-28">Cum. AI (0–3)</th>
                    <th className="px-3 py-3 text-center">ID</th>
                    <th className="px-3 py-3 text-right">Form. (20%)</th>
                    <th className="px-3 py-3 w-28">Summ. (0–80)</th>
                    <th className="px-3 py-3 text-right">Total (100%)</th>
                    <th className="px-3 py-3 text-center">Grade</th>
                    <th className="px-3 py-3">Descriptor</th>
                    <th className="px-3 py-3 w-24">Initials</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {classStudents.map((st) => {
                    const existing = records.find(
                      (r) => r.studentId === st.id && r.subjectId === selectedSubjectId
                    );
                    const locked = isTeacher && existing?.status === 'approved';
                    const d = drafts[st.id] || {
                      cumulativeAiScore: '',
                      summativeScore: '',
                      teacherInitials: '',
                      teacherComment: '',
                    };
                    const aiNum = d.cumulativeAiScore.trim() === '' ? null : Number(d.cumulativeAiScore);
                    const sumNum = d.summativeScore.trim() === '' ? null : Number(d.summativeScore);
                    const live = calculateSubjectResult(aiNum, sumNum, gradingConfig);

                    return (
                      <tr key={st.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-navy-900">{st.fullName}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{st.schoolPayCode || st.studentNumber}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            max={3}
                            disabled={locked}
                            value={d.cumulativeAiScore}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [st.id]: { ...d, cumulativeAiScore: e.target.value },
                              }))
                            }
                            placeholder="0–3"
                            className="w-20 px-2 py-1.5 border border-slate-300 rounded text-right tabular-nums disabled:bg-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums font-medium">
                          {live.identifier ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {live.formativeScore !== null ? live.formativeScore.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            max={80}
                            disabled={locked}
                            value={d.summativeScore}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [st.id]: { ...d, summativeScore: e.target.value },
                              }))
                            }
                            placeholder="0–80"
                            className="w-20 px-2 py-1.5 border border-slate-300 rounded text-right tabular-nums disabled:bg-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums text-navy-900">
                          {live.totalScore !== null ? live.totalScore.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-navy-900">
                          {live.grade || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">{live.descriptor || '—'}</td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            maxLength={8}
                            disabled={locked}
                            value={d.teacherInitials}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [st.id]: { ...d, teacherInitials: e.target.value.toUpperCase() },
                              }))
                            }
                            placeholder="INIT"
                            className="w-16 px-2 py-1.5 border border-slate-300 rounded text-center font-mono uppercase disabled:bg-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2.5 capitalize font-medium">
                          {existing?.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <Lock className="w-3 h-3" /> Approved
                            </span>
                          ) : existing?.status === 'submitted' ? (
                            <span className="text-sky-700">Submitted</span>
                          ) : (
                            <span className="text-slate-500">Draft</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            {!locked && (
                              <>
                                <button
                                  type="button"
                                  disabled={savingId === st.id}
                                  onClick={() => handleSaveRow(st, 'draft')}
                                  className="p-1.5 text-slate-600 hover:text-navy-900 hover:bg-slate-100 rounded"
                                  title="Save Draft"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={savingId === st.id}
                                  onClick={() => handleSaveRow(st, 'submitted')}
                                  className="p-1.5 text-sky-700 hover:bg-sky-50 rounded"
                                  title="Submit for Approval"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                disabled={savingId === st.id}
                                onClick={() => handleSaveRow(st, 'approved')}
                                className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
                                title="Approve & Lock Marks"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Projects, Comments & Positions Subtab */}
      {activeSubTab === 'summaries' && (
        <SummariesEditor
          students={classStudents}
          summaries={summaries}
          selectedYearId={selectedYearId}
          selectedTermId={selectedTermId}
          isAdmin={isAdmin}
          onSaved={loadData}
        />
      )}
    </div>
  );
};

interface SummariesEditorProps {
  students: Student[];
  summaries: StudentTermSummary[];
  selectedYearId: string;
  selectedTermId: string;
  isAdmin: boolean;
  onSaved: () => Promise<void>;
}

const SummariesEditor: React.FC<SummariesEditorProps> = ({
  students,
  summaries,
  selectedYearId,
  selectedTermId,
  isAdmin,
  onSaved,
}) => {
  const { showToast } = useToast();
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || '');

  useEffect(() => {
    if (students.length > 0 && !students.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  const student = students.find((s) => s.id === selectedStudentId);
  const currentSum = summaries.find((s) => s.studentId === selectedStudentId);

  const [form, setForm] = useState({
    classTeacherComment: '',
    classTeacherName: '',
    classTeacherInitials: '',
    headTeacherComment: '',
    headTeacherName: '',
    projectSubject: 'Art & Design',
    projectTitle: '',
    projectPhase: '',
    projectScore: '',
    projectRemarks: '',
    projectSupervisor: '',
    position: '',
    result: '',
  });

  useEffect(() => {
    setForm({
      classTeacherComment: currentSum?.classTeacherComment || '',
      classTeacherName: currentSum?.classTeacherName || '',
      classTeacherInitials: currentSum?.classTeacherInitials || '',
      headTeacherComment: currentSum?.headTeacherComment || '',
      headTeacherName: currentSum?.headTeacherName || '',
      projectSubject: currentSum?.projectSubject || 'Art & Design',
      projectTitle: currentSum?.projectTitle || '',
      projectPhase: currentSum?.projectPhase || '',
      projectScore:
        currentSum?.projectScore !== null && currentSum?.projectScore !== undefined
          ? String(currentSum.projectScore)
          : '',
      projectRemarks: currentSum?.projectRemarks || '',
      projectSupervisor: currentSum?.projectSupervisor || '',
      position: currentSum?.position || '',
      result: currentSum?.result || '',
    });
  }, [currentSum, selectedStudentId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    try {
      await saveStudentTermSummary(
        {
          id: currentSum?.id,
          studentId: student.id,
          studentName: student.fullName,
          gender: student.gender,
          schoolPayCode: student.schoolPayCode,
          studentAuthUid: student.studentAuthUid || '',
          classCode: student.classCode,
          stream: student.stream || 'Main',
          academicYearId: selectedYearId,
          termId: selectedTermId,
          averageAiIdentifier: currentSum?.averageAiIdentifier ?? null,
          averageAiDescriptor: currentSum?.averageAiDescriptor || '',
          averageTotalScore: currentSum?.averageTotalScore ?? null,
          averageGrade: currentSum?.averageGrade || '',
          averageFinal: currentSum?.averageFinal ?? null,
          level: currentSum?.level || '',
          position: form.position,
          result: form.result,
          classTeacherComment: form.classTeacherComment,
          classTeacherName: form.classTeacherName,
          classTeacherInitials: form.classTeacherInitials.toUpperCase(),
          bursarComment: currentSum?.bursarComment || '',
          bursarName: currentSum?.bursarName || '',
          bursarInitials: currentSum?.bursarInitials || '',
          headTeacherComment: form.headTeacherComment,
          headTeacherName: form.headTeacherName,
          projectSubject: form.projectSubject,
          projectTitle: form.projectTitle,
          projectPhase: form.projectPhase,
          projectScore: form.projectScore.trim() === '' ? null : Number(form.projectScore),
          projectRemarks: form.projectRemarks,
          projectSupervisor: form.projectSupervisor,
          authorizedTeacherUids: student.authorizedTeacherUids,
          status: currentSum?.status || 'draft',
        },
        isAdmin ? 'admin' : 'teacher'
      );
      showToast(`Saved term summary and project record for ${student.fullName}.`, 'success');
      await onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed.', 'error');
    }
  };

  if (students.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
        No students available in the selected class.
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Select Student</label>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} ({s.schoolPayCode || s.studentNumber})
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-slate-600">
          Average Total: <span className="font-bold text-navy-900 tabular-nums">{currentSum?.averageTotalScore ?? '—'}</span> · Grade:{' '}
          <span className="font-bold text-navy-900">{currentSum?.averageGrade || '—'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200 pt-4">
        <div className="sm:col-span-3">
          <h3 className="text-sm font-bold text-navy-900">Project Assessment (Art &amp; Design / Co-Curricular)</h3>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Project Subject</label>
          <input
            type="text"
            value={form.projectSubject}
            onChange={(e) => setForm({ ...form, projectSubject: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Project Title</label>
          <input
            type="text"
            value={form.projectTitle}
            onChange={(e) => setForm({ ...form, projectTitle: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Project Phase</label>
          <input
            type="text"
            value={form.projectPhase}
            onChange={(e) => setForm({ ...form, projectPhase: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Project Score</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={form.projectScore}
            onChange={(e) => setForm({ ...form, projectScore: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Supervisor&apos;s Name</label>
          <input
            type="text"
            value={form.projectSupervisor}
            onChange={(e) => setForm({ ...form, projectSupervisor: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Project Remarks</label>
          <input
            type="text"
            value={form.projectRemarks}
            onChange={(e) => setForm({ ...form, projectRemarks: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200 pt-4">
        <div className="sm:col-span-3">
          <h3 className="text-sm font-bold text-navy-900">Class Teacher &amp; Head Teacher Comments</h3>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Class Teacher&apos;s Comment</label>
          <input
            type="text"
            value={form.classTeacherComment}
            onChange={(e) => setForm({ ...form, classTeacherComment: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Class Teacher Name / Initial</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Name"
              value={form.classTeacherName}
              onChange={(e) => setForm({ ...form, classTeacherName: e.target.value })}
              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              placeholder="Init."
              maxLength={8}
              value={form.classTeacherInitials}
              onChange={(e) => setForm({ ...form, classTeacherInitials: e.target.value })}
              className="w-20 px-2 py-2 text-sm border border-slate-300 rounded-lg text-center font-mono uppercase"
            />
          </div>
        </div>

        {isAdmin && (
          <>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Head Teacher&apos;s Comment</label>
              <input
                type="text"
                value={form.headTeacherComment}
                onChange={(e) => setForm({ ...form, headTeacherComment: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Position / Result</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Pos"
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="w-24 px-2 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Result"
                  value={form.result}
                  onChange={(e) => setForm({ ...form, result: e.target.value })}
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="px-5 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 cursor-pointer"
        >
          Save Summary &amp; Project Record
        </button>
      </div>
    </form>
  );
};
