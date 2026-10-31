import type { SourceCommandReceipt } from "./cms-to-source-state.js";
interface SourceCommandChildContext {
    docsDir: string;
    stateFile: string;
    commandId: string;
    kind: "build";
    fence: number;
    deadlineMs: number;
}
/** Non-secret scheduling restriction for this build, never a credential or a
 * replacement for the action's native/receiver checks. Deploys stay unbound. */
export declare function sourceCommandChildEnvironment(docsDir: string, stateFile: string, command: SourceCommandReceipt, deadlineMs: number): NodeJS.ProcessEnv;
export declare function sourceCommandChildContext(docsDir: string, stateFile: string): SourceCommandChildContext | undefined;
export declare function assertSourceCommandChildDeadline(context: SourceCommandChildContext): void;
/** During contention this can refuse stale scheduling, never authorize a write.
 * After acquisition it is repeated against the full validated journal and actual
 * native root/file. Existing remote checks still execute in their own actions. */
export declare function assertSourceCommandChildOwner(context: SourceCommandChildContext, acquired: boolean): Promise<void>;
export {};
//# sourceMappingURL=native-source-command-context.d.ts.map