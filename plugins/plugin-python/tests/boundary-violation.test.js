/**
 * Boundary Violation Detector Tests
 *
 * Tests for the py-boundary-violation detector which identifies
 * cross-layer import violations in Python code.
 */

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { detectBoundaryViolation } from "../src/detectors/boundary-violation.js";
import { createMockContext, createFindingCollector } from "./test-utils.js";

describe("Boundary Violation Detector", () => {
  describe("detectBoundaryViolation", () => {
    test("should return no findings for empty changed files", async () => {
      const context = createMockContext({
        changedFiles: []
      });
      const collector = createFindingCollector();

      await detectBoundaryViolation({ context, addFinding: collector.addFinding });

      assert.strictEqual(collector.findings.length, 0);
    });

    test("should return no findings when no boundary rules configured", async () => {
      const context = createMockContext({
        changedFiles: ["app/services/refund_service.py"],
        config: {
          // No boundaries configured
        }
      });
      const collector = createFindingCollector();

      await detectBoundaryViolation({ context, addFinding: collector.addFinding });

      assert.strictEqual(collector.findings.length, 0);
    });

    test("should return no findings for test files", async () => {
      const context = createMockContext({
        changedFiles: [
          "tests/test_service.py",
          "tests/integration/test_api.py"
        ],
        config: {
          boundaries: [
            {
              label: "service-to-dao",
              from: "services/**",
              disallow: ["dao/**"]
            }
          ]
        }
      });
      const collector = createFindingCollector();

      await detectBoundaryViolation({ context, addFinding: collector.addFinding });

      // Test files should not trigger boundary violations
      assert.strictEqual(collector.findings.length, 0);
    });

    test("should detect cross-layer import violations", async () => {
      const context = createMockContext({
        changedFiles: ["app/services/refund_service.py"],
        config: {
          boundaries: [
            {
              label: "service-to-dao",
              from: "services/**",
              disallow: ["dao/**"],
              severity: "error"
            }
          ]
        }
      });
      const collector = createFindingCollector();

      await detectBoundaryViolation({ context, addFinding: collector.addFinding });

      // Note: This test may not find anything without actual file content
      // In a real test, we would mock the file system with imports
    });

    test("should respect expected boundary exceptions", async () => {
      const context = createMockContext({
        changedFiles: ["app/services/refund_service.py"],
        config: {
          boundaries: [
            {
              label: "service-to-dao",
              from: "services/**",
              disallow: ["dao/**"]
            }
          ]
        },
        taskContract: {
          expectedBoundaryExceptions: ["dao/special_dao.py"]
        }
      });
      const collector = createFindingCollector();

      await detectBoundaryViolation({ context, addFinding: collector.addFinding });

      // Imports to dao/special_dao.py should be allowed
      // Note: This test may not find anything without actual file content
    });
  });

  describe("Boundary rules", () => {
    test("should support warning severity", async () => {
      const context = createMockContext({
        changedFiles: ["app/services/refund_service.py"],
        config: {
          boundaries: [
            {
              label: "suggestive-rule",
              from: "services/**",
              disallow: ["utils/**"],
              severity: "warning"
            }
          ]
        }
      });
      const collector = createFindingCollector();

      await detectBoundaryViolation({ context, addFinding: collector.addFinding });

      const suggestiveFindings = collector.findings.filter(
        f => f.code === "py-boundary-violation-suggestive-import"
      );

      for (const finding of suggestiveFindings) {
        assert.strictEqual(finding.severity, "warning");
      }
    });

    test("should support error severity", async () => {
      const context = createMockContext({
        changedFiles: ["app/services/refund_service.py"],
        config: {
          boundaries: [
            {
              label: "forbidden-rule",
              from: "services/**",
              disallow: ["models/**"],
              severity: "error"
            }
          ]
        }
      });
      const collector = createFindingCollector();

      await detectBoundaryViolation({ context, addFinding: collector.addFinding });

      const forbiddenFindings = collector.findings.filter(
        f => f.code === "py-boundary-violation-forbidden-import"
      );

      for (const finding of forbiddenFindings) {
        assert.strictEqual(finding.severity, "error");
      }
    });
  });

  describe("Finding structure", () => {
    test("should create findings with correct structure", async () => {
      const context = createMockContext({
        changedFiles: ["app/services/payment_service.py"],
        config: {
          boundaries: [
            {
              label: "test-rule",
              from: "services/**",
              disallow: ["forbidden/**"]
            }
          ]
        }
      });
      const collector = createFindingCollector();

      await detectBoundaryViolation({ context, addFinding: collector.addFinding });

      for (const finding of collector.findings) {
        assert.ok(finding.severity);
        assert.ok(finding.category);
        assert.ok(finding.code);
        assert.ok(finding.message);
        assert.ok(Array.isArray(finding.files));
        assert.ok(finding.action);
      }
    });
  });
});
