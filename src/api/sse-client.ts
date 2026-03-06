import type { NegotiationEvent } from '@/types/message';

export async function consumeSSE(
  url: string,
  body: unknown,
  onEvent: (event: NegotiationEvent) => void,
  onError?: (error: string) => void
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE request failed: ${response.status}`);
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
        } catch {
          // skip invalid JSON
        }
      }
    }
  }
}
