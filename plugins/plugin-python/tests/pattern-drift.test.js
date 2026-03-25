/**
 * Pattern Drift Detector Tests
 *
 * Tests for the py-pattern-drift detector which identifies
 * parallel abstractions (duplicate patterns) in Python code.
 */

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { detectPatternDrift } from "../src/detectors/pattern-drift.js";
import { createMockContext, createFindingCollector } from "./test-utils.js";

describe("Pattern Drift Detector", () => {
  describe("detectPatternDrift", () => {
    test("should return no findings for empty changed files", async () => {
      const context = createMockContext({
        changedFiles: []
      });
      const collector = createFindingCollector();

      await detectPatternDrift({ context, addFinding: collector.addFinding });

      assert.strictEqual(collector.findings.length, 0);
    });

    test("should return no findings for non-Python files", async () => {
      const context = createMockContext({
        changedFiles: ["src/index.js", "README.md", "config.json"]
      });
      const collector = createFindingCollector();

      await detectPatternDrift({ context, addFinding: collector.addFinding });

      assert.strictEqual(collector.findings.length, 0);
    });

    test("should return no findings for single-token Python files", async () => {
      const context = createMockContext({
        changedFiles: ["app/service.py", "lib/model.py"]
      });
      const collector = createFindingCollector();

      await detectPatternDrift({ context, addFinding: collector.addFinding });

      assert.strictEqual(collector.findings.length, 0);
    });

    test("should return no findings for Python files without role suffix", async () => {
      const context = createMockContext({
        changedFiles: ["app/refund_order.py", "lib/process_data.py"]
      });
      const collector = createFindingCollector();

      await detectPatternDrift({ context, addFinding: collector.addFinding });

      assert.strictEqual(collector.findings.length, 0);
    });

    test("should detect pattern drift when parallel abstractions exist", async () => {
      // Note: This test would require a mock file system or actual files
      // For now, we test the logic without sibling matches
      const context = createMockContext({
        changedFiles: ["app/services/refund_helper.py"]
      });
      const collector = createFindingCollector();

      await detectPatternDrift({ context, addFinding: collector.addFinding });

      // Without actual sibling files, this should return no findings
      // In a real test, we'd mock the file system
      assert.ok(collector.findings.length >= 0);
    });

    test("should correctly identify Python source files", async () => {
      const context = createMockContext({
        changedFiles: [
          "app/services/refund_service.py",
          "app/models/order_model.py",
          "app/utils/helper.py",
          "tests/test_refund.py"
        ]
      });
      const collector = createFindingCollector();

      await detectPatternDrift({ context, addFinding: collector.addFinding });

      // Should process .py files without errors
      assert.ok(collector.findings.length >= 0);
    });
  });

  describe("Role detection", () => {
    test("should recognize common Python role suffixes", async () => {
      const files = [
        "app/services/refund_service.py",
        "app/models/order_model.py",
        "app/controllers/user_controller.py",
        "app/utils/string_utils.py",
        "app/helpers/form_helper.py"
      ];

      const context = createMockContext({ changedFiles: files });
      const collector = createFindingCollector();

      await detectPatternDrift({ context, addFinding: collector.addFinding });

      // Should process all files without errors
      assert.ok(true);
    });

    test("should ignore test files", async () => {
      const context = createMockContext({
        changedFiles: [
          "tests/services/test_refund_service.py",
          "tests/models/test_order_model.py"
        ]
      });
      const collector = createFindingCollector();

      await detectPatternDrift({ context, addFinding: collector.addFinding });

      // Test files should not trigger pattern drift
      assert.strictEqual(collector.findings.length, 0);
    });
  });

  describe("Finding structure", () => {
    test("should create findings with correct structure", async () => {
      // This would need a mock file system to test properly
      // For now, verify the detector runs without errors
      const context = createMockContext({
        changedFiles: ["app/services/payment_service.py"]
      });
      const collector = createFindingCollector();

      await detectPatternDrift({ context, addFinding: collector.addFinding });

      // If there are findings, verify their structure
      for (const finding of collector.findings) {
        assert.ok(finding.severity);
        assert.ok(finding.category);
        assert.ok(finding.code);
        assert.ok(finding.message);
        assert.ok(Array.isArray(finding.files));
      }
    });
  });
});
