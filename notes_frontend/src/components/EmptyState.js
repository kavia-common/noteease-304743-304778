import React from "react";

// PUBLIC_INTERFACE
export default function EmptyState({ onCreateNew }) {
  /** Empty state for when no note is selected. */
  return (
    <section className="k-card k-empty" aria-label="Empty state">
      <h2>Your notes, organized</h2>
      <p>
        Select a note from the sidebar to view and edit it. Or create a new note to start writing.
      </p>
      <button className="k-btn k-btn-primary" onClick={onCreateNew}>
        Create your first note
      </button>
      <div className="k-footer-hint">
        Notes are stored locally by default and persist via localStorage.
      </div>
    </section>
  );
}
