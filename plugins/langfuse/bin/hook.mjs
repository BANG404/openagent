import { configuration, errorCode } from '../lib/config.mjs';
import { record, flush } from '../lib/store.mjs';

// Hooks stay silent: stdout would become model context. Failures are isolated.
try {
  const config = configuration();
  let input = '';
  // Drain even when disabled so the Runtime can finish writing hook stdin.
  for await (const chunk of process.stdin) {
    if (config.ready) {
      input += chunk.toString();
      if (Buffer.byteLength(input) > 1024 * 1024) throw new Error('invalid_event');
    }
  }
  if (config.ready) {
    const envelope = JSON.parse(input);
    await record(envelope, config, process.env.PLUGIN_DATA);
    if (envelope.hook_event_name === 'Stop') {
      const result = await flush(config, process.env.PLUGIN_DATA);
      if (result.error) process.stderr.write(`[langfuse] ${result.error}\n`);
    }
  }
} catch (error) { process.stderr.write(`[langfuse] ${errorCode(error)}\n`); }
