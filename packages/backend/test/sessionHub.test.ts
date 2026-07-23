import { describe, expect, it } from 'vitest';
import { SessionHub, type ClientHandle } from '../src/session/SessionHub.js';

function makeClient(clientId: string): ClientHandle & { sent: unknown[] } {
  const sent: unknown[] = [];
  return { clientId, displayName: clientId, sent, send: (message) => sent.push(message) };
}

describe('SessionHub write-token arbitration', () => {
  it('grants control to the first requester and denies a second', () => {
    const hub = new SessionHub();
    hub.attach('p1', makeClient('a'));
    hub.attach('p1', makeClient('b'));

    expect(hub.requestControl('p1', 'a').granted).toBe(true);

    const resultB = hub.requestControl('p1', 'b');
    expect(resultB.granted).toBe(false);
    expect(resultB.reason).toContain('a');

    expect(hub.canWrite('p1', 'a')).toBe(true);
    expect(hub.canWrite('p1', 'b')).toBe(false);
  });

  it('lets the current holder release control, freeing it for others', () => {
    const hub = new SessionHub();
    hub.attach('p1', makeClient('a'));
    hub.attach('p1', makeClient('b'));
    hub.requestControl('p1', 'a');

    hub.releaseControl('p1', 'a');

    expect(hub.canWrite('p1', 'a')).toBe(false);
    expect(hub.requestControl('p1', 'b').granted).toBe(true);
    expect(hub.canWrite('p1', 'b')).toBe(true);
  });

  it('auto-releases the token when the holder disconnects', () => {
    const hub = new SessionHub();
    hub.attach('p1', makeClient('a'));
    hub.attach('p1', makeClient('b'));
    hub.requestControl('p1', 'a');

    hub.detach('p1', 'a');

    expect(hub.getWriteTokenState('p1').holder).toBeNull();
    expect(hub.requestControl('p1', 'b').granted).toBe(true);
  });

  it('a non-holder releasing control is a no-op', () => {
    const hub = new SessionHub();
    hub.attach('p1', makeClient('a'));
    hub.attach('p1', makeClient('b'));
    hub.requestControl('p1', 'a');

    hub.releaseControl('p1', 'b');

    expect(hub.getWriteTokenState('p1').holder).toBe('a');
  });

  it('free-for-all mode lets any attached viewer write regardless of the token', () => {
    const hub = new SessionHub();
    hub.attach('p1', makeClient('a'));
    hub.attach('p1', makeClient('b'));
    hub.requestControl('p1', 'a');

    expect(hub.canWrite('p1', 'b')).toBe(false);

    hub.setFreeForAll('p1', true);

    expect(hub.canWrite('p1', 'b')).toBe(true);
    expect(hub.canWrite('p1', 'a')).toBe(true);
  });

  it('reflects isWriter correctly in the viewer list', () => {
    const hub = new SessionHub();
    hub.attach('p1', makeClient('a'));
    hub.attach('p1', makeClient('b'));
    hub.requestControl('p1', 'b');

    const viewers = hub.getViewers('p1');
    expect(viewers.find((v) => v.clientId === 'a')?.isWriter).toBe(false);
    expect(viewers.find((v) => v.clientId === 'b')?.isWriter).toBe(true);
  });

  it('a client already holding the token can re-request without being denied', () => {
    const hub = new SessionHub();
    hub.attach('p1', makeClient('a'));

    hub.requestControl('p1', 'a');
    const again = hub.requestControl('p1', 'a');

    expect(again.granted).toBe(true);
  });

  it('consoles are independent: holding the token on one port has no effect on another', () => {
    const hub = new SessionHub();
    hub.attach('p1', makeClient('a'));
    hub.attach('p2', makeClient('a'));

    hub.requestControl('p1', 'a');

    expect(hub.canWrite('p1', 'a')).toBe(true);
    expect(hub.canWrite('p2', 'a')).toBe(false);
  });
});
