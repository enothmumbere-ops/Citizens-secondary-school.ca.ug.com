import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchAuditLogs, updateSchoolSettings } from '../../services/firestoreService';
import { AuditLog, GradingConfig } from '../../types/sims';
import { DEFAULT_GRADING_CONFIG } from '../../utils/grading';
import { useToast } from '../common/Toast';

export const SettingsView: React.FC = () => {
  const { userAccount, schoolSettings, refreshCatalog } = useAuth();
  const { showToast } = useToast();
  const uid = userAccount?.uid || '';

  const [form, setForm] = useState({
    schoolName: schoolSettings?.schoolName || "CITIZENS' SECONDARY SCHOOL - KASESE",
    motto: schoolSettings?.motto || 'STRIVE TO EXCEL',
    address: schoolSettings?.address || 'P.O. Box 263, Kasese, Uganda',
    phones: schoolSettings?.phones || '0777296961 / 0703825306',
    email: schoolSettings?.email || 'citizens263@gmail.com',
    headTeacherName: schoolSettings?.headTeacherName || '',
    bursarName: schoolSettings?.bursarName || '',
    bursarInitials: schoolSettings?.bursarInitials || '',
    thisTermHas: schoolSettings?.thisTermHas || '',
    nextTermBegins: schoolSettings?.nextTermBegins || '',
  });
  const [grading, setGrading] = useState<GradingConfig>(
    schoolSettings?.gradingConfig || DEFAULT_GRADING_CONFIG
  );
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    if (!uid) return;
    try {
      const list = await fetchAuditLogs(uid);
      setLogs(list.slice(0, 50));
    } catch {
      setLogs([]);
    }
  }, [uid]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSchoolSettings({
        ...form,
        gradingConfig: {
          ...grading,
          requiresAdminConfirmation: false,
        },
      });
      await refreshCatalog();
      showToast('School settings and approved grading configuration saved.', 'success');
      await loadLogs();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">School Settings, Grading Rules &amp; Audit Logs</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Configure official report card identity, signatories, term dates, and review grading scale rules.
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">School Name</label>
            <input
              type="text"
              required
              value={form.schoolName}
              onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">School Motto</label>
            <input
              type="text"
              required
              value={form.motto}
              onChange={(e) => setForm({ ...form, motto: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Postal Address</label>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Telephone Numbers</label>
            <input
              type="text"
              required
              value={form.phones}
              onChange={(e) => setForm({ ...form, phones: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Head Teacher&apos;s Name</label>
            <input
              type="text"
              value={form.headTeacherName}
              onChange={(e) => setForm({ ...form, headTeacherName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Bursar&apos;s Name</label>
            <input
              type="text"
              value={form.bursarName}
              onChange={(e) => setForm({ ...form, bursarName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Bursar&apos;s Initials</label>
            <input
              type="text"
              maxLength={8}
              value={form.bursarInitials}
              onChange={(e) => setForm({ ...form, bursarInitials: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">This Term Has (Closing Info)</label>
            <input
              type="text"
              value={form.thisTermHas}
              onChange={(e) => setForm({ ...form, thisTermHas: e.target.value })}
              placeholder="e.g. Ended on Friday 27th Nov 2026"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Next Term Begins</label>
            <input
              type="text"
              value={form.nextTermBegins}
              onChange={(e) => setForm({ ...form, nextTermBegins: e.target.value })}
              placeholder="e.g. Monday 1st Feb 2027"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {/* Grading Rule Configuration */}
        <div className="border-t border-slate-200 pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-navy-900">School Grading Scale &amp; Assessment Weights</h2>
            {grading.requiresAdminConfirmation && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                <AlertTriangle className="w-4 h-4" /> Pending Admin Confirmation
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 rounded-lg">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2">Grade</th>
                  <th className="px-3 py-2">Min Score (%)</th>
                  <th className="px-3 py-2">Max Score (%)</th>
                  <th className="px-3 py-2">Descriptor</th>
                  <th className="px-3 py-2">Level Label</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {grading.gradeBands.map((band, idx) => (
                  <tr key={band.grade}>
                    <td className="px-3 py-2 font-bold text-navy-900">{band.grade}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={band.minScore}
                        onChange={(e) => {
                          const next = [...grading.gradeBands];
                          next[idx] = { ...band, minScore: Number(e.target.value) };
                          setGrading({ ...grading, gradeBands: next });
                        }}
                        className="w-20 px-2 py-1 border border-slate-300 rounded tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={band.maxScore}
                        onChange={(e) => {
                          const next = [...grading.gradeBands];
                          next[idx] = { ...band, maxScore: Number(e.target.value) };
                          setGrading({ ...grading, gradeBands: next });
                        }}
                        className="w-20 px-2 py-1 border border-slate-300 rounded tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={band.descriptor}
                        onChange={(e) => {
                          const next = [...grading.gradeBands];
                          next[idx] = { ...band, descriptor: e.target.value };
                          setGrading({ ...grading, gradeBands: next });
                        }}
                        className="px-2 py-1 border border-slate-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={band.levelLabel}
                        onChange={(e) => {
                          const next = [...grading.gradeBands];
                          next[idx] = { ...band, levelLabel: e.target.value };
                          setGrading({ ...grading, gradeBands: next });
                        }}
                        className="px-2 py-1 border border-slate-300 rounded"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg disabled:opacity-60 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings & Confirm Grading Rules'}
          </button>
        </div>
      </form>

      {/* Audit Logs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-sky-600" />
          <h2 className="text-base font-bold text-navy-900">Immutable System &amp; Mark Audit Log</h2>
        </div>
        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No audit events recorded yet.</div>
        ) : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2 font-medium text-navy-900">{log.actorEmail}</td>
                    <td className="px-4 py-2 capitalize">{log.actorRole}</td>
                    <td className="px-4 py-2 font-semibold">{log.action}</td>
                    <td className="px-4 py-2 text-slate-600">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
