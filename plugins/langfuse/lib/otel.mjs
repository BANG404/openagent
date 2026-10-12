import { createHash } from 'node:crypto';

export const stableId = (parts, length = 32) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, length);
const nano = ms => (BigInt(ms) * 1000000n).toString();
const text = value => {
  const serialized = JSON.stringify(value);
  return serialized.length > 8192 ? JSON.stringify({ truncated: true, text: serialized.slice(0, 8192) }) : serialized;
};
const attributes = values => Object.entries(values).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => ({
  key, value: Array.isArray(value) ? { arrayValue: { values: value.map(stringValue => ({ stringValue })) } } : { stringValue: String(value) },
}));

export function buildExport(state, config) {
  const segments = new Map();
  for (const event of state.events) {
    const key = event.event.context_session?.id;
    if (segments.has(key)) segments.get(key).events.push(event);
    else segments.set(key, { ...state, events: [event] });
  }
  return { resourceSpans: [...segments.values()].flatMap(segment => buildSegment(segment, config).resourceSpans) };
}

function buildSegment(state, config) {
  const events = state.events;
  const first = events[0];
  const last = events.at(-1);
  const context = first.event;
  // Existing pending 0.2 records keep their original trace/session identities.
  // They have no durable context identity and cannot be enriched retroactively.
  const session = context.context_session ?? { id: context.parent_conv_id ?? context.conversation_id };
  const traceId = stableId(context.context_session
    ? ['openagent', context.conversation_id, context.execution_id, session.id]
    : ['openagent', context.conversation_id, context.execution_id]);
  const rootId = stableId([traceId, 'execution'], 16);
  const phase = last.event.phase ?? 'context_compacted';
  const observation = config.captureMessages && state.captureMessages ? last.observation : undefined;
  const messages = observation?.version === 1 ? observation.messages : [];
  const input = messages.filter(message => message.role === 'user');
  const output = messages.filter(message => message.role === 'assistant');
  const conversation = {
    ...(input.length ? { 'langfuse.observation.input': JSON.stringify(input) } : {}),
    ...(output.length ? { 'langfuse.observation.output': JSON.stringify(output) } : {}),
  };
  const shared = {
    'langfuse.trace.name': context.parent_conv_id ? 'OpenAgent Subagent Execution' : 'OpenAgent Execution',
    'langfuse.session.id': session.id,
    'langfuse.user.id': config.userId,
    'langfuse.environment': config.environment,
    'langfuse.trace.tags': ['openagent', ...config.tags],
    'langfuse.version': '0.3.0',
    'langfuse.trace.metadata.conversation_id': context.conversation_id,
    'langfuse.trace.metadata.branch_id': context.branch_id,
    'langfuse.trace.metadata.execution_id': context.execution_id,
    'langfuse.trace.metadata.parent_conv_id': context.parent_conv_id,
    'langfuse.trace.metadata.role_id': context.role_id,
    'langfuse.trace.metadata.previous_session_id': session.previous_id,
    'langfuse.trace.metadata.compaction_message_id': session.compaction_message_id,
    'langfuse.trace.metadata.context_identity': context.context_session ? 'durable' : 'legacy_unknown',
  };
  const spans = [];
  function span(id, name, type, start, end, extra = {}, failed = false, parent = rootId) {
    spans.push({ traceId, spanId: id, ...(parent ? { parentSpanId: parent } : {}), name, kind: 1,
      startTimeUnixNano: nano(start), endTimeUnixNano: nano(Math.max(start, end)),
      attributes: attributes({ ...shared, 'langfuse.observation.type': type, ...extra }),
      status: { code: failed ? 2 : 1, ...(failed ? { message: phase } : {}) },
    });
  }
  span(rootId, shared['langfuse.trace.name'], 'agent', first.time, last.time, {
    ...conversation,
    ...(observation ? { 'langfuse.observation.metadata.messages_truncated': String(observation.truncated === true) } : {}),
    'langfuse.observation.metadata.phase': phase,
    'langfuse.observation.metadata.events_truncated': String(state.truncated === true),
  }, phase === 'final_failed', null);
  const pending = new Map();
  for (const item of events) {
    const event = item.event;
    const model = ['BeforeModel', 'AfterModel'].includes(item.name);
    const tool = ['PreToolUse', 'PostToolUse'].includes(item.name);
    if (!model && !tool) continue;
    const key = model ? `model:${event.turn}` : `tool:${event.tool_use_id}`;
    const starting = ['BeforeModel', 'PreToolUse'].includes(item.name);
    if (starting) { pending.set(key, item); continue; }
    const start = pending.get(key);
    pending.delete(key);
    const extra = { 'langfuse.observation.metadata.turn': String(event.turn) };
    if (tool) {
      extra['langfuse.observation.metadata.tool_use_id'] = event.tool_use_id;
      if (config.captureContent && state.captureContent) {
        const input = event.tool_input ?? start?.event.tool_input;
        if (input !== undefined) extra['langfuse.observation.input'] = text(input);
        if (event.tool_response !== undefined) extra['langfuse.observation.output'] = text(event.tool_response);
      }
    }
    span(stableId([traceId, key], 16), tool ? event.tool_name : 'Model call', tool ? 'tool' : 'generation', start?.time ?? item.time, item.time, extra);
  }
  for (const [key, item] of pending) {
    span(stableId([traceId, key], 16), item.event.tool_name ?? 'Model call', key.startsWith('tool:') ? 'tool' : 'generation', item.time, last.time,
      { 'langfuse.observation.metadata.incomplete': 'true' }, phase === 'final_failed');
  }
  return { resourceSpans: [{ resource: { attributes: attributes({ 'service.name': 'openagent-langfuse', 'service.version': '0.3.0' }) },
    scopeSpans: [{ scope: { name: 'openagent.langfuse', version: '0.3.0' }, spans }],
  }] };
}

export async function upload(payload, config, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(config.endpoint, { method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`,
        'x-langfuse-ingestion-version': '4' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(4000),
    });
  } catch (error) { throw new Error(error?.name === 'TimeoutError' ? 'upload_timeout' : 'upload_network'); }
  if (!response.ok) throw new Error(`upload_http_${response.status}`);
  let body;
  try {
    const raw = await response.text();
    if (raw.length > 65536) throw new Error();
    body = raw.trim() ? JSON.parse(raw) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch { throw new Error('upload_response'); }
  const rejected = Number(body.partialSuccess?.rejectedSpans ?? 0);
  if (!Number.isSafeInteger(rejected) || rejected < 0) throw new Error('upload_response');
  if (rejected > 0) throw new Error('upload_partial');
}
