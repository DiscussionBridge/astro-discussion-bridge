/** Local URL components, never a replacement for a retained wire URL or receipt. */
export interface NativeUrl {
    readonly href: string;
    readonly origin: string;
    readonly protocol: string;
    readonly username: string;
    readonly password: string;
    pathname: string;
    readonly search: string;
    readonly hash: string;
    readonly searchParams: URLSearchParams;
    toString(): string;
}
export declare function internationalizedAuthority(value: string): boolean;
/**
 * Preserve ordinary native serialization. International domains use the pinned
 * authority for DERIVED origins/routes on every runtime, not native ICU data.
 * Original wire URLs and retained identities are never rewritten by this view.
 */
export declare function nativeUrl(value: string, base?: string | NativeUrl): NativeUrl;
/** Strict wire admission precedes any local component or origin work. */
export declare function cmsUrl(value: string): NativeUrl;
export declare function cmsServiceBaseUrl(value: string): NativeUrl;
export declare function cmsOrigin(value: string): string;
export declare function sameCmsOrigin(left: string, right: string): boolean;
//# sourceMappingURL=native-url.d.ts.map