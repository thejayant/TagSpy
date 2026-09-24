"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface Toast { id: number; title: string; body?: string }
const ToastContext = createContext<(title: string, body?: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, title, body }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className="toast" key={toast.id}>
            <strong>{toast.title}</strong>
            {toast.body && <span>{toast.body}</span>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
