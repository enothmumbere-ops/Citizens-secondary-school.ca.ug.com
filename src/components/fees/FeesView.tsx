import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchFeesRecords, fetchStudents, saveFeesRecord } from '../../services/firestoreService';
import { ClassCode, FeesRecord, Student } from '../../types/sims';
import { formatUgx } from '../../utils/grading';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';

export const FeesView: React.FC = () => {
  const { userAccount, schoolSettings, years, terms, classes } = useAuth();
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

  const [students, setStudents] = useState<Student[]>([]);
  const [fees, setFees] = useState<FeesRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [feeForm, setFeeForm] = useState({
    feesRequired: '',
    paymentAmount: '',
    paymentRef: '',
    bursarComment: '',
    bursarName: schoolSettings?.bursarName || '',
    bursarInitials: schoolSettings?.bursarInitials || '',
  });

  const loadData = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [stList, fList] = await Promise.all([
        fetchStudents(role, uid),
        fetchFeesRecords(role, uid, {
          academicYearId: selectedYearId,
          termId: selectedTermId,
          ...(isStudent ? {} : { classCode: selectedClass }),
        }),
      ]);
      setStudents(stList);
      setFees(fList);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load fees records.', 'error');
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

  const openFeeModal = (st: Student) => {
    const existing = fees.find((f) => f.studentId === st.id);
    setEditingStudent(st);
    setFeeForm({
      feesRequired: existing ? String(existing.feesRequired) : '0',
      paymentAmount: '',
      paymentRef: '',
      bursarComment: existing?.bursarComment || '',
      bursarName: existing?.bursarName || schoolSettings?.bursarName || '',
      bursarInitials: existing?.bursarInitials || schoolSettings?.bursarInitials || '',
    });
  };

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    const existing = fees.find((f) => f.studentId === editingStudent.id);
    const req = Math.max(0, Number(feeForm.feesRequired || 0));
    const pay = Math.max(0, Number(feeForm.paymentAmount || 0));
    const prevPaid = existing?.amountPaid || 0;
    const nextPaid = prevPaid + pay;
    const balance = req - nextPaid;

    const history = [...(existing?.paymentHistory || [])];
    if (pay > 0) {
      history.push({
        id: `pay_${Date.now()}`,
        amount: pay,
        date: new Date().toISOString().slice(0, 10),
        reference: feeForm.paymentRef.trim() || 'School Pay / Cash',
        recordedBy: userAccount?.email || uid,
      });
    }

    try {
      await saveFeesRecord({
        id: existing?.id,
        studentId: editingStudent.id,
        studentName: editingStudent.fullName,
        schoolPayCode: editingStudent.schoolPayCode,
        studentAuthUid: editingStudent.studentAuthUid || '',
        classCode: editingStudent.classCode,
        stream: editingStudent.stream || 'Main',
        academicYearId: selectedYearId,
        termId: selectedTermId,
        feesRequired: req,
        amountPaid: nextPaid,
        balance,
        bursarComment: feeForm.bursarComment.trim(),
        bursarName: feeForm.bursarName.trim(),
        bursarInitials: feeForm.bursarInitials.trim().toUpperCase(),
        paymentHistory: history,
      });
      setEditingStudent(null);
      showToast(`Updated UGX fees account for ${editingStudent.fullName}.`, 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save fee record.', 'error');
    }
  };

  const handleExportFeesCsv = () => {
    const rows = [
      ['Student Name', 'School Pay Code', 'Class', 'Fees Required (UGX)', 'Amount Paid (UGX)', 'Balance (UGX)', "Bursar's Comment"],
      ...classStudents.map((st) => {
        const f = fees.find((x) => x.studentId === st.id);
        return [
          st.fullName,
          st.schoolPayCode || '',
          st.classCode,
          String(f?.feesRequired ?? 0),
          String(f?.amountPaid ?? 0),
          String(f?.balance ?? 0),
          f?.bursarComment || '',
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CSS_Fees_Report_${selectedClass}_${selectedTermId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isStudent) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">My School Fees Account</h1>
          <p className="text-sm text-slate-600">Personal termly fees summary in Ugandan Shillings (UGX).</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {fees.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No fees records posted for this term yet.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Class</th>
                  <th className="px-5 py-3">School Pay Code</th>
                  <th className="px-5 py-3 text-right">Fees Required</th>
                  <th className="px-5 py-3 text-right">Amount Paid</th>
                  <th className="px-5 py-3 text-right">Balance</th>
                  <th className="px-5 py-3">Bursar&apos;s Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {fees.map((f) => (
                  <tr key={f.id}>
                    <td className="px-5 py-3 font-medium">{f.classCode}</td>
                    <td className="px-5 py-3 font-mono text-xs">{f.schoolPayCode || '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatUgx(f.feesRequired)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-700">{formatUgx(f.amountPaid)}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-navy-900">{formatUgx(f.balance)}</td>
                    <td className="px-5 py-3 text-slate-700">{f.bursarComment || '—'}</td>
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
          <h1 className="text-2xl font-bold text-navy-900">Fees &amp; Bursar Administration</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Record fees required, payments, outstanding balances in UGX, and Bursar comments for report cards.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportFeesCsv}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-navy-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4 text-sky-600" />
          Export Fees Report (CSV)
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading fees accounts...</div>
        ) : classStudents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No active students in {selectedClass}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Student Name</th>
                  <th className="px-5 py-3">Pay Code</th>
                  <th className="px-5 py-3 text-right">Fees Required</th>
                  <th className="px-5 py-3 text-right">Paid</th>
                  <th className="px-5 py-3 text-right">Balance</th>
                  <th className="px-5 py-3">Bursar&apos;s Comment</th>
                  {isAdmin && <th className="px-5 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {classStudents.map((st) => {
                  const f = fees.find((x) => x.studentId === st.id);
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-semibold text-navy-900">{st.fullName}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-600">{st.schoolPayCode || '—'}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{f ? formatUgx(f.feesRequired) : '—'}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-emerald-700">
                        {f ? formatUgx(f.amountPaid) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-navy-900">
                        {f ? formatUgx(f.balance) : '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-600 max-w-xs truncate">{f?.bursarComment || '—'}</td>
                      {isAdmin && (
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openFeeModal(st)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Update Fees
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(editingStudent)}
        onClose={() => setEditingStudent(null)}
        title={`Fees & Bursar Update · ${editingStudent?.fullName || ''}`}
        subtitle={`Pay Code: ${editingStudent?.schoolPayCode || '—'} · ${selectedClass}`}
      >
        <form onSubmit={handleSaveFee} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Fees Required (UGX)</label>
              <input
                type="number"
                min={0}
                required
                value={feeForm.feesRequired}
                onChange={(e) => setFeeForm({ ...feeForm, feesRequired: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Record New Payment (UGX)</label>
              <input
                type="number"
                min={0}
                value={feeForm.paymentAmount}
                onChange={(e) => setFeeForm({ ...feeForm, paymentAmount: e.target.value })}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Receipt / School Pay Ref</label>
              <input
                type="text"
                value={feeForm.paymentRef}
                onChange={(e) => setFeeForm({ ...feeForm, paymentRef: e.target.value })}
                placeholder="Receipt / Transaction Reference"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bursar&apos;s Comment</label>
              <input
                type="text"
                value={feeForm.bursarComment}
                onChange={(e) => setFeeForm({ ...feeForm, bursarComment: e.target.value })}
                placeholder="e.g. Cleared full fees / Clear balance before next term"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bursar Name</label>
              <input
                type="text"
                value={feeForm.bursarName}
                onChange={(e) => setFeeForm({ ...feeForm, bursarName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bursar Initials</label>
              <input
                type="text"
                maxLength={8}
                value={feeForm.bursarInitials}
                onChange={(e) => setFeeForm({ ...feeForm, bursarInitials: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg uppercase font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Wallet className="w-4 h-4 text-sky-600" />
              Currency: UGX
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800"
              >
                Save Fees Record
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
