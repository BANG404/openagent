import { test, expect, afterEach } from 'bun:test';
import { mkdtemp, rm, readdir, readFile, mkdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { configuration, errorCode } from '../lib/config.mjs';
import { record, flush, status } from '../lib/store.mjs';
import { buildExport, stableId, upload } from '../lib/otel.mjs';

const homes = [];
const servers = [];
afterEach(async () => {
  for (const server of servers.splice(0)) server.stop(true);
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});
async function home() {
  const directory = await mkdtemp(path.join(tmpdir(), 'oa-langfuse-test-'));
  homes.push(directory);
  return directory;
}
const env = (extra = {}) => ({ PLUGIN_CONFIG_ENABLED: 'true', PLUGIN_CONFIG_PUBLIC_KEY: 'public-fixture', PLUGIN_CONFIG_SECRET_KEY: 'secret-fixture', ...extra });
const config = (extra = {}) => configuration(env(extra));
const event = (name, extra = {}) => ({ hook_event_name: name, cwd: '/must-not-export', event: {
  conversation_id: 'conversation', branch_id: 'branch', execution_id: 'execution', turn: 1,
  context_session: { version: 1, id: 'a'.repeat(64) }, ...extra,
} });
async function completed(data, conf = config(), execution = 'execution', phase = 'final_completed') {
  await record(event('SessionStart', { execution_id: execution }), conf, data, 100);
  await record(event('BeforeModel', { execution_id: execution }), conf, data, 110);
  await record(event('AfterModel', { execution_id: execution }), conf, data, 120);
  await record(event('PreToolUse', { execution_id: execution, tool_name: 'read_file', tool_use_id: 'call-1', tool_input: { file: 'sensitive-input' } }), conf, data, 125);
  await record(event('PostToolUse', { execution_id: execution, tool_name: 'read_file', tool_use_id: 'call-1', tool_response: 'sensitive-output' }), conf, data, 130);
  await record(event('Stop', { execution_id: execution, phase }), conf, data, 140);
}
async function states(data) {
  const dir = path.join(data, 'executions');
  return Promise.all((await readdir(dir)).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(path.join(dir, name), 'utf8'))));
}
function mock(handler) {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handler });
  servers.push(server);
  return server;
}

test('upload requires explicit enablement and credentials; no ambient Langfuse credentials are used', async () => {
  expect(configuration({ LANGFUSE_PUBLIC_KEY: 'ambient', LANGFUSE_SECRET_KEY: 'ambient', TRACE_TO_LANGFUSE: 'true' }).ready).toBe(false);
  expect(configuration({ PLUGIN_CONFIG_ENABLED: 'true' }).missing).toEqual(['public-key', 'secret-key']);
  expect(configuration({}).captureContent).toBe(false);
  const data = await home();
  await record(event('SessionStart'), configuration({}), data);
  expect(await readdir(data)).toEqual([]);
  expect((await flush(configuration({}), data)).skipped).toBe(true);
});

test('endpoint validation allows private IPv4 HTTP and rejects public HTTP, credentials and unsafe schemes', () => {
  for (const endpoint of ['http://example.com', 'http://8.8.8.8', 'http://172.15.0.1', 'http://172.32.0.1', 'http://192.169.1.1', 'http://169.254.1.1', 'http://[::]', 'https://user:password@example.com', 'https://example.com?q=x', 'https://example.com/#x', 'file:///tmp', 'invalid']) {
    expect(() => config({ PLUGIN_CONFIG_BASE_URL: endpoint })).toThrow('invalid_endpoint');
  }
  expect(config({ PLUGIN_CONFIG_BASE_URL: 'http://127.0.0.1:1234/' }).endpoint).toBe('http://127.0.0.1:1234/api/public/otel/v1/traces');
  for (const host of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.123.47']) {
    expect(config({ PLUGIN_CONFIG_BASE_URL: `http://${host}:3033/` }).endpoint).toBe(`http://${host}:3033/api/public/otel/v1/traces`);
  }
});

test('chat messages require separate capture consent and export only on the Agent root', async () => {
  const observation = { version: 1, messages: [{ id: 'input', role: 'user', text: 'authored-input', truncated: false }, { id: 'reply', role: 'assistant', text: 'visible-output', truncated: false }], truncated: false };
  const envelope = { ...event('Stop', { phase: 'final_completed' }), observation };
  const off = config({ PLUGIN_CONFIG_CAPTURE_CONTENT: 'true' });
  const disabled = await home();
  await record(event('SessionStart'), off, disabled, 100);
  await record(envelope, off, disabled, 140);
  expect(JSON.stringify(await states(disabled))).not.toContain('authored-input');
  const on = config({ PLUGIN_CONFIG_CAPTURE_MESSAGES: 'true' });
  const enabled = await home();
  await record(event('SessionStart'), on, enabled, 100);
  await record(event('BeforeModel'), on, enabled, 110);
  await record(event('AfterModel'), on, enabled, 120);
  await record(envelope, on, enabled, 140);
  const state = (await states(enabled))[0];
  const spans = buildExport(state, on).resourceSpans[0].scopeSpans[0].spans;
  expect(spans[0].attributes.find(a => a.key === 'langfuse.observation.input').value.stringValue).toContain('authored-input');
  expect(spans[0].attributes.find(a => a.key === 'langfuse.observation.output').value.stringValue).toContain('visible-output');
  expect(JSON.stringify(spans.slice(1))).not.toContain('visible-output');
  expect(JSON.stringify(buildExport(state, off))).not.toContain('authored-input');
  expect(JSON.stringify(buildExport((await states(disabled))[0], on))).not.toContain('authored-input');
  await flush(off, enabled, async (_url, request) => {
    expect(request.body).not.toContain('authored-input');
    expect(request.body).not.toContain('visible-output');
    return Response.json({});
  });
  expect(JSON.stringify(await states(enabled))).not.toContain('visible-output');
});

test('unknown observation versions and malformed messages do not retain extra fields', async () => {
  const data = await home();
  const on = config({ PLUGIN_CONFIG_CAPTURE_MESSAGES: 'true' });
  await record(event('SessionStart'), on, data);
  await record({ ...event('Stop'), observation: { version: 1, messages: [null, { role: 'system', id: 'sys', text: 'private-system' }, { role: 'assistant', id: 'answer', text: '界'.repeat(20000), reasoning: 'private-reasoning' }] } }, on, data);
  const state = (await states(data))[0];
  expect(JSON.stringify(state)).not.toContain('private-system');
  expect(JSON.stringify(state)).not.toContain('private-reasoning');
  expect(Buffer.byteLength(state.events.at(-1).observation.messages[0].text)).toBe(8190);
  expect(state.events.at(-1).observation.messages[0].text).not.toContain('\ufffd');
  expect(state.events.at(-1).observation.truncated).toBe(true);
});

test('OTLP exports hierarchy, timestamps, session metadata and no unavailable model data', async () => {
  const data = await home();
  await completed(data);
  const payload = buildExport((await states(data))[0], config());
  const spans = payload.resourceSpans[0].scopeSpans[0].spans;
  expect(spans).toHaveLength(3);
  expect(spans[0].parentSpanId).toBeUndefined();
  expect(spans[1].parentSpanId).toBe(spans[0].spanId);
  expect(spans[2].parentSpanId).toBe(spans[0].spanId);
  expect(spans[1].startTimeUnixNano).toBe('110000000');
  expect(spans[1].endTimeUnixNano).toBe('120000000');
  for (const span of spans) {
    expect(span.traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(span.spanId).toMatch(/^[a-f0-9]{16}$/);
    expect(span.attributes.some(a => a.key === 'langfuse.session.id' && a.value.stringValue === 'a'.repeat(64))).toBe(true);
  }
  const raw = JSON.stringify(payload);
  expect(raw).not.toContain('usage_details');
  expect(raw).not.toContain('model.name');
  expect(raw).not.toContain('sensitive');
  expect(raw).not.toContain('must-not-export');
});

test('tool content opt-in uploads bounded values, and current opt-out suppresses queued content', async () => {
  const data = await home();
  const capture = config({ PLUGIN_CONFIG_CAPTURE_CONTENT: 'true' });
  await completed(data, capture);
  const state = (await states(data))[0];
  expect(JSON.stringify(buildExport(state, capture))).toContain('sensitive-output');
  expect(JSON.stringify(buildExport(state, capture))).toContain('sensitive-input');
  expect(JSON.stringify(buildExport(state, config()))).not.toContain('sensitive');
  const requests = [];
  const server = mock(async req => { requests.push(await req.json()); return Response.json({}); });
  await flush(config({ PLUGIN_CONFIG_BASE_URL: server.url.href }), data);
  expect(JSON.stringify(requests)).not.toContain('sensitive');
  expect(JSON.stringify(await states(data))).not.toContain('sensitive');
});

test('HTTP JSON ingestion uses Basic auth, version header and complete acceptance before deduplication', async () => {
  const requests = [];
  const server = mock(async request => {
    expect(new URL(request.url).pathname).toBe('/api/public/otel/v1/traces');
    expect(request.headers.get('authorization')).toBe(`Basic ${Buffer.from('public-fixture:secret-fixture').toString('base64')}`);
    expect(request.headers.get('x-langfuse-ingestion-version')).toBe('4');
    expect(request.headers.get('content-type')).toBe('application/json');
    requests.push(await request.json());
    return Response.json({});
  });
  const data = await home();
  const conf = config({ PLUGIN_CONFIG_BASE_URL: server.url.href });
  await completed(data, conf);
  expect(await flush(conf, data)).toEqual({ uploaded: 1 });
  await record(event('Stop', { phase: 'final_completed' }), conf, data);
  expect(await flush(conf, data)).toEqual({ uploaded: 0 });
  expect(requests).toHaveLength(1);
  expect(await status(data)).toEqual({ active: 0, pending: 0, delivered: 1 });
});

test('failed and partially rejected uploads retain retryable records with stable IDs', async () => {
  let mode = 'http';
  const requests = [];
  const server = mock(async request => {
    requests.push(await request.json());
    if (mode === 'http') return new Response('must-not-log-secret', { status: 401 });
    if (mode === 'partial') return Response.json({ partialSuccess: { rejectedSpans: '1', errorMessage: 'must-not-log-secret' } });
    return Response.json({});
  });
  const data = await home();
  const conf = config({ PLUGIN_CONFIG_BASE_URL: server.url.href });
  await completed(data, conf);
  expect(await flush(conf, data)).toEqual({ uploaded: 0, error: 'upload_http_401' });
  expect((await status(data)).pending).toBe(1);
  mode = 'partial';
  expect(await flush(conf, data)).toEqual({ uploaded: 0, error: 'upload_partial' });
  mode = 'ok';
  expect((await flush(conf, data)).uploaded).toBe(1);
  expect(requests[0]).toEqual(requests[2]);
});

test('concurrent tool hooks and upload processes preserve independent calls and upload once', async () => {
  const data = await home();
  const conf = config();
  await record(event('SessionStart'), conf, data);
  await Promise.all(Array.from({ length: 16 }, (_, i) => record(event('PostToolUse', { tool_name: 'tool', tool_use_id: `call-${i}` }), conf, data)));
  await record(event('Stop', { phase: 'final_completed' }), conf, data);
  let count = 0;
  const send = async () => { count++; await new Promise(resolve => setTimeout(resolve, 50)); return Response.json({}); };
  await Promise.all([flush(conf, data, send), flush(conf, data, send)]);
  expect(count).toBe(1);
});

test('execution IDs isolate approval resumes and branches even with identical conversation and run IDs', async () => {
  const data = await home();
  const conf = config();
  await completed(data, conf, 'approval', 'interrupted');
  await completed(data, conf, 'resume');
  const payloads = (await states(data)).map(state => buildExport(state, conf));
  expect(new Set(payloads.map(p => p.resourceSpans[0].scopeSpans[0].spans[0].traceId)).size).toBe(2);
  expect((await status(data)).pending).toBe(2);
  expect(new Set(payloads.map(p => p.resourceSpans[0].scopeSpans[0].spans[0].attributes.find(a => a.key === 'langfuse.session.id').value.stringValue)).size).toBe(1);
});

test('compaction splits one execution into linked traces with stable session propagation and retry', async () => {
  const data = await home();
  const conf = config();
  const before = { version: 1, id: 'a'.repeat(64) };
  const after = { version: 1, id: 'b'.repeat(64), previous_id: before.id, compaction_message_id: 'durable-boundary' };
  await record(event('SessionStart', { context_session: before }), conf, data, 100);
  await record(event('BeforeModel', { context_session: before }), conf, data, 110);
  await record(event('AfterModel', { context_session: before }), conf, data, 120);
  await record(event('BeforeModel', { context_session: after, turn: 2 }), conf, data, 130);
  await record(event('AfterModel', { context_session: after, turn: 2 }), conf, data, 140);
  await record(event('Stop', { context_session: after, phase: 'final_completed' }), conf, data, 150);
  const payload = buildExport((await states(data))[0], conf);
  expect(payload.resourceSpans.length).toBe(2);
  const groups = payload.resourceSpans.map(resource => resource.scopeSpans[0].spans);
  expect(groups[0][0].traceId).not.toBe(groups[1][0].traceId);
  for (const [index, spans] of groups.entries()) {
    expect(spans.every(span => span.traceId === spans[0].traceId)).toBe(true);
    expect(spans.every(span => span.attributes.some(a => a.key === 'langfuse.session.id' && a.value.stringValue === [before, after][index].id))).toBe(true);
    expect(spans.slice(1).every(span => span.parentSpanId === spans[0].spanId)).toBe(true);
  }
  expect(groups[1][0].attributes).toContainEqual({ key: 'langfuse.trace.metadata.previous_session_id', value: { stringValue: before.id } });
  let rejected;
  await flush(conf, data, async (_url, request) => { rejected = request.body; return new Response(null, { status: 503 }); });
  await flush(conf, data, async (_url, request) => { expect(request.body).toBe(rejected); return Response.json({}); });
});

test('new hooks require durable context identities and old pending records keep their original IDs', async () => {
  const data = await home();
  await expect(record(event('SessionStart', { context_session: undefined }), config(), data)).rejects.toThrow('invalid_event');
  await expect(record(event('SessionStart', { context_session: { version: 2, id: 'a'.repeat(64) } }), config(), data)).rejects.toThrow('invalid_event');
  const old = { version: 1, events: [
    { name: 'SessionStart', time: 100, event: { conversation_id: 'old', execution_id: 'pending', turn: 1 } },
    { name: 'Stop', time: 110, event: { conversation_id: 'old', execution_id: 'pending', turn: 1, phase: 'final_completed' } },
  ] };
  const span = buildExport(old, config()).resourceSpans[0].scopeSpans[0].spans[0];
  expect(span.traceId).toBe(stableId(['openagent', 'old', 'pending']));
  expect(span.attributes).toContainEqual({ key: 'langfuse.session.id', value: { stringValue: 'old' } });
  expect(span.attributes).toContainEqual({ key: 'langfuse.trace.metadata.context_identity', value: { stringValue: 'legacy_unknown' } });
});

test('child session association, cancellation and failure phases retain honest status', async () => {
  const data = await home();
  const conf = config();
  await record(event('BeforeModel', { parent_conv_id: 'parent', role_id: 'worker' }), conf, data, 100);
  await record(event('Stop', { phase: 'final_cancelled' }), conf, data, 110);
  const spans = buildExport((await states(data))[0], conf).resourceSpans[0].scopeSpans[0].spans;
  expect(spans[0].name).toBe('OpenAgent Subagent Execution');
  expect(spans[0].attributes).toContainEqual({ key: 'langfuse.session.id', value: { stringValue: 'a'.repeat(64) } });
  expect(spans[1].attributes).toContainEqual({ key: 'langfuse.observation.metadata.incomplete', value: { stringValue: 'true' } });
  await completed(data, conf, 'failed', 'final_failed');
  const failed = (await states(data)).find(state => state.events[0].event.execution_id === 'failed');
  expect(buildExport(failed, conf).resourceSpans[0].scopeSpans[0].spans[0].status.code).toBe(2);
});

test('redirects and network errors never leak remote messages or follow credential redirects', async () => {
  let redirected = false;
  const target = mock(() => { redirected = true; return Response.json({}); });
  const server = mock(() => new Response(null, { status: 307, headers: { location: target.url.href } }));
  await expect(upload({}, config({ PLUGIN_CONFIG_BASE_URL: server.url.href }))).rejects.toThrow('upload_network');
  expect(redirected).toBe(false);
  expect(errorCode(new Error('secret-key, token, remote body'))).toBe('storage_error');
});

test('malformed success responses remain retryable', async () => {
  const data = await home();
  await completed(data);
  expect(await flush(config(), data, async () => new Response('invalid-success-response'))).toEqual({ uploaded: 0, error: 'upload_response' });
  expect((await status(data)).pending).toBe(1);
});

test('bounded queue preserves pending records and rejects unsafe routing IDs', async () => {
  const data = await home();
  const conf = config();
  await expect(record(event('Stop', { execution_id: '../../escape' }), conf, data)).resolves.toEqual({ recorded: true });
  expect((await readdir(path.join(data, 'executions')))[0]).toMatch(/^[a-f0-9]{32}\.json$/);
  for (let i = 1; i < 128; i++) await record(event('Stop', { execution_id: `run-${i}` }), conf, data);
  await expect(record(event('Stop', { execution_id: 'overflow' }), conf, data)).rejects.toThrow('storage_limit');
  expect((await status(data)).pending).toBe(128);
  await expect(record(event('Stop', { execution_id: null }), conf, data)).rejects.toThrow('invalid_event');
});

test('stale crash locks recover without deleting queued telemetry', async () => {
  const data = await home();
  const lock = path.join(data, 'executions', 'store.lock');
  await mkdir(lock, { recursive: true });
  const stale = new Date(Date.now() - 60000);
  await utimes(lock, stale, stale);
  await record(event('Stop'), config(), data);
  expect((await status(data)).pending).toBe(1);
});

function processEntry(entry, input, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.resolve(import.meta.dir, '..', 'bin', entry)], { env: { ...process.env, ...environment } });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

test('real Node hooks remain silent, fail open and deduplicate repeated Stop', async () => {
  const data = await home();
  let calls = 0;
  const server = mock(() => { calls++; return Response.json({}); });
  const environment = { ...env({ PLUGIN_CONFIG_BASE_URL: server.url.href }), PLUGIN_DATA: data };
  for (const envelope of [event('SessionStart'), event('Stop', { phase: 'final_completed' }), event('Stop', { phase: 'final_completed' })]) {
    expect(await processEntry('hook.mjs', envelope, environment)).toEqual({ code: 0, stdout: '', stderr: '' });
  }
  expect(calls).toBe(1);
  const invalid = await processEntry('hook.mjs', { event: {} }, environment);
  expect(invalid.stdout).toBe('');
  expect(invalid.code).toBe(0);
});

test('status command uses live host locale and excludes credentials', async () => {
  const data = await home();
  const server = mock(async request => {
    const body = await request.json();
    expect(body.operation).toBe('locale.get');
    expect(request.headers.get('authorization')).toBe('Bearer fixture-token');
    return Response.json({ ok: true, result: { version: 1, locale: 'zh' } });
  });
  const result = await processEntry('command.mjs', { command: 'langfuse:status' }, {
    ...env(), PLUGIN_DATA: data, OPENAGENT_PLUGIN_HOST_URL: server.url.href, OPENAGENT_PLUGIN_HOST_TOKEN: 'fixture-token',
  });
  expect(result.stdout).toContain('已就绪');
  expect(result.stdout).not.toContain('secret-fixture');
  expect(result.stdout).not.toContain('fixture-token');
});
