import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { createRequire } from "node:module";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGE_ROOT = resolve(ROOT, "packages", "astro-discussion-bridge");
const SITE_ROOT = resolve(
  ROOT,
  "..",
  "..",
  "Projects",
  "OBBBA",
  "sites",
  "onebigbeautifulbill.us",
  "astro",
);
const require = createRequire(pathToFileURL(resolve(PACKAGE_ROOT, "package.json")));
const ts = require("typescript");

export const STATIC_GRAMMAR_PROFILE =
  "obbba-law-active-boundary-static-grammar-v2";

const TOOLCHAIN = Object.freeze({
  typescript: require("typescript/package.json").version,
  astro: require("astro/package.json").version,
  yaml: require("yaml/package.json").version,
  operationOrdinal: "preorder-call-expression-v1",
  manifest: "obbba-law-active-boundary-contracts-v2",
});

const LIMITATIONS = Object.freeze([
  "bounded-static-grammar-conformance-only",
  "not-general-runtime-proof",
  "not-legal-authority-approval",
  "not-source-freshness-proof",
  "not-publication-authorization",
]);

const LAW_ROOT_MANIFEST = Object.freeze({
  auditor: Object.freeze([
    "scripts/check-obbba-law-active-boundary.mjs",
  ]),
  "official-evidence-tool": Object.freeze([
    "scripts/analyze-obbba-law-usc-target-presence.mjs",
    "scripts/build-obbba-law-as-amended-metadata.mjs",
    "scripts/build-obbba-law-as-amended-page-plan.mjs",
    "scripts/build-obbba-law-incorporation-window-plan.mjs",
    "scripts/build-obbba-law-usc-attribution-index.mjs",
    "scripts/build-obbba-law-usc-comparison-index.mjs",
    "scripts/build-obbba-law-usc-release-plan.mjs",
    "scripts/build-obbba-law-usc-section-store.mjs",
    "scripts/extract-obbba-law-incorporation-window-xml.mjs",
    "scripts/fetch-obbba-law-authority-map.mjs",
    "scripts/fetch-obbba-law-incorporation-window-archives.mjs",
  ]),
  "publication-candidate": Object.freeze([
    "scripts/obbba-law-as-amended-page-renderer.mjs",
  ]),
  library: Object.freeze([
    "scripts/obbba-law-as-amended-metadata-lib.mjs",
    "scripts/obbba-law-as-amended-page-plan-lib.mjs",
    "scripts/obbba-law-authority-map-lib.mjs",
    "scripts/obbba-law-incorporation-window-plan-lib.mjs",
    "scripts/obbba-law-official-reference-map.mjs",
    "scripts/obbba-law-usc-archive-collector.mjs",
    "scripts/obbba-law-usc-comparison-lib.mjs",
    "scripts/obbba-law-usc-release-plan-lib.mjs",
    "scripts/obbba-law-usc-section-selector-lib.mjs",
    "scripts/obbba-law-usc-xml-extractor.mjs",
    "scripts/obbba-law-uslm-ast-lib.mjs",
    "scripts/obbba-law-uslm-markdown-lib.mjs",
    "scripts/obbba-law-uslm-renderer-registry.mjs",
  ]),
  test: Object.freeze([
    "scripts/test/fetch-obbba-law-authority-map.test.mjs",
    "scripts/test/obbba-law-as-amended-metadata.test.mjs",
    "scripts/test/obbba-law-as-amended-page-plan.test.mjs",
    "scripts/test/obbba-law-as-amended-page-renderer.test.mjs",
    "scripts/test/obbba-law-authority-map.test.mjs",
    "scripts/test/obbba-law-incorporation-window-plan.test.mjs",
    "scripts/test/obbba-law-official-reference-map.test.mjs",
    "scripts/test/obbba-law-usc-archive-collector.test.mjs",
    "scripts/test/obbba-law-usc-attribution-runner.test.mjs",
    "scripts/test/obbba-law-usc-comparison-runner.test.mjs",
    "scripts/test/obbba-law-usc-comparison.test.mjs",
    "scripts/test/obbba-law-usc-release-plan.test.mjs",
    "scripts/test/obbba-law-usc-section-selector.test.mjs",
    "scripts/test/obbba-law-usc-section-store.test.mjs",
    "scripts/test/obbba-law-usc-xml-extractor.test.mjs",
    "scripts/test/obbba-law-uslm-ast.test.mjs",
    "scripts/test/obbba-law-uslm-markdown.test.mjs",
    "scripts/test/obbba-law-uslm-renderer-registry.test.mjs",
  ]),
});

const TEXT_ROOT_MANIFEST = Object.freeze([
  "scripts/enrolled-source-lib.mjs",
  "scripts/analyze-enrolled-source.mjs",
  "scripts/build-obbba-enrolled-section-authority.mjs",
  "scripts/build-obbba-text-import-manifest.mjs",
  "packages/astro-discussion-bridge/test/enrolled-source-analyzer.test.mjs",
  "packages/astro-discussion-bridge/test/obbba-text-body-edits.test.mjs",
  "packages/astro-discussion-bridge/test/obbba-text-evidence-validator.test.mjs",
]);

const PACKAGE_REGISTRATIONS = Object.freeze([
  Object.freeze({
    path: "packages/astro-discussion-bridge/package.json",
    keys: Object.freeze(["main", "types", "bin", "exports", "scripts"]),
  }),
  Object.freeze({
    path: "site:package.json",
    keys: Object.freeze(["main", "bin", "exports", "scripts"]),
  }),
]);

const SOURCE_CLASSES = deepFreeze({
  "forum-law-metadata-candidate": {
    kind: "fixed-file",
    path: "docs/evidence/OBBBA_LAW_AS_AMENDED_FORUM_METADATA_2026-07-26.json",
    sha256: "434761fa42bbd67e2b9b6b8e1523d87fb85b238a5e376c0d6c5ab004e0a16f67",
    contentBoundary: "forum-metadata-only",
    allowedFields: [
      "sectionId",
      "title",
      "tags",
      "category",
      "indexIdentity",
      "topicId",
      "topicUrl",
      "discussion",
    ],
    forbiddenFields: ["body", "raw", "cooked", "posts", "postStream"],
  },
  "olrc-authority-map-candidate": fixedEvidence(
    "docs/evidence/OBBBA_LAW_OFFICIAL_AUTHORITY_MAP_2026-07-26.json",
    "977639eacd190746b9bf347fb933bf7434cbf80891d1b7255007c9daf2edcf26",
    "classification-metadata",
  ),
  "olrc-release-plan-v3-candidate": fixedEvidence(
    "docs/evidence/OBBBA_LAW_USC_RELEASE_INPUT_PLAN_V3_2026-07-26.json",
    "5a76438265c076c3be6188fed52ebf21078ea928177a8659e03be1fc209bb6c7",
    "release-acquisition-metadata",
  ),
  "olrc-incorporation-plan-candidate": fixedEvidence(
    "docs/evidence/OBBBA_LAW_INCORPORATION_WINDOW_INPUT_PLAN_2026-07-26.json",
    "562759559ff62101394fe512c38e68593fbbc8ce2d10f3719f101d351d875c10",
    "release-acquisition-metadata",
  ),
  "olrc-incorporation-archive-evidence-candidate": fixedEvidence(
    "docs/evidence/OBBBA_LAW_INCORPORATION_WINDOW_ARCHIVE_EVIDENCE_2026-07-26.json",
    "5dc17fedeaaccfa834ce41732047685b80006d4158151a103b3ad1ec68d63f79",
    "archive-commitments",
  ),
  "olrc-incorporation-xml-evidence-candidate": fixedEvidence(
    "docs/evidence/OBBBA_LAW_INCORPORATION_WINDOW_XML_EVIDENCE_2026-07-26.json",
    "84136240ddc76309e82dd7d39ca8c4cd4fce08a0bdd737ce0075aa55f0829577",
    "xml-document-commitments",
  ),
  "olrc-section-store-candidate": fixedEvidence(
    "docs/evidence/OBBBA_LAW_USC_VERSIONED_SECTION_STORE_2026-07-26.json",
    "90e1f677227f510fd2b25f370d200ba49d5cc6476706d3be50bad66092177cdd",
    "versioned-section-commitments",
  ),
  "olrc-comparison-candidate": fixedEvidence(
    "docs/evidence/OBBBA_LAW_USC_STATE_COMPARISON_INDEX_2026-07-26.json",
    "c2de89f8b5ff24485c19a4dc1c5658ce0a86ada9fba5030ec8de9adfccda76e5",
    "neutral-state-comparison",
  ),
  "olrc-attribution-v2-candidate": fixedEvidence(
    "docs/evidence/OBBBA_LAW_USC_ATTRIBUTION_INDEX_V2_2026-07-26.json",
    "ea33c90c3c860385d016a58e10cdc92f5eb97e4620a3e406fa8696074fbc3ec7",
    "bounded-attribution-metadata",
  ),
  "olrc-official-anonymous-get": {
    kind: "network",
    protocol: "https:",
    hostname: "uscode.house.gov",
    method: "GET",
    redirect: "manual",
    allowedHeaders: [],
    pathPattern:
      "^/(?:download/releasepoints/us/pl/119/(?:27not21|31)/xml_usc\\d{2}@119-(?:27not21|31)\\.zip)$",
    contentBoundary: "bounded-official-archive-bytes",
  },
  "text-enrolled-diagnostic": {
    kind: "protected-root",
    paths: [
      "docs/evidence/OBBBA_ENROLLED_SECTION_AUTHORITY_2026-07-26.json",
      "scripts/enrolled-source-lib.mjs",
    ],
    contentBoundary: "text-qa-diagnostic-only",
  },
  "text-content-input": {
    kind: "site-protected-root",
    path: "src/content/docs/obbba-text",
    contentBoundary: "text-import-only",
  },
});

const SINK_CLASSES = deepFreeze({
  "metadata-evidence-create-only": {
    apis: ["writeFile", "writeFileSync"],
    requiredOptions: { flag: "wx" },
    contentBoundary: "metadata-only",
  },
  "ignored-cache-exclusive": {
    apis: ["writeFile", "copyFile", "rename", "mkdir"],
    requiredOptions: { exclusive: true },
    contentBoundary: "reviewed-cache-only",
  },
  "text-qa-evidence-create-only": {
    apis: ["writeFile", "writeFileSync"],
    requiredOptions: { flag: "wx" },
    contentBoundary: "text-qa-only",
  },
  stdout: {
    apis: ["process.stdout.write"],
    requiredOptions: {},
    contentBoundary: "metadata-report-only",
  },
});

/*
 * This is intentionally closed-world. V2 source review and the separately
 * approved test implementation may extend this table, but the checker never
 * synthesizes permission from a fixed path, a root role, or an API name.
 */
const OPERATION_CONTRACTS = deepFreeze([
  operationContract({
    module: "scripts/check-obbba-law-active-boundary.mjs",
    entry: "main",
    ordinal: 1,
    api: "process.stdout.write",
    operand: 0,
    operation: "write",
    sourceClasses: ["checker-report"],
    sinkClass: "stdout",
    transforms: ["JSON.stringify"],
  }),
]);

const IMMUTABLE_FILES = deepFreeze([
  immutable(
    "scripts/superseded/law-as-amended-local-derivative/build-obbba-law-enacted-derivative-manifest.mjs.txt",
    13879,
    "e5e4531e186a66ef3d5574ffd8046c6dbbc9b799158435e9688fb8e77891f17c",
  ),
  immutable(
    "scripts/superseded/law-as-amended-local-derivative/obbba-law-enacted-derivative-manifest.test.mjs.txt",
    3754,
    "50336226c9d18fab3edc6c6458df709fb69242c8c7e1a1c78f402cf97058078e",
  ),
  immutable(
    "scripts/superseded/law-as-amended-local-derivative/write-obbba-law-as-amended-pages.mjs.txt",
    21371,
    "73571d80e0e4dbaa7961a4cfb08d36760355119871568cfe4ca3857b2a779019",
  ),
  immutable(
    "scripts/superseded/law-as-amended-local-derivative/obbba-law-as-amended-writer-transaction.test.mjs.txt",
    3936,
    "8f3f5630045725cc558f520dc211d2f43983a4b2218f8fad96241010523ea50b",
  ),
  immutable(
    "scripts/superseded/law-as-amended-local-derivative/build-obbba-law-uslm-rendering-commitments.mjs.txt",
    14981,
    "e91aaa2356636e9e8990acadb555900d7d8c5c8a43fbfaac11d8d4313ff32e63",
  ),
  immutable(
    "scripts/superseded/law-as-amended-local-derivative/obbba-law-uslm-rendering-commitments.test.mjs.txt",
    5432,
    "4ddd927ac1ca15f398c4b80666651c739ec71b1a3f4f61121c062bcf96c58bda",
  ),
  immutable(
    "docs/evidence/OBBBA_LAW_USLM_RENDERING_COMMITMENTS_2026-07-26.json",
    2491556,
    "4798677ffa04d2237a60359465108f5e12d46b6dc4d9101e23a3ade1a8e66422",
  ),
  immutable(
    "docs/evidence/OBBBA_LAW_GATE1_DOCTRINE_FACT_SOURCE_MATRIX_2026-07-26.json",
    33658,
    "392800a7028afb3565247c68c5df98923ff7c9c77142fd5f9c31b87202e86268",
  ),
  immutable(
    "docs/evidence/OBBBA_LAW_GATE1_BASELINE_AND_REACHABILITY_INVENTORY_2026-07-26.md",
    9613,
    "663fedd18d30c8acf09d3da4dc9ee50887727d913aeb5d3d313e3bbd94bbd164",
  ),
]);

const OLD_ACTIVE_PATHS = Object.freeze([
  "scripts/build-obbba-law-enacted-derivative-manifest.mjs",
  "scripts/test/obbba-law-enacted-derivative-manifest.test.mjs",
  "scripts/write-obbba-law-as-amended-pages.mjs",
  "scripts/test/obbba-law-as-amended-writer-transaction.test.mjs",
  "scripts/build-obbba-law-uslm-rendering-commitments.mjs",
  "scripts/test/obbba-law-uslm-rendering-commitments.test.mjs",
]);

const READ_APIS = new Set([
  "node:fs.readFile",
  "node:fs.readFileSync",
  "node:fs.readdir",
  "node:fs.readdirSync",
  "node:fs.open",
  "node:fs.openSync",
  "global.fetch",
]);
const WRITE_APIS = new Set([
  "node:fs.writeFile",
  "node:fs.writeFileSync",
  "node:fs.copyFile",
  "node:fs.rename",
  "node:fs.mkdir",
  "process.stdout.write",
  "process.stderr.write",
]);
const ARCHIVE_XML_APIS = new Set([
  "fast-xml-parser.XMLParser.parse",
  "fast-xml-parser.XMLValidator.validate",
  "node:zlib.inflateRaw",
  "node:zlib.inflateRawSync",
]);
const FORBIDDEN_OPAQUE_APIS = new Set([
  "eval",
  "Function",
  "node:vm.runInContext",
  "node:vm.runInNewContext",
  "node:child_process.exec",
  "node:child_process.execFile",
  "node:child_process.spawn",
]);
const NEUTRAL_TEXT_IMPORTS = new Set([
  "node:assert",
  "node:buffer",
  "node:crypto",
  "node:path",
  "node:url",
  "fast-xml-parser",
]);

export function inspectObbbaLawActiveBoundary({
  repositoryRoot = ROOT,
  siteRoot = SITE_ROOT,
  readBytes = (path) => readFileSync(path),
  readText = (path) => readFileSync(path, "utf8"),
} = {}) {
  const state = createState(repositoryRoot, siteRoot);
  const roots = buildExactRootSet(state);
  validateRegistrations(state, roots, readText);
  validateImmutableFiles(state, readBytes);
  validateOldPathsAndLawRoot(state);

  const programFiles = roots
    .filter((root) => root.kind === "module")
    .map((root) => root.absolutePath);
  const compilerOptions = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ESNext,
  };
  const program = ts.createProgram(programFiles, compilerOptions);
  const checker = program.getTypeChecker();

  for (const root of roots) {
    if (root.kind === "module") {
      inspectProgramRoot(state, program, checker, root);
    } else if (root.kind === "astro") {
      inspectAstroRoot(state, root, readText);
    } else if (root.kind === "markdown") {
      inspectMarkdownRoot(state, root, readText);
    } else if (root.kind === "mdx") {
      addFinding(state, "unsupported-mdx-root", root.path);
    }
  }

  validateClosedOperations(state);
  validateEdges(state);
  validateTaintAndSinks(state);
  validateContractCoverage(state);

  const findings = [...state.findings].sort(compareFinding);
  const report = {
    version: 2,
    mode: STATIC_GRAMMAR_PROFILE,
    claim: LIMITATIONS[0],
    limitations: LIMITATIONS.slice(1),
    toolchain: TOOLCHAIN,
    manifestSha256: sha256(Buffer.from(canonicalJson({
      roots: LAW_ROOT_MANIFEST,
      textRoots: TEXT_ROOT_MANIFEST,
      registrations: PACKAGE_REGISTRATIONS,
      sources: SOURCE_CLASSES,
      sinks: SINK_CLASSES,
      operations: OPERATION_CONTRACTS,
      immutable: IMMUTABLE_FILES,
    }))),
    summary: {
      roots: roots.length,
      modules: state.modules.size,
      edges: state.edges.length,
      operations: state.operations.length,
      values: state.values.size,
      findings: findings.length,
    },
    roots: roots.map(({ path, role, kind }) => ({ path, role, kind })),
    operations: state.operations.map(projectOperation),
    findings,
  };
  return deepFreeze(report);
}

function createState(repositoryRoot, siteRoot) {
  return {
    repositoryRoot: resolve(repositoryRoot),
    siteRoot: resolve(siteRoot),
    findings: [],
    roots: new Map(),
    modules: new Map(),
    edges: [],
    operations: [],
    values: new Map(),
    contractUses: new Map(),
  };
}

function buildExactRootSet(state) {
  const expected = new Map();
  for (const [role, paths] of Object.entries(LAW_ROOT_MANIFEST)) {
    for (const path of paths) declareRoot(expected, path, role);
  }
  for (const path of TEXT_ROOT_MANIFEST) declareRoot(expected, path, "text-qa");

  const discovered = [
    ...discoverFiles(resolve(state.repositoryRoot, "scripts"))
      .filter((path) => extname(path) === ".mjs")
      .filter((path) => /obbba-law/i.test(path)),
    ...discoverFiles(resolve(state.repositoryRoot, "packages", "astro-discussion-bridge", "test"))
      .filter((path) => extname(path) === ".mjs")
      .filter((path) => /(?:enrolled-source|obbba-text)/i.test(path)),
  ];
  for (const absolutePath of discovered) {
    const path = repositoryRelative(state.repositoryRoot, absolutePath);
    const declaration = expected.get(path);
    if (!declaration) {
      addFinding(state, "unknown-active-root", path);
      continue;
    }
    addRoot(state, path, declaration.role, "module", absolutePath);
    expected.delete(path);
  }
  for (const [path, declaration] of expected) {
    const absolutePath = resolve(state.repositoryRoot, path);
    if (!existsSync(absolutePath)) {
      addFinding(state, "missing-declared-root", path);
      continue;
    }
    addRoot(state, path, declaration.role, classifyRootKind(path), absolutePath);
  }

  if (!existsSync(state.siteRoot)) {
    addFinding(state, "missing-site-root", portable(state.siteRoot));
  } else {
    const siteFiles = [
      resolve(state.siteRoot, "astro.config.mjs"),
      ...discoverFiles(resolve(state.siteRoot, "src"))
        .filter((path) => [".astro", ".js", ".mjs", ".ts", ".md", ".mdx"]
          .includes(extname(path))),
      ...discoverFiles(resolve(state.siteRoot, "scripts"))
        .filter((path) => [".js", ".mjs", ".ts"].includes(extname(path))),
    ].filter(existsSync);
    for (const absolutePath of siteFiles) {
      const path = `site:${portable(relative(state.siteRoot, absolutePath))}`;
      addRoot(state, path, "site-active", classifyRootKind(path), absolutePath);
    }
  }
  return [...state.roots.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function validateRegistrations(state, roots, readText) {
  for (const declaration of PACKAGE_REGISTRATIONS) {
    const absolutePath = declaration.path.startsWith("site:")
      ? resolve(state.siteRoot, declaration.path.slice(5))
      : resolve(state.repositoryRoot, declaration.path);
    if (!existsSync(absolutePath)) {
      addFinding(state, "missing-package-registration", declaration.path);
      continue;
    }
    let value;
    try {
      value = JSON.parse(readText(absolutePath));
    } catch {
      addFinding(state, "invalid-package-json", declaration.path);
      continue;
    }
    const unknownKeys = Object.keys(value)
      .filter((key) => ["main", "types", "bin", "exports", "scripts"]
        .includes(key) && !declaration.keys.includes(key));
    if (unknownKeys.length) {
      addFinding(state, "undeclared-package-registration-key",
        `${declaration.path}:${unknownKeys.sort().join(",")}`);
    }
    for (const key of declaration.keys) {
      for (const registration of stringsIn(value[key])) {
        inspectRegistrationTarget(state, declaration.path, key, registration, roots);
      }
    }
  }
}

function inspectRegistrationTarget(state, packagePath, key, registration, roots) {
  if (!looksLikePath(registration)) return;
  const base = packagePath.startsWith("site:")
    ? state.siteRoot
    : resolve(state.repositoryRoot, dirname(packagePath));
  const token = shellExecutableToken(registration);
  if (!token) return;
  const absolutePath = resolve(base, token);
  if (!existsSync(absolutePath)) {
    if (/\b(?:obbba-law|law-as-amended)\b/i.test(registration)) {
      addFinding(state, "unresolved-law-registration",
        `${packagePath}:${key}:${registration}`);
    }
    return;
  }
  const classified = classifyAbsolute(state, absolutePath);
  state.edges.push({
    from: packagePath,
    to: classified,
    kind: `package-${key}`,
    role: "package-registration",
  });
  if (!roots.some((root) => root.path === classified)) {
    addFinding(state, "untraversed-registered-root",
      `${packagePath}:${key}:${classified}`);
  }
}

function inspectProgramRoot(state, program, checker, root) {
  const source = program.getSourceFile(root.absolutePath);
  if (!source) {
    addFinding(state, "program-source-missing", root.path);
    return;
  }
  state.modules.set(root.path, root);
  const importBindings = collectImportBindings(source, checker);
  const graph = createValueGraph(state, root, source, checker, importBindings);
  let ordinal = 0;
  walk(source, "<top-level>", []);

  function walk(node, entry, controlTaint) {
    const nextEntry = functionIdentity(node, entry);
    if (isUnsupportedSyntax(node)) {
      addNodeFinding(state, source, node, "unsupported-static-grammar", root.path);
    }
    if (ts.isImportDeclaration(node)
      || ts.isExportDeclaration(node) && node.moduleSpecifier) {
      recordModuleEdge(state, root, source, node, node.moduleSpecifier, "static");
    } else if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      recordModuleEdge(state, root, source, node, node.arguments[0], "dynamic");
    }
    if (ts.isCallExpression(node)) {
      ordinal += 1;
      inspectCall({
        state,
        root,
        source,
        checker,
        graph,
        node,
        entry: nextEntry,
        ordinal,
        controlTaint,
      });
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      inspectForumProjection(state, root, source, checker, graph, node);
    }
    const branchTaint = ts.isIfStatement(node) || ts.isConditionalExpression(node)
      ? unionTaint(controlTaint, graph.taintOf(node.expression))
      : controlTaint;
    ts.forEachChild(node, (child) => walk(child, nextEntry, branchTaint));
  }
}

function inspectCall({
  state,
  root,
  source,
  checker,
  graph,
  node,
  entry,
  ordinal,
  controlTaint,
}) {
  const api = resolvedApiIdentity(checker, node.expression);
  if (!api) {
    addNodeFinding(state, source, node, "unresolved-call-identity", root.path);
    return;
  }
  if (FORBIDDEN_OPAQUE_APIS.has(api)) {
    addNodeFinding(state, source, node, "forbidden-opaque-effect", root.path, api);
    return;
  }
  const effect = classifyEffect(api);
  if (!effect) {
    if (isOpaqueExternalCall(checker, node.expression)
      && !reviewedPureEffect(api)) {
      addNodeFinding(state, source, node, "unreviewed-opaque-effect", root.path, api);
    }
    graph.propagateCall(node, api);
    return;
  }
  for (const operandPosition of authorityOperandPositions(api, node.arguments.length)) {
    const argument = node.arguments[operandPosition];
    const operation = {
      key: operationKey(root.path, entry, ordinal, api, operandPosition),
      module: root.path,
      role: root.role,
      entry,
      ordinal,
      api,
      operation: effect,
      operandPosition,
      location: nodeLocation(source, node),
      locator: evaluateLocator(state, root, checker, graph, argument),
      taint: unionTaint(controlTaint, graph.taintOf(argument)),
      options: extractLiteralOptions(node.arguments),
      sinkClass: undefined,
      contractId: undefined,
    };
    state.operations.push(operation);
  }
  graph.propagateCall(node, api);
}

function validateClosedOperations(state) {
  const byKey = new Map(OPERATION_CONTRACTS.map((contract) => [contract.key, contract]));
  for (const operation of state.operations) {
    const contract = byKey.get(operation.key);
    if (!contract) {
      addFinding(state, "missing-operation-contract", operation.key);
      continue;
    }
    operation.contractId = contract.id;
    state.contractUses.set(contract.id, (state.contractUses.get(contract.id) ?? 0) + 1);
    if (operation.operation !== contract.operation
      || operation.api !== contract.api
      || operation.operandPosition !== contract.operand) {
      addFinding(state, "operation-contract-shape-drift", operation.key);
      continue;
    }
    validateOperationLocator(state, operation, contract);
    validateOperationOptions(state, operation, contract);
  }
}

function validateOperationLocator(state, operation, contract) {
  if (operation.locator.kind === "unresolved") {
    addFinding(state, "unresolved-operation-operand", operation.key);
    return;
  }
  if (contract.locator?.kind === "fixed") {
    if (operation.locator.kind !== "fixed"
      || normalizeLocator(operation.locator.value) !== contract.locator.value) {
      addFinding(state, "operation-locator-drift", operation.key);
    }
  } else if (contract.locator?.kind === "source-class") {
    const actualClass = classifySourceLocator(operation.locator);
    if (actualClass !== contract.locator.sourceClass) {
      addFinding(state, "operation-source-class-drift", operation.key);
    }
  } else if (contract.locator?.kind === "network") {
    if (!matchesNetworkClass(operation.locator, contract.locator.sourceClass)) {
      addFinding(state, "operation-network-contract-drift", operation.key);
    }
  } else {
    addFinding(state, "invalid-operation-contract-locator", contract.id);
  }
}

function validateOperationOptions(state, operation, contract) {
  const expected = canonicalJson(contract.requiredOptions ?? {});
  const actual = canonicalJson(operation.options ?? {});
  if (expected !== actual) {
    addFinding(state, "operation-options-drift", operation.key);
  }
}

function validateTaintAndSinks(state) {
  for (const operation of state.operations) {
    if (!operation.contractId) continue;
    const contract = OPERATION_CONTRACTS.find(({ id }) => id === operation.contractId);
    const observed = new Set(operation.taint);
    const allowed = new Set(contract.sourceClasses);
    if ([...observed].some((sourceClass) => !allowed.has(sourceClass))) {
      addFinding(state, "source-taint-laundering", operation.key);
    }
    if (operation.operation === "write") {
      const sink = SINK_CLASSES[contract.sinkClass];
      operation.sinkClass = contract.sinkClass;
      if (!sink || !sink.apis.includes(operation.api)) {
        addFinding(state, "sink-class-mismatch", operation.key);
      }
    }
  }
  for (const edge of state.edges) {
    const fromText = TEXT_ROOT_MANIFEST.includes(edge.from);
    const toText = TEXT_ROOT_MANIFEST.includes(edge.to);
    const fromLaw = isLawPath(edge.from);
    const toLaw = isLawPath(edge.to);
    if (fromText && toLaw || fromLaw && toText) {
      addFinding(state, "text-law-lane-crossing", `${edge.from}->${edge.to}`);
    }
    if (fromText && !toText && !NEUTRAL_TEXT_IMPORTS.has(edge.to)) {
      addFinding(state, "unapproved-text-import", `${edge.from}->${edge.to}`);
    }
  }
}

function validateContractCoverage(state) {
  for (const contract of OPERATION_CONTRACTS) {
    const uses = state.contractUses.get(contract.id) ?? 0;
    if (uses === 0) addFinding(state, "stale-operation-contract", contract.id);
    if (uses > 1) addFinding(state, "duplicate-operation-contract-use", contract.id);
  }
}

function inspectForumProjection(state, root, source, checker, graph, node) {
  const target = ts.isPropertyAccessExpression(node)
    ? node.expression
    : node.expression;
  const taint = graph.taintOf(target);
  if (!taint.includes("forum-law-metadata-candidate")) return;
  let field;
  if (ts.isPropertyAccessExpression(node)) {
    field = node.name.text;
  } else {
    field = literalText(node.argumentExpression);
    if (field === undefined) {
      addNodeFinding(state, source, node, "computed-forum-field", root.path);
      return;
    }
  }
  const schema = SOURCE_CLASSES["forum-law-metadata-candidate"];
  if (!schema.allowedFields.includes(field)
    || schema.forbiddenFields.includes(field)) {
    addNodeFinding(state, source, node, "forbidden-forum-field", root.path, field);
  }
}

function inspectAstroRoot(state, root, readText) {
  const raw = readText(root.absolutePath);
  let compiler;
  try {
    compiler = require("@astrojs/compiler");
  } catch {
    addFinding(state, "astro-compiler-unavailable", root.path);
    return;
  }
  if (typeof compiler.parse !== "function") {
    addFinding(state, "astro-compiler-contract-drift", root.path);
    return;
  }
  /*
   * The compiler parse call is asynchronous in supported Astro versions.
   * Gate 1 deliberately refuses to execute source parsing through an opaque
   * promise in this synchronous inspector; the separately reviewed execution
   * wrapper must supply a pinned parsed result or fail.
   */
  addFinding(state, "astro-root-requires-pinned-parser-adapter", root.path);
}

function inspectMarkdownRoot(state, root, readText) {
  const raw = readText(root.absolutePath);
  const parsed = splitStrictFrontmatter(raw);
  if (!parsed.ok) {
    addFinding(state, parsed.code, root.path);
    return;
  }
  if (!parsed.frontmatter) return;
  let yaml;
  try {
    yaml = require("yaml");
  } catch {
    addFinding(state, "yaml-parser-unavailable", root.path);
    return;
  }
  try {
    const document = yaml.parseDocument(parsed.frontmatter, {
      uniqueKeys: true,
      schema: "core",
    });
    if (document.errors.length) addFinding(state, "invalid-markdown-frontmatter", root.path);
    inspectFrontmatterValue(state, root, document.toJS());
  } catch {
    addFinding(state, "invalid-markdown-frontmatter", root.path);
  }
}

function inspectFrontmatterValue(state, root, value) {
  if (!value || typeof value !== "object") return;
  const serialized = canonicalJson(value);
  for (const forbidden of ["raw", "cooked", "postStream", "forumBody"]) {
    if (new RegExp(`"${escapeRegex(forbidden)}"\\s*:`).test(serialized)) {
      addFinding(state, "forbidden-forum-frontmatter-field",
        `${root.path}:${forbidden}`);
    }
  }
  if (/officialSourceAuthority|officialSourceManaged|law-as-amended/i
    .test(serialized)) {
    addFinding(state, "law-publication-frontmatter-present", root.path);
  }
}

function validateImmutableFiles(state, readBytes) {
  for (const commitment of IMMUTABLE_FILES) {
    const absolutePath = resolve(state.repositoryRoot, commitment.path);
    if (!existsSync(absolutePath)) {
      addFinding(state, "missing-immutable-file", commitment.path);
      continue;
    }
    if (!safeRegularFile(state, absolutePath, commitment.path)) continue;
    const bytes = readBytes(absolutePath);
    if (bytes.length !== commitment.length) {
      addFinding(state, "immutable-length-drift", commitment.path);
    }
    if (sha256(bytes) !== commitment.sha256) {
      addFinding(state, "immutable-hash-drift", commitment.path);
    }
  }
}

function validateOldPathsAndLawRoot(state) {
  for (const path of OLD_ACTIVE_PATHS) {
    if (existsSync(resolve(state.repositoryRoot, path))) {
      addFinding(state, "superseded-active-path-resurrected", path);
    }
  }
  const lawRoot = resolve(
    state.siteRoot,
    "src",
    "content",
    "docs",
    "law-as-amended",
  );
  if (existsSync(lawRoot)) addFinding(state, "law-content-root-present", portable(lawRoot));
}

function recordModuleEdge(state, root, source, node, specifierNode, kind) {
  const specifier = literalText(specifierNode);
  if (specifier === undefined) {
    addNodeFinding(state, source, node, "computed-module-specifier", root.path);
    return;
  }
  let target = specifier;
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const absolutePath = resolve(dirname(root.absolutePath), specifier);
    if (!existsSync(absolutePath)) {
      addNodeFinding(state, source, node, "unresolved-local-import", root.path, specifier);
      return;
    }
    target = classifyAbsolute(state, absolutePath);
  }
  state.edges.push({ from: root.path, to: target, kind, role: root.role });
}

function validateEdges(state) {
  for (const edge of state.edges) {
    if (edge.to.startsWith("node:")) continue;
    if (isProtectedLawDeniedPath(edge.to)) {
      addFinding(state, "globally-denied-active-import", `${edge.from}->${edge.to}`);
    }
  }
}

function createValueGraph(state, root, source, checker, importBindings) {
  const cache = new Map();
  const active = new Set();
  return {
    taintOf,
    propagateCall,
  };

  function taintOf(node) {
    if (!node) return [];
    const key = `${root.path}:${node.pos}:${node.end}`;
    if (cache.has(key)) return cache.get(key);
    if (active.has(key)) {
      addNodeFinding(state, source, node, "taint-cycle", root.path);
      return ["unknown-source"];
    }
    active.add(key);
    let result = [];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const locator = classifyLiteralSource(node.text);
      result = locator ? [locator] : [];
    } else if (ts.isIdentifier(node)) {
      result = taintOfIdentifier(node);
    } else if (ts.isPropertyAccessExpression(node)
      || ts.isElementAccessExpression(node)) {
      result = taintOf(node.expression);
    } else if (ts.isAwaitExpression(node)
      || ts.isParenthesizedExpression(node)
      || ts.isAsExpression(node)
      || ts.isNonNullExpression(node)) {
      result = taintOf(node.expression);
    } else if (ts.isArrayLiteralExpression(node)) {
      result = unionTaint(...node.elements.map(taintOf));
    } else if (ts.isObjectLiteralExpression(node)) {
      result = unionTaint(...node.properties.map((property) =>
        taintOf(property.initializer ?? property.name)));
    } else if (ts.isConditionalExpression(node)) {
      result = unionTaint(
        taintOf(node.condition),
        taintOf(node.whenTrue),
        taintOf(node.whenFalse),
      );
    } else if (ts.isBinaryExpression(node)) {
      result = unionTaint(taintOf(node.left), taintOf(node.right));
    } else if (ts.isCallExpression(node)) {
      result = taintOfCall(node);
    } else if (ts.isTemplateExpression(node)) {
      result = unionTaint(...node.templateSpans.map((span) => taintOf(span.expression)));
    } else {
      result = unionTaint(...childrenOf(node).map(taintOf));
    }
    active.delete(key);
    const frozen = Object.freeze([...new Set(result)].sort());
    cache.set(key, frozen);
    state.values.set(key, frozen);
    return frozen;
  }

  function taintOfIdentifier(node) {
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) return ["unknown-source"];
    const declarations = symbol.declarations ?? [];
    if (!declarations.length) return ["unknown-source"];
    return unionTaint(...declarations.map((declaration) => {
      if (ts.isVariableDeclaration(declaration)) return taintOf(declaration.initializer);
      if (ts.isParameter(declaration)) return taintOfParameter(declaration);
      if (ts.isBindingElement(declaration)) return taintOf(declaration.parent?.parent?.initializer);
      if (ts.isImportSpecifier(declaration) || ts.isImportClause(declaration)) {
        return importBindings.get(symbol) ?? [];
      }
      return [];
    }));
  }

  function taintOfParameter(parameter) {
    const fn = parameter.parent;
    const symbol = checker.getSymbolAtLocation(fn.name ?? fn);
    if (!symbol) return ["unknown-source"];
    const references = findCallsToSymbol(source, checker, symbol);
    const index = fn.parameters.indexOf(parameter);
    if (!references.length) return ["unknown-source"];
    return unionTaint(...references.map((call) => taintOf(call.arguments[index])));
  }

  function taintOfCall(node) {
    const api = resolvedApiIdentity(checker, node.expression);
    const explicit = sourceClassForReadCall(api, node.arguments[0]);
    if (explicit) return [explicit];
    if (reviewedPureEffect(api)) return unionTaint(...node.arguments.map(taintOf));
    const signature = checker.getResolvedSignature(node);
    const declaration = signature?.declaration;
    if (declaration?.body) {
      const returns = collectReturns(declaration.body);
      return unionTaint(...returns.map((value) => taintOf(value)));
    }
    return unionTaint(["unknown-source"], ...node.arguments.map(taintOf));
  }

  function propagateCall(node, api) {
    const result = taintOf(node);
    if (result.includes("unknown-source") && classifyEffect(api)) {
      addNodeFinding(state, source, node, "unresolved-authority-flow", root.path, api);
    }
  }
}

function evaluateLocator(state, root, checker, graph, node) {
  if (!node) return { kind: "unresolved" };
  const literal = literalText(node);
  if (literal !== undefined) {
    if (/^https:\/\//.test(literal)) return networkLocator(literal);
    const absolutePath = isAbsolute(literal)
      ? resolve(literal)
      : resolve(dirname(root.absolutePath), literal);
    return { kind: "fixed", value: classifyAbsolute(state, absolutePath) };
  }
  if (ts.isNewExpression(node)
    && resolvedApiIdentity(checker, node.expression).endsWith(".URL")
    && node.arguments?.length >= 1) {
    const first = literalText(node.arguments[0]);
    if (first?.startsWith("https://")) return networkLocator(first);
  }
  const taint = graph.taintOf(node);
  if (taint.length === 1 && taint[0] !== "unknown-source") {
    return { kind: "source-class", value: taint[0] };
  }
  return { kind: "unresolved" };
}

function classifySourceLocator(locator) {
  if (locator.kind === "source-class") return locator.value;
  if (locator.kind !== "fixed") return undefined;
  return Object.entries(SOURCE_CLASSES).find(([, source]) =>
    source.kind === "fixed-file" && source.path === locator.value)?.[0];
}

function matchesNetworkClass(locator, sourceClass) {
  if (locator.kind !== "network") return false;
  const contract = SOURCE_CLASSES[sourceClass];
  return contract?.kind === "network"
    && locator.protocol === contract.protocol
    && locator.hostname === contract.hostname
    && new RegExp(contract.pathPattern, "u").test(locator.pathname);
}

function networkLocator(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) {
      return { kind: "unresolved" };
    }
    return {
      kind: "network",
      protocol: url.protocol,
      hostname: url.hostname,
      pathname: url.pathname,
    };
  } catch {
    return { kind: "unresolved" };
  }
}

function extractLiteralOptions(argumentsList) {
  const options = argumentsList.find((argument) => ts.isObjectLiteralExpression(argument));
  if (!options) return {};
  const value = {};
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property)
      || !ts.isIdentifier(property.name)
      || literalPrimitive(property.initializer) === undefined) {
      return { unsupported: true };
    }
    value[property.name.text] = literalPrimitive(property.initializer);
  }
  return value;
}

function resolvedApiIdentity(checker, expression) {
  if (ts.isIdentifier(expression)) {
    const symbol = checker.getSymbolAtLocation(expression);
    return importedApiName(symbol) ?? expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const left = resolvedApiIdentity(checker, expression.expression);
    return `${left}.${expression.name.text}`;
  }
  if (ts.isElementAccessExpression(expression)) {
    const property = literalText(expression.argumentExpression);
    return property === undefined
      ? "<computed-api>"
      : `${resolvedApiIdentity(checker, expression.expression)}.${property}`;
  }
  if (expression.kind === ts.SyntaxKind.ImportKeyword) return "import";
  return "<unresolved-api>";
}

function importedApiName(symbol) {
  const declaration = symbol?.declarations?.[0];
  if (!declaration) return undefined;
  const importDeclaration = findAncestor(declaration, ts.isImportDeclaration);
  const moduleName = literalText(importDeclaration?.moduleSpecifier);
  if (!moduleName) return undefined;
  if (ts.isImportSpecifier(declaration)) {
    return `${moduleName}.${declaration.propertyName?.text ?? declaration.name.text}`;
  }
  if (ts.isNamespaceImport(declaration)) return moduleName;
  if (ts.isImportClause(declaration)) return `${moduleName}.default`;
  return undefined;
}

function classifyEffect(api) {
  if (READ_APIS.has(api)) return api === "global.fetch" ? "network" : "read";
  if (WRITE_APIS.has(api)) return "write";
  if (ARCHIVE_XML_APIS.has(api)) return "transform";
  return undefined;
}

function authorityOperandPositions(api, argumentCount) {
  if (api === "global.fetch") return [0, ...(argumentCount > 1 ? [1] : [])];
  if (api === "node:fs.copyFile" || api === "node:fs.rename") return [0, 1, 2]
    .filter((index) => index < argumentCount);
  if (api === "node:fs.writeFile" || api === "node:fs.writeFileSync") {
    return [0, 1, 2].filter((index) => index < argumentCount);
  }
  if (api === "process.stdout.write" || api === "process.stderr.write") return [0];
  return [...Array(argumentCount).keys()];
}

function collectImportBindings(source, checker) {
  const result = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const sourceClass = classifyLiteralSource(literalText(statement.moduleSpecifier));
    if (!sourceClass) continue;
    const clause = statement.importClause;
    if (!clause) continue;
    const names = [];
    if (clause.name) names.push(clause.name);
    if (ts.isNamespaceImport(clause.namedBindings)) names.push(clause.namedBindings.name);
    if (ts.isNamedImports(clause.namedBindings)) {
      names.push(...clause.namedBindings.elements.map(({ name }) => name));
    }
    for (const name of names) {
      const symbol = checker.getSymbolAtLocation(name);
      if (symbol) result.set(symbol, [sourceClass]);
    }
  }
  return result;
}

function sourceClassForReadCall(api, operand) {
  if (!READ_APIS.has(api)) return undefined;
  return classifyLiteralSource(literalText(operand));
}

function classifyLiteralSource(value) {
  if (!value) return undefined;
  const normalized = portable(value);
  const exact = Object.entries(SOURCE_CLASSES).find(([, source]) =>
    source.path === normalized);
  if (exact) return exact[0];
  if (normalized.includes("OBBBA_LAW_USLM_RENDERING_COMMITMENTS_2026-07-26")) {
    return "denied-rendering-commitment";
  }
  if (/obbba-text/i.test(normalized)) return "text-content-input";
  if (/enrolled/i.test(normalized)) return "text-enrolled-diagnostic";
  if (/forum.*(?:raw|cooked|body|cache)/i.test(normalized)) {
    return "denied-forum-body";
  }
  if (/superseded|enacted-derivative/i.test(normalized)) {
    return "denied-superseded-provenance";
  }
  return undefined;
}

function reviewedPureEffect(api) {
  return [
    "JSON.parse",
    "JSON.stringify",
    "Object.entries",
    "Object.keys",
    "Object.values",
    "Array.isArray",
    "String",
    "Number",
    "Boolean",
    "node:path.resolve",
    "node:path.join",
    "node:path.relative",
    "node:url.fileURLToPath",
    "node:url.pathToFileURL",
    "node:crypto.createHash",
  ].includes(api);
}

function isOpaqueExternalCall(checker, expression) {
  const symbol = checker.getSymbolAtLocation(expression);
  const declarations = symbol?.declarations ?? [];
  return !declarations.some((declaration) =>
    containedRelative(ROOT, declaration.getSourceFile().fileName) !== undefined);
}

function isUnsupportedSyntax(node) {
  return ts.isWithStatement?.(node)
    || ts.isTaggedTemplateExpression(node)
    || ts.isDeleteExpression(node)
    || ts.isClassExpression(node)
    || ts.isYieldExpression(node)
    || ts.isCallExpression(node)
      && resolvedCallText(node.expression) === "eval";
}

function validateAbsentReparse(state, absolutePath, detail) {
  const chain = [];
  let current = resolve(absolutePath);
  while (containedRelative(state.repositoryRoot, current) !== undefined
    || containedRelative(state.siteRoot, current) !== undefined) {
    chain.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const path of chain.reverse()) {
    if (!existsSync(path)) continue;
    const info = lstatSync(path);
    if (info.isSymbolicLink() || !(info.isFile() || info.isDirectory())) {
      addFinding(state, "reparse-or-special-path", detail);
      return false;
    }
  }
  return true;
}

function safeRegularFile(state, absolutePath, detail) {
  if (!validateAbsentReparse(state, absolutePath, detail)) return false;
  const info = lstatSync(absolutePath);
  if (!info.isFile()) {
    addFinding(state, "immutable-not-regular-file", detail);
    return false;
  }
  return true;
}

function classifyAbsolute(state, absolutePath) {
  const repoPath = containedRelative(state.repositoryRoot, absolutePath);
  if (repoPath !== undefined) return portable(repoPath);
  const sitePath = containedRelative(state.siteRoot, absolutePath);
  if (sitePath !== undefined) return `site:${portable(sitePath)}`;
  return `external:${portable(resolve(absolutePath))}`;
}

function isProtectedLawDeniedPath(path) {
  return /(?:superseded|enacted-derivative|OBBBA_ENROLLED_SECTION_AUTHORITY|OBBBA_LAW_USLM_RENDERING_COMMITMENTS|src\/content\/docs\/obbba-text)/i
    .test(path);
}

function isLawPath(path) {
  return /obbba-law|law-as-amended/i.test(path);
}

function splitStrictFrontmatter(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") return { ok: true, frontmatter: "" };
  const closing = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") closing.push(index);
  }
  if (!closing.length) return { ok: false, code: "unclosed-markdown-frontmatter" };
  if (closing.length > 1) return { ok: false, code: "ambiguous-markdown-frontmatter" };
  return { ok: true, frontmatter: lines.slice(1, closing[0]).join("\n") };
}

function operationContract({
  module,
  entry,
  ordinal,
  api,
  operand,
  operation,
  sourceClasses,
  sinkClass,
  transforms = [],
  locator = { kind: "fixed", value: "<stdout>" },
  requiredOptions = {},
}) {
  const id = operationKey(module, entry, ordinal, api, operand);
  return {
    id,
    key: id,
    module,
    entry,
    ordinal,
    api,
    operand,
    operation,
    sourceClasses,
    sinkClass,
    transforms,
    locator,
    requiredOptions,
  };
}

function operationKey(module, entry, ordinal, api, operand) {
  return `${module}#${entry}@${ordinal}:${api}[${operand}]`;
}

function fixedEvidence(path, sha256Value, contentBoundary) {
  return { kind: "fixed-file", path, sha256: sha256Value, contentBoundary };
}

function immutable(path, length, sha256Value) {
  return { path, length, sha256: sha256Value };
}

function declareRoot(map, path, role) {
  if (map.has(path)) throw new Error(`Duplicate root declaration: ${path}`);
  map.set(path, { path, role });
}

function addRoot(state, path, role, kind, absolutePath) {
  if (state.roots.has(path)) {
    addFinding(state, "duplicate-active-root", path);
    return;
  }
  state.roots.set(path, { path, role, kind, absolutePath });
}

function classifyRootKind(path) {
  if (path.endsWith(".astro")) return "astro";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".mdx")) return "mdx";
  return "module";
}

function discoverFiles(path) {
  if (!existsSync(path)) return [];
  const result = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if ([".git", "dist", "node_modules"].includes(entry.name)) continue;
    const child = resolve(path, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) result.push(...discoverFiles(child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

function repositoryRelative(repositoryRoot, absolutePath) {
  const value = containedRelative(repositoryRoot, absolutePath);
  if (value === undefined) throw new Error("Path escaped repository.");
  return portable(value);
}

function containedRelative(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  if (value === "") return "";
  if (value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    return undefined;
  }
  return value;
}

function collectReturns(node) {
  const result = [];
  function visit(child) {
    if (ts.isFunctionLike(child) && child !== node) return;
    if (ts.isReturnStatement(child) && child.expression) result.push(child.expression);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return result;
}

function findCallsToSymbol(source, checker, symbol) {
  const result = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const called = checker.getSymbolAtLocation(node.expression);
      if (called === symbol || checker.getAliasedSymbol?.(called) === symbol) result.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

function functionIdentity(node, fallback) {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
    && node.name) return node.name.getText();
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts.isPropertyAssignment(parent)) return parent.name.getText();
    return "<anonymous>";
  }
  return fallback;
}

function findAncestor(node, predicate) {
  let current = node;
  while (current) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function childrenOf(node) {
  const result = [];
  ts.forEachChild(node, (child) => result.push(child));
  return result;
}

function unionTaint(...values) {
  return [...new Set(values.flat().filter(Boolean))].sort();
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function literalPrimitive(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  return undefined;
}

function stringsIn(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(stringsIn);
  }
  return [];
}

function looksLikePath(value) {
  return typeof value === "string"
    && (/[./\\]/.test(value) || /\bnode\b/.test(value));
}

function shellExecutableToken(value) {
  const match = String(value).match(/(?:^|\s)(\.{0,2}\/[^\s"'`]+|[^\s"'`]+\.(?:[cm]?[jt]s|astro|mdx?))(?:\s|$)/);
  return match?.[1];
}

function normalizeLocator(value) {
  return value === "<stdout>" ? value : portable(value);
}

function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function addFinding(state, code, detail) {
  state.findings.push({ code, detail });
}

function addNodeFinding(state, source, node, code, path, detail = "") {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  addFinding(
    state,
    code,
    `${path}:${position.line + 1}:${position.character + 1}${detail ? `:${detail}` : ""}`,
  );
}

function nodeLocation(source, node) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${position.line + 1}:${position.character + 1}`;
}

function compareFinding(left, right) {
  return `${left.code}:${left.detail}`.localeCompare(`${right.code}:${right.detail}`);
}

function projectOperation(operation) {
  return {
    key: operation.key,
    module: operation.module,
    role: operation.role,
    entry: operation.entry,
    ordinal: operation.ordinal,
    api: operation.api,
    operation: operation.operation,
    operandPosition: operation.operandPosition,
    locator: operation.locator,
    sourceClasses: operation.taint,
    sinkClass: operation.sinkClass,
    contractId: operation.contractId,
    location: operation.location,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function portable(value) {
  return value.split(sep).join("/");
}

function resolvedCallText(expression) {
  return expression.getText?.() ?? "";
}

async function main() {
  const result = inspectObbbaLawActiveBoundary();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.findings.length) process.exitCode = 1;
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
