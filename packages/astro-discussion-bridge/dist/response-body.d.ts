/** Shared bounded consumption; this module also runs in the public browser graph. */
export declare function consumeBoundedResponseBody(response: Response, maximum: number, signal: AbortSignal, consume: (bytes: Uint8Array) => void, options?: {
    canonicalContentLength?: boolean;
}): Promise<number>;
export declare function readBoundedResponseBytes(response: Response, maximum: number, signal: AbortSignal, options?: {
    canonicalContentLength?: boolean;
}): Promise<Uint8Array>;
/** End the transport lifetime even when a response exposes no cancellable body. */
export declare function closeResponse(response: Response | undefined, controller: AbortController): void;
//# sourceMappingURL=response-body.d.ts.map