const MAX_TOPIC_ID = "9223372036854775807";
/** Preserve exact mapped IDs; a caller's already-rounded number is not an ID. */
export function normalizeTopicId(value, label = "Topic ID") {
    if (value === undefined)
        return undefined;
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0)) {
        throw new Error(`${label} must be an exact positive signed-64 decimal ID.`);
    }
    const text = typeof value === "number" ? String(value) : value;
    if (typeof text !== "string" || !/^[1-9][0-9]{0,18}$/u.test(text)
        || text.length === MAX_TOPIC_ID.length && text > MAX_TOPIC_ID) {
        throw new Error(`${label} must be an exact positive signed-64 decimal ID.`);
    }
    return text;
}
// Tokenize strings as units so text, escaped quotes/keys and non-ID numbers are
// untouched. Quote plain positive integer topic_id tokens before JSON.parse;
// decimal/exponent spellings retain ordinary numeric parsing and safe-ID checks.
const JSON_TOKEN = /"(?:[^"\\]|\\[\s\S])*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|[{}\[\]:,]|true|false|null|\S/gu;
const PLAIN_TOPIC_INTEGER = /^[1-9][0-9]*$/u;
export function parsePublicTopicJson(text) {
    let previous = "", topicValue = false;
    const exact = text.replace(JSON_TOKEN, token => {
        const isTopicValue = topicValue;
        topicValue = token === ":" && previous.startsWith('"') && JSON.parse(previous) === "topic_id";
        previous = token;
        return isTopicValue && PLAIN_TOPIC_INTEGER.test(token) ? JSON.stringify(token) : token;
    });
    return JSON.parse(exact, (key, value) => key === "topic_id" ? normalizeTopicId(value, "Public reply topic ID") : value);
}
