export declare function resolveServerSecret<T extends {
    connectionSecret?: string;
    secretFile?: string;
}>(input: T): Promise<T & {
    connectionSecret: string;
}>;
//# sourceMappingURL=server-secret.d.ts.map