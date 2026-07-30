import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve("../..");
const launcher = path.join(repositoryRoot, "scripts", "invoke-impact-population-secure.ps1");
const credentialFixture = path.resolve("test/windows-credential-fixture.ps1");
const canary = "0123456789abcdef".repeat(4);

test("production transport excludes interactive, clipboard, and secret-argv inputs", async () => {
  const source = await readFile(launcher, "utf8");
  assert.doesNotMatch(source, /Get-Clipboard|Set-Clipboard|Read-Host/);
  assert.doesNotMatch(source, /ApiKey\s*[,)]|SecretValue\s*[,)]/);
  assert.match(source, /CredReadW/);
  assert.match(source, /ArgumentList\.Add/);
  assert.match(source, /Environment\['DISCOURSE_DIAGNOSTICS_API_KEY'\]/);
  assert.match(source, /Remove\('DISCOURSE_DIAGNOSTICS_API_KEY'\)/);
  assert.doesNotMatch(source, /TestOnly|NODE_TLS_REJECT_UNAUTHORIZED/);
  assert.match(source, /BeginOutputReadLine/);
  assert.match(source, /BeginErrorReadLine/);
  assert.match(source, /ProcessOutputForwarder/);
});

async function createConfig(discourseUrl) {
  const production = JSON.parse(await readFile(
    path.join(repositoryRoot, "examples", "obbba-impact-population.config.json"),
    "utf8",
  ));
  const canonical = production.sources.find(
    (source) => source.topicId === production.placeholder.topicId,
  );
  const directory = await mkdtemp(path.join(os.tmpdir(), "bridge-secure-transport-"));
  const configPath = path.join(directory, "config.json");
  await writeFile(configPath, JSON.stringify({
    ...production,
    discourseUrl,
    placeholder: {
      ...production.placeholder,
      topicUrl: `${discourseUrl}t/${production.placeholder.topicId}`,
    },
    sources: [{
      ...canonical,
      sourceUrl: `${discourseUrl}t/${canonical.topicId}`,
    }],
  }), "utf8");
  return { configPath, directory, production };
}

async function createTestCertificate(directory) {
  const pfxPath = path.join(directory, "localhost-test-only.pfx");
  const caPath = path.join(directory, "localhost-test-only.pem");
  const script = [
    "$rsa=[Security.Cryptography.RSA]::Create(2048)",
    "$request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)",
    "$certificate=$request.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-1),[DateTimeOffset]::Now.AddHours(1))",
    `[IO.File]::WriteAllBytes('${pfxPath.replaceAll("'", "''")}',$certificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,'test-only'))`,
    `[IO.File]::WriteAllText('${caPath.replaceAll("'", "''")}',$certificate.ExportCertificatePem())`,
  ].join(";");
  await execFileAsync("pwsh.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
  });
  return { pfx: await readFile(pfxPath), caPath };
}

async function startDiscourseServer(handler) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bridge-https-canary-"));
  const { pfx, caPath } = await createTestCertificate(directory);
  const server = https.createServer({ pfx, passphrase: "test-only" }, handler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        discourseUrl: `https://localhost:${address.port}/`,
        caPath,
      });
    });
  });
}

async function runLauncher({
  mode = "Preflight",
  configPath,
  discourseUrl,
  secret = canary,
  reportOut,
  credentialTarget = "DiscussionBridge/TestOnly",
  caPath,
}) {
  const args = launcherArgs({
    mode,
    configPath,
    discourseUrl,
    reportOut,
    credentialTarget,
  });
  if (secret) {
    assert.ok(args.every((value) => !value.includes(secret)), "the secret must not enter argv");
  }
  return execFileAsync("pwsh.exe", args, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DISCOURSE_API_KEY: "must-not-be-used",
      DISCOURSE_DIAGNOSTICS_API_KEY: "must-not-be-used",
      ...(caPath ? { NODE_EXTRA_CA_CERTS: caPath } : {}),
    },
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function launcherArgs({
  mode = "Preflight",
  configPath,
  discourseUrl,
  reportOut,
  credentialTarget,
}) {
  const args = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-File",
    launcher,
    "-Mode",
    mode,
    "-CredentialTarget",
    credentialTarget,
    "-DiscourseUrl",
    discourseUrl,
    "-RequestActor",
    "transport-canary",
    "-ConfigPath",
    configPath,
  ];
  if (reportOut) args.push("-ReportOut", reportOut);
  return args;
}

async function manageFakeWindowsCredential(action, target, secret = canary) {
  const args = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-File",
    credentialFixture,
    "-Action",
    action,
    "-Target",
    target,
  ];
  if (secret) {
    assert.ok(args.every((value) => !value.includes(secret)), "the canary must not enter fixture argv");
  }
  return execFileAsync("pwsh.exe", args, {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      ...(secret ? { DISCUSSION_BRIDGE_TRANSPORT_TEST_CANARY: secret } : {}),
      ...(!secret && action === "Write" ? { DISCUSSION_BRIDGE_TRANSPORT_TEST_EMPTY: "1" } : {}),
    },
    windowsHide: true,
  });
}

test("Windows transport injects an exact canary only into the isolated preflight child", async () => {
  const requests = [];
  const { server, discourseUrl, caPath } = await startDiscourseServer((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      key: request.headers["api-key"],
      actor: request.headers["api-username"],
    });
    response.setHeader("content-type", "application/json");
    if (request.url === "/t/1002.json") {
      response.end(JSON.stringify({
        id: 1002,
        title: "Impact",
        posts_count: 1,
        created_at: "2026-07-24T00:00:00.000Z",
        post_stream: {
          stream: [1009],
          posts: [{
            id: 1009,
            post_number: 1,
            topic_id: 1002,
            topic_slug: "impact",
            cooked: "",
          }],
        },
      }));
      return;
    }
    if (request.url === "/posts/1009.json") {
      response.end(JSON.stringify({
        id: 1009,
        post_number: 1,
        topic_id: 1002,
        topic_slug: "impact",
        raw: "Developed canary content.",
        cooked: "",
      }));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  });
  const { configPath } = await createConfig(discourseUrl);
  const credentialTarget = `DiscussionBridge/TestOnly/${process.pid}/${Date.now()}`;
  try {
    await manageFakeWindowsCredential("Write", credentialTarget);
    const { stdout, stderr } = await runLauncher({
      configPath,
      discourseUrl,
      credentialTarget,
      caPath,
    });
    assert.match(stdout, /Preflight PASS/);
    assert.doesNotMatch(stdout, new RegExp(canary));
    assert.doesNotMatch(stderr, new RegExp(canary));
    assert.deepEqual(requests, [
      { method: "GET", url: "/t/1002.json", key: canary, actor: "transport-canary" },
      { method: "GET", url: "/posts/1009.json", key: canary, actor: "transport-canary" },
    ]);
    assert.equal(process.env.DISCUSSION_BRIDGE_TRANSPORT_TEST_CANARY, undefined);
  } finally {
    try {
      await manageFakeWindowsCredential("Delete", credentialTarget);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("Windows transport rejects malformed records before starting any request", async () => {
  const requests = [];
  const { server, discourseUrl, caPath } = await startDiscourseServer((request, response) => {
    requests.push(request.url);
    response.statusCode = 500;
    response.end();
  });
  const { configPath } = await createConfig(discourseUrl);
  const malformed = [
    "",
    "a".repeat(63),
    "a".repeat(65),
    `${"a".repeat(32)} ${"b".repeat(31)}`,
    `${"a".repeat(32)}\n${"b".repeat(32)}`,
    `${"a".repeat(64)}\nextra-record`,
    "g".repeat(64),
  ];
  try {
    for (const secret of malformed) {
      const credentialTarget = `DiscussionBridge/TestOnly/${process.pid}/${Date.now()}/${malformed.indexOf(secret)}`;
      try {
        await manageFakeWindowsCredential("Write", credentialTarget, secret);
        await assert.rejects(
          runLauncher({ configPath, discourseUrl, credentialTarget, caPath }),
          (error) => {
            const output = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
            assert.match(output, /not an exact Discourse API key/);
            if (secret) {
              assert.doesNotMatch(output, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
            }
            return true;
          },
        );
      } finally {
        await manageFakeWindowsCredential("Delete", credentialTarget);
      }
    }
    assert.deepEqual(requests, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Windows transport forwards progress before the delayed child exits", async () => {
  let topicRequestSeen;
  const topicRequest = new Promise((resolve) => {
    topicRequestSeen = resolve;
  });
  const { server, discourseUrl, caPath } = await startDiscourseServer((request, response) => {
    topicRequestSeen();
    setTimeout(() => {
      response.statusCode = 403;
      response.end("{}");
    }, 3_000);
  });
  const { configPath } = await createConfig(discourseUrl);
  const credentialTarget = `DiscussionBridge/TestOnly/${process.pid}/${Date.now()}/stream`;
  try {
    await manageFakeWindowsCredential("Write", credentialTarget);
    const child = spawn("pwsh.exe", launcherArgs({
      configPath,
      discourseUrl,
      credentialTarget,
    }), {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        NODE_EXTRA_CA_CERTS: caPath,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let exited = false;
    let stdout = "";
    child.once("exit", () => {
      exited = true;
    });
    const earlyProgress = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("progress was not forwarded in time")), 5_000);
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.includes("Impact credential preflight:")) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    await Promise.all([topicRequest, earlyProgress]);
    assert.equal(exited, false, "progress must arrive while the delayed child is still running");
    await new Promise((resolve) => child.once("close", resolve));
  } finally {
    await manageFakeWindowsCredential("Delete", credentialTarget);
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Windows transport redacts a canary reflected by a failing server", async () => {
  const { server, discourseUrl, caPath } = await startDiscourseServer((_request, response) => {
    response.statusCode = 403;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: canary, padding: "x".repeat(512 * 1024) }));
  });
  const { configPath } = await createConfig(discourseUrl);
  const credentialTarget = `DiscussionBridge/TestOnly/${process.pid}/${Date.now()}/reflection`;
  try {
    await manageFakeWindowsCredential("Write", credentialTarget);
    await assert.rejects(
      runLauncher({ configPath, discourseUrl, credentialTarget, caPath }),
      (error) => {
        assert.doesNotMatch(error.stdout, new RegExp(canary));
        assert.doesNotMatch(error.stderr, new RegExp(canary));
        assert.match(error.stderr, /\[REDACTED\]/);
        return true;
      },
    );
  } finally {
    await manageFakeWindowsCredential("Delete", credentialTarget);
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Windows transport plan writes only the final zero-write report", async () => {
  const { server, discourseUrl, caPath } = await startDiscourseServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/t/1002.json") {
      response.end(JSON.stringify({
        id: 1002,
        title: "Impact",
        posts_count: 1,
        created_at: "2026-07-24T00:00:00.000Z",
        post_stream: {
          stream: [1009],
          posts: [{
            id: 1009,
            post_number: 1,
            topic_id: 1002,
            topic_slug: "impact",
            cooked: "",
          }],
        },
      }));
      return;
    }
    response.end(JSON.stringify({
      id: 1009,
      post_number: 1,
      topic_id: 1002,
      topic_slug: "impact",
      raw: "Developed canary content.",
      cooked: "",
    }));
  });
  const { configPath, directory } = await createConfig(discourseUrl);
  const reportOut = path.join(directory, "report.json");
  const credentialTarget = `DiscussionBridge/TestOnly/${process.pid}/${Date.now()}/plan`;
  try {
    await manageFakeWindowsCredential("Write", credentialTarget);
    const { stdout, stderr } = await runLauncher({
      mode: "Plan",
      configPath,
      discourseUrl,
      reportOut,
      credentialTarget,
      caPath,
    });
    const reportText = await readFile(reportOut, "utf8");
    const report = JSON.parse(reportText);
    assert.match(stdout, /Read 1\/1/);
    assert.deepEqual(report.writes, { discourse: 0, astroContent: 0 });
    assert.doesNotMatch(stdout, new RegExp(canary));
    assert.doesNotMatch(stderr, new RegExp(canary));
    assert.doesNotMatch(reportText, new RegExp(canary));
  } finally {
    await manageFakeWindowsCredential("Delete", credentialTarget);
    await new Promise((resolve) => server.close(resolve));
  }
});
