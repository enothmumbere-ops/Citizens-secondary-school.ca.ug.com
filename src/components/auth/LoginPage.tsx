import React, { useState } from 'react';
import { LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SchoolCrest } from '../common/SchoolCrest';

export const LoginPage: React.FC = () => {
  const { firebaseUser, userAccount, loading, authError, signInWithGoogle, logout, refreshProfile } = useAuth();
  const [imgError, setImgError] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleRecheck = async () => {
    setChecking(true);
    try {
      await refreshProfile();
    } finally {
      setChecking(false);
    }
  };

  // Pending or inactive user view
  if (firebaseUser && userAccount && (userAccount.role === 'pending' || userAccount.status !== 'active')) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-4 pb-6 border-b border-slate-200">
            <SchoolCrest size={56} />
            <div>
              <h1 className="text-xl font-bold text-navy-900">Citizens’ Secondary School – Kasese</h1>
              <p className="text-xs font-medium text-sky-700 mt-0.5">“STRIVE TO EXCEL”</p>
            </div>
          </div>

          <div className="py-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              {userAccount.status === 'inactive'
                ? 'Account Deactivated'
                : 'Account Pending Administrator Authorization'}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              You are signed in as <span className="font-semibold text-slate-900">{userAccount.email}</span>.
              {userAccount.status === 'inactive'
                ? ' Your account is currently inactive. Please contact the school administration.'
                : ' Access to student, teacher, or administrative records requires your email address to be assigned a role by the School Administrator.'}
            </p>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
              <p>Ask the School Administrator to register or invite your Google email address under Staff, Students, or User Access Management.</p>
              <p>Once assigned, click Check Authorization below.</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
            <button
              type="button"
              onClick={handleRecheck}
              disabled={checking}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              Check Authorization
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white grid grid-cols-1 lg:grid-cols-12">
      {/* Left Institutional Visual Column */}
      <div className="relative lg:col-span-7 bg-navy-950 flex flex-col justify-between p-8 lg:p-12 overflow-hidden min-h-[320px]">
        {!imgError ? (
          <img
            src="/src/assets/images/campus_banner_kasese_1794836789450.jpg"
            alt="Citizens' Secondary School Kasese Campus"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-navy-950 via-navy-900 to-sky-900 opacity-90" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/75 to-navy-950/60" />

        <div className="relative z-10 flex items-center gap-4">
          <SchoolCrest size={60} />
          <div>
            <p className="text-xs font-semibold tracking-wider text-sky-300 uppercase">
              P.O. Box 263, Kasese, Uganda
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Citizens’ Secondary School – Kasese
            </h1>
          </div>
        </div>

        <div className="relative z-10 max-w-xl my-12">
          <p className="text-sm font-semibold text-sky-300 mb-3">Motto: “STRIVE TO EXCEL”</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight [text-wrap:balance]">
            Online School Information Management System
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-200 leading-relaxed">
            Unified academic records, competency-based continuous &amp; summative assessments, attendance tracking, UGX fees administration, and automated progressive report cards for S.1–S.6.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-300 border-t border-white/15 pt-5">
          <span>Tel: 0777296961 / 0703825306</span>
          <span aria-hidden="true">·</span>
          <span>Email: citizens263@gmail.com</span>
          <span aria-hidden="true">·</span>
          <span>Classes: Senior 1 – Senior 6</span>
        </div>
      </div>

      {/* Right Sign-In Column */}
      <div className="lg:col-span-5 flex items-center justify-center p-8 lg:p-14 bg-white">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-navy-900">Portal Sign In</h2>
            <p className="text-sm text-slate-600">
              Sign in with your authorized Google account to access the Administrator, Teacher, or Student workspace.
            </p>
          </div>

          {authError && (
            <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
              {authError}
            </div>
          )}

          <div className="space-y-4">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-5 py-3.5 text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
            >
              <ShieldCheck className="w-5 h-5 text-sky-300" />
              {loading ? 'Verifying session...' : 'Sign In with Google Account'}
            </button>
          </div>

          <div className="border-t border-slate-200 pt-6 space-y-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Role-Based Access Control</p>
            <div className="space-y-1.5 leading-relaxed">
              <p><span className="font-medium text-navy-900">Administrators:</span> Full academic setup, Excel workbook imports, mark approval, fees, and bulk report card publishing.</p>
              <p><span className="font-medium text-navy-900">Teachers:</span> Assigned classes &amp; subjects only—enter cumulative AI (0–3) and summative (80%) scores, initials, and attendance.</p>
              <p><span className="font-medium text-navy-900">Students:</span> Secure personal access to profile, attendance summary, academic history, and published report cards.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
