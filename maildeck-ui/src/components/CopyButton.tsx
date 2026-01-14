/**
 * Copy Button Component
 *
 * A button that copies text to clipboard with visual feedback
 */

import { useState } from 'react';

interface CopyButtonProps {
  /** The text to copy to clipboard */
  value: string;

  /** Optional label for the button (default: "コピー") */
  label?: string;

  /** Optional CSS class name */
  className?: string;

  /** Callback fired after successful copy */
  onCopy?: () => void;
}

export default function CopyButton({ value, label = 'コピー', className = '', onCopy }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy?.();

      // Reset after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback to older method
      fallbackCopy(value);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`
        inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium
        rounded transition-all
        ${copied
          ? 'bg-green-100 text-green-700 border border-green-300'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
        }
        ${className}
      `}
      aria-label={copied ? 'コピーしました' : `${value}をコピー`}
      title={copied ? 'コピーしました' : `${value}をコピー`}
    >
      {copied ? (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>コピー済み</span>
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

/**
 * Fallback copy method using execCommand (for older browsers)
 */
function fallbackCopy(text: string): void {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand('copy');
  } catch (error) {
    console.error('Fallback copy failed:', error);
  }
  document.body.removeChild(textArea);
}
