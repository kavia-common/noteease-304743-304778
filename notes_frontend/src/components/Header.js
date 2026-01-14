import React from "react";

// PUBLIC_INTERFACE
export default function Header({ theme, onToggleTheme, storeKind }) {
  /** App header with brand, environment indicator, and theme toggle. */
  return (
    <header className="k-header">
      <div className="k-brand">
        <div className="k-logo" aria-hidden="true">N</div>
        <div className="k-brand-title">
          <strong>NoteEase</strong>
          <span>Ocean Professional</span>
        </div>
      </div>

      <div className="k-header-actions">
        <div className="k-pill" title="Active storage adapter">
          <span>Storage</span>
          <span className="k-badge">{storeKind}</span>
        </div>

        <button
          className="k-btn"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
      </div>
    </header>
  );
}
