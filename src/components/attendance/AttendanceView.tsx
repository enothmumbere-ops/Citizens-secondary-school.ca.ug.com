import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Check, Download, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchAttendance, fetchStudents, saveAttendanceBatch } from '../../services/firestoreService';
import { AttendanceRecord, ClassCode, Student } from '../../types/sims';
import { useToast } from '../common/Toast';

export const AttendanceView: React.FC = () => {
  const { userAccount, schoolSettings, years, terms, classes } = useAuth();
  const { showToast } = useToast();

  const role = userAccount?.role || 'pending';
  const uid = userAccount?.uid || '';
  const isStudent = role === 'student';

  const [selectedYearId, setSelectedYearId] = useState(
    schoolSettings?.currentAcademicYearId || years[0]?.id || 'yr_2026'
  );
  const [selectedTermId, setSelectedTermId] = useState(
    schoolSettings?.currentTermId || terms[0]?.id || 'term_2026_3'
  );
  const [selectedClass, setSelectedClass] = useState<ClassCode>('S.1');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [dailyState, setDailyState] = useState<Record<string, 'present' | 'absent'>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [stList, attList] = await Promise.all([
        fetchStudents(role, uid),
        fetchAttendance(role, uid, {
          academicYearId: selectedYearId,
          termId: selectedTermId,
          ...(isStudent ? {} : { classCode: selectedClass }),
        }),
      ]);
      setStudents(stList);
      setRecords(attList);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load attendance.', 'error');
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

  useEffect(() => {
    const map: Record<string, 'present' | 'absent'> = {};
    for (const st of classStudents) {
      const match = records.find((r) => r.studentId === st.id && r.date === selectedDate);
      map[st.id] = match ? match.status : 'present';
    }
    setDailyState(map);
  }, [classStudents, records, selectedDate]);

  const termSummaries = useMemo(() => {
    const map: Record<string, { present: number; absent: number; total: number }> = {};
    for (const r of records) {
      if (!map[r.studentId]) map[r.studentId] = { present: 0, absent: 0, total: 0 };
      map[r.studentId].total += 1;
      if (r.status === 'present') map[r.studentId].present += 1;
      else map[r.studentId].absent += 1;
    }
    return map;
  }, [records]);

  const handleSaveRollCall = async () => {
    if (classStudents.length === 0) return;
    setSaving(true);
    try {
      await saveAttendanceBatch(
        classStudents.map((st) => ({
          studentId: st.id,
          studentName: st.fullName,
          studentAuthUid: st.studentAuthUid || '',
          classCode: st.classCode,
          stream: st.stream || 'Main',
          academicYearId: selectedYearId,
          termId: selectedTermId,
          date: selectedDate,
          status: dailyState[st.id] || 'present',
          recordedByUid: uid,
          recordedByName: userAccount?.displayName || '',
          authorizedTeacherUids: st.authorizedTeacherUids,
        }))
      );
      showToast(`Attendance saved for ${classStudents.length} students on ${selectedDate}.`, 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save attendance.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      ['Student Name', 'Class', 'Days Present', 'Days Absent', 'Total Recorded Days'],
      ...classStudents.map((st) => {
        const s = termSummaries[st.id] || { present: 0, absent: 0, total: 0 };
        return [st.fullName, st.classCode, String(s.present), String(s.absent), String(s.total)];
      }),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CSS_Attendance_${selectedClass}_${selectedTermId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isStudent) {
    const presentCount = records.filter((r) => r.status === 'present').length;
    const absentCount = records.filter((r) => r.status === 'absent').length;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">My Attendance Record</h1>
          <p className="text-sm text-slate-600">
            Days Present: <span className="font-bold text-emerald-700 tabular-nums">{presentCount}</span> · Days Absent:{' '}
            <span className="font-bold text-amber-700 tabular-nums">{absentCount}</span> · Total Recorded:{' '}
            <span className="font-bold text-navy-900 tabular-nums">{records.length}</span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {records.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No attendance logs recorded for this term yet.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Class</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-mono text-xs">{r.date}</td>
                    <td className="px-5 py-3">{r.classCode}</td>
                    <td className="px-5 py-3 capitalize font-medium">
                      {r.status === 'present' ? (
                        <span className="text-emerald-700">Present</span>
                      ) : (
                        <span className="text-red-700">Absent</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{r.recordedByName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Daily Attendance &amp; Termly Summaries</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Actual attendance figures recorded here populate each student&apos;s progressive report card.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-navy-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4 text-sky-600" />
          Export Attendance CSV
        </button>
      </div>

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
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Roll-Call Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-sky-600" />
            <h2 className="text-base font-bold text-navy-900">
              {selectedClass} Roll Call · {selectedDate}
            </h2>
          </div>
          <button
            type="button"
            disabled={saving || classStudents.length === 0}
            onClick={handleSaveRollCall}
            className="px-4 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Roll Call'}
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading class roster...</div>
        ) : classStudents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No active students in {selectedClass}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Student Name</th>
                  <th className="px-5 py-3">Mark for {selectedDate}</th>
                  <th className="px-5 py-3 text-right">Term Present</th>
                  <th className="px-5 py-3 text-right">Term Absent</th>
                  <th className="px-5 py-3 text-right">Total Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {classStudents.map((st) => {
                  const status = dailyState[st.id] || 'present';
                  const summary = termSummaries[st.id] || { present: 0, absent: 0, total: 0 };
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-semibold text-navy-900">{st.fullName}</td>
                      <td className="px-5 py-3">
                        <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setDailyState((prev) => ({ ...prev, [st.id]: 'present' }))}
                            className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                              status === 'present'
                                ? 'bg-emerald-600 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => setDailyState((prev) => ({ ...prev, [st.id]: 'absent' }))}
                            className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                              status === 'absent'
                                ? 'bg-red-600 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <X className="w-3.5 h-3.5" />
                            Absent
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-emerald-700 font-semibold">
                        {summary.present}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-amber-700 font-semibold">
                        {summary.absent}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{summary.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
