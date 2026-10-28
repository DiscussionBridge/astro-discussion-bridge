import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const cache = createRequire('C:/CodeProjects/Products/DiscussionBridge/codex crap/astro/packages/astro-discussion-bridge/package.json');
const allowed = new Set(['yaml', 'sanitize-html', '@astrojs/markdown-remark', 'proper-lockfile', 'astro', 'dompurify', 'sharp']);
export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !allowed.has(specifier)) throw error;
    return { url: pathToFileURL(cache.resolve(specifier)).href, shortCircuit: true };
  }
}
