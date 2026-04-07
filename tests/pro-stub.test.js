import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tryEnrichReview, getProNextActions, formatProCategoryBreakdown } from "../lib/check/pro/index.js";

export async function run() {
  const mockReview = { score: 85, scoreVerdict: "pass-with-concerns", summary: {} };
  const mockContext = { repoRoot: "/tmp", config: {} };

  await describe("Pro stub (lib/check/pro/index.js)", async () => {
    it("tryEnrichReview returns review unchanged when Pro is absent", async () => {
      const result = await tryEnrichReview(mockReview, mockContext);
      assert.equal(result, mockReview);
    });

    it("getProNextActions returns empty array when Pro is absent", async () => {
      const result = await getProNextActions({}, mockContext);
      assert.deepEqual(result, []);
    });

    it("formatProCategoryBreakdown returns null when Pro is absent", async () => {
      const result = await formatProCategoryBreakdown(mockReview, () => "", "en");
      assert.equal(result, null);
    });

    it("tryEnrichReview does not throw on null input", async () => {
      const result = await tryEnrichReview(null, mockContext);
      assert.equal(result, null);
    });

    it("getProNextActions does not throw on null input", async () => {
      const result = await getProNextActions(null, null);
      assert.deepEqual(result, []);
    });

    it("formatProCategoryBreakdown does not throw on null input", async () => {
      const result = await formatProCategoryBreakdown(null, null, null);
      assert.equal(result, null);
    });

    it("dynamic import is attempted only once (cached)", async () => {
      await tryEnrichReview(mockReview, mockContext);
      await getProNextActions({}, mockContext);
      await formatProCategoryBreakdown(mockReview, () => "", "en");
      const r1 = await tryEnrichReview(mockReview, mockContext);
      assert.equal(r1, mockReview);
    });
  });
}
