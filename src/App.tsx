import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/common/Toast';
import { LoginPage } from './components/auth/LoginPage';
import { AppShell, NavSectionId } from './components/layout/AppShell';
import { DashboardView } from './components/dashboard/DashboardView';
import { StudentsView } from './components/students/StudentsView';
import { AcademicsSetupView } from './components/academics/AcademicsSetupView';
import { ExcelImportView } from './components/excel/ExcelImportView';
import { AssessmentsView } from './components/assessments/AssessmentsView';
import { AttendanceView } from './components/attendance/AttendanceView';
import { FeesView } from './components/fees/FeesView';
import { ReportCardsView } from './components/reports/ReportCardsView';
import { SettingsView } from './components/settings/SettingsView';

const PortalRouter: React.FC = () => {
  const { firebaseUser, userAccount, loading } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSectionId>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-navy-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-navy-900">Loading Citizens’ SS – Kasese SIMS...</p>
      </div>
    );
  }

  if (!firebaseUser || !userAccount || userAccount.role === 'pending' || userAccount.status !== 'active') {
    return <LoginPage />;
  }

  const role = userAccount.role;

  // Enforce role routing guard on activeSection
  const allowedByRole: Record<string, NavSectionId[]> = {
    admin: [
      'dashboard',
      'students',
      'academics',
      'excel-import',
      'assessments',
      'attendance',
      'fees',
      'report-cards',
      'settings',
    ],
    teacher: ['dashboard', 'students', 'assessments', 'attendance'],
    student: ['dashboard', 'assessments', 'attendance', 'fees', 'report-cards'],
  };

  const effectiveSection = allowedByRole[role]?.includes(activeSection)
    ? activeSection
    : 'dashboard';

  return (
    <AppShell activeSection={effectiveSection} onNavigate={setActiveSection}>
      {effectiveSection === 'dashboard' && <DashboardView onNavigate={setActiveSection} />}
      {effectiveSection === 'students' && <StudentsView />}
      {effectiveSection === 'academics' && <AcademicsSetupView />}
      {effectiveSection === 'excel-import' && <ExcelImportView />}
      {effectiveSection === 'assessments' && <AssessmentsView />}
      {effectiveSection === 'attendance' && <AttendanceView />}
      {effectiveSection === 'fees' && <FeesView />}
      {effectiveSection === 'report-cards' && <ReportCardsView />}
      {effectiveSection === 'settings' && <SettingsView />}
    </AppShell>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <PortalRouter />
      </ToastProvider>
    </AuthProvider>
  );
}
