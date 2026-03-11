import test from "node:test";
import assert from "node:assert/strict";
import { slugifyTopicName, isSafeRssUrl } from "../src/utils/topics.js";

test("slugifyTopicName converts names to URL-safe slugs", () => {
  assert.equal(slugifyTopicName("Crypto News"), "crypto-news");
  assert.equal(slugifyTopicName("  F1 & Soccer  "), "f1-soccer");
  assert.equal(slugifyTopicName("Cars_from_USA"), "cars-from-usa");
});

test("isSafeRssUrl only allows http/https URLs", () => {
  assert.equal(isSafeRssUrl("https://example.com/feed.xml"), true);
  assert.equal(isSafeRssUrl("http://example.com/rss"), true);
  assert.equal(isSafeRssUrl("ftp://example.com/feed.xml"), false);
  assert.equal(isSafeRssUrl("javascript:alert(1)"), false);
  assert.equal(isSafeRssUrl("not-a-url"), false);
});
