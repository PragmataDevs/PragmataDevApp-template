/**
 * Editor visual tipo doc → guardamos Markdown (`body_markdown`) para Astro.
 * TipTap (HTML interno) + marked / turndown en los bordes.
 */

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import TurndownService from 'turndown';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Unlink,
  Minus,
} from 'lucide-react';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

function markdownToHtml(md: string): string {
  const src = (md ?? '').trim();
  if (!src) return '<p></p>';
  const out = marked.parse(src, { async: false });
  return typeof out === 'string' ? out : '<p></p>';
}

function htmlToMarkdown(html: string): string {
  const normalized = html.replace(/<p><\/p>/g, '').replace(/<p>\s*<\/p>/g, '');
  if (!normalized.trim()) return '';
  return turndown.turndown(html).trim();
}

const btnBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
  color: '#374151',
};
function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        ...btnBase,
        background: active ? '#ede9fe' : '#fff',
        borderColor: active ? '#c4b5fd' : '#e5e7eb',
        color: active ? '#5b21b6' : '#374151',
      }}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL del enlace', prev ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  
  return (
    <div
      role="toolbar"
      aria-label="Formato"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: '8px 10px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
      }}
    >
      <ToolbarBtn title="Negrita" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={16} strokeWidth={2.25} />
      </ToolbarBtn>
      <ToolbarBtn title="Cursiva" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={16} strokeWidth={2.25} />
      </ToolbarBtn>
      <ToolbarBtn
        title="Subrayado"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={16} strokeWidth={2.25} />
      </ToolbarBtn>
      <ToolbarBtn title="Título 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 size={16} strokeWidth={2.25} />
      </ToolbarBtn>
      <ToolbarBtn title="Título 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 size={16} strokeWidth={2.25} />
      </ToolbarBtn>
      <ToolbarBtn title="Lista con viñetas" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={16} strokeWidth={2.25} />
      </ToolbarBtn>
      <ToolbarBtn title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={16} strokeWidth={2.25} />
      </ToolbarBtn>
      <ToolbarBtn title="Cita" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={16} strokeWidth={2.25} />
      </ToolbarBtn>
      <ToolbarBtn title="Línea horizontal" active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus size={16} strokeWidth={2.25} />
      </ToolbarBtn>
      <ToolbarBtn title="Insertar enlace" active={editor.isActive('link')} onClick={setLink}>
        <Link2 size={16} strokeWidth={2.25} />
      </ToolbarBtn>
      <ToolbarBtn title="Quitar enlace" active={false} onClick={() => editor.chain().focus().unsetLink().run()}>
        <Unlink size={16} strokeWidth={2.25} />
      </ToolbarBtn>
    </div>
  );
}

export interface RichMarkdownEditorProps {
  /** Markdown persistido */
  markdown: string;
  onMarkdownChange: (md: string) => void;
  placeholder?: string;
  /** Altura mínima del área editable (px). */
  minHeightPx?: number;
}

/** Montar con `key` estable por página (ej. `page.id` o `'new-standard'`) para reiniciar el estado al abrir otra fila. */
export function RichMarkdownEditor({
  markdown,
  onMarkdownChange,
  placeholder = 'Escribe el contenido de la página…',
  minHeightPx = 280,
}: RichMarkdownEditorProps) {
  const editor = useEditor({
    /** React Strict Mode / detección SSR: sin esto el editor puede quedar en blanco. */
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        'data-placeholder': placeholder,
      },
    },
    content: markdownToHtml(markdown),
    onUpdate: ({ editor: ed }) => {
      onMarkdownChange(htmlToMarkdown(ed.getHTML()));
    },
  });

  return (
    <div
      style={{
        border: '1px solid #d1d5db',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <EditorToolbar editor={editor} />
      <EditorContent
        editor={editor}
        style={{ minHeight: minHeightPx }}
      />
      <style>{`
        .tiptap.ProseMirror {
          min-height: ${minHeightPx}px;
          outline: none;
          padding: 12px 14px;
          font-size: 0.875rem;
          line-height: 1.65;
          color: #111827;
        }
        .tiptap.ProseMirror.is-editor-empty::before {
          content: attr(data-placeholder);
          float: left;
          height: 0;
          color: #9ca3af;
          pointer-events: none;
        }
        .tiptap.ProseMirror h2 { font-size: 1.25rem; font-weight: 800; margin: 1rem 0 0.5rem; letter-spacing: -0.02em; }
        .tiptap.ProseMirror h3 { font-size: 1.05rem; font-weight: 700; margin: 0.85rem 0 0.4rem; }
        .tiptap.ProseMirror ul, .tiptap.ProseMirror ol { margin: 0.5rem 0 0.5rem 1.25rem; padding-left: 0.25rem; }
        .tiptap.ProseMirror blockquote {
          margin: 0.75rem 0;
          padding-left: 12px;
          border-left: 3px solid #e5e7eb;
          color: #6b7280;
        }
        .tiptap.ProseMirror a { color: #7c3aed; text-decoration: underline; }
        .tiptap.ProseMirror hr { border: none; border-top: 1px solid #e5e7eb; margin: 1rem 0; }
        .tiptap.ProseMirror pre {
          background: #1e293b;
          color: #e2e8f0;
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 0.8125rem;
          overflow-x: auto;
        }
        .tiptap.ProseMirror code {
          background: #f3f4f6;
          padding: 0.1em 0.35em;
          border-radius: 4px;
          font-size: 0.9em;
        }
      `}</style>
      <p style={{ margin: 0, padding: '6px 12px 10px', fontSize: '0.6875rem', color: '#9ca3af', background: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
        Se guarda como Markdown compatible con el sitio público (Astro).
      </p>
    </div>
  );
}
