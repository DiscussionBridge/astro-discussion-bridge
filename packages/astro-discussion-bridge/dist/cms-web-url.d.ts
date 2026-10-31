import { type PublicDiscourseTopicUrl } from "./web-url.js";
import { type PublicForumSettings } from "./forum-name.js";
export { nativeUrl, type NativeUrl } from "./native-url.js";
export { cmsFetch } from "./cms-fetch.js";
export declare function normalizeServiceBaseUrl(value: string, label?: string): string;
export declare function normalizePublicHttpUrl(value: string, label?: string, options?: {
    allowQuery?: boolean;
    allowFragment?: boolean;
}): string;
export declare function parsePublicDiscourseTopicUrl(value: string, base?: string, label?: string): PublicDiscourseTopicUrl;
export declare function readPublicForumSettings(value: string, fetchImplementation?: typeof fetch): Promise<PublicForumSettings>;
//# sourceMappingURL=cms-web-url.d.ts.map