interface TopicPayload {
    post_stream?: {
        posts?: unknown[];
        stream?: unknown[];
    };
}
export declare function refreshSimpleComments(root: HTMLElement): Promise<void>;
export declare function startSimpleComments(): void;
export declare function publicJson(url: URL, expectedOrigin: string, fetchImpl?: typeof fetch): Promise<TopicPayload>;
export {};
//# sourceMappingURL=simple-live.d.ts.map