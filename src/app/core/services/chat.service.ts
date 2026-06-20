import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface StreamHandlers {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export type ModelType = 'OPENAI' | 'OLLAMA';

/**
 * Talks to the Spring AI backend's /chat endpoint.
 *
 * IMPORTANT: this deliberately does NOT try to parse SSE "data:" framing.
 * Different Spring AI / WebFlux versions flush Flux<String> chunks onto the
 * wire differently — sometimes as proper `data: <token>\n\n` frames,
 * sometimes as raw un-prefixed text writes. Trying to strip SSE framing
 * that isn't actually there is what was eating the spaces between words.
 * Decoding the raw bytes and forwarding them untouched is correct either
 * way, because:
 *   - if the backend sends raw text chunks, we render exactly what it sent.
 *   - if the backend sends real SSE frames, Spring AI's token chunks don't
 *     rely on the "data:" line for spacing (the space is part of the token
 *     itself), so passing the decoded text straight through still renders
 *     correctly.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  readonly connected = signal(true);

  private activeController: AbortController | null = null;

  send(message: string, handlers: StreamHandlers, model?: ModelType): void {
    this.activeController = new AbortController();
    const chosenModel: ModelType = (model ?? (environment.chatModel as ModelType));

    fetch(`${environment.apiBaseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Chat-Model': chosenModel,
      },
      body: JSON.stringify({ message }),
      signal: this.activeController.signal,
    })
      .then((response) => {
        if (!response.ok || !response.body) {
          throw new Error(`Backend responded with ${response.status}`);
        }
        this.connected.set(true);
        return this.readStream(response.body, handlers);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          handlers.onDone();
          return;
        }
        this.connected.set(false);
        handlers.onError(err instanceof Error ? err.message : 'Connection to the agent failed.');
      });
  }

  stop(): void {
    this.activeController?.abort();
    this.activeController = null;
  }

  private async readStream(body: ReadableStream<Uint8Array>, handlers: StreamHandlers): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const raw = decoder.decode(value, { stream: true });
        const text = this.stripSseFramingIfPresent(raw);
        if (text.length > 0) handlers.onChunk(text);
      }

      // Flush any trailing multi-byte sequence held by the decoder.
      const tail = decoder.decode();
      const tailText = this.stripSseFramingIfPresent(tail);
      if (tailText.length > 0) handlers.onChunk(tailText);

      handlers.onDone();
    } catch (err) {
      handlers.onError(err instanceof Error ? err.message : 'Stream interrupted.');
    } finally {
      this.activeController = null;
    }
  }

  /**
   * If — and only if — this chunk is unambiguously SSE-framed (starts a
   * line with "data:"), strip the "data:" prefixes and keep everything
   * else (including all spacing) exactly as sent. Otherwise return the
   * chunk completely untouched.
   */
  private stripSseFramingIfPresent(raw: string): string {
    if (!raw) return '';
    if (!/^data:/m.test(raw)) {
      return raw;
    }

    return raw
      .split('\n')
      .map((line) => (line.startsWith('data:') ? line.slice('data:'.length) : line))
      .join('\n')
      .replace(/\n\n+/g, '');
  }
}
