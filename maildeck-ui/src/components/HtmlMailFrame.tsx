import { useEffect, useRef, useState } from 'react';

interface HtmlMailFrameProps {
  /** Complete HTML document string (<!DOCTYPE html>...) */
  html: string;
  className?: string;
}

export default function HtmlMailFrame({ html, className = '' }: HtmlMailFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const resize = () => {
      const body = iframe.contentDocument?.body;
      const docEl = iframe.contentDocument?.documentElement;
      if (!body || !docEl) return;
      const h = Math.max(body.scrollHeight, docEl.scrollHeight, 200);
      setHeight(h);
    };

    const onLoad = () => {
      resize();
      // Re-check after short delay for web fonts / lazy images
      setTimeout(resize, 500);
    };

    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className={`w-full border-0 ${className}`}
      style={{ height }}
      title="メール本文"
    />
  );
}
