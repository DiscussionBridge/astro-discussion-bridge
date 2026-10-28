import type { CmsCoordinatorOptions } from "./cms-coordinator.js";
import type { AttentionState } from "./cms-attention-types.js";
export declare const attentionFile: (options: CmsCoordinatorOptions) => string;
export declare function readAttentionState(options: CmsCoordinatorOptions): Promise<AttentionState>;
export declare const writeAttentionState: (options: CmsCoordinatorOptions, state: AttentionState) => Promise<void>;
//# sourceMappingURL=cms-attention-state.d.ts.map