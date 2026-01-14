import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

function makeToastId() {
  return `toast_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

/**
 * PUBLIC_INTERFACE
 * ToastProvider provides non-blocking toast notifications across the app.
 * - No external dependencies
 * - Accessible: uses aria-live regions and role="status"/"alert"
 */
export function ToastProvider({ children }) {
  /** Provides toast state + actions to descendants. */
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timersRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (opts) => {
      const toast = {
        id: makeToastId(),
        type: opts?.type || "info", // info | success | error
        title: opts?.title || "",
        message: opts?.message || "",
        // default durations: info 2800ms, success 2200ms, error 4200ms
        durationMs:
          typeof opts?.durationMs === "number"
            ? opts.durationMs
            : opts?.type === "error"
              ? 4200
              : opts?.type === "success"
                ? 2200
                : 2800
      };

      setToasts((prev) => {
        // Limit stack so we don't flood small screens
        const next = [toast, ...prev].slice(0, 4);
        return next;
      });

      const timer = window.setTimeout(() => removeToast(toast.id), toast.durationMs);
      timersRef.current.set(toast.id, timer);

      return toast.id;
    },
    [removeToast]
  );

  const api = useMemo(() => ({ notify, removeToast }), [notify, removeToast]);

  useEffect(() => {
    return () => {
      // cleanup timers on unmount
      for (const t of timersRef.current.values()) {
        window.clearTimeout(t);
      }
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

// PUBLIC_INTERFACE
export function useToast() {
  /** Hook to access toast notify/remove APIs. */
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider />");
  }
  return ctx;
}

function ToastViewport({ toasts, onDismiss }) {
  // Use a single live region; each toast uses status/alert depending on type.
  return (
    <div className="k-toast-viewport" aria-label="Notifications" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => {
        const isError = t.type === "error";
        return (
          <div
            key={t.id}
            className={`k-toast k-toast-${t.type}`}
            role={isError ? "alert" : "status"}
            aria-atomic="true"
          >
            <div className="k-toast-body">
              {t.title ? <div className="k-toast-title">{t.title}</div> : null}
              {t.message ? <div className="k-toast-message">{t.message}</div> : null}
            </div>
            <button className="k-toast-dismiss" onClick={() => onDismiss(t.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
