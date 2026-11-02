import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createNativeStarlightPublication } from 'astro-discussion-bridge/starlight';
// The native build process runs in this consumer's project root. Its server
// configuration must not reinterpret a private file relative to a Vite chunk.
const configured = JSON.parse(fs.readFileSync(path.resolve('test-options.json')));
export const options = { ...configured.options, controlledCreation: { ...configured.options.controlledCreation,
  fetchImplementation: async (url, init) => {
    const address = new URL(url); assert.equal(address.origin, 'https://forum.example');
    const response = await fetch(`http://127.0.0.1:${configured.port}${address.pathname}${address.search}`, init);
    // Explicit local simulated transport, not proof of real origin/TLS behavior.
    // Do not feed a loopback response URL to the production origin fence.
    return new Response(response.body, { status: response.status, headers: response.headers });
  } } };
export const nativeOptions = { title: 'Ordinary native Starlight publication', pagefind: false, expressiveCode: false,
  sidebar: [], components: { MarkdownContent: './src/components/NativeArticle.astro' } };
export const publication = await createNativeStarlightPublication({ source: options, native: nativeOptions });
export const readSource = file => fs.readFileSync(path.resolve(file), 'utf8');
