import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./ToastProvider";
import { checkApiReachable, getConfiguredApiBase } from "../storage/notesStore";

function getConfiguredMode() {
  const base = getConfiguredApiBase();
  return base ? "api" : "local";
}

// PUBLIC_INTERFACE
export default function Header({ theme, onToggleTheme, storeKind }) {
  /** App header with brand, environment indicator, sync status, and theme toggle. */
  const { notify } = useToast();

  // UI status states:
  // - local (default)
  // - checking (when configured and verifying)
  // - api (configured and reachable)
  // - error (configured but unreachable)
  const configuredMode = useMemo(() => getConfiguredMode(), []);
  const [syncState, setSyncState] = useState(() => (configuredMode === "api" ? "checking" : "local"));
  const lastAnnouncedRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function runCheck() {
      if (configuredMode !== "api") {
        setSyncState("local");
        return;
      }

      setSyncState("checking");
      const res = await checkApiReachable({ timeoutMs: 1200 });

      if (cancelled) return;

      if (res.reachable) setSyncState("api");
      else setSyncState("error");
    }

    runCheck().catch(() => setSyncState(configuredMode === "api" ? "error" : "local"));

    return () => {
      cancelled = true;
    };
  }, [configuredMode]);

  // Listen for connectivity changes emitted by the storage layer, and toast non-blockingly.
  useEffect(() => {
    const handler = (e) => {
      const d = e?.detail || {};
      // d: { mode: "api"|"local", state:"ok"|"error", message? }
      if (!d.mode) return;

      if (d.mode === "api" && d.state === "ok") setSyncState("api");
      if (d.mode === "local" && d.state === "error") setSyncState("error");

      // Avoid spamming the user with repeated identical messages.
      const signature = `${d.mode}:${d.state}:${d.message || ""}`;
      if (signature === lastAnnouncedRef.current) return;
      lastAnnouncedRef.current = signature;

      if (d.state === "error") {
        notify({
          type: "error",
          title: "Sync status",
          message: d.message || "Connectivity issue detected."
        });
      } else if (d.mode === "api" && d.state === "ok") {
        notify({
          type: "success",
          title: "Sync status",
          message: "API connection restored."
        });
      }
    };

    window.addEventListener("noteease:connectivity", handler);
    return () => window.removeEventListener("noteease:connectivity", handler);
  }, [notify]);

  const syncLabel =
    syncState === "api"
      ? "API"
      : syncState === "checking"
        ? "Checking…"
        : syncState === "error"
          ? "Error"
          : "Local";

  const syncTone =
    syncState === "api"
      ? "ok"
      : syncState === "checking"
        ? "checking"
        : syncState === "error"
          ? "error"
          : "local";

  const syncTitle =
    configuredMode !== "api"
      ? "Local-first mode (no API configured)"
      : syncState === "checking"
        ? "Checking API connectivity…"
        : syncState === "api"
          ? "API reachable"
          : "API configured but unreachable; app will use local fallback";

  return (
    <header className="k-header">
      <div className="k-brand">
        <div className="k-logo" aria-hidden="true">
          N
        </div>
        <div className="k-brand-title">
          <strong>NoteEase</strong>
          <span>Ocean Professional</span>
        </div>
      </div>

      <div className="k-header-actions">
        <div className="k-pill" title={syncTitle} aria-label={`Sync status: ${syncLabel}`}>
          <span>Sync</span>
          <span className={`k-badge k-badge-${syncTone}`}>{syncLabel}</span>
        </div>

        <div className="k-pill" title="Active storage adapter">
          <span>Storage</span>
          <span className="k-badge">{storeKind}</span>
        </div>

        <button className="k-btn" onClick={onToggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
      </div>
    </header>
  );
}
