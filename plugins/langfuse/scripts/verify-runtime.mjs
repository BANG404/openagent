import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runtimeAcceptance } from '../../openagent-plugin-kit/lib/runtime-acceptance.mjs';

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
    executable: process.argv[2] ?? path.join(root, 'src-tauri/binaries/openagent-server-x86_64-pc-windows-msvc.exe'),
    packageDirectory: path.join(root, 'plugins/langfuse'), workspace, outputDirectory: artifacts,
    permissionProfile: { enforcement: 'disabled' }, timeoutMs: 90000,
    async verify({ operation, request, home }) {
      const initial = await operation('get_agent_plugin_configuration', { plugin_id: 'langfuse' });
      assert.equal(initial.values.enabled, false);
      const saved = await operation('save_agent_plugin_configuration', { plugin_id: 'langfuse', revision: initial.revision,
        values: { enabled: true, 'public-key': 'public-fixture', 'secret-key': 'secret-fixture', 'base-url': ingestion.url.href } });
      assert(saved.secrets_set.includes('secret-key'));
      assert(!JSON.stringify(saved).includes('secret-fixture'));
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
  console.log(JSON.stringify({ passed: report.passed, report: report.report_path, checks: report.checks, error: report.error }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally { ingestion.stop(true); model.stop(true); }
