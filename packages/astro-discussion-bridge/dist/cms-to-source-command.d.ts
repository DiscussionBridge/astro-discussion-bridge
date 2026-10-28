import type { PublishControlledDiscussionsOptions } from "./controlled-creation.js";
import type { SourceNativeCommand, SourceCommandReceipt } from "./cms-to-source-state.js";
/** Structured native commands; the OS writer is released for child build hooks.
 * The durable source fence/owner still excludes another command/publication.
 * An uncertain PID/effect requires reconciliation, never a duplicate command.
 */
export declare function runControlledSourceCommand(options: PublishControlledDiscussionsOptions, sourceFile: string, kind: "build" | "deploy", command: SourceNativeCommand): Promise<SourceCommandReceipt>;
//# sourceMappingURL=cms-to-source-command.d.ts.map