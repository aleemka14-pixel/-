import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './styles/index.css';

// Global canvas getBoundingClientRect fallback guard
if (typeof window !== 'undefined') {
  const fallbackGetBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      width: window.innerWidth || 1024,
      height: window.innerHeight || 768,
      top: 0,
      right: window.innerWidth || 1024,
      bottom: window.innerHeight || 768,
      left: 0,
      toJSON: () => {}
    };
  };

  // 1. Guard HTMLCanvasElement Prototype
  if (typeof window.HTMLCanvasElement !== 'undefined') {
    try {
      if (typeof window.HTMLCanvasElement.prototype.getBoundingClientRect !== 'function') {
        Object.defineProperty(window.HTMLCanvasElement.prototype, 'getBoundingClientRect', {
          value: fallbackGetBoundingClientRect,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
    } catch (e) {
      try {
        window.HTMLCanvasElement.prototype.getBoundingClientRect = fallbackGetBoundingClientRect as any;
      } catch (err) {}
    }
  }

  // 2. Guard OffscreenCanvas Prototype (if exists)
  if (typeof (window as any).OffscreenCanvas !== 'undefined') {
    try {
      if (typeof (window as any).OffscreenCanvas.prototype.getBoundingClientRect !== 'function') {
        Object.defineProperty((window as any).OffscreenCanvas.prototype, 'getBoundingClientRect', {
          value: fallbackGetBoundingClientRect,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
    } catch (e) {
      try {
        (window as any).OffscreenCanvas.prototype.getBoundingClientRect = fallbackGetBoundingClientRect as any;
      } catch (err) {}
    }
  }

  // 3. Guard generic Element Prototype (catch-all for mock environments / non-standard nodes)
  if (typeof Element !== 'undefined' && Element.prototype) {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      try {
        if (typeof originalGetBoundingClientRect === 'function') {
          return originalGetBoundingClientRect.call(this);
        }
      } catch (e) {
        // Fallback if call fails (e.g., detached node, mock object, etc.)
      }
      return fallbackGetBoundingClientRect() as any;
    };
  }

  // 4. Guard document.createElement
  if (typeof document !== 'undefined') {
    const originalCreateElement = document.createElement;
    document.createElement = function (tagName: string, options?: any) {
      const element = originalCreateElement.call(document, tagName, options);
      if (element && tagName && tagName.toLowerCase() === 'canvas') {
        if (typeof element.getBoundingClientRect !== 'function') {
          element.getBoundingClientRect = fallbackGetBoundingClientRect as any;
        }
      }
      return element;
    };

    // 5. Guard document.createElementNS
    const originalCreateElementNS = document.createElementNS;
    document.createElementNS = function (namespaceURI: string, qualifiedName: string, options?: any) {
      const element = originalCreateElementNS.call(document, namespaceURI, qualifiedName, options);
      if (element && qualifiedName && qualifiedName.toLowerCase() === 'canvas') {
        if (typeof element.getBoundingClientRect !== 'function') {
          element.getBoundingClientRect = fallbackGetBoundingClientRect as any;
        }
      }
      return element;
    };
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

