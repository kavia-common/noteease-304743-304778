import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatRelative, summarize } from "../utils";

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    // Safari fallback
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    setMatches(mql.matches);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [query]);

  return matches;
}

// PUBLIC_INTERFACE
export default function Sidebar({
  notes,
  selectedId,
  search,
  onSearchChange,
  onSelect,
  onCreateNew,
  collapsed,
  onToggleCollapsed
}) {
  /** Sidebar with search and notes list. Includes small-screen collapse behavior. */
  const isSmall = useMediaQuery("(max-width: 860px)");
  const listRef = useRef(null);

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

  const effectiveCollapsed = Boolean(isSmall && collapsed);

  // If we select a note on small screens, collapse the sidebar list so the editor is focused.
  const handleSelect = (id) => {
    onSelect(id);
    if (isSmall) onToggleCollapsed(true);
  };

  // When expanding, move focus to the list container for easier keyboard navigation.
  useEffect(() => {
    if (!isSmall) return;
    if (!effectiveCollapsed && listRef.current) {
      listRef.current.focus();
    }
  }, [effectiveCollapsed, isSmall]);

  return (
    <aside
      className={`k-card k-sidebar ${effectiveCollapsed ? "k-sidebar-collapsed" : ""}`}
      aria-label="Notes sidebar"
    >
      <div className="k-sidebar-top">
        <div className="k-editor-actions" style={{ justifyContent: "space-between" }}>
          <button
            className="k-btn"
            onClick={() => onToggleCollapsed(!effectiveCollapsed)}
            aria-label={effectiveCollapsed ? "Show notes list" : "Hide notes list"}
            aria-expanded={!effectiveCollapsed}
            aria-controls="notes-list-region"
            style={{ display: isSmall ? "inline-flex" : "none" }}
          >
            {effectiveCollapsed ? "Show notes" : "Hide notes"}
          </button>

          <button className="k-btn k-btn-primary" onClick={onCreateNew} aria-label="Create new note">
            New note
          </button>
        </div>

        <input
          className="k-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search notes, body, tags…"
          aria-label="Search notes"
        />

        <div className="k-sidebar-actions" aria-label="Sidebar tips" style={{ marginTop: 10 }}>
          <div className="k-pill" title="Tip">
            <span className="k-badge">Tip</span>
            <span>Use tags like work, ideas</span>
          </div>
        </div>
      </div>

      <div
        id="notes-list-region"
        className="k-note-list"
        role="list"
        aria-label="Notes list"
        tabIndex={-1}
        ref={listRef}
      >
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
                onClick={() => handleSelect(note.id)}
                aria-current={isActive ? "true" : "false"}
                role="listitem"
                aria-label={`Open note: ${note.title || "Untitled"}`}
              >
                <div className="k-note-title">
                  <span>{note.title || "Untitled"}</span>
                  <span className="k-chip">{formatRelative(note.updatedAt || note.createdAt)}</span>
                </div>

                {(note.tags || []).length > 0 ? (
                  <div className="k-note-meta" aria-label="Tags">
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
