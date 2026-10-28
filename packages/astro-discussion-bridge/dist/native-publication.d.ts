import { assertPublicationDirectory, readExistingPublication, atomicWrite, removeOwnedPublication, mkdirDurably } from "./native-files.js";
import { type NativeArticleCapture } from "./native-preparation.js";
declare function metadata(contents: string): Record<string, unknown> | null;
declare function bodyDigest(contents: string): string;
declare function sanitize(content: string, sourceArticleUrl: string): NativeArticleCapture;
/** Native file/rendering owner only. The sole V4 coordinator supplies transport. */
export declare const nativePublicationFiles: Readonly<{
    assertDirectory: typeof assertPublicationDirectory;
    readExisting: typeof readExistingPublication;
    metadata: typeof metadata;
    bodyDigest: typeof bodyDigest;
    write: typeof atomicWrite;
    remove: typeof removeOwnedPublication;
    sanitize: typeof sanitize;
    mkdir: typeof mkdirDurably;
}>;
export {};
//# sourceMappingURL=native-publication.d.ts.map