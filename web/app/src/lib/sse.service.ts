import { fetchEventSource } from '@microsoft/fetch-event-source';

export class SSEService {
  private controller: AbortController | null = null;
  private active = false;

  constructor() {
    this.controller = null;
    this.active = false;
  }

  async connect(
    url: string,
    onMessage: (data: unknown) => void,
    onError?: (err: unknown) => void,
    onOpen?: () => void
  ) {
    this.active = true;
    this.controller = new AbortController();

    try {
      await fetchEventSource(url, {
        signal: this.controller.signal,
        openWhenHidden: true,
        headers: {
          Accept: 'text/event-stream',
          'ngrok-skip-browser-warning': 'true',
          'bypass-tunnel-reminder': 'true',
        },
        onopen: async (response) => {
          if (!response.ok) {
            throw new Error(`SSE failed: ${response.status}`);
          }
          if (onOpen) onOpen();
          await Promise.resolve(); // satisfy require-await
        },
        onmessage: (msg) => {
          if (!this.active) return;
          if (!msg.data) return;

          console.log('[SSE Raw Data]:', msg.data.substring(0, 100));

          let parsed: unknown;
          try {
            parsed = JSON.parse(msg.data);
          } catch (parseErr) {
            // handle parse errors
            console.warn(
              '[SSE] Failed to parse event data:',
              parseErr instanceof Error ? parseErr.message : parseErr,
              'raw:',
              msg.data.substring(0, 200)
            );
            return;
          }

          // isolate message handler
          try {
            onMessage(parsed);
          } catch (handlerErr) {
            console.error(
              '[SSE] Handler threw — event dropped:',
              handlerErr instanceof Error ? handlerErr.message : handlerErr
            );
          }
        },
        onclose: () => {
          console.log('[SSE] Connection closed by server.');
        },
        onerror: (err: unknown) => {
          onError?.(err);
          // handle reconnection
        },
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const errorToReport = err instanceof Error ? err.message : err;
      onError?.(errorToReport);
    }
  }

  disconnect() {
    this.active = false;
    if (this.controller) {
      try {
        this.controller.abort();
      } catch (_e) {
        /* ignore */
      }
    }
    this.controller = null;
  }
}
