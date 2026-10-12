import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runtimeAcceptance } from '../../openagent-plugin-kit/lib/runtime-acceptance.mjs';
import { configuration } from '../lib/config.mjs';
import { stableId } from '../lib/otel.mjs';

const live = process.argv.includes('--live');
const readApi = process.argv.includes('--read-api=v1') ? 'v1' : 'v2';
const liveConfig = live ? configuration({ PLUGIN_CONFIG_ENABLED: 'true',
  PLUGIN_CONFIG_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
  PLUGIN_CONFIG_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
  PLUGIN_CONFIG_BASE_URL: process.env.LANGFUSE_BASE_URL }) : null;
if (live) assert(liveConfig.ready && process.env.LANGFUSE_BASE_URL, 'Live verification requires explicit Langfuse credentials and base URL');
async function liveGet(route) {
  const response = await fetch(new URL(route, liveConfig.baseUrl), {
    headers: { authorization: `Basic ${Buffer.from(`${liveConfig.publicKey}:${liveConfig.secretKey}`).toString('base64')}` },
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  assert(response.ok, `Langfuse readback HTTP ${response.status}`);
  return response.json();
}

const root = path.resolve(import.meta.dirname, '../../..');
const artifacts = await mkdtemp(path.join(tmpdir(), 'openagent-langfuse-runtime-'));
const workspace = path.join(artifacts, 'workspace');
await mkdir(workspace);
await writeFile(path.join(workspace, 'fixture.txt'), 'Langfuse runtime fixture');
const payloads = [];
let reject = true;
let modelCalls = 0;
const ingestion = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  assert.equal(request.headers.get('authorization'), `Basic ${Buffer.from('public-fixture:secret-fixture').toString('base64')}`);
  payloads.push(await request.json());
  return reject ? new Response(null, { status: 503 }) : Response.json({});
} });
const model = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  const body = await request.json();
  modelCalls++;
  const messages = body.messages ?? [];
  const lastUser = messages.findLastIndex(message => message.role === 'user');
  const hasToolResult = messages.slice(lastUser + 1).some(message => message.role === 'tool');
  const message = { role: 'assistant', content: 'Langfuse runtime fixture completed.' };
  const tool = body.tools?.find(tool => tool.function.name === 'exec_command');
  if (tool && !hasToolResult && JSON.stringify(messages[lastUser]).includes('Run the telemetry fixture')) {
    message.content = '';
    message.tool_calls = [{ function: { name: tool.function.name, arguments: { cmd: 'Write-Output langfuse-runtime-fixture' } } }];
  }
  return new Response(JSON.stringify({ model: 'fixture-model', created_at: new Date().toISOString(), message,
    done: true, done_reason: 'stop', prompt_eval_count: 30, eval_count: 8 }) + '\n',
  { headers: { 'content-type': 'application/x-ndjson' } });
} });
try {
  const report = await runtimeAcceptance({
    executable: process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? path.join(root, 'src-tauri/binaries/openagent-server-x86_64-pc-windows-msvc.exe'),
    packageDirectory: path.join(root, 'plugins/langfuse'), workspace, outputDirectory: artifacts,
    permissionProfile: { enforcement: 'disabled' }, timeoutMs: live ? 180000 : 90000,
    async verify({ operation, request, home }) {
      const initial = await operation('get_agent_plugin_configuration', { plugin_id: 'langfuse' });
      assert.equal(initial.values.enabled, false);
      const saved = await operation('save_agent_plugin_configuration', { plugin_id: 'langfuse', revision: initial.revision,
        values: { enabled: true, 'public-key': liveConfig?.publicKey ?? 'public-fixture',
          'secret-key': liveConfig?.secretKey ?? 'secret-fixture', 'base-url': liveConfig?.baseUrl ?? ingestion.url.href } });
      assert(saved.secrets_set.includes('secret-key'));
      assert(!JSON.stringify(saved).includes('secret-fixture'));
      if (live) {
        assert(!JSON.stringify(saved).includes(liveConfig.secretKey), 'live credential must remain redacted');
        const projects = await liveGet('/api/public/projects');
        assert(projects.data?.length > 0, 'authenticated project required');
      }
      const config = await operation('get_settings');
      config.providers = [{ id: 'langfuse-fixture', name: 'Langfuse fixture', provider: 'ollama', api_key: '',
        base_url: model.url.href.replace(/\/$/, ''), enabled: true, models: ['fixture-model'], model_context_compaction_thresholds: {},
        model_reasoning_efforts: {}, model_reasoning_effort_enabled: {}, model_vision_enabled: {} }];
      config.defaults.chat_model = config.defaults.flash_model = { provider_id: 'langfuse-fixture', model: 'fixture-model' };
      config.approval_mode = 'off';
      config.memory_retrieval_enabled = false;
      for (const agent of Object.values(config.flash_agents)) if (agent && typeof agent === 'object') agent.enabled = false;
      await operation('save_settings', { config });
      const convId = randomUUID();
      await operation('create_conversation', { id: convId, title: 'Langfuse qualification', workspace });
      await operation('create_branch', { id: randomUUID(), convId });
      async function submit(text) {
        let accepted;
        await until(async () => {
          try {
            accepted = await request(`/api/conversations/${convId}/runs`, { text, user_message_id: randomUUID(), assistant_message_id: randomUUID(),
              attachments: [], contexts: [], model_binding: { providerId: 'langfuse-fixture', model: 'fixture-model' } });
            return true;
          } catch (error) { if (!error.message.includes('already active')) throw error; return false; }
        });
        return accepted;
      }
      async function until(predicate) {
        const deadline = Date.now() + 30000;
        for (;;) {
          if (await predicate()) return;
          assert(Date.now() < deadline, 'Runtime telemetry timeout');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      const data = path.join(home, 'plugin-data/langfuse/executions');
      async function records() {
        const names = await readdir(data).catch(() => []);
        return Promise.all(names.filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(path.join(data, name), 'utf8'))));
      }
      await submit('Run the telemetry fixture');
      if (live) {
        await until(async () => (await records()).some(record => record.delivered));
        const receipt = (await records()).find(record => record.delivered);
        const execution = receipt.events[0].event;
        const traceId = stableId(['openagent', execution.conversation_id, execution.execution_id]);
        let observations;
        const from = new Date(Date.now() - 300000).toISOString();
        const deadline = Date.now() + 90000;
        do {
          const query = new URLSearchParams({ traceId, limit: '100', fromStartTime: from,
            toStartTime: new Date(Date.now() + 60000).toISOString() });
          if (readApi === 'v2') query.set('fields', 'core,basic,io');
          const result = await liveGet(`/api/public/${readApi === 'v2' ? 'v2/' : ''}observations?${query}`);
          observations = result.data ?? [];
          if (['AGENT', 'GENERATION', 'TOOL'].every(type => observations.some(item => item.type === type))) break;
          assert(Date.now() < deadline, 'Langfuse observations readback timeout');
          await new Promise(resolve => setTimeout(resolve, 2000));
        } while (true);
        assert(observations.every(item => item.traceId === traceId), 'readback trace identity');
        const agent = observations.find(item => item.type === 'AGENT');
        assert(observations.filter(item => item.type !== 'AGENT').every(item => item.parentObservationId === agent.id), 'readback span hierarchy');
        assert(observations.every(item => item.input == null && item.output == null), 'tool content stays disabled');
        const current = await operation('get_agent_plugin_configuration', { plugin_id: 'langfuse' });
        await operation('save_agent_plugin_configuration', { plugin_id: 'langfuse', revision: current.revision, values: { enabled: false } });
        await submit('Telemetry disabled fixture');
        await new Promise(resolve => setTimeout(resolve, 1000));
        assert.equal((await records()).length, 1, 'disabled hooks create no telemetry');
        return [{ kind: 'authenticated_project', passed: true }, { kind: 'live_runtime_trace_readback', passed: true,
          trace_id: traceId, observations: observations.length, types: observations.map(item => item.type), model_calls: modelCalls, read_api: readApi },
          { kind: 'live_secret_redaction_content_optout_and_disable', passed: true }];
      }
      await until(async () => payloads.length > 0 && (await records()).some(record => record.complete));
      assert((await records()).some(record => record.complete && !record.delivered), 'failed upload remains queued');
      const spans = payloads[0].resourceSpans[0].scopeSpans[0].spans;
      assert(spans.some(span => span.attributes.some(attribute => attribute.key === 'langfuse.observation.type' && attribute.value.stringValue === 'tool')), 'real tool span required');
      assert(spans.some(span => span.attributes.some(attribute => attribute.key === 'langfuse.observation.type' && attribute.value.stringValue === 'generation')), 'real model timing required');
      assert(!JSON.stringify(payloads[0]).includes('langfuse-runtime-fixture'), 'tool content is opt-in');
      reject = false;
      await submit('/langfuse:retry');
      await until(async () => (await records()).some(record => record.delivered));
      assert.deepEqual(payloads[0], payloads[1], 'retry preserves payload and span IDs');
      const beforeDisable = payloads.length;
      const current = await operation('get_agent_plugin_configuration', { plugin_id: 'langfuse' });
      await operation('save_agent_plugin_configuration', { plugin_id: 'langfuse', revision: current.revision, values: { enabled: false } });
      await submit('Telemetry disabled fixture');
      await new Promise(resolve => setTimeout(resolve, 1000));
      assert.equal(payloads.length, beforeDisable, 'disabled upload sends nothing');
      return [{ kind: 'configuration_secret_redaction', passed: true }, { kind: 'real_agent_model_and_tool_hooks', passed: true, model_calls: modelCalls, spans: spans.length },
        { kind: 'failed_upload_retry_and_disable', passed: true }];
    },
  });
  if (live) {
    await rm(path.join(report.home, 'plugin-settings/langfuse.json'), { force: true });
    const redact = text => text.split(liveConfig.secretKey).join('[redacted]').split(liveConfig.publicKey).join('[redacted]');
    for (const file of [report.logs.stdout, report.logs.stderr]) await writeFile(file, redact(await readFile(file, 'utf8')));
    if (report.error) report.error = redact(report.error);
    await writeFile(report.report_path, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ passed: report.passed, report: report.report_path, checks: report.checks, error: report.error }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally { ingestion.stop(true); model.stop(true); }
