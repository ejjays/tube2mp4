import React, {
  useLayoutEffect,
  useEffect,
  useRef,
  lazy,
  Suspense,
} from 'react';
import { Routes, Route, useLocation } from 'react-router';
import { useAppStore } from './store/useAppStore';
import { VideoInfo } from '@phantom/shared/schemas/media.schema';
import { getDynamicBackendUrl } from './lib/config';
import { SSEService } from './lib/sse.service';
import { handleSseMessage } from './hooks/useSSE';
import Layout from './components/Layout';

// lazy load pages
const MainContent = lazy(() => import('./components/MainContent'));
const UpdatesPage = lazy(() => import('./pages/Updates/UpdatesPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

// doc pages (pages/Guide/*, pages/About/*) intentionally unrouted — content is
// seeded into the astro site guides later; git history keeps them alive

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
};

const App = () => {
  const backendUrl = useAppStore((state) => state.backendUrl);
  const setBackendUrl = useAppStore((state) => state.setBackendUrl);
  const clientId = useAppStore((state) => state.clientId);
  const location = useLocation();

  const sseRef = useRef<SSEService | null>(null);

  // set remote url
  useEffect(() => {
    let mounted = true;
    console.log('[App] initiating backend discovery...');
    getDynamicBackendUrl()
      .then((url) => {
        console.log(
          '[App] backend discovery result:',
          url || '(empty/null — SSE will not start)'
        );
        if (url && mounted) setBackendUrl(url);
      })
      .catch((err) => {
        console.error('[App] backend discovery threw:', err);
      });
    return () => {
      mounted = false;
    };
  }, [setBackendUrl]);

  // manage sse
  useEffect(
    function () {
      console.log(
        '[App] SSE effect run — backendUrl:',
        backendUrl || '(empty)',
        'clientId:',
        clientId || '(empty)',
        'pathname:',
        location.pathname
      );
      if (!backendUrl || !clientId) {
        console.log(
          '[App] SSE effect bailed — waiting for backendUrl + clientId'
        );
        return;
      }

      if (sseRef.current) {
        console.log('[App] SSE already connected, skipping');
        return;
      }

      const sse = new SSEService();
      sseRef.current = sse;
      let mounted = true;
      let reconnectTimeout: number | null = null;

      const connect = async () => {
        if (!mounted) return;

        const sseUrl = `${backendUrl}/events?id=${clientId}`;
        console.log('[App] SSE connecting to:', sseUrl);

        try {
          await sse.connect(
            sseUrl,
            (data: unknown) => {
              if (!mounted) return;

              const event = data as { status?: string };
              // track session start
              if (
                (event.status === 'fetching_info' ||
                  event.status === 'initializing') &&
                !useAppStore.getState().sessionStartTime
              ) {
                useAppStore.getState().setSessionStartTime(Date.now());
              }

              handleSseMessage(data as Record<string, unknown>, '', {
                setStatus: (s: string) => useAppStore.getState().setStatus(s),
                setVideoData: (v: unknown) =>
                  useAppStore.getState().setVideoData(v as VideoInfo),
                setIsPickerOpen: (o: boolean) =>
                  useAppStore.getState().setIsPickerOpen(o),
                setPendingSubStatuses: (payload: unknown) =>
                  useAppStore
                    .getState()
                    .setPendingSubStatuses(payload as string[]),
                setDesktopLogs: (payload: unknown) =>
                  useAppStore.getState().setDesktopLogs(payload as string[]),
                setTargetProgress: (tp: unknown) =>
                  useAppStore.getState().setTargetProgress(tp as number),
                setProgress: (progress: unknown) =>
                  useAppStore.getState().setProgress(progress as number),
                setSubStatus: (ss: string) =>
                  useAppStore.getState().setSubStatus(ss),
                getTS: () => {
                  const start = useAppStore.getState().sessionStartTime;
                  if (!start) return '[0:00]';
                  const elapsed = Math.floor((Date.now() - start) / 1000);
                  const mins = Math.floor(elapsed / 60);
                  const secs = elapsed % 60;
                  return `[${mins}:${secs.toString().padStart(2, '0')}]`;
                },
              });
            },
            (err: unknown) => {
              if (!mounted) return;
              const error = err as { message?: string };
              console.error('[SSE] Error:', error.message);
              if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
              reconnectTimeout = window.setTimeout(connect, 3000);
            },
            () => {
              if (!mounted) return;
              console.log('[SSE] Connected');
            }
          );
        } catch (_e) {
          if (mounted) {
            if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
            reconnectTimeout = window.setTimeout(connect, 3000);
          }
        }
      };

      function initSse(): void {
        connect();
      }
      initSse();

      // skipcq: JS-0045
      return () => {
        mounted = false;
        if (reconnectTimeout) {
          window.clearTimeout(reconnectTimeout);
        }
        sse.disconnect();
        sseRef.current = null;
      };
    },
    [backendUrl, clientId, location.pathname]
  );

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-cyan-500 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>
      <ScrollToTop />
      <Suspense fallback={null}>
        <Routes>
          <Route
            path="/"
            element={
              <Layout>
                <MainContent />
              </Layout>
            }
          />
          <Route
            path="/updates"
            element={
              <Layout>
                <UpdatesPage />
              </Layout>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
};

export default App;
