import { CmsClient, type CmsConnection } from "./cms-client.js";
import type { CmsToRecord, CmsToRecordMetadata } from "./cms-to.js";
import type { PublishControlledDiscussionsOptions, NativeRenderedSourceInput } from "./controlled-creation.js";
import type { CmsToSourceMove } from "./cms-to-source-state.js";
import { type PublicationOperationalState, type PublicationOperation } from "./operational-state.js";
import { type SourceNativeCapture } from "./to-source-profile.js";
type Options = PublishControlledDiscussionsOptions;
export declare const currentSourceRecord: (operation: PublicationOperation) => CmsToRecord | undefined;
export declare function sourcePreparationBase(operation: PublicationOperation | undefined, contents: string, canonicalUrl: string): string;
export declare function assertSourceConnection(options: Options, operation: PublicationOperation, client: CmsClient, connection: CmsConnection): void;
/** Shared local source fence/current native check, not a receiver Work lease. */
export declare function withCurrentSourceMove<T>(options: Options, sourceFile: string, action: (state: PublicationOperationalState, operation: PublicationOperation, move: CmsToSourceMove, client: CmsClient) => Promise<T>, allowCommitted?: boolean): Promise<T>;
/** Settles only an actual supervised deployment plus anonymous full-source proof. */
export declare function finalizeControlledSourceUrlMove(options: Options, sourceFile: string, verification?: {
    fetchImplementation?: typeof fetch;
}): Promise<CmsToRecordMetadata>;
/** Native abort never pretends an applied/uncertain move was not applied. */
export declare function abortControlledSourceUrlMove(options: Options, sourceFile: string, restoreExactLocalFile?: boolean): Promise<import("./cms-client.js").CmsSourceUrlMove>;
/** Bounded actual receiver history; never an alternate mutation receipt. */
export declare function controlledSourceUrlHistory(options: Options, sourceFile: string, cursor?: string): Promise<import("./cms-client.js").CmsUrlHistoryPage>;
/** Protected same-file native action; never creates a topic or initializes one. */
export declare function beginControlledSourceUrlMove(options: Options, sourceFile: string, newUrl: string): Promise<{
    moveId: string;
    phase: "intent" | "reserved" | "native_applied" | "built" | "deployed" | "finalize_pending" | "committed" | "abort_pending" | "aborted" | "attention" | "known_rejected";
    nativeId: string;
    newUrl: string;
    sourceRevision: string | undefined;
    requiresBuild: boolean;
}>;
/** Called ONLY inside the existing source writer by a bound native SSR helper. */
export declare function captureSourceNativeUnderWriter(options: Options, state: PublicationOperationalState, operation: PublicationOperation, input: NativeRenderedSourceInput, client: CmsClient, connection: CmsConnection): Promise<{
    frontmatter: Record<string, unknown>;
    result: import("./cms-to.js").CmsToResult;
    source: SourceNativeCapture;
}>;
export {};
//# sourceMappingURL=cms-to-source-move.d.ts.map