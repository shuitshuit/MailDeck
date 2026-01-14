/**
 * Enhanced Mail Content Component
 *
 * Renders email content with custom action buttons (e.g., copy buttons for OTP codes)
 */

import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import type { CustomActionPattern, PatternMatch } from '../types/customAction';
import { findPatternMatches } from '../utils/patternMatcher';
import CopyButton from './CopyButton';

interface EnhancedMailContentProps {
  /** The email body content (plain text or HTML) */
  content: string;

  /** Whether the content is HTML (default: false) */
  isHtml?: boolean;

  /** Custom action patterns to apply */
  patterns: CustomActionPattern[];

  /** Optional CSS class name */
  className?: string;
}

export default function EnhancedMailContent({
  content,
  isHtml = false,
  patterns,
  className = ''
}: EnhancedMailContentProps) {
  // Find pattern matches in the content
  const matches = useMemo(() => {
    if (!content || patterns.length === 0) {
      return [];
    }

    // For HTML content, extract text content for matching
    // (We'll enhance the HTML separately)
    const textContent = isHtml ? extractTextFromHtml(content) : content;
    return findPatternMatches(textContent, patterns);
  }, [content, patterns, isHtml]);

  // Render enhanced content
  const enhancedContent = useMemo(() => {
    if (matches.length === 0) {
      // No matches, render content as-is
      if (isHtml) {
        return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />;
      }
      return <pre className="whitespace-pre-wrap font-sans">{content}</pre>;
    }

    // For plain text, insert copy buttons
    if (!isHtml) {
      return renderEnhancedPlainText(content, matches);
    }

    // For HTML, we need more complex processing
    // For now, just render the HTML with a note about matches
    return (
      <>
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
        {matches.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm font-medium text-blue-800 mb-2">
              検出されたパターン ({matches.length}件):
            </div>
            <div className="space-y-2">
              {matches.map((match, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <span className="text-sm text-blue-700 font-mono bg-white px-2 py-1 rounded border border-blue-200">
                    {match.value}
                  </span>
                  <CopyButton value={match.value} />
                  <span className="text-xs text-blue-600">
                    ({match.pattern.patternName})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }, [content, isHtml, matches]);

  return <div className={className}>{enhancedContent}</div>;
}

/**
 * Render plain text content with inline copy buttons
 */
function renderEnhancedPlainText(content: string, matches: PatternMatch[]) {
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

    // Add the matched text with copy button
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

        // Render matched text with inline copy button
        return (
          <span key={index} className="inline-flex items-center">
            <span className="font-semibold text-blue-700 bg-blue-50 px-1 rounded">
              {segment.content}
            </span>
            <span className="ml-1">
              <CopyButton value={segment.content} />
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
