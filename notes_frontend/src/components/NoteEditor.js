import React, { useEffect, useMemo, useState } from "react";
import { markdownToSafeHtml, nowIso } from "../utils";

function normalizeTags(raw) {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

// PUBLIC_INTERFACE
export default function NoteEditor({
  note,
  onSave,
  onDelete,
  onChangeDirty
}) {
  /** Editor for a single note: title, markdown body, tags. */
  const [title, setTitle] = useState(note?.title || "");
  const [body, setBody] = useState(note?.body || "");
  const [tagsText, setTagsText] = useState((note?.tags || []).join(", "));
  const [lastSavedAt, setLastSavedAt] = useState(note?.updatedAt || note?.createdAt || null);

  useEffect(() => {
    setTitle(note?.title || "");
    setBody(note?.body || "");
    setTagsText((note?.tags || []).join(", "));
    setLastSavedAt(note?.updatedAt || note?.createdAt || null);
    onChangeDirty(false);
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewHtml = useMemo(() => markdownToSafeHtml(body), [body]);

  const isDirty = useMemo(() => {
    const originalTitle = note?.title || "";
    const originalBody = note?.body || "";
    const originalTags = (note?.tags || []).join(", ");
    return title !== originalTitle || body !== originalBody || tagsText !== originalTags;
  }, [note, title, body, tagsText]);

  useEffect(() => {
    onChangeDirty(isDirty);
  }, [isDirty, onChangeDirty]);

  const handleSave = async () => {
    const next = {
      ...note,
      title: title.trim() || "Untitled",
      body,
      tags: normalizeTags(tagsText),
      updatedAt: nowIso()
    };
    await onSave(next);
    setLastSavedAt(next.updatedAt);
  };

  return (
    <section className="k-card k-editor" aria-label="Note editor">
      <div className="k-editor-head">
        <h2>
          {note?.id ? "Edit note" : "New note"}{" "}
          {isDirty ? <span className="k-chip">Unsaved</span> : <span className="k-chip">Saved</span>}
        </h2>

        <div className="k-editor-actions">
          <button className="k-btn k-btn-primary" onClick={handleSave} disabled={!isDirty}>
            Save
          </button>
          {note?.id ? (
            <button className="k-btn k-btn-danger" onClick={() => onDelete(note.id)}>
              Delete
            </button>
          ) : null}
        </div>
      </div>

      <div className="k-editor-body">
        <div className="k-field">
          <label htmlFor="note-title">Title</label>
          <input
            id="note-title"
            className="k-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A clear, short title…"
          />
        </div>

        <div className="k-split">
          <div className="k-field">
            <label htmlFor="note-body">Body (Markdown)</label>
            <textarea
              id="note-body"
              className="k-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Write your note in markdown…\n\nExamples:\n# Heading\n- list item\n**bold** *italic* `code`"}
            />
          </div>

          <div className="k-field">
            <label>Preview</label>
            <div
              className="k-preview"
              aria-label="Markdown preview"
              // This is safe because markdownToSafeHtml escapes HTML first.
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>

        <div className="k-field">
          <label htmlFor="note-tags">Tags (comma separated)</label>
          <input
            id="note-tags"
            className="k-input"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="work, ideas, personal"
          />
        </div>

        <div className="k-footer-hint">
          {lastSavedAt ? `Last saved: ${new Date(lastSavedAt).toLocaleString()}` : "Not saved yet"}
        </div>
      </div>
    </section>
  );
}
