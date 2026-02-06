import React, { useEffect, useRef, useState } from 'react';
import { Heading1, Heading2, List } from 'lucide-react';

interface SimpleEditorProps {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    className?: string;
    placeholder?: string;
}

export default function SimpleEditor({ value, onChange, onBlur, className, placeholder }: SimpleEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const isInternalChange = useRef(false);

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

    const parseMarkdown = (md: string) => {
        if (!md) return '<div><br></div>';
        return md.split('\n').map(line => {
            const t = line.trim();
            // Render Headers
            if (t.startsWith('# ')) return `<div class="text-3xl font-bold text-neutral-900 mb-4 mt-6 tracking-tight leading-tight" data-type="h1">${line.substring(2)}</div>`;
            if (t.startsWith('## ')) return `<div class="text-xl font-semibold text-neutral-700 mb-3 mt-4 tracking-tight leading-snug" data-type="h2">${line.substring(3)}</div>`;

            // Render Lists
            if (t.startsWith('• ')) return `<div class="flex gap-3 ml-1 mb-2 items-start" data-type="li"><span class="text-neutral-400 select-none mt-1.5">•</span><div class="leading-relaxed text-neutral-800 text-lg">${line.substring(2)}</div></div>`;

            // Render Paragraphs
            return `<div class="leading-relaxed mb-2 text-lg text-neutral-800">${line || '<br>'}</div>`;
        }).join('');
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        isInternalChange.current = true;
        const content = e.currentTarget;
        let md = '';

        // Parse the HTML structures back to simple markdown for storage
        Array.from(content.childNodes).forEach((node: any) => {
            // Text node (fallback)
            if (node.nodeType === 3) {
                const text = node.textContent?.trim();
                if (text) md += `${text}\n`;
                return;
            }

            // Element node
            const type = node.getAttribute?.('data-type');
            let text = node.innerText || node.textContent || '';
            text = text.replace(/[\n\r]+/g, ' ').trim(); // Flatten internal newlines of a block

            // Remove bullet char if captured in text due to selection sloppy copy
            if (type === 'li' && text.startsWith('•')) text = text.substring(1).trim();

            if (!text && node.tagName === 'DIV' && node.innerHTML === '<br>') {
                md += '\n'; // preserve intentional empty lines
                return;
            }
            if (!text) {
                md += '\n'; // empty div
                return;
            }

            if (type === 'h1') md += `# ${text}\n`;
            else if (type === 'h2') md += `## ${text}\n`;
            else if (type === 'li') md += `• ${text}\n`;
            else md += `${text}\n`;
        });

        // Strip excessive trailing newlines
        const finalVal = md.replace(/\n\n\n+/g, '\n\n');
        onChange(finalVal);

        // Reset internal flag after render cycle clearance
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

    return (
        <div className={`flex flex-col border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-neutral-200 focus-within:border-neutral-400 ${className}`}>
            {/* Helper Toolbar */}
            <div className="flex items-center gap-1 p-2 border-b border-neutral-100 bg-neutral-50/80">
                <button onMouseDown={(e) => { e.preventDefault(); toggleFormat('h1'); }} className="p-1.5 hover:bg-white rounded-md text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2" title="Large Header">
                    <Heading1 className="w-4 h-4" />
                    <span className="text-xs font-medium hidden sm:inline">Header</span>
                </button>
                <button onMouseDown={(e) => { e.preventDefault(); toggleFormat('h2'); }} className="p-1.5 hover:bg-white rounded-md text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2" title="Subheader">
                    <Heading2 className="w-4 h-4" />
                    <span className="text-xs font-medium hidden sm:inline">Subheader</span>
                </button>
                <div className="w-px h-4 bg-neutral-200 mx-1" />
                <button onMouseDown={(e) => { e.preventDefault(); toggleFormat('li'); }} className="p-1.5 hover:bg-white rounded-md text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2" title="Bullet List">
                    <List className="w-4 h-4" />
                    <span className="text-xs font-medium hidden sm:inline">List</span>
                </button>
            </div>

            <div
                ref={editorRef}
                contentEditable
                style={{ fontFamily: '"Inter", sans-serif' }}
                data-placeholder={placeholder}
                className="p-4 outline-none min-h-[320px] text-lg text-neutral-800 max-h-[800px] overflow-y-auto cursor-text empty:before:content-[attr(data-placeholder)] empty:before:text-neutral-400 empty:before:pointer-events-none"
                onInput={handleInput}
                onBlur={onBlur}
                onPaste={(e) => {
                    e.preventDefault();
                    const html = e.clipboardData.getData('text/html');
                    const text = e.clipboardData.getData('text/plain');

                    if (!html) {
                        document.execCommand('insertText', false, text);
                        return;
                    }

                    try {
                        const temp = document.createElement('div');
                        temp.innerHTML = html;
                        let resultHtml = '';

                        // Helper to map HTML to our Editor structure
                        const processNode = (node: Node) => {
                            if (node.nodeType === 3) { // Text
                                const val = node.textContent?.trim();
                                if (val) resultHtml += `<div class="leading-relaxed mb-2 text-lg text-neutral-800">${val}</div>`;
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
                                if (val) resultHtml += `<div class="${styles}" data-type="${type}">${val}</div>`;
                            }
                            else if (tag === 'li') {
                                if (val) resultHtml += `<div class="flex gap-3 ml-1 mb-2 items-start" data-type="li"><span class="text-neutral-400 select-none mt-1.5">•</span><div class="leading-relaxed text-neutral-800 text-lg">${val}</div></div>`;
                            }
                            else if (tag === 'ul' || tag === 'ol') {
                                Array.from(el.children).forEach(processNode);
                            }
                            else if (tag === 'div' && el.querySelector('li')) {
                                // Sometimes lists are wrapped in divs
                                Array.from(el.children).forEach(processNode);
                            }
                            else {
                                // Default Paragraph logic
                                if (!val) {
                                    // Empty
                                    // resultHtml += `<div class="leading-relaxed mb-2 text-lg text-neutral-800"><br></div>`;
                                } else {
                                    // Clean up bullet chars if they were pasted as text
                                    const cleanVal = val.startsWith('•') ? val.substring(1).trim() : val;
                                    resultHtml += `<div class="leading-relaxed mb-2 text-lg text-neutral-800">${cleanVal}</div>`;
                                }
                            }
                        };

                        Array.from(temp.childNodes).forEach(processNode);

                        if (resultHtml) {
                            document.execCommand('insertHTML', false, resultHtml);
                        } else {
                            document.execCommand('insertText', false, text);
                        }
                    } catch (err) {
                        console.warn('Smart paste failed, falling back', err);
                        document.execCommand('insertText', false, text);
                    }
                }}
            />
        </div>
    );
}
