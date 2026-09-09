import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  addClient,
  removeClient,
  sendEvent,
} from '../../src/utils/network/sse.util.js';

/**
 * prevents stale state replay on sse reconnect.
 * ensures browser refresh doesn't resurrect old modals
 * by re-emitting the last metadata event.
 */

interface FakeRes extends EventEmitter {
  setHeader: (key: string, value: string) => void;
  getHeader: (key: string) => string | undefined;
  writeHead: (status: number, headers?: Record<string, string>) => void;
  write: (chunk: string) => boolean;
  writableEnded: boolean;
  writes: string[];
  destroyed: boolean;
}

function makeFakeRes(): FakeRes {
  const headers: Record<string, string> = {};
  const writes: string[] = [];
  const emitter = new EventEmitter() as FakeRes;
  emitter.setHeader = (key, value) => {
    headers[key.toLowerCase()] = value;
  };
  emitter.getHeader = (key) => headers[key.toLowerCase()];
  emitter.writeHead = () => undefined;
  emitter.write = (chunk: string) => {
    writes.push(chunk);
    return true;
  };
  emitter.writableEnded = false;
  emitter.writes = writes;
  emitter.destroyed = false;
  return emitter;
}

const CLIENT_ID = 'replay-test-client';

beforeEach(() => {
  // teardown
  removeClient(CLIENT_ID);
});

describe('SSE reconnect — no stale-state replay (refresh resurrection bug)', () => {
  it('a fresh connection with the same id does NOT replay the last metadata_update', () => {
    // first connection
    const resA = makeFakeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addClient(CLIENT_ID, resA as any);

    // push event
    sendEvent(CLIENT_ID, {
      status: 'success',
      text: 'Quality resolution complete.',
      metadata_update: {
        title: 'Stale Video',
        formats: [{ formatId: '137', height: 1080 }],
        isFullData: true,
        isPartial: false,
      } as never,
    });

    // verify delivery
    const aReceivedStaleEvent = resA.writes.some((write) =>
      write.includes('Stale Video')
    );
    expect(aReceivedStaleEvent).toBe(true);

    // disconnect
    resA.emit('close');

    // reconnect same id
    const resB = makeFakeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addClient(CLIENT_ID, resB as any);

    // assert no replay
    const bReceivedStaleReplay = resB.writes.some((write) =>
      write.includes('Stale Video')
    );
    expect(bReceivedStaleReplay).toBe(false);

    // retry handshake
    expect(resB.writes.some((write) => write.startsWith('retry:'))).toBe(true);

    removeClient(CLIENT_ID);
  });

  it('events sent AFTER reconnect still reach the new connection', () => {
    const resA = makeFakeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addClient(CLIENT_ID, resA as any);
    resA.emit('close');

    const resB = makeFakeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addClient(CLIENT_ID, resB as any);

    sendEvent(CLIENT_ID, {
      status: 'initializing',
      subStatus: 'fresh-event-after-reconnect',
    });

    expect(
      resB.writes.some((write) => write.includes('fresh-event-after-reconnect'))
    ).toBe(true);

    removeClient(CLIENT_ID);
  });
});
