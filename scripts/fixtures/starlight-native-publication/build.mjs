import { build } from 'astro';
import discussionBridge from 'astro-discussion-bridge';
import { options, publication } from './server.mjs';
await build({ root: new URL('./', import.meta.url), configFile: false, site: options.siteUrl,
  output: 'static', trailingSlash: 'always', force: process.argv[3] === 'force', logLevel: 'warn',
  integrations: [publication.integration, discussionBridge({ discourseUrl: options.discourseUrl, siteUrl: options.siteUrl,
    publishOnBuild: { enabled: true, docsDir: options.docsDir, stateFile: options.stateFile, routeBase: options.routeBase, ...options.controlledCreation } })] });
console.log(JSON.stringify({ phase: process.argv[2], completed: true }));
