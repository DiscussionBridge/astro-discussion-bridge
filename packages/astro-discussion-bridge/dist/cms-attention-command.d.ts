import { spawn } from "node:child_process";
import type { CmsNativeCommand } from "./cms-pipeline.js";
import { type CmsAttentionOptions } from "./cms-attention-native.js";
export interface CmsBaselineCommandOptions extends CmsAttentionOptions {
    spawnImplementation?: typeof spawn;
}
/** Separate explicit native-owner action. Neither Check nor Restore invokes it. */
export declare function runCmsAttentionBaselineCommand(options: CmsBaselineCommandOptions, restorationOperationId: string, command: CmsNativeCommand): Promise<{
    operationId: string;
    phase: "succeeded";
    requiresFreshCheck: boolean;
}>;
//# sourceMappingURL=cms-attention-command.d.ts.map