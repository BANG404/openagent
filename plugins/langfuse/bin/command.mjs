import { configuration, errorCode } from '../lib/config.mjs';
import { flush, status } from '../lib/store.mjs';
import { stableId, upload } from '../lib/otel.mjs';

let locale = 'en';
async function currentLocale() {
  const base = process.env.OPENAGENT_PLUGIN_HOST_URL;
  const token = process.env.OPENAGENT_PLUGIN_HOST_TOKEN;
  if (!base || !token) return;
  try {
    const response = await fetch(base, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ operation: 'locale.get', args: {} }), signal: AbortSignal.timeout(1000),
    });
    const body = await response.json();
    if (body.ok && body.result?.version === 1 && body.result.locale === 'zh') locale = 'zh';
  } catch { /* Offline diagnostics still work. */ }
}
const say = (en, zh) => console.log(locale === 'zh' ? zh : en);

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input) > 65536) throw new Error('invalid_event');
  }
  const request = JSON.parse(input);
  await currentLocale();
  const action = request.command?.split(':').at(-1);
  const config = configuration();
  if (action === 'status') {
    const counts = await status(process.env.PLUGIN_DATA);
    say(`Langfuse: ${config.ready ? 'ready' : config.enabled ? 'credentials required' : 'upload disabled'}. Pending: ${counts.pending}; active: ${counts.active}; delivered: ${counts.delivered}. Configure Langfuse in Settings > Plugins. Chat messages require their separate capture switch; model prompts and token usage are unavailable through the plugin interface.`,
      `Langfuse：${config.ready ? '已就绪' : config.enabled ? '需要填写凭据' : '上传已关闭'}。待上传：${counts.pending}；进行中：${counts.active}；已上传：${counts.delivered}。请在设置 > 插件中配置 Langfuse。聊天消息需单独开启采集；插件接口不提供模型提示词和 token 用量。`);
  } else if (!config.ready) {
    say('Enable upload and save the public/secret keys in Settings > Plugins > Langfuse.', '请在设置 > 插件 > Langfuse 中保存公钥、密钥并开启上传。');
  } else if (action === 'retry') {
    const result = await flush(config, process.env.PLUGIN_DATA);
    say(`Uploaded: ${result.uploaded}.${result.error ? ` Error: ${result.error}. Pending records retained.` : ''}`,
      `已上传：${result.uploaded}。${result.error ? `错误：${result.error}。待上传记录已保留。` : ''}`);
  } else if (action === 'test') {
    const time = Date.now();
    await upload({ resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'openagent-langfuse' } }] },
      scopeSpans: [{ scope: { name: 'openagent.langfuse', version: '0.3.0' }, spans: [{
        traceId: stableId(['connection-test', time]), spanId: stableId(['test', time], 16), name: 'OpenAgent Langfuse Connection Test', kind: 1,
        startTimeUnixNano: (BigInt(time) * 1000000n).toString(), endTimeUnixNano: (BigInt(time) * 1000000n).toString(),
        attributes: [{ key: 'langfuse.observation.type', value: { stringValue: 'span' } }], status: { code: 1 },
      }] }],
    }] }, config);
    say('Langfuse accepted the connection test span. Check the project for OpenAgent Langfuse Connection Test.', 'Langfuse 已接收测试 span。请在项目中查看 OpenAgent Langfuse Connection Test。');
  } else throw new Error('invalid_event');
} catch (error) {
  say(`Langfuse error: ${errorCode(error)}. Pending records retained.`, `Langfuse 错误：${errorCode(error)}。待上传记录已保留。`);
}
