/** Internal native lock condition, not a wire failure or authority decision. */
export declare class NativeSourceWriterBusyError extends Error {
    constructor();
}
/** One native content writer plus private operational-state writer. */
export declare function withNativeSourceWriter<T>(docsDir: string, stateFile: string, action: () => Promise<T>): Promise<T>;
export declare function withPublicationOperationalStateLock<T>(filePath: string, action: () => Promise<T>, options?: {
    staleMs?: number;
    updateMs?: number;
}): Promise<T>;
//# sourceMappingURL=native-locks.d.ts.map