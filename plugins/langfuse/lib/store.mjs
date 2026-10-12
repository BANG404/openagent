import { mkdir, readdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { stableId, buildExport, upload } from './otel.mjs';
import { errorCode } from './config.mjs';

const MAX_RECORDS = 128;
const MAX_EVENTS = 1000;
const MAX_BYTES = 2 * 1024 * 1024;
const names = new Set(['SessionStart', 'BeforeModel', 'AfterModel', 'PreToolUse', 'PostToolUse', 'Stop']);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const directory = data => {
  if (!data || !path.isAbsolute(data)) throw new Error('invalid_state');
  return path.join(data, 'executions');
};

async function locked(dir, key, action) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, `${key}.lock`);
  const deadline = Date.now() + 2000;
  for (;;) {
    try { await mkdir(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - (await stat(lock)).mtimeMs > 30000) {
          const stale = `${lock}.${randomUUID()}.stale`;
          await rename(lock, stale);
          await rm(stale, { recursive: true, force: true });
          continue;
        }
      } catch (recoveryError) { if (recoveryError.code !== 'ENOENT') throw recoveryError; }
      if (Date.now() >= deadline) throw new Error('storage_busy');
      await pause(25);
    }
  }
  try { return await action(); }
  finally { await rm(lock, { recursive: true, force: true }); }
}

async function read(file) {
  try {
    if ((await stat(file)).size > MAX_BYTES) throw new Error('invalid_state');
    const state = JSON.parse(await readFile(file, 'utf8'));
    if (state.version !== 1 || !Array.isArray(state.events) || !state.events.length || state.events.length > MAX_EVENTS) throw new Error('invalid_state');
    return state;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function save(file, state) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    await rename(temp, file);
  } finally { await rm(temp, { force: true }); }
}

function sanitized(envelope, config, time) {
  const event = envelope.event;
  if (!names.has(envelope.hook_event_name) || !event ||
    !['conversation_id', 'execution_id'].every(key => typeof event[key] === 'string' && event[key].length > 0 && event[key].length <= 256) ||
    !Number.isSafeInteger(event.turn) || event.turn < 0) throw new Error('invalid_event');
  const selected = { conversation_id: event.conversation_id, execution_id: event.execution_id, turn: event.turn };
  for (const key of ['branch_id', 'parent_conv_id', 'role_id', 'phase', 'tool_name', 'tool_use_id']) {
    if (typeof event[key] === 'string') selected[key] = event[key].slice(0, 256);
  }
  if (config.captureContent && ['PreToolUse', 'PostToolUse'].includes(envelope.hook_event_name)) {
    for (const key of ['tool_input', 'tool_response']) {
      if (event[key] !== undefined) {
        const content = JSON.stringify(event[key]);
        selected[key] = content.length <= 8192 ? event[key] : { truncated: true, text: content.slice(0, 8192) };
      }
    }
  }
  return { name: envelope.hook_event_name, event: selected, time };
}

export async function record(envelope, config, data, time = Date.now()) {
  if (!config.ready) return { skipped: true };
  const item = sanitized(envelope, config, time);
  const dir = directory(data);
  // One package lock also serializes capacity checks across executions.
  return locked(dir, 'store', async () => {
    const key = stableId([item.event.conversation_id, item.event.execution_id]);
    const file = path.join(dir, `${key}.json`);
    let state = await read(file);
    if (state?.delivered || state?.complete) return { duplicate: true };
    if (!state) {
      const files = (await readdir(dir)).filter(name => /^[a-f0-9]{32}\.json$/.test(name));
      if (files.length >= MAX_RECORDS) {
        // Pending records are never evicted to make room for new telemetry.
        for (const name of files) {
          const old = await read(path.join(dir, name));
          if (old?.delivered) { await rm(path.join(dir, name)); break; }
        }
        if ((await readdir(dir)).filter(name => /^[a-f0-9]{32}\.json$/.test(name)).length >= MAX_RECORDS) throw new Error('storage_limit');
      }
      state = { version: 1, events: [], captureContent: config.captureContent };
    }
    const identity = entry => JSON.stringify([entry.name, entry.event.turn, entry.event.tool_use_id]);
    if (state.events.some(entry => identity(entry) === identity(item))) return { duplicate: true };
    if (item.name === 'Stop') {
      state.events.push(item);
      state.complete = true;
    } else if (state.events.length < MAX_EVENTS - 1 && Buffer.byteLength(JSON.stringify(state)) < MAX_BYTES - 40000) {
      state.events.push(item);
    } else { state.truncated = true; }
    await save(file, state);
    return { recorded: true };
  });
}

export async function flush(config, data, fetcher = fetch) {
  if (!config.ready) return { skipped: true, uploaded: 0 };
  const dir = directory(data);
  // A separate upload lock prevents parallel Stop hooks from exporting twice.
  return locked(dir, 'upload', async () => {
    const files = (await readdir(dir)).filter(name => /^[a-f0-9]{32}\.json$/.test(name)).sort();
    let uploaded = 0;
    let attempted = 0;
    for (const name of files) {
      const file = path.join(dir, name);
      const state = await locked(dir, 'store', () => read(file));
      if (!state?.complete || state.delivered) continue;
      if (++attempted > 3) break;
      try {
        await upload(buildExport(state, config), config, fetcher);
        // Compact receipts retain deduplication without retaining captured content.
        const receipt = { ...state.events[0], event: { conversation_id: state.events[0].event.conversation_id, execution_id: state.events[0].event.execution_id } };
        await locked(dir, 'store', () => save(file, { version: 1, events: [receipt], delivered: true, complete: true }));
        uploaded++;
      } catch (error) { return { uploaded, error: errorCode(error) }; }
    }
    return { uploaded };
  });
}

export async function status(data) {
  const dir = directory(data);
  try {
    return await locked(dir, 'store', async () => {
      const counts = { pending: 0, active: 0, delivered: 0 };
      for (const name of (await readdir(dir)).filter(name => /^[a-f0-9]{32}\.json$/.test(name))) {
        const state = await read(path.join(dir, name));
        counts[state.delivered ? 'delivered' : state.complete ? 'pending' : 'active']++;
      }
      return counts;
    });
  } catch (error) { if (error.code === 'ENOENT') return { pending: 0, active: 0, delivered: 0 }; throw error; }
}
