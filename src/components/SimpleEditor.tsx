import React, { useEffect, useRef, useState } from 'react';
import { Heading1, Heading2, List, Bold, Italic, Type, ChevronDown } from 'lucide-react';

export const FONT_OPTIONS: { id: string; label: string; fontFamily: string; weight?: string; group: string }[] = [
    { id: 'default', label: 'Default', fontFamily: 'Inter', group: 'Default' },
    { id: 'playfair', label: 'Playfair Display', fontFamily: 'Playfair Display', group: 'Elegant' },
    { id: 'lora', label: 'Lora', fontFamily: 'Lora', group: 'Elegant' },
    { id: 'cormorant', label: 'Cormorant Garamond', fontFamily: 'Cormorant Garamond', group: 'Elegant' },
    { id: 'libre', label: 'Libre Baskerville', fontFamily: 'Libre Baskerville', group: 'Elegant' },
    { id: 'merriweather', label: 'Merriweather', fontFamily: 'Merriweather', group: 'Elegant' },
    { id: 'outfit', label: 'Outfit (Thin)', fontFamily: 'Outfit', weight: '300', group: 'Thin & Light' },
    { id: 'raleway', label: 'Raleway (Light)', fontFamily: 'Raleway', weight: '300', group: 'Thin & Light' },
    { id: 'manrope', label: 'Manrope (Light)', fontFamily: 'Manrope', weight: '300', group: 'Thin & Light' },
    { id: 'plusjakarta', label: 'Plus Jakarta Sans (Thin)', fontFamily: 'Plus Jakarta Sans', weight: '300', group: 'Thin & Light' },
    { id: 'dmsans', label: 'DM Sans (Light)', fontFamily: 'DM Sans (Light)', weight: '300', group: 'Thin & Light' },
    { id: 'interlight', label: 'Inter (Thin)', fontFamily: 'Inter', weight: '300', group: 'Thin & Light' },
];

const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,600&family=Inter:wght@300;400;600&family=Libre+Baskerville:ital,wght@0,400;0,700&family=Lora:ital,wght@0,400;0,600;1,400&family=Manrope:wght@300;400;600&family=Merriweather:ital,wght@0,400;0,700&family=Outfit:wght@200;300;400;600&family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Plus+Jakarta+Sans:wght@300;400;600&family=Raleway:wght@300;400;600&display=swap';

interface SimpleEditorProps {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    className?: string;
    placeholder?: string;
}

const applyInlineFormatting = (raw: string) => {
    if (!raw) return raw;
    let s = raw
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+?)\*/g, '<em>$1</em>');
    const fontRegex = /\[font:([^\]]+)\]([\s\S]*?)\[\/font\]/g;
    const fallback = (id: string) => (FONT_OPTIONS.find(f => f.id === id)?.group === 'Thin & Light' ? 'sans-serif' : 'serif');
    s = s.replace(fontRegex, (_, fontId, content) => {
        const opt = FONT_OPTIONS.find(f => f.id === fontId);
        if (!opt) return content;
        const style = `font-family: '${opt.fontFamily.replace(/'/g, "\\'")}', ${fallback(opt.id)};${opt.weight ? ` font-weight: ${opt.weight};` : ''}`;
        return `<span data-font-id="${opt.id}" style="${style}">${applyInlineFormatting(content)}</span>`;
    });
    return s;
};

const normalizeBullets = (text: string): string => {
    if (!text) return text;
    let r = text.replace(/([^\n])•/g, '$1\n•');
    r = r.replace(/•(?=\S)/g, '• ');
    return r;
};

const parseMarkdown = (md: string) => {
    if (!md) return '<div><br></div>';
    return normalizeBullets(md).split('\n').map(line => {
        const t = line.trim();
        // Render Headers
        if (t.startsWith('# ')) return `<div class="text-3xl font-bold text-neutral-900 mb-4 mt-6 tracking-tight leading-tight" data-type="h1">${applyInlineFormatting(line.substring(2))}</div>`;
        if (t.startsWith('## ')) return `<div class="text-xl font-semibold text-neutral-700 mb-3 mt-4 tracking-tight leading-snug" data-type="h2">${applyInlineFormatting(line.substring(3))}</div>`;

        // Render Lists
        if (t.startsWith('• ')) return `<div class="flex gap-3 ml-1 mb-2 items-start" data-type="li"><span class="text-neutral-400 select-none mt-1.5">•</span><div class="leading-relaxed text-neutral-800 text-lg">${applyInlineFormatting(line.substring(2))}</div></div>`;

        // Render Paragraphs
        return `<div class="leading-relaxed mb-2 text-lg text-neutral-800">${applyInlineFormatting(line) || '<br>'}</div>`;
    }).join('');
};

export function SimpleMarkdownRenderer({ content, className }: { content: string; className?: string }) {
    useEffect(() => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = GOOGLE_FONTS_URL;
        document.head.appendChild(link);
        return () => { document.head.removeChild(link); };
    }, []);

    const html = parseMarkdown(content);
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function SimpleEditor({ value, onChange, onBlur, className, placeholder }: SimpleEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const isInternalChange = useRef(false);
    const [fontMenuOpen, setFontMenuOpen] = useState(false);

    useEffect(() => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = GOOGLE_FONTS_URL;
        document.head.appendChild(link);
        return () => { document.head.removeChild(link); };
    }, []);

    // Convert incoming Markdown to HTML
    // We only update HTML from props if the change didn't originate from this editor
    // to avoid cursor jumping and re-render loops.
    useEffect(() => {
        if (!isInternalChange.current) {
            if (editorRef.current) {
                editorRef.current.innerHTML = parseMarkdown(value);
            }
        }
    }, [value]);



    const getInlineMarkdown = (el: Node): string => {
        let out = '';
        el.childNodes.forEach((child) => {
            if (child.nodeType === 3) {
                out += (child.textContent || '');
                return;
            }
            if (child.nodeType !== 1) return;
            const tag = (child as Element).tagName?.toLowerCase();
            const inner = getInlineMarkdown(child);
            const fontId = (child as Element).getAttribute?.('data-font-id');
            if (fontId) out += `[font:${fontId}]${inner}[/font]`;
            else if (tag === 'strong' || tag === 'b') out += `**${inner}**`;
            else if (tag === 'em' || tag === 'i') out += `*${inner}*`;
            else out += inner;
        });
        return out;
    };

    const getBlockText = (node: HTMLElement): string => {
        const type = node.getAttribute?.('data-type');
        if (type === 'li') {
            const inner = node.querySelector('.leading-relaxed, div');
            return inner ? getInlineMarkdown(inner) : getInlineMarkdown(node);
        }
        return getInlineMarkdown(node);
    };

    /** Collect block-level divs, flattening any wrapper div the browser may have inserted (e.g. around pasted HTML). */
    const getBlockNodes = (container: HTMLElement): HTMLElement[] => {
        const blocks: HTMLElement[] = [];
        const isBlock = (el: HTMLElement) => {
            const type = el.getAttribute?.('data-type');
            if (type) return true;
            const c = el.className || '';
            if (c.includes('leading-relaxed') || c.includes('text-3xl') || c.includes('text-xl') || c.includes('flex gap-3')) return true;
            if (el.tagName !== 'DIV') return false;
            if (el.innerHTML === '<br>' || el.childNodes.length === 0) return true;
            return false;
        };
        const collect = (node: Node) => {
            if (node.nodeType === 3) return;
            if (node.nodeType !== 1) return;
            const el = node as HTMLElement;
            if (el.tagName !== 'DIV') return;
            if (isBlock(el)) {
                blocks.push(el);
                return;
            }
            const divChildren = Array.from(el.childNodes).filter((n) => n.nodeType === 1 && (n as HTMLElement).tagName === 'DIV');
            if (divChildren.length > 0 && divChildren.length === el.childNodes.length) {
                divChildren.forEach(collect);
            } else {
                blocks.push(el);
            }
        };
        container.childNodes.forEach(collect);
        return blocks;
    };

    const syncFromDom = () => {
        if (editorRef.current) {
            handleInput({ currentTarget: editorRef.current } as unknown as React.FormEvent<HTMLDivElement>);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount || !editorRef.current) return;
            const range = selection.getRangeAt(0);
            const el = editorRef.current;
            let block: HTMLElement | null = range.startContainer.nodeType === 3 ? range.startContainer.parentElement as HTMLElement : range.startContainer as HTMLElement;
            while (block && block !== el && block.tagName !== 'DIV') block = block.parentElement as HTMLElement;
            const newDiv = document.createElement('div');
            newDiv.className = 'leading-relaxed mb-2 text-lg text-neutral-800';
            newDiv.innerHTML = '<br>';
            if (block && block !== el) {
                const parent = block.parentNode;
                if (parent) parent.insertBefore(newDiv, block.nextSibling);
                else el.appendChild(newDiv);
            } else {
                el.appendChild(newDiv);
            }
            range.setStart(newDiv, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            syncFromDom();
        }
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        isInternalChange.current = true;
        const content = e.currentTarget;
        let md = '';

        const nodes = getBlockNodes(content);
        nodes.forEach((node) => {
            if (node.nodeType === 3) {
                const text = node.textContent?.trim();
                if (text) md += `${text}\n`;
                return;
            }

            const type = node.getAttribute?.('data-type');
            let text = getBlockText(node).replace(/[\n\r]+/g, ' ').trim();
            if (type === 'li' && text.startsWith('•')) text = text.substring(1).trim();

            if (!text && node.tagName === 'DIV' && node.innerHTML === '<br>') {
                md += '\n';
                return;
            }
            if (!text) {
                md += '\n';
                return;
            }

            if (type === 'h1') md += `# ${text}\n`;
            else if (type === 'h2') md += `## ${text}\n`;
            else if (type === 'li') md += `• ${text}\n`;
            else md += `${text}\n`;
        });

        const finalVal = md.replace(/\n\n\n+/g, '\n\n');
        onChange(finalVal);
        setTimeout(() => isInternalChange.current = false, 100);
    };

    const toggleFormat = (type: string) => {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        // Get current block
        let node = selection.anchorNode;
        // Walk up to div inside editor
        while (node && (node.nodeType !== 1 || (node as Element).tagName !== 'DIV') && node !== editorRef.current) {
            node = node.parentNode;
        }

        if (node && node !== editorRef.current) {
            const el = node as HTMLElement;
            const currentType = el.getAttribute('data-type');

            // Define styles
            const styles = {
                h1: { class: "text-3xl font-bold text-neutral-900 mb-4 mt-6 tracking-tight leading-tight", type: "h1" },
                h2: { class: "text-xl font-semibold text-neutral-700 mb-3 mt-4 tracking-tight leading-snug", type: "h2" },
                li: { class: "flex gap-3 ml-1 mb-2 items-start", type: "li" },
                p: { class: "leading-relaxed mb-2 text-lg text-neutral-800", type: null }
            };

            if (currentType === type) {
                // Toggle OFF (Back to P)
                el.className = styles.p.class;
                el.removeAttribute('data-type');
                if (el.querySelector('span')) el.innerHTML = el.innerText; // Unwrap list
            } else {
                // Apply New Style
                if (type === 'h1') {
                    el.className = styles.h1.class;
                    el.setAttribute('data-type', 'h1');
                    if (el.querySelector('span')) el.innerHTML = el.innerText;
                } else if (type === 'h2') {
                    el.className = styles.h2.class;
                    el.setAttribute('data-type', 'h2');
                    if (el.querySelector('span')) el.innerHTML = el.innerText;
                } else if (type === 'li') {
                    el.className = styles.li.class;
                    el.setAttribute('data-type', 'li');
                    el.innerHTML = `<span class="text-neutral-400 select-none mt-1.5">•</span><div class="leading-relaxed text-neutral-800 text-lg">${el.innerText}</div>`;
                }
            }

            // Force update sync
            handleInput({ currentTarget: editorRef.current } as any);
        }
    };

    const applyFont = (fontId: string) => {
        const opt = FONT_OPTIONS.find(f => f.id === fontId);
        if (!opt || !editorRef.current) return;
        editorRef.current.focus();
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const fallback = opt.group === 'Thin & Light' ? 'sans-serif' : 'serif';
        const style = `font-family: '${opt.fontFamily.replace(/'/g, "\\'")}', ${fallback};${opt.weight ? ` font-weight: ${opt.weight};` : ''}`;
        const span = document.createElement('span');
        span.setAttribute('data-font-id', opt.id);
        span.setAttribute('style', style);

        try {
            const range = selection.getRangeAt(0);
            if (range.collapsed) {
                let block: Node | null = range.startContainer;
                if (block.nodeType === 3) block = block.parentElement;
                let blockEl: HTMLElement | null = block as HTMLElement;
                while (blockEl && blockEl !== editorRef.current && blockEl.tagName !== 'DIV') blockEl = blockEl.parentElement;
                if (blockEl && blockEl !== editorRef.current) {
                    const wrap = document.createElement('span');
                    wrap.setAttribute('data-font-id', opt.id);
                    wrap.setAttribute('style', style);
                    while (blockEl.firstChild) wrap.appendChild(blockEl.firstChild);
                    blockEl.appendChild(wrap);
                }
            } else {
                range.surroundContents(span);
            }
        } catch {
            try {
                const range = selection.getRangeAt(0);
                const contents = range.extractContents();
                span.appendChild(contents);
                range.insertNode(span);
            } catch (_) { /* ignore */ }
        }
        selection.removeAllRanges();
        handleInput({ currentTarget: editorRef.current } as unknown as React.FormEvent<HTMLDivElement>);
        setFontMenuOpen(false);
    };

    return (
        <div className={`flex flex-col border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-neutral-200 focus-within:border-neutral-400 ${className}`}>
            {/* Helper Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-2 border-b border-neutral-100 bg-neutral-50/80">
                <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); editorRef.current?.focus(); document.execCommand('bold'); }}
                    className="p-1.5 hover:bg-white rounded-md text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2 font-bold"
                    title="Bold (Ctrl+B)"
                >
                    <Bold className="w-4 h-4" />
                    <span className="text-xs font-medium hidden sm:inline">Bold</span>
                </button>
                <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); editorRef.current?.focus(); document.execCommand('italic'); }}
                    className="p-1.5 hover:bg-white rounded-md text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2 italic"
                    title="Italic (Ctrl+I)"
                >
                    <Italic className="w-4 h-4" />
                    <span className="text-xs font-medium hidden sm:inline">Italic</span>
                </button>
                <div className="w-px h-4 bg-neutral-200 mx-1" />
                <button onMouseDown={(e) => { e.preventDefault(); toggleFormat('h1'); }} className="p-1.5 hover:bg-white rounded-md text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2" title="Large Header">
                    <Heading1 className="w-4 h-4" />
                    <span className="text-xs font-medium hidden sm:inline">Header</span>
                </button>
                <button onMouseDown={(e) => { e.preventDefault(); toggleFormat('h2'); }} className="p-1.5 hover:bg-white rounded-md text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2" title="Subheader">
                    <Heading2 className="w-4 h-4" />
                    <span className="text-xs font-medium hidden sm:inline">Subheader</span>
                </button>
                <button onMouseDown={(e) => { e.preventDefault(); toggleFormat('li'); }} className="p-1.5 hover:bg-white rounded-md text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2" title="Bullet List">
                    <List className="w-4 h-4" />
                    <span className="text-xs font-medium hidden sm:inline">List</span>
                </button>
                <div className="w-px h-4 bg-neutral-200 mx-1" />
                <div className="relative">
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setFontMenuOpen((v) => !v); }}
                        className="p-1.5 hover:bg-white rounded-md text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2"
                        title="Font"
                    >
                        <Type className="w-4 h-4" />
                        <span className="text-xs font-medium hidden sm:inline">Font</span>
                        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                    </button>
                    {fontMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setFontMenuOpen(false)} aria-hidden />
                            <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-neutral-200 rounded-lg shadow-lg py-1.5 min-w-[200px] max-h-[280px] overflow-y-auto">
                                {['Default', 'Elegant', 'Thin & Light'].map((group) => (
                                    <div key={group}>
                                        <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{group}</div>
                                        {FONT_OPTIONS.filter((f) => f.group === group).map((f) => (
                                            <button
                                                key={f.id}
                                                type="button"
                                                onMouseDown={(e) => { e.preventDefault(); applyFont(f.id); }}
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2"
                                                style={{ fontFamily: `${f.fontFamily}, serif`, fontWeight: f.weight || '400' }}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div
                ref={editorRef}
                contentEditable
                style={{ fontFamily: '"Inter", sans-serif' }}
                data-placeholder={placeholder}
                className="p-4 outline-none min-h-[320px] text-lg text-neutral-800 max-h-[800px] overflow-y-auto cursor-text empty:before:content-[attr(data-placeholder)] empty:before:text-neutral-400 empty:before:pointer-events-none"
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onBlur={onBlur}
                onPaste={(e) => {
                    e.preventDefault();
                    const html = e.clipboardData.getData('text/html');
                    const text = e.clipboardData.getData('text/plain');

                    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

                    const listItemHtml = (content: string) =>
                        `<div class="flex gap-3 ml-1 mb-2 items-start" data-type="li"><span class="text-neutral-400 select-none mt-1.5">•</span><div class="leading-relaxed text-neutral-800 text-lg">${content || '<br>'}</div></div>`;
                    const paragraphHtml = (content: string) =>
                        `<div class="leading-relaxed mb-2 text-lg text-neutral-800">${content || '<br>'}</div>`;

                    function blocksFromPastedText(input: string): { type: 'p' | 'li' | 'h2'; text: string }[] {
                        const result: { type: 'p' | 'li' | 'h2'; text: string }[] = [];
                        const lines = input.split(/\r?\n/);
                        const numberedListPattern = /\s+(?=\d+[.)]\s+)/;
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) {
                                result.push({ type: 'p', text: '' });
                                continue;
                            }
                            const parts = trimmed.split(/\s*•\s*/).map((p) => p.trim()).filter(Boolean);
                            const startsWithBullet = /^\s*[•\-*]\s*/.test(trimmed);
                            if (startsWithBullet && parts.length >= 1) {
                                parts.forEach((p) => result.push({ type: 'li', text: p }));
                                continue;
                            }
                            if (parts.length > 1) {
                                result.push({ type: 'p', text: parts[0] });
                                parts.slice(1).forEach((p) => result.push({ type: 'li', text: (p.replace(/^\s*\d+[.)]\s*/, '').trim() || p) }));
                                continue;
                            }
                            if (startsWithBullet) {
                                result.push({ type: 'li', text: trimmed.replace(/^\s*[•\-*]\s*/, '').trim() });
                                continue;
                            }
                            const startsWithNumber = /^\s*\d+[.)]\s*/.test(trimmed);
                            if (startsWithNumber) {
                                const afterNumber = trimmed.replace(/^\s*\d+[.)]\s*/, '').trim();
                                const looksLikeSectionHeading = afterNumber.length > 0 && afterNumber.length < 120 && !/\.\s+[A-Z]/.test(afterNumber);
                                if (looksLikeSectionHeading) {
                                    result.push({ type: 'h2', text: afterNumber });
                                } else {
                                    result.push({ type: 'li', text: afterNumber });
                                }
                                continue;
                            }
                            if (numberedListPattern.test(trimmed)) {
                                const segments = trimmed.split(numberedListPattern).map((s) => s.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
                                if (segments.length > 1) {
                                    result.push({ type: 'p', text: segments[0] });
                                    segments.slice(1).forEach((s) => result.push({ type: 'li', text: s }));
                                    continue;
                                }
                            }
                            result.push({ type: 'p', text: trimmed });
                        }
                        return result;
                    }

                    const subheaderHtml = (content: string) =>
                        `<div class="text-xl font-semibold text-neutral-700 mb-3 mt-4 tracking-tight leading-snug" data-type="h2">${content || '<br>'}</div>`;

                    if (!html || html.trim() === '' || (text && text.includes('\n'))) {
                        const raw = text || '';
                        const blocks = blocksFromPastedText(raw);
                        const resultHtml = blocks.length
                            ? blocks.map((b) => {
                                if (b.type === 'li') return listItemHtml(escapeHtml(b.text));
                                if (b.type === 'h2') return subheaderHtml(escapeHtml(b.text));
                                return paragraphHtml(escapeHtml(b.text));
                            }).join('')
                            : paragraphHtml('');
                        document.execCommand('insertHTML', false, resultHtml);
                        requestAnimationFrame(syncFromDom);
                        return;
                    }

                    try {
                        const temp = document.createElement('div');
                        temp.innerHTML = html;
                        let resultHtml = '';

                        const processNode = (node: Node) => {
                            if (node.nodeType === 3) {
                                const val = node.textContent?.trim();
                                if (val) resultHtml += `<div class="leading-relaxed mb-2 text-lg text-neutral-800">${escapeHtml(val)}</div>`;
                                return;
                            }
                            if (node.nodeType !== 1) return;

                            const el = node as HTMLElement;
                            const tag = el.tagName.toLowerCase();
                            const val = el.innerText.trim();

                            if (tag === 'br') return;

                            if (['h1', 'h2', 'h3'].includes(tag)) {
                                const type = tag === 'h1' ? 'h1' : 'h2';
                                const styles = type === 'h1'
                                    ? "text-3xl font-bold text-neutral-900 mb-4 mt-6 tracking-tight leading-tight"
                                    : "text-xl font-semibold text-neutral-700 mb-3 mt-4 tracking-tight leading-snug";
                                if (val) resultHtml += `<div class="${styles}" data-type="${type}">${escapeHtml(val)}</div>`;
                            }
                            else if (tag === 'li') {
                                if (val) resultHtml += `<div class="flex gap-3 ml-1 mb-2 items-start" data-type="li"><span class="text-neutral-400 select-none mt-1.5">•</span><div class="leading-relaxed text-neutral-800 text-lg">${escapeHtml(val)}</div></div>`;
                            }
                            else if (tag === 'ul' || tag === 'ol') {
                                Array.from(el.children).forEach(processNode);
                            }
                            else if (tag === 'div' && el.querySelector('li')) {
                                Array.from(el.children).forEach(processNode);
                            }
                            else {
                                if (val) {
                                    const blocks = blocksFromPastedText(val);
                                    blocks.forEach((b) => {
                                        if (b.type === 'li') resultHtml += listItemHtml(escapeHtml(b.text));
                                        else if (b.type === 'h2') resultHtml += subheaderHtml(escapeHtml(b.text));
                                        else resultHtml += paragraphHtml(escapeHtml(b.text));
                                    });
                                }
                            }
                        };

                        Array.from(temp.childNodes).forEach(processNode);

                        if (resultHtml) {
                            document.execCommand('insertHTML', false, resultHtml);
                        } else {
                            const blocks = blocksFromPastedText(text || '');
                            const fallbackHtml = blocks.length
                                ? blocks.map((b) => {
                                    if (b.type === 'li') return listItemHtml(escapeHtml(b.text));
                                    if (b.type === 'h2') return subheaderHtml(escapeHtml(b.text));
                                    return paragraphHtml(escapeHtml(b.text));
                                }).join('')
                                : paragraphHtml('');
                            document.execCommand('insertHTML', false, fallbackHtml);
                        }
                    } catch (err) {
                        console.warn('Smart paste failed, falling back', err);
                        const blocks = blocksFromPastedText(text || '');
                        const fallbackHtml = blocks.length
                            ? blocks.map((b) => {
                                if (b.type === 'li') return listItemHtml(escapeHtml(b.text));
                                if (b.type === 'h2') return subheaderHtml(escapeHtml(b.text));
                                return paragraphHtml(escapeHtml(b.text));
                            }).join('')
                            : paragraphHtml('');
                        document.execCommand('insertHTML', false, fallbackHtml);
                    }
                    requestAnimationFrame(syncFromDom);
                }}
            />
        </div>
    );
}
