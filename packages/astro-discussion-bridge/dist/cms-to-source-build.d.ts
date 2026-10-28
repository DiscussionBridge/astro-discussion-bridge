import type { PublishControlledDiscussionsOptions } from "./controlled-creation.js";
import type { PublicationOperationalState } from "./operational-state.js";
import { type SourceNativeCapture } from "./to-source-profile.js";
import type { CmsSourceUrlVerification } from "./cms-client.js";
type Options = PublishControlledDiscussionsOptions;
export declare function assertActualSourceBuild(state: PublicationOperationalState): void;
/** Called by the actual native integration ONLY for command=build. */
export declare function startControlledSourceBuild(options: Options): Promise<void>;
/** Manifest comes from actual astro:build:done, never a guessed route/file. */
export declare function recordControlledSourceBuild(options: Options, buildDir: string, assets: Map<string, URL[]>, base?: string, assetsDir?: string): Promise<string[]>;
export declare function verifyControlledSourcePublic(capture: SourceNativeCapture, preparedAt: string, deployedAt: string, fetchImplementation?: typeof fetch): Promise<CmsSourceUrlVerification>;
export {};
//# sourceMappingURL=cms-to-source-build.d.ts.map