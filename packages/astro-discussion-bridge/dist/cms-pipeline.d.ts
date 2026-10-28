import { spawn } from "node:child_process";
import { type CmsCoordinatorOptions } from "./cms-coordinator.js";
import { abortCmsNativeWork, finalizeCmsNativeWork, type CmsFinalizeOptions } from "./cms-static.js";
export interface CmsPipelineOptions extends CmsCoordinatorOptions {
    /** Native per-build batch, not a wire/publication-content bound. */
    maximumWorkPerBuild?: number;
}
/** Automatic initial/continuing intake and bounded native static staging. */
export declare function stageCmsNativePublications(options: CmsPipelineOptions): Promise<{
    stagedEvents: number;
    prepared: string[];
    pendingDeployment: number;
    localLimitations: {
        workId: string;
        mappingId: string;
        detail: string;
    }[];
}>;
export declare function recordCmsNativeBuild(options: CmsCoordinatorOptions, buildDir: string): Promise<{
    recorded: string[];
}>;
export { finalizeCmsNativeWork, abortCmsNativeWork };
export declare function renewCmsNativeBuild(options: CmsCoordinatorOptions): Promise<void>;
export interface CmsNativeCommand {
    executable: string;
    args: string[];
    cwd: string;
    timeoutMs?: number;
}
export interface CmsCommandOptions extends CmsFinalizeOptions {
    /** Isolated process seam; normal native execution uses node:child_process. */
    spawnImplementation?: typeof spawn;
}
/** Caller-configured native deploy argv under the same native writer locks. */
export declare function deployCmsNativeBuild(options: CmsCommandOptions, command: CmsNativeCommand): Promise<{
    deploymentId: string;
    deployedAt: string;
    results: ({
        workId: string;
        transactionId: string;
        stage: "verified";
        publiclyVerifiedAt: string;
    } | {
        workId: string;
        phase: string;
        requiresFreshBuild: boolean;
    })[];
    requiresFreshBuild: boolean;
}>;
//# sourceMappingURL=cms-pipeline.d.ts.map