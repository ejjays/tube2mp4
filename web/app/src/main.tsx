import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import * as Sentry from '@sentry/react'; // skipcq: JS-C1003
import './index.css';
import App from './App';
import { initAV1Support } from './lib/codec-support';

initAV1Support();

// show focus outline only on tab
window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') document.documentElement.classList.add('kbd-focus');
});
const clearKbdFocus = () =>
  document.documentElement.classList.remove('kbd-focus');
window.addEventListener('mousedown', clearKbdFocus);
window.addEventListener('touchstart', clearKbdFocus, { passive: true });

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN.trim(),
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    tracePropagationTargets: [
      'localhost',
      /^\//,
      import.meta.env.VITE_API_URL || '',
    ],
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find root element');

createRoot(rootElement).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={<p>Something went wrong. Please refresh the page.</p>}
    >
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
