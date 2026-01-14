import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import "./App.css";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import NoteEditor from "./components/NoteEditor";
import EmptyState from "./components/EmptyState";
import { ToastProvider, useToast } from "./components/ToastProvider";
import { getNotesStore } from "./storage/notesStore";
import { makeId, nowIso } from "./utils";

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("noteease.theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("noteease.theme", theme);
  }, [theme]);

  return { theme, setTheme };
}

function createDraftNote() {
  const now = nowIso();
  return {
    id: makeId("draft"),
    title: "",
    body: "",
    tags: [],
    createdAt: now,
    updatedAt: now
  };
}

// PUBLIC_INTERFACE
function useUnsavedChangesPrompt(when, message) {
  /**
   * Minimal, consistent prompt for losing unsaved changes.
   * Covers browser/tab close and in-app navigation (route changes).
   */
  const location = useLocation();
  const lastLocationRef = useRef(location);

  // Browser/tab close (native prompt)
  useEffect(() => {
    if (!when) return;

    const handler = (e) => {
      e.preventDefault();
      // Chrome requires returnValue to be set.
      e.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when, message]);

  // SPA route change detection: if route changes while dirty, confirm and (if cancelled) revert.
  useEffect(() => {
    if (!when) {
      lastLocationRef.current = location;
      return;
    }

    const prev = lastLocationRef.current;
    if (prev.key !== location.key) {
      const ok = window.confirm(message);
      if (!ok) {
        // Go back to previous location. This keeps prompts minimal and avoids custom modals.
        window.history.back();
      } else {
        lastLocationRef.current = location;
      }
    }
  }, [location, when, message]);
}

function NotesShell() {
  const store = useMemo(() => getNotesStore(), []);
  const navigate = useNavigate();
  const { noteId } = useParams();
  const { notify } = useToast();

  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(null);

  // Dirty state refers to the editor’s current note.
  const [isDirty, setIsDirty] = useState(false);

  // Draft state: drafts are not persisted until Save.
  const [draft, setDraft] = useState(null);

  const [loading, setLoading] = useState(true);

  // Sidebar collapse state (used on small screens)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const confirmLoseChanges = useCallback(() => {
    return window.confirm("You have unsaved changes. Discard them?");
  }, []);

  useUnsavedChangesPrompt(isDirty, "You have unsaved changes. Discard them?");

  // Prevent setState-after-unmount and "not wrapped in act(...)" warnings in tests.
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (preferredId) => {
      // Only update state if still mounted (avoid late async setState).
      const safeSet = (fn) => {
        if (!mountedRef.current) return;
        fn();
      };

      safeSet(() => setLoading(true));

      try {
        const list = await store.list();

        safeSet(() => setNotes(list));

        const nextId = preferredId || noteId || (list[0]?.id ?? null);

        if (!nextId) {
          safeSet(() => {
            setActive(null);
            setLoading(false);
          });
          return;
        }

        // If we’re currently showing a draft (not persisted), keep it as active.
        if (draft && nextId === draft.id) {
          safeSet(() => {
            setActive(draft);
            setLoading(false);
          });
          return;
        }

        const nextActive = list.find((n) => n.id === nextId) || null;
        safeSet(() => {
          setActive(nextActive);
          setLoading(false);
        });
      } catch (e) {
        safeSet(() => setLoading(false));
        // Toasts are non-blocking; avoid firing after unmount.
        if (mountedRef.current) {
          notify({ type: "error", title: "Could not load notes", message: e?.message || "Please try again." });
        }
      }
    },
    [store, noteId, draft, notify]
  );

  useEffect(() => {
    refresh().catch(() => {
      if (mountedRef.current) setLoading(false);
    });
  }, [refresh]);

  useEffect(() => {
    if (!noteId) return;

    // If URL points at current draft, keep it active.
    if (draft && noteId === draft.id) {
      setActive(draft);
      return;
    }

    const selected = notes.find((n) => n.id === noteId) || null;
    setActive(selected);
  }, [noteId, notes, draft]);

  const onSelect = (id) => {
    if (isDirty && !confirmLoseChanges()) return;
    // If moving away from a draft, discard it safely.
    if (draft) setDraft(null);
    navigate(`/notes/${id}`);
  };

  const onCreateNew = useCallback(() => {
    if (isDirty && !confirmLoseChanges()) return;

    // Cancel any existing draft when starting a new one.
    if (draft) setDraft(null);

    const nextDraft = createDraftNote();
    setDraft(nextDraft);
    setActive(nextDraft);

    // Draft lives only in UI state; route still reflects the editor context.
    navigate(`/notes/${nextDraft.id}`, { state: { draft: true } });

    notify({ type: "info", title: "New draft", message: "Start typing — save when ready." });
  }, [confirmLoseChanges, draft, isDirty, navigate, notify]);

  const onCancelDraft = () => {
    // Only relevant if current active is draft.
    if (!draft) return;

    if (isDirty && !confirmLoseChanges()) return;

    setDraft(null);
    setIsDirty(false);

    // Navigate to first available note, else /notes (empty state).
    const next = notes[0]?.id;
    if (next) navigate(`/notes/${next}`);
    else navigate("/notes");

    notify({ type: "info", title: "Draft discarded", message: "Your draft was not saved." });
  };

  const onSave = async (next) => {
    // Saving a draft promotes it to a regular note (persisted) and clears draft state.
    try {
      await store.upsert(next);
      setDraft(null);
      await refresh(next.id);
      navigate(`/notes/${next.id}`);

      notify({ type: "success", title: "Saved", message: "Your note is up to date." });
    } catch (e) {
      notify({ type: "error", title: "Save failed", message: e?.message || "Please try again." });
      throw e;
    }
  };

  const onDelete = async (id) => {
    const ok = window.confirm("Delete this note? This cannot be undone.");
    if (!ok) return;

    // If deleting a draft (should be rare), just discard it.
    if (draft && id === draft.id) {
      setDraft(null);
      setIsDirty(false);
      navigate("/notes");
      notify({ type: "info", title: "Draft discarded", message: "The draft was removed." });
      return;
    }

    try {
      await store.remove(id);
      await refresh();
      navigate("/notes");
      notify({ type: "success", title: "Deleted", message: "The note was removed." });
    } catch (e) {
      notify({ type: "error", title: "Delete failed", message: e?.message || "Please try again." });
    }
  };

  // Keyboard shortcuts at shell level:
  // - Cmd/Ctrl+N new note
  // - Cmd/Ctrl+S save (editor also handles; this catches when focus isn't in editor)
  useEffect(() => {
    const handler = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      // Avoid stealing shortcuts from inputs except our desired ones.
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        onCreateNew();
      }
      // Save shortcut is handled inside NoteEditor to ensure correct note content,
      // but prevent the browser save dialog globally as well.
      if (key === "s") {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCreateNew]);

  const main = useMemo(() => {
    if (loading) {
      return (
        <section className="k-card k-empty" aria-busy="true" aria-live="polite">
          <h2>Loading notes…</h2>
          <p>Getting your workspace ready.</p>
        </section>
      );
    }

    if (!active) {
      return <EmptyState onCreateNew={onCreateNew} hasAnyNotes={notes.length > 0} />;
    }

    return (
      <NoteEditor
        note={active}
        isDraft={Boolean(draft && active?.id === draft.id)}
        onSave={onSave}
        onDelete={onDelete}
        onCancelDraft={onCancelDraft}
        onChangeDirty={setIsDirty}
        onEditorReady={() => setSidebarCollapsed(true)}
      />
    );
  }, [active, loading, draft, notes.length, onCreateNew]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="k-main" aria-label="Notes workspace">
      <Sidebar
        notes={notes}
        selectedId={active?.id || noteId || null}
        search={search}
        onSearchChange={setSearch}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={setSidebarCollapsed}
      />
      {main}
    </div>
  );
}

// PUBLIC_INTERFACE
function App() {
  /** Root app: theme + router. */
  const { theme, setTheme } = useTheme();
  const storeKind = useMemo(() => getNotesStore().kind, []);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  };

  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="App k-shell">
          <Header theme={theme} onToggleTheme={toggleTheme} storeKind={storeKind} />
          <Routes>
            <Route path="/" element={<Navigate to="/notes" replace />} />
            <Route path="/notes" element={<NotesShell />} />
            <Route path="/notes/:noteId" element={<NotesShell />} />
            <Route path="*" element={<Navigate to="/notes" replace />} />
          </Routes>
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
