import { randomUUID, createHash } from "node:crypto";
import { readFile, lstat, open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readPublicationOperationalState, writePublicationOperationalState } from "./operational-state.js";
import { withNativeSourceWriter } from "./native-locks.js";
import { nativePublicationFiles } from "./native-publication.js";
import { activeSourceMove } from "./cms-to-source-state.js";
import { sourceHash, inspectSourceArticle, parseSourceHtml, sourceNodes, sourceDependencyMarkup, assertSourceHtmlContentType } from "./to-source-profile.js";
import { publicResponse, publicHtml } from "./cms-verification.js";
import { semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
import { cmsUrl, nativeUrl, sameCmsOrigin } from "./native-url.js";
import { cmsFetch } from "./cms-fetch.js";
import { closeResponse, consumeBoundedResponseBody } from "./response-body.js";
const symbol = Symbol.for("discussionbridge.astro.native-source-build.v4");
const globalOwner = globalThis;
const processToken = globalOwner[symbol] ??= randomUUID();
export function assertActualSourceBuild(state) {
    if (!state.sourceBuildOwner || state.sourceBuildOwner.pid !== process.pid || state.sourceBuildOwner.token !== processToken || state.sourceBuildOwner.buildId !== state.sourceBuildId)
        throw new Error("Full native source capture requires this ACTUAL active native build; runtime/pageview cannot publish or capture it.");
}
/** Called by the actual native integration ONLY for command=build. */
export async function startControlledSourceBuild(options) {
    return withNativeSourceWriter(options.docsDir, options.stateFile, async () => {
        const state = await readPublicationOperationalState(options.stateFile);
        if (!state.sourceBuildId)
            throw new Error("Native source build requires its complete publisher census first.");
        state.sourceBuildOwner = { pid: process.pid, token: processToken, buildId: state.sourceBuildId };
        await writePublicationOperationalState(options.stateFile, state);
    });
}
async function actualBuildHtml(file, root) {
    const relative = path.relative(root, file);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        throw new Error("Actual native build manifest left its output root.");
    await nativePublicationFiles.assertDirectory(path.dirname(file));
    const first = await nativePublicationFiles.readExisting(file);
    if (!first)
        throw new Error("Native generated source artifact is unavailable.");
    const html = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(file));
    const last = await nativePublicationFiles.readExisting(file);
    if (!last || first.dev !== last.dev || first.ino !== last.ino || html !== last.contents || first.contents !== last.contents)
        throw new Error("Native source artifact changed while capturing.");
    return html;
}
async function captureNativeAssets(html, capture, root, base, assetsDir) {
    const result = [], seen = new Set(), canonical = cmsUrl(capture.canonicalUrl);
    const generatedPrefix = `${base.replace(/\/$/u, "")}/${assetsDir.replace(/^\/+|\/+$/gu, "")}/`;
    for (const node of sourceNodes(parseSourceHtml(html))) {
        const supplied = node.name === "img" || node.name === "script" ? node.attribs?.src : node.name === "link" && /(?:^|\s)(?:stylesheet|modulepreload)(?:\s|$)/iu.test(node.attribs?.rel ?? "") ? node.attribs?.href : undefined;
        if (!supplied)
            continue;
        const url = nativeUrl(supplied, canonical);
        if (url.protocol !== "https:" || !sameCmsOrigin(url.href, capture.canonicalUrl) || seen.has(url.href) || !url.pathname.startsWith(base))
            continue;
        const local = decodeURIComponent(url.pathname.slice(base.length)).split("/").join(path.sep), file = path.resolve(root, local), relative = path.relative(root, file);
        if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
            throw new Error("Actual native dependency left its generated root.");
        await nativePublicationFiles.assertDirectory(path.dirname(file));
        let bytes;
        try {
            const first = await lstat(file, { bigint: true });
            if (!first.isFile() || first.isSymbolicLink())
                throw new Error("Actual native asset must be an unlinked regular file.");
            const handle = await open(file, "r");
            try {
                const opened = await handle.stat({ bigint: true });
                if (opened.dev !== first.dev || opened.ino !== first.ino)
                    throw new Error("Actual native asset changed while opening.");
                bytes = await handle.readFile();
                const last = await handle.stat({ bigint: true });
                if (opened.size !== last.size || opened.mtimeNs !== last.mtimeNs)
                    throw new Error("Actual native asset changed while capturing.");
            }
            finally {
                await handle.close();
            }
        }
        catch (error) {
            if (error.code === "ENOENT" && !url.pathname.startsWith(generatedPrefix))
                continue;
            throw new Error("Actual generated native source asset is unavailable; no full source proof was fabricated.");
        }
        seen.add(url.href);
        result.push({ url: url.href, file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    return result;
}
/** Manifest comes from actual astro:build:done, never a guessed route/file. */
export async function recordControlledSourceBuild(options, buildDir, assets, base = "/", assetsDir = "_astro") {
    return withNativeSourceWriter(options.docsDir, options.stateFile, async () => {
        const state = await readPublicationOperationalState(options.stateFile);
        assertActualSourceBuild(state);
        const expected = new Map();
        for (const operation of Object.values(state.operations)) {
            const move = activeSourceMove(operation.to?.sourceMove) ? operation.to.sourceMove : undefined, capture = move?.nativeCapture ?? operation.to?.nativeCapture;
            if (capture && capture.buildId === state.sourceBuildId)
                expected.set(capture.ownership.nativeId, { capture, move });
        }
        const found = new Set(), root = path.resolve(buildDir), files = new Set([...assets.values()].flat().map(file => fileURLToPath(file)));
        for (const file of files) {
            if (!file.endsWith(".html"))
                continue;
            const html = await actualBuildHtml(file, root), owners = sourceNodes(parseSourceHtml(html)).filter(node => node.name === "article" && node.attribs?.["data-discussionbridge-source-native"]);
            for (const owner of owners) {
                const nativeId = owner.attribs["data-discussionbridge-source-native"], entry = expected.get(nativeId);
                if (!entry)
                    continue;
                if (found.has(nativeId))
                    throw new Error("Actual source build contains duplicate owned native publications.");
                const actual = await nativePublicationFiles.readExisting(entry.capture.file);
                if (!actual || sourceHash(actual.contents) !== entry.capture.fileSha256)
                    throw new Error("Native source changed before actual build capture.");
                inspectSourceArticle(html, entry.capture);
                entry.capture.build = { file, html, builtAt: new Date().toISOString(), sha256: sourceHash(html), dependencyMarkup: sourceDependencyMarkup(html), assets: await captureNativeAssets(html, entry.capture, root, base, assetsDir) };
                if (entry.move)
                    entry.move.phase = "built";
                found.add(nativeId);
            }
        }
        if (found.size !== expected.size)
            throw new Error("Actual native build did not emit every captured FULL source article.");
        delete state.sourceBuildOwner;
        await writePublicationOperationalState(options.stateFile, state);
        return [...found];
    });
}
async function verifyNativeAsset(expected, fetchImplementation) {
    const request = await publicResponse(expected.url, fetchImplementation), response = request.response;
    try {
        if (response.status !== 200 || !response.body)
            throw new Error("Actual native source asset is unavailable.");
        const hash = createHash("sha256");
        const count = await consumeBoundedResponseBody(response, expected.bytes, request.controller.signal, bytes => { hash.update(bytes); });
        if (count !== expected.bytes || hash.digest("hex") !== expected.sha256)
            throw new Error("Actual native source asset differs from the expected native build.");
    }
    finally {
        closeResponse(response, request.controller);
        clearTimeout(request.timeout);
    }
}
export async function verifyControlledSourcePublic(capture, preparedAt, deployedAt, fetchImplementation = cmsFetch) {
    if (!capture.build || !capture.ownership.moveId || !capture.ownership.proofNonce)
        throw new Error("Actual full native source build/issued challenge is unavailable.");
    validateCms("Instant", preparedAt);
    validateCms("Instant", deployedAt);
    const expected = inspectSourceArticle(capture.build.html, capture), request = await publicResponse(capture.canonicalUrl, fetchImplementation), response = request.response;
    try {
        if (response.status !== 200)
            throw new Error("Actual source new URL did not return native HTML.");
        assertSourceHtmlContentType(response.headers.get("content-type"));
        const html = await publicHtml(response, Buffer.byteLength(capture.build.html) * 2 + 65536, request.controller.signal), actual = inspectSourceArticle(html, capture);
        if (sourceHash(actual) !== sourceHash(expected) || semanticIdentity(sourceDependencyMarkup(html)) !== semanticIdentity(capture.build.dependencyMarkup))
            throw new Error("Actual FULL native source/dependency markup differs from its generated publication.");
        for (const asset of capture.build.assets)
            await verifyNativeAsset(asset, fetchImplementation);
        const checkedAt = new Date().toISOString();
        if (Date.parse(checkedAt) < Math.max(Date.parse(preparedAt), Date.parse(deployedAt)))
            throw new Error("Actual source verification clock precedes prepare/deploy.");
        return validateCms("SourceUrlVerification", { url: capture.canonicalUrl, external_id: capture.ownership.externalId, source_revision: capture.revision,
            source_content_sha256: capture.ownership.preparedSourceSha256, native_ownership_receipt_sha256: capture.ownershipSha256, native_publication_sha256: sourceHash(actual), verification_profile: capture.ownership.profile, checked_at: checkedAt });
    }
    finally {
        closeResponse(response, request.controller);
        clearTimeout(request.timeout);
    }
}
