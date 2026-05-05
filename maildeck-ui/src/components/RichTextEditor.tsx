import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { useEffect, useCallback } from 'react';

interface RichTextEditorProps {
    content: string;
    onChange: (html: string) => void;
    placeholder?: string;
}

function ToolbarButton({ onClick, active, title, children }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onClick(); }}
            title={title}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
                active
                    ? 'bg-brand-100 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            }`}
        >
            {children}
        </button>
    );
}

export default function RichTextEditor({ content, onChange, placeholder = '本文を入力...' }: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-brand-600 underline' } }),
        ],
        content,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[160px] p-3 text-base',
            },
        },
    });

    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content, { emitUpdate: false });
        }
    }, [content, editor]);

    const setLink = useCallback(() => {
        if (!editor) return;
        const previous = editor.getAttributes('link').href as string | undefined;
        const url = window.prompt('URL', previous ?? '');
        if (url === null) return;
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);

    if (!editor) return null;

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:border-brand-400 transition-colors">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50">
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    active={editor.isActive('bold')}
                    title="太字 (Ctrl+B)"
                >
                    <strong>B</strong>
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    active={editor.isActive('italic')}
                    title="斜体 (Ctrl+I)"
                >
                    <em>I</em>
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    active={editor.isActive('underline')}
                    title="下線 (Ctrl+U)"
                >
                    <span className="underline">U</span>
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    active={editor.isActive('strike')}
                    title="取り消し線"
                >
                    <span className="line-through">S</span>
                </ToolbarButton>

                <span className="w-px h-4 bg-gray-300 mx-1" />

                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    active={editor.isActive('bulletList')}
                    title="箇条書き"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M6 4.75A.75.75 0 016.75 4h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 4.75zM6 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 10zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zM1.99 4.75a1 1 0 011-1H3a1 1 0 010 2h-.01a1 1 0 01-1-1zM1.99 10a1 1 0 011-1H3a1 1 0 010 2h-.01a1 1 0 01-1-1zm0 5.25a1 1 0 011-1H3a1 1 0 010 2h-.01a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    active={editor.isActive('orderedList')}
                    title="番号付きリスト"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M6 4.75A.75.75 0 016.75 4h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 4.75zM6 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 10zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zM2.722 3.51a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-1.823l-.013.01a.75.75 0 01-.9-1.201l.95-.716a.75.75 0 01.713-.02zM2 8.75a.75.75 0 01.75-.75h.5a1.5 1.5 0 011.144 2.463L3.056 11.5H3.75a.75.75 0 010 1.5h-2a.75.75 0 01-.573-1.237l1.774-2.086A.75.75 0 013 9.25v-.003a.003.003 0 00-.003-.003H2.75A.75.75 0 012 8.75zm1 5.5a.75.75 0 000 1.5H3.75a.25.25 0 010 .5H2.75a.75.75 0 000 1.5H3.75a1.75 1.75 0 100-3.5H3a.75.75 0 000-1.5h.75a.25.25 0 010-.5H3.75a.75.75 0 000-1.5H3a1.75 1.75 0 00-1.75 1.75.75.75 0 001.5 0A.25.25 0 013 12h.75z" clipRule="evenodd" />
                    </svg>
                </ToolbarButton>

                <span className="w-px h-4 bg-gray-300 mx-1" />

                <ToolbarButton
                    onClick={setLink}
                    active={editor.isActive('link')}
                    title="リンク"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                        <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                    </svg>
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    active={editor.isActive('blockquote')}
                    title="引用"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M6 4a2 2 0 00-2 2v2.172a2 2 0 00.586 1.414L6 11v5a2 2 0 002 2h.01a2 2 0 002-2v-5l1.414-1.414A2 2 0 0012 8.172V6a2 2 0 00-2-2H6zm8 0a2 2 0 00-2 2v2.172a2 2 0 00.586 1.414L14 11v5a2 2 0 002 2h.01a2 2 0 002-2v-5l1.414-1.414A2 2 0 0020 8.172V6a2 2 0 00-2-2h-4z" clipRule="evenodd" />
                    </svg>
                </ToolbarButton>

                <span className="w-px h-4 bg-gray-300 mx-1" />

                <ToolbarButton
                    onClick={() => editor.chain().focus().undo().run()}
                    active={false}
                    title="元に戻す (Ctrl+Z)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.128a5.75 5.75 0 010 11.5H8a.75.75 0 010-1.5h5.75a4.25 4.25 0 000-8.5H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.061.025z" clipRule="evenodd" />
                    </svg>
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().redo().run()}
                    active={false}
                    title="やり直す (Ctrl+Y)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M12.207 2.232a.75.75 0 00.025 1.06l4.146 3.958H6.25a5.75 5.75 0 000 11.5H12a.75.75 0 000-1.5H6.25a4.25 4.25 0 010-8.5h10.128l-4.146 3.957a.75.75 0 001.036 1.085l5.5-5.25a.75.75 0 000-1.085l-5.5-5.25a.75.75 0 00-1.061.025z" clipRule="evenodd" />
                    </svg>
                </ToolbarButton>
            </div>

            {/* Editor area */}
            <div className="relative">
                {editor.isEmpty && (
                    <p className="absolute top-3 left-3 text-gray-400 pointer-events-none text-base select-none">
                        {placeholder}
                    </p>
                )}
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}
