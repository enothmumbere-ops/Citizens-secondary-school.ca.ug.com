import React, { useState } from 'react';
import {
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/sims';
import { SchoolCrest } from '../common/SchoolCrest';

export type NavSectionId =
  | 'dashboard'
  | 'students'
  | 'academics'
  | 'excel-import'
  | 'assessments'
  | 'attendance'
  | 'fees'
  | 'report-cards'
  | 'settings';

interface NavItem {
  id: NavSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'teacher', 'student'] },
  { id: 'students', label: 'Students', icon: GraduationCap, roles: ['admin', 'teacher'] },
  { id: 'academics', label: 'Classes & Staff', icon: Users, roles: ['admin'] },
  { id: 'excel-import', label: 'Excel Import & Export', icon: FileSpreadsheet, roles: ['admin'] },
  { id: 'assessments', label: 'Assessments & Marks', icon: ClipboardList, roles: ['admin', 'teacher', 'student'] },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck, roles: ['admin', 'teacher', 'student'] },
  { id: 'fees', label: 'Fees & Bursar', icon: Wallet, roles: ['admin', 'student'] },
  { id: 'report-cards', label: 'Report Cards', icon: FileText, roles: ['admin', 'student'] },
  { id: 'settings', label: 'School Settings', icon: Settings, roles: ['admin'] },
];

interface AppShellProps {
  activeSection: NavSectionId;
  onNavigate: (id: NavSectionId) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ activeSection, onNavigate, children }) => {
  const { userAccount, schoolSettings, years, terms, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = userAccount?.role || 'pending';
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const currentItem = visibleItems.find((i) => i.id === activeSection) || visibleItems[0];

  const currentYear = years.find((y) => y.id === schoolSettings?.currentAcademicYearId) || years.find((y) => y.isCurrent);
  const currentTerm = terms.find((t) => t.id === schoolSettings?.currentTermId) || terms.find((t) => t.isCurrent);

  const roleLabel =
    role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Teacher' : role === 'student' ? 'Student' : 'Pending';

  const handleSelect = (id: NavSectionId) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-navy-900 text-white border-r border-navy-950 no-print">
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
          <SchoolCrest size={40} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-white truncate">Citizens’ SS</p>
            <p className="text-[11px] text-sky-300 truncate">Kasese · Strive to Excel</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="text-xs text-slate-300 space-y-0.5">
            <p className="font-semibold text-white truncate">{userAccount?.displayName}</p>
            <p className="text-sky-300 truncate">{roleLabel}</p>
            <p className="text-slate-400 truncate">{userAccount?.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-white/10 hover:bg-white/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="fixed inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-navy-900 text-white flex flex-col z-10">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SchoolCrest size={36} />
                <span className="text-sm font-bold">Citizens’ SS Kasese</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 text-slate-300 hover:text-white"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      active ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/10">
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-white/10 rounded-lg"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Clean 3-Zone Top Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-8 h-16 flex items-center justify-between gap-6 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-navy-900 rounded-lg"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-semibold text-navy-900 whitespace-nowrap shrink-0">CSS-SIMS</span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="font-medium text-slate-700 truncate">{currentItem?.label}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 whitespace-nowrap shrink-0">
            <BookOpen className="w-3.5 h-3.5 text-sky-600" />
            <span>{currentYear?.name || '2026'}</span>
            <span aria-hidden="true">·</span>
            <span>{currentTerm?.name || 'Term III'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-navy-900">{roleLabel}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {role === 'admin' && activeSection !== 'report-cards' && (
              <button
                type="button"
                onClick={() => handleSelect('report-cards')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Report Cards
              </button>
            )}
            {role === 'teacher' && activeSection !== 'assessments' && (
              <button
                type="button"
                onClick={() => handleSelect('assessments')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Enter Marks
              </button>
            )}
            {role === 'student' && activeSection !== 'report-cards' && (
              <button
                type="button"
                onClick={() => handleSelect('report-cards')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                View Report Card
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
