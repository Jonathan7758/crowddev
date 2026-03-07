import type { NegotiationEvent } from '@/types/message';

export async function consumeSSE(
  url: string,
  _body: unknown,
  onEvent: (event: NegotiationEvent) => void,
  onError?: (error: string) => void
): Promise<void> {
  // Use GET for SSE — Railway proxy buffers POST SSE responses
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'text/event-stream' },
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`SSE request failed: ${response.status} - ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6)) as NegotiationEvent;
          onEvent(event);
          if (event.event === 'error' && onError) {
            onError(event.error || 'Unknown error');
          }
        } catch {
          // skip invalid JSON
        }
      }
      // Skip comments (:keepalive) and event: lines
    }
  }
}
