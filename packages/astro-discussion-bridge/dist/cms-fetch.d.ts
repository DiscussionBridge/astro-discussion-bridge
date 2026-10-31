/**
 * Ordinary ASCII URLs keep native fetch. International authorities use pinned
 * HTTPS hostname handling on every runtime: native ICU can reject OR map them
 * differently. A failed network request/mutation is never retried here.
 */
export declare const cmsFetch: typeof fetch;
//# sourceMappingURL=cms-fetch.d.ts.map