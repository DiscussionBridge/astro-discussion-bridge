import { NativePreparationLimitation } from "./native-preparation.js";
/** Explicit native capability boundary while the preservation recipe is unsettled. */
export declare class NativeMediaUnsupportedError extends NativePreparationLimitation {
    constructor();
}
export declare function assertNativeMediaPreservedByCurrentRenderer(renderedHtml: string): void;
/** Compare actual native meaning with the actual existing cleaner output. */
export declare function assertNativeMeaningRetained(renderedHtml: string, preparedHtml: string, nativeCodeIdentityVerified?: boolean): void;
//# sourceMappingURL=native-media.d.ts.map