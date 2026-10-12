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
await writeFile(path.join(workspace, 'legacy-hook.mjs'), `import {appendFileSync} from 'node:fs';let input='';for await(const chunk of process.stdin)input+=chunk;const event=JSON.parse(input);appendFileSync('legacy-hooks.jsonl',JSON.stringify({has_observation:Object.hasOwn(event,'observation')})+'\\n');`);
const payloads = [];
let reject = true;
let modelCalls = 0;
let rejectCompaction = false;
let contextRejected = false;
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
  if (JSON.stringify(messages).includes('Return the summary directly as Markdown')) {
    if (rejectCompaction) return new Response(JSON.stringify({ error: 'fixture compaction rejected' }), { status: 400 });
    message.content = '## Current progress\n- Fixture completed.\n\n## Key decisions\n- Preserve context stages.\n\n## Constraints and user preferences\n- Synthetic data only.\n\n## Next steps\n- Verify session.';
  } else if (!contextRejected && JSON.stringify(messages[lastUser]).includes('Recover context limit fixture')) {
    contextRejected = true;
    return new Response(JSON.stringify({ error: 'Context size has been exceeded.' }), { status: 400 });
  } else if (tool && !hasToolResult && JSON.stringify(messages[lastUser]).includes('Run the telemetry fixture')) {
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
      config.model_retry.retry_count = 0;
      config.context_compaction_enabled = true;
      config.automation_hooks.push({ id: 'legacy-observation-fixture', name: 'Ordinary hook fixture', enabled: true, event: 'stop', matcher: '*', timeout_secs: 10, action: { type: 'command', command: 'node legacy-hook.mjs' } });
      for (const agent of Object.values(config.flash_agents)) if (agent && typeof agent === 'object') agent.enabled = false;
      await operation('save_settings', { config });
      const convId = randomUUID();
      await operation('create_conversation', { id: convId, title: 'Langfuse qualification', workspace });
      const branchId = randomUUID();
      await operation('create_branch', { id: branchId, convId });
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
      async function sessionCaptureChecks() {
        async function restoreCurrent() {
          const checkpointId = await operation('get_active_branch_tip', { convId });
          assert(checkpointId, 'restoration requires the selected checkpoint');
          await operation('restore_agent_history', { convId, checkpointId });
        }
        async function turn(text, start = () => submit(text)) {
          const before = new Set((await records()).map(record => record.events[0].event.execution_id));
          await until(async () => {
            try { await start(); return true; }
            catch (error) { if (!/already active|while a chat run is active/i.test(error.message)) throw error; return false; }
          });
          let receipt;
          await until(async () => {
            receipt = (await records()).find(record => record.delivered && !before.has(record.events[0].event.execution_id));
            return !!receipt;
          });
          // Stop upload precedes terminal branch-head publication and guard release.
          // Wait for the real restore boundary before reading a fork source.
          await until(async () => {
            try { await restoreCurrent(); return true; }
            catch (error) { if (!error.message.includes('while a chat run is active')) throw error; return false; }
          });
          const execution = receipt.events[0].event;
          const traceId = stableId(['openagent', execution.conversation_id, execution.execution_id, execution.context_session.id]);
          if (live) {
            await until(async () => {
              const result = await liveGet(`/api/public/traces/${traceId}`).catch(() => null);
              if (!result) return false;
              assert.equal(result.sessionId, execution.context_session.id, 'server session matches Runtime identity');
              if (execution.context_session.previous_id) assert.equal(result.metadata.previous_session_id, execution.context_session.previous_id, 'server retains previous session link');
              return true;
            });
          } else {
            const payload = payloads.find(payload => payload.resourceSpans.some(resource => resource.scopeSpans[0].spans[0].traceId === traceId));
            assert(payload, 'session trace uploaded');
            for (const resource of payload.resourceSpans) {
              const spans = resource.scopeSpans[0].spans;
              const id = spans[0].attributes.find(attribute => attribute.key === 'langfuse.session.id').value.stringValue;
              assert(spans.every(span => span.attributes.some(attribute => attribute.key === 'langfuse.session.id' && attribute.value.stringValue === id)), 'stage session propagated to every observation');
            }
          }
          return { trace_id: traceId, session: execution.context_session };
        }
        const original = (await records())[0].events[0].event.context_session;
        assert((await records()).every(record => record.events[0].event.context_session.id === original.id), 'ordinary turns keep one session');
        rejectCompaction = true;
        try { await submit('/compact'); assert.fail('failed compaction must reject'); }
        catch (error) { assert(!error.message.includes('failed compaction must reject'), 'failed compaction must reject'); }
        finally { rejectCompaction = false; }
        const failed = await turn('Continue after failed compaction fixture');
        assert.equal(failed.session.id, original.id, 'failed compaction does not advance session');
        await submit('/compact');
        const compacted = await turn('After successful context compaction fixture');
        assert.notEqual(compacted.session.id, original.id, 'successful manual compaction starts new session');
        assert.equal(compacted.session.previous_id, original.id, 'compaction links previous session');
        await until(async () => {
          try { await restoreCurrent(); return true; }
          catch (error) { if (!error.message.includes('while a chat run is active')) throw error; return false; }
        });
        const restored = await turn('Restored same context fixture');
        assert.equal(restored.session.id, compacted.session.id, 'restoration retains session');
        const recovered = await turn('Recover context limit fixture');
        assert(contextRejected, 'provider context-limit recovery exercised');
        assert.notEqual(recovered.session.id, restored.session.id, 'in-flight recovery compaction advances session');
        assert.equal(recovered.session.previous_id, restored.session.id, 'in-flight recovery links previous session');
        const recoveryRecord = (await records()).find(record => record.events[0].event.context_session.id === recovered.session.id);
        const recoveryExecution = recoveryRecord.events[0].event;
        const beforeRecoveryTrace = stableId(['openagent', convId, recoveryExecution.execution_id, restored.session.id]);
        if (live) {
          const prior = await liveGet(`/api/public/traces/${beforeRecoveryTrace}`);
          assert.equal(prior.sessionId, restored.session.id, 'pre-compaction segment keeps previous session');
          assert.equal(prior.metadata.execution_id, recoveryExecution.execution_id, 'both stage traces retain execution identity');
        } else {
          const payload = payloads.find(payload => payload.resourceSpans.some(resource => resource.scopeSpans[0].spans[0].traceId === beforeRecoveryTrace));
          assert.equal(payload.resourceSpans.length, 2, 'one recovery execution exports two context traces');
        }
        const beforeFork = await operation('get_branches', { convId });
        const current = beforeFork.find(branch => branch.id === branchId);
        const checkpoints = await operation('get_renderable_checkpoints', { convId });
        const head = checkpoints.find(checkpoint => checkpoint.meta.checkpoint_id === current.head_checkpoint_id);
        const user = head.data.messages.findLast(message => message.role === 'user' && !(message.tags ?? []).length);
        const lineage = [];
        let cursor = head;
        while (cursor) {
          lineage.push(cursor);
          cursor = checkpoints.find(checkpoint => checkpoint.meta.checkpoint_id === cursor.meta.parent_checkpoint_id);
        }
        const firstWithUser = lineage.reverse().find(checkpoint => checkpoint.data.messages.some(message => message.id === user.id));
        const fork = await turn('Independent branch session fixture', () => request(`/api/conversations/${convId}/fork-runs`, {
          text: 'Independent branch session fixture', source_checkpoint_id: current.head_checkpoint_id,
          parent_checkpoint_id: firstWithUser.meta.parent_checkpoint_id, forked_from_message_id: user.id,
          user_message_id: randomUUID(), assistant_message_id: randomUUID(), attachments: [], contexts: [],
          model_binding: { providerId: 'langfuse-fixture', model: 'fixture-model' },
        }));
        assert.notEqual(fork.session.id, recovered.session.id, 'fork has independent session');
        await operation('set_active_branch_tip', { convId, checkpointId: current.head_checkpoint_id });
        const switched = await turn('Back to original branch fixture');
        assert.equal(switched.session.id, recovered.session.id, 'switching back resumes the original branch context session');
        return { kind: 'runtime_branch_compaction_restore_sessions', passed: true, conversation_id: convId,
          original_session_id: original.id, compacted_session_id: compacted.session.id, recovered_session_id: recovered.session.id,
          fork_session_id: fork.session.id, trace_id: compacted.trace_id, recovery_trace_id: recovered.trace_id };
      }
      async function messageCaptureChecks() {
        async function captureTurn(capture, text) {
          const before = new Set((await records()).map(record => record.events[0].event.execution_id));
          const current = await operation('get_agent_plugin_configuration', { plugin_id: 'langfuse' });
          await operation('save_agent_plugin_configuration', { plugin_id: 'langfuse', revision: current.revision, values: { 'capture-messages': capture } });
          await submit(text);
          let receipt;
          await until(async () => {
            receipt = (await records()).find(record => record.delivered && !before.has(record.events[0].event.execution_id));
            return !!receipt;
          });
          const execution = receipt.events[0].event;
          const traceId = stableId(['openagent', execution.conversation_id, execution.execution_id, execution.context_session.id]);
          if (live) {
            const deadline = Date.now() + 90000;
            let observations;
            do {
              const query = new URLSearchParams({ traceId, limit: '100' });
              if (readApi === 'v2') query.set('fields', 'core,basic,io');
              observations = (await liveGet(`/api/public/${readApi === 'v2' ? 'v2/' : ''}observations?${query}`)).data ?? [];
              const agent = observations.find(item => item.type === 'AGENT');
              if (agent && (!capture || agent.input != null && agent.output != null)) break;
              assert(Date.now() < deadline, 'Langfuse message observation readback timeout');
              await new Promise(resolve => setTimeout(resolve, 2000));
            } while (true);
            const agent = observations.find(item => item.type === 'AGENT');
            if (capture) {
              assert(JSON.stringify(agent.input).includes(text), 'authored input stored on Agent');
              assert(JSON.stringify(agent.output).includes('Langfuse runtime fixture completed.'), 'visible reply stored on Agent');
              assert(observations.filter(item => item.type !== 'AGENT').every(item => item.input == null && item.output == null), 'message projection belongs only to Agent root');
            } else assert(observations.every(item => item.input == null && item.output == null), 'revoked message capture sends no bodies');
          } else {
            const spans = payloads.find(payload => payload.resourceSpans[0].scopeSpans[0].spans[0].traceId === traceId).resourceSpans[0].scopeSpans[0].spans;
            const input = spans[0].attributes.find(attribute => attribute.key === 'langfuse.observation.input');
            const output = spans[0].attributes.find(attribute => attribute.key === 'langfuse.observation.output');
            if (capture) {
              assert(JSON.parse(input.value.stringValue).some(message => message.role === 'user' && message.text === text), 'authored input projection required');
              assert(JSON.parse(output.value.stringValue).some(message => message.role === 'assistant' && message.text === 'Langfuse runtime fixture completed.'), 'visible reply projection required');
              assert(!input.value.stringValue.includes('Run the telemetry fixture'), 'prior user messages excluded');
              assert(spans.slice(1).every(span => !span.attributes.some(attribute => ['langfuse.observation.input', 'langfuse.observation.output'].includes(attribute.key))), 'message projection belongs only to Agent root');
            } else assert(!input && !output, 'revoked message capture sends no bodies');
          }
          assert(!JSON.stringify(receipt).includes(text), 'delivered receipts remove captured bodies');
          return traceId;
        }
        const traceId = await captureTurn(true, 'Observe authored message fixture');
        await captureTurn(false, 'Revoked message capture fixture');
        await until(async () => {
          const hooks = (await readFile(path.join(workspace, 'legacy-hooks.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
          assert(hooks.every(hook => hook.has_observation === false), 'ordinary user hooks must never receive message observation');
          return hooks.length >= 3;
        });
        return { kind: 'runtime_message_optin_scope_and_revocation', passed: true, trace_id: traceId, conversation_id: convId };
      }
      await submit('Run the telemetry fixture');
      if (live) {
        await until(async () => (await records()).some(record => record.delivered));
        const receipt = (await records()).find(record => record.delivered);
        const execution = receipt.events[0].event;
        const traceId = stableId(['openagent', execution.conversation_id, execution.execution_id, execution.context_session.id]);
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
        const messageCheck = await messageCaptureChecks();
        const sessionCheck = await sessionCaptureChecks();
        const current = await operation('get_agent_plugin_configuration', { plugin_id: 'langfuse' });
        await operation('save_agent_plugin_configuration', { plugin_id: 'langfuse', revision: current.revision, values: { enabled: false } });
        await submit('Telemetry disabled fixture');
        await new Promise(resolve => setTimeout(resolve, 1000));
        assert.equal((await records()).length, 9, 'disabled hooks create no telemetry');
        return [{ kind: 'authenticated_project', passed: true }, { kind: 'live_runtime_trace_readback', passed: true,
          trace_id: traceId, observations: observations.length, types: observations.map(item => item.type), model_calls: modelCalls, read_api: readApi },
          { kind: 'live_secret_redaction_content_optout_and_disable', passed: true }, messageCheck, sessionCheck];
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
      await until(async () => {
        const completed = await records();
        return completed.length >= 2 && completed.every(record => record.delivered);
      });
      const messageCheck = await messageCaptureChecks();
      const sessionCheck = await sessionCaptureChecks();
      const beforeDisable = payloads.length;
      const current = await operation('get_agent_plugin_configuration', { plugin_id: 'langfuse' });
      await operation('save_agent_plugin_configuration', { plugin_id: 'langfuse', revision: current.revision, values: { enabled: false } });
      await submit('Telemetry disabled fixture');
      await new Promise(resolve => setTimeout(resolve, 1000));
      assert.equal(payloads.length, beforeDisable, 'disabled upload sends nothing');
      return [{ kind: 'configuration_secret_redaction', passed: true }, { kind: 'real_agent_model_and_tool_hooks', passed: true, model_calls: modelCalls, spans: spans.length },
        { kind: 'failed_upload_retry_and_disable', passed: true }, messageCheck, sessionCheck];
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
