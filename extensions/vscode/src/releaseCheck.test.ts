import assert from "node:assert/strict";
import test from "node:test";

import { availableReleases, findChecksum } from "./releaseCheck";

test("returns only release tags available in both upstream repositories", () => {
  assert.deepEqual(
    availableReleases(
      ["2026-09", "2026-08-pre", "2026-07.2", "2026-06", "2026-07.1"],
      ["2026-09", "2026-07.2", "2026-07.1"]
    ),
    ["2026-09", "2026-07.2", "2026-07.1"]
  );
});

test("sorts numeric point releases after their base release", () => {
  assert.deepEqual(
    availableReleases(["2026-09", "2026-09.10", "2026-09.2"], ["2026-09", "2026-09.10", "2026-09.2"]),
    ["2026-09.10", "2026-09.2", "2026-09"]
  );
});

test("extracts a case-insensitive release asset checksum", () => {
  const checksum = "A".repeat(64);
  assert.equal(
    findChecksum(`| \`hypha-1.4.0-linux-x64.zip\` | ${checksum} |`, "hypha-1.4.0-linux-x64.zip"),
    checksum.toLowerCase()
  );
});

test("does not accept a checksum for a different asset", () => {
  assert.equal(
    findChecksum(`| \`hypha-1.4.0-win-x64.zip\` | ${"a".repeat(64)} |`, "hypha-1.4.0-linux-x64.zip"),
    null
  );
});
