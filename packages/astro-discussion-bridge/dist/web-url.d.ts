export declare function parseServiceBaseUrl(value: string, label?: string): URL;
export declare function normalizeServiceBaseUrl(value: string, label?: string): string;
export declare function normalizePublicHttpUrl(value: string, label?: string, options?: {
    allowQuery?: boolean;
    allowFragment?: boolean;
}): string;
export interface PublicDiscourseTopicUrl {
    href: string;
    serviceBase: string;
    topicId: number | string;
    slug?: string;
    postNumber?: number;
}
export declare function parsePublicDiscourseTopicUrl(value: string, serviceBaseValue?: string, label?: string): PublicDiscourseTopicUrl;
export declare function resolveServiceRequestUrl(pathname: string, serviceBase: URL): URL;
export declare function assertServiceResponseUrl(value: URL | string, serviceBase: URL, label?: string): void;
export declare function serviceRelativeRequestTarget(value: string, serviceBase: URL): string;
export declare function parseDiscourseTopicReference(value: string, serviceBase: URL): {
    topicId: number | string;
    slug?: string;
    postNumber?: number;
};
//# sourceMappingURL=web-url.d.ts.map