import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { reserveDailySlot, japanDate, SESSION_DURATION_MS } from '../usage-limit.js';
import { NeneBridgeSession, buildSystemInstruction } from '../server.js';

function store() {
  const documents = new Set();
  return { documents, client: { async request({ params }) {
    if (documents.has(params.documentId)) throw { response: { status: 409 } };
    documents.add(params.documentId);
  } } };
}
const now = new Date('2026-10-13T12:00:00Z');

test('JST resets at midnight, not UTC midnight', () => {
  assert.equal(japanDate(new Date('2026-10-13T14:59:59Z')), '2026-10-13');
  assert.equal(japanDate(new Date('2026-10-13T15:00:00Z')), '2026-10-14');
});

test('concurrent instances share exactly ten durable slots; next day resets', async () => {
  const { client, documents } = store();
  const results = await Promise.all(Array.from({ length: 20 }, () => reserveDailySlot({ now, client, projectId: 'test' })));
  assert.equal(results.filter(Boolean).length, 10);
  assert.equal(documents.size, 10);
  assert.equal(await reserveDailySlot({ now, client, projectId: 'test' }), null);
  assert.ok(await reserveDailySlot({ now: new Date('2026-10-13T15:00:00Z'), client, projectId: 'test' }));
});

test('Firestore errors fail closed instead of granting a slot', async () => {
  await assert.rejects(reserveDailySlot({ now, projectId: 'test', client: { request: async () => { throw new Error('unavailable'); } } }));
});

class Socket extends EventEmitter {
  readyState = 1;
  messages = [];
  send(data) { this.messages.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.emit('close'); }
}
function bridge(options = {}) {
  const socket = new Socket();
  let closes = 0;
  let connects = 0;
  let reservations = 0;
  const session = { close: async () => { closes++; }, sendRealtimeInput() {} };
  const instance = new NeneBridgeSession(socket, {
    hasKey: true,
    reserveSlot: async () => { reservations++; return { slot: 1 }; },
    createAI: () => ({ live: { connect: async () => { connects++; return session; } } }),
    ...options,
  });
  return { socket, instance, session, counts: () => ({ closes, connects, reservations }) };
}

test('three-minute limit is enforced upstream without browser cooperation', async () => {
  assert.equal(SESSION_DURATION_MS, 180000);
  const b = bridge({ durationMs: 25 });
  await b.instance.startLiveSession({});
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(b.socket.readyState, 3);
  assert.equal(b.counts().closes, 1);
  assert.match(b.socket.messages.at(-1).reason, /3分/);
  await b.instance.startLiveSession({});
  assert.equal(b.counts().connects, 1);
});

test('limit reached or storage unavailable never connects to Gemini', async () => {
  for (const reserveSlot of [async () => null, async () => { throw new Error('offline'); }]) {
    const b = bridge({ reserveSlot });
    await b.instance.startLiveSession({});
    assert.equal(b.counts().connects, 0);
    assert.equal(b.socket.readyState, 3);
    assert.equal(b.socket.messages.at(-1).type, 'session_closed');
  }
});

test('duplicate start requests cannot reserve extra slots or create extra sessions', async () => {
  const b = bridge();
  await Promise.all([b.instance.startLiveSession({}), b.instance.startLiveSession({})]);
  await b.instance.startLiveSession({});
  assert.deepEqual(b.counts(), { closes: 0, connects: 1, reservations: 1 });
  b.instance.finishSession('done');
});

test('connection resolving after client disconnect is closed immediately', async () => {
  let resolveConnect;
  const b = bridge({ createAI: () => ({ live: { connect: () => new Promise(resolve => { resolveConnect = resolve; }) } }) });
  const starting = b.instance.startLiveSession({});
  await new Promise(resolve => setImmediate(resolve));
  b.socket.close();
  resolveConnect(b.session);
  await starting;
  assert.equal(b.counts().closes, 1);
  assert.equal(b.socket.messages.filter(m => m.type === 'session_ready').length, 0);
});

test('connection resolving after deadline is closed immediately', async () => {
  let resolveConnect;
  const b = bridge({ durationMs: 20, createAI: () => ({ live: { connect: () => new Promise(resolve => { resolveConnect = resolve; }) } }) });
  const starting = b.instance.startLiveSession({});
  await new Promise(resolve => setTimeout(resolve, 50));
  resolveConnect(b.session);
  await starting;
  assert.equal(b.counts().closes, 1);
  assert.equal(b.socket.readyState, 3);
  assert.equal(b.socket.messages.filter(m => m.type === 'session_ready').length, 0);
});

test('system instruction defines a serious, calm secretary', () => {
  const instruction = buildSystemInstruction({ cameraEnabled: false, googleSearchEnabled: false });
  assert.match(instruction, /真面目/);
  assert.match(instruction, /常に冷静な秘書/);
  assert.match(instruction, /礼儀正しい敬語/);
  assert.doesNotMatch(instruction, /明るく/);
});
