import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md no-print">
        {toasts.map((t) => {
          const styles =
            t.tone === 'success'
              ? 'bg-white border-emerald-200 text-emerald-900'
              : t.tone === 'error'
              ? 'bg-white border-red-200 text-red-900'
              : 'bg-white border-sky-200 text-navy-900';
          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-md text-sm ${styles}`}
              role="status"
            >
              {t.tone === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
              {t.tone === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
              {t.tone === 'info' && <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />}
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
