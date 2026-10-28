/** Private native state. Storage format identity is not wire-version selection. */
export declare function readPrivateJournal<T>(file: string, validate: (value: unknown) => T): Promise<T | undefined>;
export declare function writePrivateJournal<T>(file: string, state: T, validate: (value: unknown) => T): Promise<void>;
//# sourceMappingURL=native-journal.d.ts.map