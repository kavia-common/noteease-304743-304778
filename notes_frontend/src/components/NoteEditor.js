import React, { useEffect, useMemo, useRef, useState } from "react";
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
  isDraft,
  onSave,
  onDelete,
  onCancelDraft,
  onChangeDirty,
  onEditorReady
}) {
  /** Editor for a single note: title, markdown body, tags. */
  const [title, setTitle] = useState(note?.title || "");
  const [body, setBody] = useState(note?.body || "");
  const [tagsText, setTagsText] = useState((note?.tags || []).join(", "));
  const [lastSavedAt, setLastSavedAt] = useState(note?.updatedAt || note?.createdAt || null);

  const titleRef = useRef(null);

  useEffect(() => {
    setTitle(note?.title || "");
    setBody(note?.body || "");
    setTagsText((note?.tags || []).join(", "));
    setLastSavedAt(note?.updatedAt || note?.createdAt || null);
    onChangeDirty(false);

    // Focus management: when switching notes (or opening draft), move focus to title for fast typing.
    // This keeps keyboard workflows snappy.
    window.setTimeout(() => {
      titleRef.current?.focus?.();
      onEditorReady?.();
    }, 0);
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

  const onKeyDownCapture = (e) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (!isMod) return;

    // Cmd/Ctrl+S -> Save (prevent browser save dialog)
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (isDirty) {
        handleSave().catch(() => {
          // errors are surfaced via higher-level toasts; keep editor non-blocking
        });
      }
    }
  };

  const statusId = "note-editor-status";

  return (
    <section className="k-card k-editor" aria-label="Note editor" onKeyDownCapture={onKeyDownCapture}>
      <div className="k-editor-head">
        <h2 id="note-editor-title">
          {isDraft ? "Draft note" : "Edit note"}{" "}
          {isDirty ? <span className="k-chip">Unsaved</span> : <span className="k-chip">Saved</span>}
          {isDraft ? <span className="k-chip">Draft</span> : null}
        </h2>

        <div className="k-editor-actions" aria-label="Editor actions">
          <button
            className="k-btn k-btn-primary"
            onClick={() => handleSave().catch(() => {})}
            disabled={!isDirty}
            aria-disabled={!isDirty}
            aria-describedby={statusId}
          >
            Save
          </button>

          {isDraft ? (
            <button className="k-btn" onClick={onCancelDraft} title="Discard this draft">
              Cancel draft
            </button>
          ) : null}

          {note?.id && !isDraft ? (
            <button className="k-btn k-btn-danger" onClick={() => onDelete(note.id)} aria-label="Delete note">
              Delete
            </button>
          ) : null}
        </div>
      </div>

      <div className="k-editor-body" role="form" aria-labelledby="note-editor-title">
        <div className="k-field">
          <label htmlFor="note-title">Title</label>
          <input
            id="note-title"
            ref={titleRef}
            className="k-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A clear, short title…"
            aria-describedby={statusId}
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
              aria-describedby={statusId}
            />
          </div>

          <div className="k-field">
            <label htmlFor="note-preview">Preview</label>
            <div
              id="note-preview"
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
            aria-describedby={statusId}
          />
        </div>

        <div className="k-footer-hint" id={statusId}>
          {isDraft
            ? "Draft is not saved yet. Save to keep it."
            : lastSavedAt
              ? `Last saved: ${new Date(lastSavedAt).toLocaleString()}`
              : "Not saved yet"}{" "}
          <span aria-hidden="true">·</span>{" "}
          <span className="k-chip" aria-label="Keyboard shortcuts hint">
            Ctrl/Cmd+S to save · Ctrl/Cmd+N for new
          </span>
        </div>
      </div>
    </section>
  );
}
