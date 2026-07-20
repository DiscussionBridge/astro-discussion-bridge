#!/usr/bin/env node

const args = process.argv.slice(2);

const usage = `Usage:
  node scripts/tag-discourse-topics.mjs --tag TAG [--drop TAG[,TAG...]] TOPIC_ID [TOPIC_ID...]
  node scripts/tag-discourse-topics.mjs --tag historical-reference 20 21 24 28

Environment:
  DISCOURSE_URL=https://forum.example.com
  DISCOURSE_API_USERNAME=discussbridge-bot
  DISCOURSE_API_KEY=...

Options:
  --dry-run   Read topics and print the tag changes without writing
`;

const dryRun = args.includes("--dry-run");
const tagIndex = args.indexOf("--tag");
const tag = tagIndex >= 0 ? args[tagIndex + 1] : undefined;
const dropIndex = args.indexOf("--drop");
const dropTags = dropIndex >= 0 ? args[dropIndex + 1].split(",").map((name) => name.trim().toLowerCase()).filter(Boolean) : [];
const topicIds = args
  .filter((arg, index) => arg !== "--dry-run" && arg !== "--tag" && arg !== "--drop" && index !== tagIndex + 1 && index !== dropIndex + 1)
  .map((arg) => Number(arg))
  .filter((id) => Number.isInteger(id) && id > 0);

if (!tag || topicIds.length === 0) {
  console.error(usage);
  process.exit(1);
}

const discourseUrl = process.env.DISCOURSE_URL ?? "https://forum.discussionbridge.dev";
const apiUsername = process.env.DISCOURSE_API_USERNAME;
const apiKey = process.env.DISCOURSE_API_KEY;

if (!apiUsername || !apiKey) {
  console.error("Missing required environment: DISCOURSE_API_USERNAME and DISCOURSE_API_KEY");
  process.exit(1);
}

for (const topicId of topicIds) {
  const topic = await request(`/t/${topicId}.json`);
  const existingTags = tagNames(topic.tags);
  const nextTags = [...new Set(
    [...existingTags, tag]
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name && !dropTags.includes(name))
  )].sort();

  if (sameTags(existingTags, nextTags)) {
    console.log(`unchanged: topic ${topicId} already has ${tag}`);
    continue;
  }

  if (dryRun) {
    console.log(`dry-run: topic ${topicId} tags ${formatTags(existingTags)} -> ${formatTags(nextTags)}`);
    continue;
  }

  await request(`/t/-/${topicId}.json`, {
    method: "PUT",
    body: JSON.stringify({
      tags: nextTags.map((name) => ({ name })),
    }),
  });
  console.log(`updated: topic ${topicId} tags ${formatTags(existingTags)} -> ${formatTags(nextTags)}`);
}

async function request(path, init = {}) {
  const response = await fetch(`${discourseUrl}${path}`, {
    ...init,
    headers: {
      "Api-Key": apiKey,
      "Api-Username": apiUsername,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Discourse request failed: ${response.status} ${response.statusText}${body ? `\n${body}` : ""}`);
  }

  return body ? JSON.parse(body) : undefined;
}

function tagNames(tags) {
  return tags?.map((tag) => tag.name ?? tag.slug).filter(Boolean) ?? [];
}

function sameTags(a, b) {
  return normalizeTags(a).join("\0") === normalizeTags(b).join("\0");
}

function normalizeTags(tags) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
}

function formatTags(tags) {
  return `[${normalizeTags(tags).join(", ")}]`;
}
