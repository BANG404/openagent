export interface RuntimeProxyResponse {
  status: number;
  statusText: string;
  contentType?: string | null;
  body: string;
}

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

export function createRuntimeProxyResponse(response: RuntimeProxyResponse): Response {
  return new Response(NULL_BODY_STATUSES.has(response.status) ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.contentType ? { "content-type": response.contentType } : undefined,
  });
}
