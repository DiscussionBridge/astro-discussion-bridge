export declare const PUBLIC_BOOTSTRAP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
export interface PublicForumSettings {
    title: unknown;
    poweredBy?: boolean;
}
/** Shared Label rule: validate the supplied bytes; trimming does not rename it. */
export declare function validateForumName(value: unknown, label?: string): string;
/** The optional plugin-free setting overrides only its native-title fallback. */
export declare function resolveForumName(override: unknown, nativeTitle: unknown): string;
/** The current connected effective label is authoritative. */
export declare function resolveConnectedForumName(value: unknown): Promise<string>;
/** Reuse the existing public core bootstrap; no connection credential is sent. */
export declare function readPublicForumSettings(discourseUrl: string, fetchImplementation?: typeof fetch): Promise<PublicForumSettings>;
/** Shared pure bootstrap decoder; browser callers acquire no server transport. */
export declare function parsePublicForumSettings(html: string): PublicForumSettings;
//# sourceMappingURL=forum-name.d.ts.map