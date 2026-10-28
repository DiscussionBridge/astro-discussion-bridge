export function normalizeCommentsMode(value) {
    if (value === "simple" || value === "full" || value === "interactive")
        return value;
    return undefined;
}
export function isInteractiveCommentsMode(value) {
    return normalizeCommentsMode(value) === "interactive";
}
