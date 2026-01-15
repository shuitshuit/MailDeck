/**
 * Enhanced Mail Content Component
 *
 * Renders email content with custom action buttons (e.g., copy buttons for OTP codes)
 * Supports both plain text and HTML emails with inline highlighting
 * Supports three action types: copy, link, highlight
 */

import { useMemo, useRef, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import type { CustomActionPattern, PatternMatch } from '../types/customAction';
import { findPatternMatches } from '../utils/patternMatcher';
import CopyButton from './CopyButton';
import { recordPatternUsage } from '../lib/api';

interface EnhancedMailContentProps {
  /** The email body content (plain text or HTML) */
  content: string;

  /** Whether the content is HTML (default: false) */
  isHtml?: boolean;

  /** Custom action patterns to apply */
  patterns: CustomActionPattern[];

  /** Optional CSS class name */
  className?: string;

  /** Optional callback when a value is copied */
  onCopy?: (value: string) => void;

  /** Optional callback when a link is clicked */
  onLinkClick?: (value: string, url: string) => void;
}

// CSS class for highlighted matches (clickable)
const HIGHLIGHT_CLASS = 'maildeck-pattern-match';

export default function EnhancedMailContent({
  content,
  isHtml = false,
  patterns,
  className = '',
  onCopy,
  onLinkClick
}: EnhancedMailContentProps) {
  const htmlContainerRef = useRef<HTMLDivElement>(null);

  // Find pattern matches in the content
  const matches = useMemo(() => {
    if (!content || patterns.length === 0) {
      return [];
    }

    // For HTML content, extract text content for matching
    const textContent = isHtml ? extractTextFromHtml(content) : content;
    return findPatternMatches(textContent, patterns);
  }, [content, patterns, isHtml]);

  // Get unique match values for highlighting in HTML
  const matchValues = useMemo(() => {
    return [...new Set(matches.map(m => m.value))];
  }, [matches]);

  // Process HTML with highlighted matches
  const enhancedHtml = useMemo(() => {
    if (!isHtml || matches.length === 0) {
      return sanitizeHtml(content);
    }
    return highlightMatchesInHtml(sanitizeHtml(content), matchValues);
  }, [content, isHtml, matches, matchValues]);

  // Handle click on highlighted text to copy
  const handleHighlightClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains(HIGHLIGHT_CLASS)) {
      const value = target.getAttribute('data-match-value');
      if (value) {
        copyToClipboard(value);
        onCopy?.(value);

        // Visual feedback
        target.classList.add('maildeck-pattern-copied');
        setTimeout(() => {
          target.classList.remove('maildeck-pattern-copied');
        }, 1500);
      }
    }
  }, [onCopy]);

  // Attach click handler to HTML container
  useEffect(() => {
    const container = htmlContainerRef.current;
    if (container && isHtml && matches.length > 0) {
      container.addEventListener('click', handleHighlightClick);
      return () => {
        container.removeEventListener('click', handleHighlightClick);
      };
    }
  }, [isHtml, matches.length, handleHighlightClick]);

  // Render enhanced content
  const enhancedContent = useMemo(() => {
    if (matches.length === 0) {
      // No matches, render content as-is
      if (isHtml) {
        return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />;
      }
      return <pre className="whitespace-pre-wrap font-sans">{content}</pre>;
    }

    // For plain text, insert copy buttons inline
    if (!isHtml) {
      return renderEnhancedPlainText(content, matches, onCopy);
    }

    // For HTML, show summary panel at top + highlighted content
    return (
      <>
        {/* Summary panel with action buttons based on action type */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm font-medium text-blue-800 mb-2">
            検出されたパターン ({matches.length}件):
          </div>
          <div className="flex flex-wrap gap-2">
            {matches.map((match, index) => (
              <div key={index} className="flex items-center space-x-1">
                <span className="text-sm text-blue-700 font-mono bg-white px-2 py-1 rounded border border-blue-200">
                  {match.value}
                </span>
                {renderActionButton(match, onCopy, onLinkClick)}
              </div>
            ))}
          </div>
        </div>

        {/* HTML content with inline highlights */}
        <div
          ref={htmlContainerRef}
          dangerouslySetInnerHTML={{ __html: enhancedHtml }}
        />

        {/* Styles for highlights */}
        <style>{`
          .${HIGHLIGHT_CLASS} {
            background-color: #dbeafe;
            color: #1d4ed8;
            font-weight: 600;
            padding: 1px 4px;
            border-radius: 3px;
            cursor: pointer;
            transition: all 0.15s ease;
            border: 1px solid transparent;
          }
          .${HIGHLIGHT_CLASS}:hover {
            background-color: #bfdbfe;
            border-color: #93c5fd;
          }
          .${HIGHLIGHT_CLASS}.maildeck-pattern-copied {
            background-color: #bbf7d0;
            color: #166534;
            border-color: #86efac;
          }
          .${HIGHLIGHT_CLASS}.maildeck-pattern-highlight-only {
            background-color: #fef3c7;
            color: #92400e;
            cursor: default;
          }
          .${HIGHLIGHT_CLASS}.maildeck-pattern-highlight-only:hover {
            background-color: #fde68a;
            border-color: #fcd34d;
          }
          .${HIGHLIGHT_CLASS}.maildeck-pattern-link {
            background-color: #e0e7ff;
            color: #4338ca;
          }
          .${HIGHLIGHT_CLASS}.maildeck-pattern-link:hover {
            background-color: #c7d2fe;
            border-color: #a5b4fc;
          }
        `}</style>
      </>
    );
  }, [content, isHtml, matches, onCopy, onLinkClick, enhancedHtml]);

  return <div className={className}>{enhancedContent}</div>;
}

/**
 * Render action button based on action type
 */
function renderActionButton(
  match: PatternMatch,
  onCopy?: (value: string) => void,
  onLinkClick?: (value: string, url: string) => void
) {
  const actionType = match.pattern.actionType;
  const patternId = match.pattern.id;

  // Handle copy action
  const handleCopy = () => {
    onCopy?.(match.value);
    // Record usage (fire and forget)
    recordPatternUsage(patternId, 'copy', match.value).catch(() => {});
  };

  // Handle link click action
  const handleLinkClick = () => {
    if (match.pattern.linkTemplate) {
      const url = generateLinkUrl(match.pattern.linkTemplate, match.value);
      window.open(url, '_blank', 'noopener,noreferrer');
      onLinkClick?.(match.value, url);
      // Record usage (fire and forget)
      recordPatternUsage(patternId, 'link_click', match.value).catch(() => {});
    }
  };

  switch (actionType) {
    case 'copy':
      return <CopyButton value={match.value} onCopy={handleCopy} />;

    case 'link':
      return (
        <button
          onClick={handleLinkClick}
          className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded transition-colors"
          title="リンクを開く"
          aria-label={`${match.value} のリンクを開く`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      );

    case 'highlight':
      // Highlight only - no button, just show a subtle indicator
      return (
        <span className="text-xs text-amber-600" title="ハイライト表示">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </span>
      );

    default:
      return null;
  }
}

/**
 * Generate URL from link template
 */
function generateLinkUrl(template: string, value: string): string {
  // URL encode the value for safety
  const encodedValue = encodeURIComponent(value);
  return template.replace(/\{value\}/g, encodedValue);
}

/**
 * Render plain text content with inline action buttons
 */
function renderEnhancedPlainText(
  content: string,
  matches: PatternMatch[],
  onCopy?: (value: string) => void
) {
  const segments: Array<{ type: 'text' | 'match'; content: string; match?: PatternMatch }> = [];
  let lastIndex = 0;

  for (const match of matches) {
    // Add text before the match
    if (match.startIndex > lastIndex) {
      segments.push({
        type: 'text',
        content: content.slice(lastIndex, match.startIndex)
      });
    }

    // Add the matched text with action button
    segments.push({
      type: 'match',
      content: match.value,
      match
    });

    lastIndex = match.endIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex)
    });
  }

  return (
    <div className="whitespace-pre-wrap font-sans">
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={index}>{segment.content}</span>;
        }

        const match = segment.match!;
        const actionType = match.pattern.actionType;

        // Get style based on action type
        const bgColorClass = actionType === 'link'
          ? 'bg-indigo-50 text-indigo-700'
          : actionType === 'highlight'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-blue-50 text-blue-700';

        // Render matched text with inline action button
        return (
          <span key={index} className="inline-flex items-center">
            <span className={`font-semibold ${bgColorClass} px-1 rounded`}>
              {segment.content}
            </span>
            <span className="ml-1">
              {renderActionButton(match, onCopy)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Extract plain text from HTML content
 */
function extractTextFromHtml(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitizeHtml(html);
  return tempDiv.textContent || tempDiv.innerText || '';
}

/**
 * Sanitize HTML content using DOMPurify
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'div', 'span', 'a', 'strong', 'em', 'u', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style']
  });
}

/**
 * Highlight matched values in HTML content by wrapping them with span elements
 */
function highlightMatchesInHtml(html: string, matchValues: string[]): string {
  if (matchValues.length === 0) {
    return html;
  }

  // Parse HTML into DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Walk through all text nodes
  const walker = document.createTreeWalker(
    doc.body,
    NodeFilter.SHOW_TEXT,
    null
  );

  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  // Process each text node
  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    if (!text.trim()) continue;

    // Check if any match values exist in this text node
    const fragments = splitTextByMatches(text, matchValues);

    if (fragments.length > 1 || (fragments.length === 1 && fragments[0].isMatch)) {
      // Create a document fragment to hold the new nodes
      const fragment = doc.createDocumentFragment();

      for (const frag of fragments) {
        if (frag.isMatch) {
          // Create highlighted span
          const span = doc.createElement('span');
          span.className = HIGHLIGHT_CLASS;
          span.setAttribute('data-match-value', frag.text);
          span.setAttribute('title', 'クリックでコピー');
          span.textContent = frag.text;
          fragment.appendChild(span);
        } else {
          // Create regular text node
          fragment.appendChild(doc.createTextNode(frag.text));
        }
      }

      // Replace the original text node with the fragment
      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }

  return doc.body.innerHTML;
}

/**
 * Split text into fragments, marking which parts are matches
 */
function splitTextByMatches(
  text: string,
  matchValues: string[]
): Array<{ text: string; isMatch: boolean }> {
  const result: Array<{ text: string; isMatch: boolean }> = [];

  // Sort match values by length (longest first) to avoid partial matches
  const sortedValues = [...matchValues].sort((a, b) => b.length - a.length);

  // Escape special regex characters in match values
  const escapedValues = sortedValues.map(v =>
    v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );

  // Create a regex that matches any of the values
  const regex = new RegExp(`(${escapedValues.join('|')})`, 'g');

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      result.push({
        text: text.slice(lastIndex, match.index),
        isMatch: false
      });
    }

    // Add the match
    result.push({
      text: match[0],
      isMatch: true
    });

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result.push({
      text: text.slice(lastIndex),
      isMatch: false
    });
  }

  return result;
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}