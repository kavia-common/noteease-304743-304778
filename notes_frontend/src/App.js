import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import "./App.css";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import NoteEditor from "./components/NoteEditor";
import EmptyState from "./components/EmptyState";
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

function createEmptyNote() {
  const now = nowIso();
  return {
    id: makeId(),
    title: "",
    body: "",
    tags: [],
    createdAt: now,
    updatedAt: now
  };
}

function NotesShell() {
  const store = useMemo(() => getNotesStore(), []);
  const navigate = useNavigate();
  const { noteId } = useParams();

  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (preferredId) => {
    setLoading(true);
    const list = await store.list();
    setNotes(list);
    const nextId = preferredId || noteId || (list[0]?.id ?? null);
    setActive(nextId ? list.find((n) => n.id === nextId) || null : null);
    setLoading(false);
  }, [store, noteId]);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!noteId) return;
    const selected = notes.find((n) => n.id === noteId) || null;
    setActive(selected);
  }, [noteId, notes]);

  const onSelect = (id) => {
    if (isDirty) {
      const ok = window.confirm("You have unsaved changes. Switch notes anyway?");
      if (!ok) return;
    }
    navigate(`/notes/${id}`);
  };

  const onCreateNew = () => {
    if (isDirty) {
      const ok = window.confirm("You have unsaved changes. Create a new note anyway?");
      if (!ok) return;
    }
    const draft = createEmptyNote();
    // We navigate to the draft id; it will be persisted on first save.
    navigate(`/notes/${draft.id}`, { state: { draft } });
    setActive(draft);
  };

  const onSave = async (next) => {
    await store.upsert(next);
    await refresh(next.id);
    navigate(`/notes/${next.id}`);
  };

  const onDelete = async (id) => {
    const ok = window.confirm("Delete this note? This cannot be undone.");
    if (!ok) return;
    await store.remove(id);
    await refresh();
    navigate("/notes");
  };

  const main = useMemo(() => {
    if (loading) {
      return (
        <section className="k-card k-empty">
          <h2>Loading notes…</h2>
          <p>Getting your workspace ready.</p>
        </section>
      );
    }

    if (!active) {
      return <EmptyState onCreateNew={onCreateNew} />;
    }

    return (
      <NoteEditor
        note={active}
        onSave={onSave}
        onDelete={onDelete}
        onChangeDirty={setIsDirty}
      />
    );
  }, [active, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="k-main">
      <Sidebar
        notes={notes}
        selectedId={active?.id || noteId || null}
        search={search}
        onSearchChange={setSearch}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
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
      <div className="App k-shell">
        <Header theme={theme} onToggleTheme={toggleTheme} storeKind={storeKind} />
        <Routes>
          <Route path="/" element={<Navigate to="/notes" replace />} />
          <Route path="/notes" element={<NotesShell />} />
          <Route path="/notes/:noteId" element={<NotesShell />} />
          <Route path="*" element={<Navigate to="/notes" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
