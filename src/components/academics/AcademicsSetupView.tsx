import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  createAcademicYear,
  createUserInvite,
  deleteTeacher,
  deleteTeacherAssignment,
  fetchTeacherAssignments,
  fetchTeachers,
  fetchUsersAndInvites,
  saveSchoolClass,
  saveSubject,
  saveTeacher,
  saveTeacherAssignment,
  updateSchoolSettings,
  updateTermDetails,
  updateUserRoleOrStatus,
} from '../../services/firestoreService';
import { ClassCode, Gender, SchoolClass, Subject, Teacher, TeacherAssignment, UserAccount, UserInvite } from '../../types/sims';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';

type SetupTab = 'teachers' | 'classes' | 'subjects' | 'years' | 'users';

const ALL_CLASSES: ClassCode[] = ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'];

export const AcademicsSetupView: React.FC = () => {
  const { userAccount, schoolSettings, years, terms, classes, subjects, refreshCatalog } = useAuth();
  const { showToast } = useToast();
  const uid = userAccount?.uid || '';

  const [tab, setTab] = useState<SetupTab>('teachers');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [loading, setLoading] = useState(true);

  // Teacher modal
  const [teacherModal, setTeacherModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [tForm, setTForm] = useState({
    staffNumber: '',
    fullName: '',
    initials: '',
    email: '',
    phone: '',
    gender: 'M' as Gender,
    status: 'active' as 'active' | 'inactive',
  });

  // Delete Teacher modal & selection
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState('');
  const [deletingTeacher, setDeletingTeacher] = useState(false);

  // Assignment modal
  const [assignModal, setAssignModal] = useState(false);
  const [aForm, setAForm] = useState({
    teacherId: '',
    classCode: 'S.1' as ClassCode,
    stream: 'Main',
    stream: 'A',
    stream: 'B',
    subjectId: '',
    academicYearId: schoolSettings?.currentAcademicYearId || years[0]?.id || '',
    termId: schoolSettings?.currentTermId || terms[0]?.id || '',
  });

  // Stream / Class Teacher edit
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [streamsText, setStreamsText] = useState('');
  const [classTeacherId, setClassTeacherId] = useState('');

  // New Subject modal
  const [subjModal, setSubjModal] = useState(false);
  const [newSubj, setNewSubj] = useState({
    name: '',
    code: '',
    isCompulsory: false,
    allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4'] as ClassCode[],
  });

  // New Academic Year
  const [newYearName, setNewYearName] = useState('');

  // Invite Modal
  const [inviteModal, setInviteModal] = useState(false);
  const [invForm, setInvForm] = useState({
    email: '',
    fullName: '',
    role: 'teacher' as 'admin' | 'teacher' | 'student',
    initials: '',
    schoolPayCode: '',
  });

  const loadAll = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [tList, aList, uData] = await Promise.all([
        fetchTeachers('admin', uid),
        fetchTeacherAssignments('admin', uid),
        fetchUsersAndInvites(uid),
      ]);
      setTeachers(tList);
      setAssignments(aList);
      setUsers(uData.users);
      setInvites(uData.invites);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load staff & academic records.', 'error');
    } finally {
      setLoading(false);
    }
  }, [uid, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveTeacher({
        id: editingTeacher?.id,
        ...tForm,
        authUid: editingTeacher?.authUid || '',
        assignedClasses: editingTeacher?.assignedClasses || [],
        assignedSubjects: editingTeacher?.assignedSubjects || [],
      });
      showToast('Teacher saved and portal invite prepared.', 'success');
      setTeacherModal(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save teacher.', 'error');
    }
  };

  const toggleSelectTeacher = (teacherId: string) => {
    setSelectedTeacherIds((prev) =>
      prev.includes(teacherId) ? prev.filter((id) => id !== teacherId) : [...prev, teacherId]
    );
  };

  const handleOpenDeleteTeacher = () => {
    if (selectedTeacherIds.length === 0) return;
    setDeleteModal(true);
  };

  const handleConfirmDeleteTeachers = async (e: React.FormEvent) => {
    e.preventDefault();
    const targets =
      selectedTeacherIds.length > 0
        ? teachers.filter((t) => selectedTeacherIds.includes(t.id))
        : teachers.filter((t) => t.id === deleteTargetId);
    if (targets.length === 0) {
      showToast('Select a teacher to delete.', 'error');
      return;
    }
    setDeletingTeacher(true);
    try {
      for (const target of targets) {
        await deleteTeacher(target);
      }
      setSelectedTeacherIds([]);
      setDeleteModal(false);
      await Promise.all([loadAll(), refreshCatalog()]);
      showToast(
        targets.length === 1
          ? `Deleted teacher ${targets[0].fullName}.`
          : `Deleted ${targets.length} teachers.`,
        'info'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete teacher.', 'error');
    } finally {
      setDeletingTeacher(false);
    }
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    const teacher = teachers.find((t) => t.id === aForm.teacherId);
    const subj = subjects.find((s) => s.id === aForm.subjectId);
    if (!teacher || !subj) {
      showToast('Select both a teacher and a subject.', 'error');
      return;
    }
    try {
      await saveTeacherAssignment({
        teacherId: teacher.id,
        teacherUid: teacher.authUid || '',
        teacherName: teacher.fullName,
        teacherInitials: teacher.initials,
        classCode: aForm.classCode,
        stream: aForm.stream,
        subjectId: subj.id,
        subjectName: subj.name,
        academicYearId: aForm.academicYearId || schoolSettings?.currentAcademicYearId || years[0]?.id || 'yr_2026',
        termId: aForm.termId || schoolSettings?.currentTermId || terms[0]?.id || 'term_2026_3',
      });
      showToast(`Assigned ${teacher.fullName} to ${aForm.classCode} ${subj.name}.`, 'success');
      setAssignModal(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to assign teacher.', 'error');
    }
  };

  const handleToggleSubjectClass = async (subj: Subject, code: ClassCode) => {
    const exists = subj.allowedClasses.includes(code);
    const next = exists ? subj.allowedClasses.filter((c) => c !== code) : [...subj.allowedClasses, code];
    try {
      await saveSubject({ ...subj, allowedClasses: next });
      await refreshCatalog();
      showToast(`Updated ${subj.name} availability for ${code}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  };

  const handleSaveClassEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;
    const streams = streamsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ct = teachers.find((t) => t.id === classTeacherId);
    try {
      await saveSchoolClass({
        ...editingClass,
        streams: streams.length > 0 ? streams : ['Main'],
        classTeacherId: ct?.id || '',
        classTeacherName: ct?.fullName || '',
        classTeacherInitials: ct?.initials || '',
      });
      await refreshCatalog();
      setEditingClass(null);
      showToast(`Updated ${editingClass.code} streams and class teacher.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update class.', 'error');
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubj.name.trim()) return;
    try {
      await saveSubject({
        id: '',
        schoolCode: 'CSS_KASESE',
        name: newSubj.name.trim(),
        code: newSubj.code.trim().toUpperCase(),
        allowedClasses: newSubj.allowedClasses,
        isCompulsory: newSubj.isCompulsory,
      });
      await refreshCatalog();
      setSubjModal(false);
      setNewSubj({ name: '', code: '', isCompulsory: false, allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4'] });
      showToast('Subject added.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add subject.', 'error');
    }
  };

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearName.trim()) return;
    try {
      await createAcademicYear(newYearName.trim(), false);
      setNewYearName('');
      await refreshCatalog();
      showToast('Academic year and Terms I–III created.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create year.', 'error');
    }
  };

  const handleSetCurrentTerm = async (yearId: string, termId: string) => {
    try {
      await updateSchoolSettings({ currentAcademicYearId: yearId, currentTermId: termId });
      await updateTermDetails(termId, { isCurrent: true });
      await refreshCatalog();
      showToast('Active term updated across school portal.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to switch active term.', 'error');
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUserInvite(invForm);
      setInviteModal(false);
      setInvForm({ email: '', fullName: '', role: 'teacher', initials: '', schoolPayCode: '' });
      await loadAll();
      showToast('User access invite issued.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create invite.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Classes, Subjects, Staff &amp; Access</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Configure academic years, terms, senior classes S.1–S.6, subject allocations, teachers, and user roles.
          </p>
        </div>
      </div>

      {/* Segmented Navigation */}
      <div className="inline-flex flex-wrap gap-1 p-1 bg-slate-200/70 rounded-lg">
        {(
          [
            { id: 'teachers', label: 'Teachers & Assignments' },
            { id: 'classes', label: 'Classes & Streams' },
            { id: 'subjects', label: 'Subjects Allocation' },
            { id: 'years', label: 'Academic Years & Terms' },
            { id: 'users', label: 'User Accounts & Roles' },
          ] as Array<{ id: SetupTab; label: string }>
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === t.id ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-navy-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: TEACHERS & ASSIGNMENTS */}
      {tab === 'teachers' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-navy-900">Teaching Staff Directory</h2>
                <p className="text-xs text-slate-500">Register teachers with their official initials and Google login email.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenDeleteTeacher}
                  disabled={selectedTeacherIds.length === 0}
                  title={
                    selectedTeacherIds.length === 0
                      ? 'Select a teacher below to enable deletion'
                      : `Delete ${selectedTeacherIds.length} selected teacher(s)`
                  }
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 border border-red-600 rounded-lg hover:bg-red-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Teacher{selectedTeacherIds.length > 0 ? ` (${selectedTeacherIds.length})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTeacher(null);
                    setTForm({
                      staffNumber: `CSS-TR-${String(teachers.length + 1).padStart(3, '0')}`,
                      fullName: '',
                      initials: '',
                      email: '',
                      phone: '',
                      gender: 'M',
                      status: 'active',
                    });
                    setTeacherModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Add Teacher
                </button>
              </div>
            </div>
            {loading ? (
              <div className="p-6 text-sm text-slate-500">Loading teachers...</div>
            ) : teachers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No teachers registered yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="pl-5 pr-2 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={teachers.length > 0 && selectedTeacherIds.length === teachers.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTeacherIds(teachers.map((t) => t.id));
                            } else {
                              setSelectedTeacherIds([]);
                            }
                          }}
                          className="w-4 h-4 accent-navy-900 cursor-pointer"
                          aria-label="Select all teachers"
                        />
                      </th>
                      <th className="px-4 py-3">Staff No.</th>
                      <th className="px-5 py-3">Full Name</th>
                      <th className="px-5 py-3">Initials</th>
                      <th className="px-5 py-3">Email</th>
                      <th className="px-5 py-3">Phone</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {teachers.map((t) => {
                      const isChecked = selectedTeacherIds.includes(t.id);
                      return (
                        <tr
                          key={t.id}
                          onClick={() => toggleSelectTeacher(t.id)}
                          className={`cursor-pointer transition-colors ${
                            isChecked ? 'bg-red-50/60' : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <td className="pl-5 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectTeacher(t.id)}
                              className="w-4 h-4 accent-red-600 cursor-pointer"
                              aria-label={`Select ${t.fullName}`}
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{t.staffNumber}</td>
                          <td className="px-5 py-3 font-semibold text-navy-900">{t.fullName}</td>
                          <td className="px-5 py-3 font-mono font-semibold">{t.initials}</td>
                          <td className="px-5 py-3 text-slate-600">{t.email}</td>
                          <td className="px-5 py-3 text-slate-600">{t.phone || '—'}</td>
                          <td className="px-5 py-3 capitalize text-xs">{t.status}</td>
                          <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTeacher(t);
                                setTForm({
                                  staffNumber: t.staffNumber,
                                  fullName: t.fullName,
                                  initials: t.initials,
                                  email: t.email,
                                  phone: t.phone || '',
                                  gender: t.gender || 'M',
                                  status: t.status,
                                });
                                setTeacherModal(true);
                              }}
                              className="text-xs font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-navy-900">Class &amp; Subject Assignments</h2>
                <p className="text-xs text-slate-500">Controls which classes and subjects each teacher can access and score.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAForm({
                    teacherId: teachers[0]?.id || '',
                    classCode: 'S.1',
                    stream: 'Main',
                    subjectId: subjects[0]?.id || '',
                    academicYearId: schoolSettings?.currentAcademicYearId || years[0]?.id || '',
                    termId: schoolSettings?.currentTermId || terms[0]?.id || '',
                  });
                  setAssignModal(true);
                }}
                disabled={teachers.length === 0}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Assign Subject
              </button>
            </div>
            {assignments.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No teacher subject assignments configured yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-5 py-3">Teacher</th>
                      <th className="px-5 py-3">Class</th>
                      <th className="px-5 py-3">Stream</th>
                      <th className="px-5 py-3">Subject</th>
                      <th className="px-5 py-3 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td className="px-5 py-3 font-medium text-navy-900">
                          {a.teacherName} ({a.teacherInitials || '—'})
                        </td>
                        <td className="px-5 py-3 font-semibold">{a.classCode}</td>
                        <td className="px-5 py-3 text-slate-600">{a.stream || 'Main'}</td>
                        <td className="px-5 py-3">{a.subjectName}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteTeacherAssignment(a.id, a.classCode);
                              await loadAll();
                              showToast('Assignment removed.', 'info');
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                            aria-label="Remove assignment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CLASSES & STREAMS */}
      {tab === 'classes' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-navy-900">Senior Classes (S.1 – S.6) &amp; Streams</h2>
            <p className="text-xs text-slate-500">Configure streams and assign Class Teachers for termly report cards.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Class Name</th>
                  <th className="px-5 py-3">Level</th>
                  <th className="px-5 py-3">Streams</th>
                  <th className="px-5 py-3">Class Teacher</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {classes.map((cls) => (
                  <tr key={cls.id}>
                    <td className="px-5 py-3 font-bold text-navy-900">{cls.code}</td>
                    <td className="px-5 py-3">{cls.name}</td>
                    <td className="px-5 py-3 text-slate-600">{cls.level}</td>
                    <td className="px-5 py-3 text-slate-700">{cls.streams.join(', ')}</td>
                    <td className="px-5 py-3 text-slate-700">
                      {cls.classTeacherName ? `${cls.classTeacherName} (${cls.classTeacherInitials || ''})` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingClass(cls);
                          setStreamsText(cls.streams.join(', '));
                          setClassTeacherId(cls.classTeacherId || '');
                        }}
                        className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                      >
                        Configure
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SUBJECTS ALLOCATION */}
      {tab === 'subjects' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-navy-900">Approved Subject Matrix by Class</h2>
              <p className="text-xs text-slate-500">Toggle which classes offer each subject so report cards only show approved subjects.</p>
            </div>
            <button
              type="button"
              onClick={() => setSubjModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              Add Subject
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3 text-center">Compulsory</th>
                  {ALL_CLASSES.map((c) => (
                    <th key={c} className="px-3 py-3 text-center">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {subjects.map((subj) => (
                  <tr key={subj.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-medium text-navy-900">{subj.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{subj.code || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={subj.isCompulsory}
                        onChange={async () => {
                          await saveSubject({ ...subj, isCompulsory: !subj.isCompulsory });
                          await refreshCatalog();
                          showToast(
                            `${subj.name} marked as ${!subj.isCompulsory ? 'compulsory' : 'optional'}.`,
                            'success'
                          );
                        }}
                        className="w-4 h-4 accent-sky-600 cursor-pointer"
                        aria-label={`${subj.name} compulsory status`}
                      />
                    </td>
                    {ALL_CLASSES.map((c) => {
                      const active = subj.allowedClasses.includes(c);
                      return (
                        <td key={c} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => handleToggleSubjectClass(subj, c)}
                            className="w-4 h-4 accent-navy-900 cursor-pointer"
                            aria-label={`${subj.name} available in ${c}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: ACADEMIC YEARS & TERMS */}
      {tab === 'years' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-navy-900">Create Academic Year</h2>
            <p className="text-xs text-slate-500">Automatically generates Term I, Term II, and Term III for the new year.</p>
            <form onSubmit={handleCreateYear} className="space-y-3">
              <input
                type="text"
                value={newYearName}
                onChange={(e) => setNewYearName(e.target.value)}
                placeholder="e.g. 2027"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
              <button
                type="submit"
                className="w-full px-4 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800"
              >
                Create Academic Year
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-navy-900">Terms &amp; Active Term Selection</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Academic Year</th>
                    <th className="px-5 py-3">Term</th>
                    <th className="px-5 py-3">Active Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {terms.map((t) => {
                    const yr = years.find((y) => y.id === t.academicYearId);
                    const isCurr = schoolSettings?.currentTermId === t.id;
                    return (
                      <tr key={t.id}>
                        <td className="px-5 py-3 font-medium">{yr?.name || t.academicYearId}</td>
                        <td className="px-5 py-3 font-semibold text-navy-900">{t.name}</td>
                        <td className="px-5 py-3 text-xs">
                          {isCurr ? (
                            <span className="font-semibold text-emerald-700">Active School Term</span>
                          ) : (
                            <span className="text-slate-500">Inactive</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {!isCurr && (
                            <button
                              type="button"
                              onClick={() => handleSetCurrentTerm(t.academicYearId, t.id)}
                              className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                            >
                              Set Active
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: USER ACCOUNTS & ROLES */}
      {tab === 'users' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-navy-900">User Invites &amp; Role Authorizations</h2>
                <p className="text-xs text-slate-500">Pre-authorize Google email addresses as Administrator, Teacher, or Student.</p>
              </div>
              <button
                type="button"
                onClick={() => setInviteModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Shield className="w-4 h-4" />
                Issue Role Invite
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Full Name</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invites.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-5 py-3 font-medium text-navy-900">{inv.fullName}</td>
                      <td className="px-5 py-3 text-slate-600">{inv.email}</td>
                      <td className="px-5 py-3 capitalize font-medium">{inv.role}</td>
                      <td className="px-5 py-3 capitalize text-xs">{inv.status}</td>
                    </tr>
                  ))}
                  {invites.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                        No pending or claimed role invites yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-600" />
              <h2 className="text-base font-bold text-navy-900">Signed-In Accounts</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.map((u) => (
                    <tr key={u.uid}>
                      <td className="px-5 py-3 font-medium text-navy-900">{u.displayName}</td>
                      <td className="px-5 py-3 text-slate-600">{u.email}</td>
                      <td className="px-5 py-3">
                        <select
                          value={u.role}
                          onChange={async (e) => {
                            await updateUserRoleOrStatus(u.uid, {
                              role: e.target.value as UserAccount['role'],
                              status: e.target.value === 'pending' ? 'pending' : 'active',
                            });
                            await loadAll();
                            showToast(`Updated role for ${u.email}.`, 'success');
                          }}
                          className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                        >
                          <option value="admin">Admin</option>
                          <option value="teacher">Teacher</option>
                          <option value="student">Student</option>
                          <option value="pending">Pending</option>
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={u.status}
                          onChange={async (e) => {
                            await updateUserRoleOrStatus(u.uid, { status: e.target.value as UserAccount['status'] });
                            await loadAll();
                            showToast(`Updated status for ${u.email}.`, 'success');
                          }}
                          className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="pending">Pending</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Teacher Modal */}
      <Modal
        open={teacherModal}
        onClose={() => setTeacherModal(false)}
        title={editingTeacher ? 'Edit Teacher' : 'Register Teacher'}
      >
        <form onSubmit={handleSaveTeacher} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Staff ID *</label>
              <input
                type="text"
                required
                value={tForm.staffNumber}
                onChange={(e) => setTForm({ ...tForm, staffNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Teacher Initials *</label>
              <input
                type="text"
                required
                maxLength={10}
                value={tForm.initials}
                onChange={(e) => setTForm({ ...tForm, initials: e.target.value.toUpperCase() })}
                placeholder="e.g. M.E."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={tForm.fullName}
                onChange={(e) => setTForm({ ...tForm, fullName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Google Email (Portal Login) *</label>
              <input
                type="email"
                required
                value={tForm.email}
                onChange={(e) => setTForm({ ...tForm, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                value={tForm.phone}
                onChange={(e) => setTForm({ ...tForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={() => setTeacherModal(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg">
              Save Teacher
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Teacher Modal */}
      <Modal
        open={deleteModal}
        onClose={() => !deletingTeacher && setDeleteModal(false)}
        title="Delete Teacher"
      >
        <form onSubmit={handleConfirmDeleteTeachers} className="space-y-4">
          {selectedTeacherIds.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">
                The following selected teacher record(s) and their class/subject assignments will be permanently removed:
              </p>
              <ul className="max-h-48 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-lg bg-slate-50">
                {teachers
                  .filter((t) => selectedTeacherIds.includes(t.id))
                  .map((t) => (
                    <li key={t.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-navy-900">{t.fullName}</span>{' '}
                        <span className="font-mono text-slate-500">({t.initials})</span>
                      </div>
                      <span className="text-slate-500">{t.email}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select Teacher to Delete *
              </label>
              <select
                value={deleteTargetId}
                onChange={(e) => setDeleteTargetId(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.initials}) · {t.staffNumber}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            This action permanently deletes the selected teacher profile, unlinks any Class Teacher role, and removes their subject assignments. Existing approved assessment marks remain preserved.
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              disabled={deletingTeacher}
              onClick={() => setDeleteModal(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deletingTeacher}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              {deletingTeacher ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assignment Modal */}
      <Modal open={assignModal} onClose={() => setAssignModal(false)} title="Assign Teacher to Class & Subject">
        <form onSubmit={handleSaveAssignment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Teacher *</label>
              <select
                value={aForm.teacherId}
                onChange={(e) => setAForm({ ...aForm, teacherId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.initials})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Class *</label>
              <select
                value={aForm.classCode}
                onChange={(e) => setAForm({ ...aForm, classCode: e.target.value as ClassCode })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {ALL_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
              <select
                value={aForm.subjectId}
                onChange={(e) => setAForm({ ...aForm, subjectId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {subjects
                  .filter((s) => s.allowedClasses.includes(aForm.classCode))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={() => setAssignModal(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg">
              Save Assignment
            </button>
          </div>
        </form>
      </Modal>

      {/* Class Edit Modal */}
      <Modal
        open={Boolean(editingClass)}
        onClose={() => setEditingClass(null)}
        title={`Configure ${editingClass?.code || ''}`}
      >
        <form onSubmit={handleSaveClassEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Streams (comma-separated)</label>
            <input
              type="text"
              value={streamsText}
              onChange={(e) => setStreamsText(e.target.value)}
              placeholder="e.g. East, West"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Class Teacher</label>
            <select
              value={classTeacherId}
              onChange={(e) => setClassTeacherId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">None Assigned</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} ({t.initials})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={() => setEditingClass(null)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg">
              Save Class
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Subject Modal */}
      <Modal open={subjModal} onClose={() => setSubjModal(false)} title="Add Approved Subject">
        <form onSubmit={handleAddSubject} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Name *</label>
            <input
              type="text"
              required
              value={newSubj.name}
              onChange={(e) => setNewSubj({ ...newSubj, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Code</label>
            <input
              type="text"
              value={newSubj.code}
              onChange={(e) => setNewSubj({ ...newSubj, code: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={() => setSubjModal(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg">
              Add Subject
            </button>
          </div>
        </form>
      </Modal>

      {/* Issue Role Invite Modal */}
      <Modal open={inviteModal} onClose={() => setInviteModal(false)} title="Authorize User Account">
        <form onSubmit={handleCreateInvite} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={invForm.fullName}
              onChange={(e) => setInvForm({ ...invForm, fullName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Google Email Address *</label>
            <input
              type="email"
              required
              value={invForm.email}
              onChange={(e) => setInvForm({ ...invForm, email: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Role *</label>
            <select
              value={invForm.role}
              onChange={(e) => setInvForm({ ...invForm, role: e.target.value as 'admin' | 'teacher' | 'student' })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={() => setInviteModal(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg">
              Issue Invite
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
