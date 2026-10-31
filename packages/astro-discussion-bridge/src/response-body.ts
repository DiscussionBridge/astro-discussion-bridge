export class ResponseBodyLimitError extends Error {
  constructor() { super("Response exceeds its byte limit."); this.name = "ResponseBodyLimitError"; }
}

/** Shared bounded consumption; this module also runs in the public browser graph. */
export async function consumeBoundedResponseBody(response: Response, maximum: number, signal: AbortSignal, consume: (bytes: Uint8Array) => void, options: { canonicalContentLength?: boolean } = {}): Promise<number> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => {
    // Cancellation must start immediately, but an uncooperative supplied stream
    // must not prolong the request by returning an unresolved cleanup promise.
    try { void (reader ? reader.cancel() : response.body?.cancel())?.catch(() => undefined); } catch { /* Preserve the original rejection. */ }
  };
  try {
    signal.throwIfAborted();
    if (!Number.isSafeInteger(maximum) || maximum < 0) throw new Error("Response byte limit requires attention.");
    const declared = response.headers.get("content-length");
    // Public Core responses retain normal HTTP digit syntax, including leading
    // zeroes. Only callers that already required canonical length keep that rule.
    const lengthSyntax = options.canonicalContentLength ? /^(?:0|[1-9]\d*)$/u : /^[0-9]+$/u;
    if (declared !== null && (!lengthSyntax.test(declared) || Number(declared) > maximum)) throw new ResponseBodyLimitError();
    if (!response.body) return 0;
    reader = response.body.getReader();
    signal.addEventListener("abort", cancel, { once: true });
    signal.throwIfAborted();
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("Response contains a non-byte chunk.");
      size += value.byteLength;
      if (size > maximum) throw new ResponseBodyLimitError();
      if (value.byteLength) consume(value);
    }
    return size;
  } catch (error) { cancel(); throw error; }
  finally { signal.removeEventListener("abort", cancel); reader?.releaseLock(); }
}

export async function readBoundedResponseBytes(response: Response, maximum: number, signal: AbortSignal, options: { canonicalContentLength?: boolean } = {}): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const size = await consumeBoundedResponseBody(response, maximum, signal, bytes => { chunks.push(bytes); }, options);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** End the transport lifetime even when a response exposes no cancellable body. */
export function closeResponse(response: Response | undefined, controller: AbortController): void {
  controller.abort();
  try { void response?.body?.cancel().catch(() => undefined); } catch { /* Cleanup must not replace the original result. */ }
}
