import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Edit3, History, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAssessments,
  fetchStudents,
  fetchTeacherAssignments,
  saveStudent,
  syncAuthorizedTeachersForClass,
} from '../../services/firestoreService';
import { AssessmentRecord, ClassCode, Gender, Student } from '../../types/sims';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';

export const StudentsView: React.FC = () => {
  const { userAccount, classes, years, schoolSettings } = useAuth();
  const { showToast } = useToast();
  const role = userAccount?.role || 'pending';
  const uid = userAccount?.uid || '';
  const isAdmin = role === 'admin';

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('active');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [historyRecords, setHistoryRecords] = useState<AssessmentRecord[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    studentNumber: string;
    fullName: string;
    gender: Gender;
    schoolPayCode: string;
    dateOfBirth: string;
    admissionDate: string;
    classCode: ClassCode;
    stream: string;
    academicYearId: string;
    status: Student['status'];
    email: string;
  }>({
    studentNumber: '',
    fullName: '',
    gender: 'M',
    schoolPayCode: '',
    dateOfBirth: '',
    admissionDate: '',
    classCode: 'S.1',
    stream: 'Main',
    academicYearId: schoolSettings?.currentAcademicYearId || years[0]?.id || 'yr_2026',
    status: 'active',
    email: '',
  });

  const loadData = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const list = await fetchStudents(role, uid);
      setStudents(list);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load students.', 'error');
    } finally {
      setLoading(false);
    }
  }, [role, uid, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (classFilter !== 'ALL' && s.classCode !== classFilter) return false;
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.schoolPayCode.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q)
      );
    });
  }, [students, classFilter, statusFilter, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      studentNumber: `CSS-${new Date().getFullYear()}-${String(students.length + 1).padStart(3, '0')}`,
      fullName: '',
      gender: 'M',
      schoolPayCode: '',
      dateOfBirth: '',
      admissionDate: new Date().toISOString().slice(0, 10),
      classCode: 'S.1',
      stream: 'Main',
      academicYearId: schoolSettings?.currentAcademicYearId || years[0]?.id || 'yr_2026',
      status: 'active',
      email: '',
    });
    setModalOpen(true);
  };

  const openEdit = (st: Student) => {
    setEditing(st);
    setForm({
      studentNumber: st.studentNumber,
      fullName: st.fullName,
      gender: st.gender,
      schoolPayCode: st.schoolPayCode,
      dateOfBirth: st.dateOfBirth || '',
      admissionDate: st.admissionDate || '',
      classCode: st.classCode,
      stream: st.stream || 'Main',
      academicYearId: st.academicYearId,
      status: st.status,
      email: st.email || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.studentNumber.trim()) {
      showToast('Student Name and Student Number are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const assignments = await fetchTeacherAssignments(role, uid);
      const teacherUids = Array.from(
        new Set(
          assignments
            .filter((a) => a.classCode === form.classCode && a.teacherUid)
            .map((a) => a.teacherUid as string)
        )
      ).slice(0, 35);

      await saveStudent({
        id: editing?.id,
        ...form,
        authorizedTeacherUids: teacherUids,
        studentAuthUid: editing?.studentAuthUid || '',
      });
      await syncAuthorizedTeachersForClass(form.classCode, uid);
      showToast(editing ? 'Student record updated.' : 'Student registered successfully.', 'success');
      setModalOpen(false);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save student.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (st: Student, nextStatus: Student['status']) => {
    try {
      await saveStudent({
        ...st,
        status: nextStatus,
      });
      showToast(`${st.fullName} marked as ${nextStatus}.`, 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed.', 'error');
    }
  };

  const openHistory = async (st: Student) => {
    setHistoryStudent(st);
    try {
      const all = await fetchAssessments(role, uid);
      setHistoryRecords(all.filter((a) => a.studentId === st.id));
    } catch {
      setHistoryRecords([]);
    }
  };

  const selectedClassObj = classes.find((c) => c.code === form.classCode);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Student Registry</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Manage student admissions, class allocations, transfers, and academic history.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Register Student
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student name, School Pay Code, or ID..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="ALL">All Classes (S.1–S.6)</option>
          {classes.map((c) => (
            <option key={c.id} value={c.code}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="ALL">All Statuses</option>
          <option value="active">Active</option>
          <option value="transferred">Transferred</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading student records...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-slate-700">No students match the current filter.</p>
            <p className="text-xs text-slate-500">
              Register students individually or import your official Excel workbook under Excel Import &amp; Export.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Student ID</th>
                  <th className="px-5 py-3">Full Name</th>
                  <th className="px-5 py-3">Gender</th>
                  <th className="px-5 py-3">School Pay Code</th>
                  <th className="px-5 py-3">Class / Stream</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{st.studentNumber}</td>
                    <td className="px-5 py-3 font-semibold text-navy-900">{st.fullName}</td>
                    <td className="px-5 py-3 text-slate-700">{st.gender}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{st.schoolPayCode || '—'}</td>
                    <td className="px-5 py-3 text-slate-700">
                      {st.classCode}
                      {st.stream ? ` · ${st.stream}` : ''}
                    </td>
                    <td className="px-5 py-3 capitalize text-xs font-medium text-slate-700">{st.status}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openHistory(st)}
                          className="p-1.5 text-slate-600 hover:text-navy-900 hover:bg-slate-100 rounded-md"
                          title="Academic History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(st)}
                              className="p-1.5 text-slate-600 hover:text-navy-900 hover:bg-slate-100 rounded-md"
                              title="Edit / Transfer Student"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {st.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(st, 'inactive')}
                                className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-md"
                                title="Deactivate Student"
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(st, 'active')}
                                className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-md"
                                title="Activate Student"
                              >
                                <UserCheck className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit or Transfer Student' : 'Register New Student'}
        subtitle="Citizens’ Secondary School – Kasese Student Master Record"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Student ID Number *</label>
              <input
                type="text"
                required
                value={form.studentNumber}
                onChange={(e) => setForm({ ...form, studentNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">School Pay Code</label>
              <input
                type="text"
                value={form.schoolPayCode}
                onChange={(e) => setForm({ ...form, schoolPayCode: e.target.value })}
                placeholder="e.g. 1004523890"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gender *</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="M">Male (M)</option>
                <option value="F">Female (F)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Student Google Email (Portal Login)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="student@gmail.com"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Class *</label>
              <select
                value={form.classCode}
                onChange={(e) => setForm({ ...form, classCode: e.target.value as ClassCode })}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Stream</label>
              <select
                value={form.stream}
                onChange={(e) => setForm({ ...form, stream: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {(selectedClassObj?.streams.length ? selectedClassObj.streams : ['Main']).map((str) => (
                  <option key={str} value={str}>
                    {str}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Year *</label>
              <select
                value={form.academicYearId}
                onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Student['status'] })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="active">Active</option>
                <option value="transferred">Transferred</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Admission Date</label>
              <input
                type="date"
                value={form.admissionDate}
                onChange={(e) => setForm({ ...form, admissionDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {editing && editing.classCode !== form.classCode && (
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg flex items-start gap-2 text-xs text-navy-900">
              <ArrowRightLeft className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
              <span>
                Transferring from {editing.classCode} to {form.classCode}. Previous term assessment records remain preserved under {editing.classCode}.
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg disabled:opacity-60"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Register Student'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Academic History Modal */}
      <Modal
        open={Boolean(historyStudent)}
        onClose={() => setHistoryStudent(null)}
        title={`Academic History · ${historyStudent?.fullName || ''}`}
        subtitle={`${historyStudent?.classCode || ''} · School Pay Code: ${historyStudent?.schoolPayCode || '—'}`}
        maxWidth="max-w-3xl"
      >
        {historyRecords.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            No historical assessment records found for this student yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2">Term</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2 text-right">AI (0-3)</th>
                  <th className="px-3 py-2 text-right">Form. (20%)</th>
                  <th className="px-3 py-2 text-right">Summ. (80%)</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-center">Grade</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {historyRecords.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-medium">{r.classCode}</td>
                    <td className="px-3 py-2">{r.termId}</td>
                    <td className="px-3 py-2 font-medium text-navy-900">{r.subjectName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.cumulativeAiScore ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.formativeScore ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.summativeScore ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.totalScore ?? '—'}</td>
                    <td className="px-3 py-2 text-center font-bold">{r.grade || '—'}</td>
                    <td className="px-3 py-2 capitalize">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
};
