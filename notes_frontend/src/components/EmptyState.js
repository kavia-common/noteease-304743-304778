import React from "react";

// PUBLIC_INTERFACE
export default function EmptyState({ onCreateNew, hasAnyNotes }) {
  /** Empty state for when no note is selected, or when there are no notes yet. */
  const title = hasAnyNotes ? "Select a note to get started" : "Your notes, organized";
  const body = hasAnyNotes
    ? "Pick a note from the sidebar, or create a new one to start writing."
    : "Create your first note to start building your workspace.";

  const cta = hasAnyNotes ? "Create a new note" : "Create your first note";

  return (
    <section className="k-card k-empty" aria-label="Empty state">
      <h2>{title}</h2>
      <p>{body}</p>
      <button className="k-btn k-btn-primary" onClick={onCreateNew}>
        {cta}
      </button>
      <div className="k-footer-hint">
        Notes are stored locally by default and persist via localStorage.
      </div>
    </section>
  );
}
