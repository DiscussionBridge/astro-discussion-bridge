export interface ExistingPublication {
    contents: string;
    dev: bigint;
    ino: bigint;
}
export declare function assertPublicationDirectory(directory: string): Promise<void>;
export declare function readExistingPublication(file: string): Promise<ExistingPublication | null>;
export declare function syncDirectory(directory: string): Promise<void>;
export declare function mkdirDurably(directory: string): Promise<void>;
export declare function atomicWrite(file: string, contents: string, prior: ExistingPublication | null): Promise<void>;
export declare function removeOwnedPublication(file: string, prior: ExistingPublication): Promise<void>;
//# sourceMappingURL=native-files.d.ts.map