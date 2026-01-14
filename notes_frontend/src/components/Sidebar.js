import React, { useMemo } from "react";
import { formatRelative, summarize } from "../utils";

// PUBLIC_INTERFACE
export default function Sidebar({
  notes,
  selectedId,
  search,
  onSearchChange,
  onSelect,
  onCreateNew
}) {
  /** Sidebar with search and notes list. */
  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const hay = `${n.title || ""}\n${n.body || ""}\n${(n.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [notes, search]);

  const hasAnyNotes = notes.length > 0;
  const hasQuery = (search || "").trim().length > 0;

  return (
    <aside className="k-card k-sidebar" aria-label="Notes sidebar">
      <div className="k-sidebar-top">
        <input
          className="k-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search notes, body, tags…"
          aria-label="Search notes"
        />
        <div className="k-sidebar-actions">
          <button className="k-btn k-btn-primary" onClick={onCreateNew}>
            New note
          </button>
          <div className="k-pill" title="Tip">
            <span className="k-badge">Tip</span>
            <span>Use tags like work, ideas</span>
          </div>
        </div>
      </div>

      <div className="k-note-list">
        {!hasAnyNotes ? (
          <div className="k-empty" aria-label="No notes empty state">
            <h2>No notes yet</h2>
            <p>Create your first note to start building your knowledge base.</p>
            <div className="k-empty-actions">
              <button className="k-btn k-btn-primary" onClick={onCreateNew}>
                Create note
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="k-empty" aria-label="No search results empty state">
            <h2>No results</h2>
            <p>Nothing matched your search. Try clearing the query or create a new note.</p>
            <div className="k-empty-actions">
              <button className="k-btn" onClick={() => onSearchChange("")} disabled={!hasQuery}>
                Clear search
              </button>
              <button className="k-btn k-btn-primary" onClick={onCreateNew}>
                Create note
              </button>
            </div>
          </div>
        ) : (
          filtered.map((note) => {
            const isActive = note.id === selectedId;
            return (
              <button
                key={note.id}
                className="k-note-item"
                onClick={() => onSelect(note.id)}
                aria-current={isActive ? "true" : "false"}
              >
                <div className="k-note-title">
                  <span>{note.title || "Untitled"}</span>
                  <span className="k-chip">{formatRelative(note.updatedAt || note.createdAt)}</span>
                </div>

                {(note.tags || []).length > 0 ? (
                  <div className="k-note-meta">
                    {(note.tags || []).slice(0, 3).map((t) => (
                      <span className="k-chip" key={t}>
                        {t}
                      </span>
                    ))}
                    {(note.tags || []).length > 3 ? (
                      <span className="k-chip">+{note.tags.length - 3}</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="k-note-meta">
                    <span className="k-chip">No tags</span>
                  </div>
                )}

                <div className="k-note-snippet">{summarize(note.body, 92)}</div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
