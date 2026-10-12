export function configuration(env = process.env) {
  const value = (key, fallback = '') => env[`PLUGIN_CONFIG_${key}`] ?? fallback;
  const enabled = value('ENABLED') === 'true';
  const publicKey = value('PUBLIC_KEY');
  const secretKey = value('SECRET_KEY');
  let baseUrl;
  try { baseUrl = new URL(value('BASE_URL', 'https://cloud.langfuse.com')); }
  catch { throw new Error('invalid_endpoint'); }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash ||
      (baseUrl.protocol !== 'https:' && !(baseUrl.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)))) {
    throw new Error('invalid_endpoint');
  }
  baseUrl.pathname = baseUrl.pathname.replace(/\/$/, '');
  const missing = [!publicKey && 'public-key', !secretKey && 'secret-key'].filter(Boolean);
  return {
    enabled, publicKey, secretKey, missing,
    ready: enabled && missing.length === 0,
    endpoint: `${baseUrl.href.replace(/\/$/, '')}/api/public/otel/v1/traces`,
    baseUrl: baseUrl.href,
    captureContent: value('CAPTURE_CONTENT') === 'true',
    environment: value('ENVIRONMENT', 'development'),
    userId: value('USER_ID'),
    tags: value('TAGS').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 32),
  };
}

// Never log a remote body, URL, tool payload, bridge token or API key.
export function errorCode(error) {
  return /^(invalid_endpoint|storage_busy|storage_limit|invalid_state|invalid_event|upload_http_\d{3}|upload_partial|upload_response|upload_timeout|upload_network)$/.test(error?.message)
    ? error.message : 'storage_error';
}
