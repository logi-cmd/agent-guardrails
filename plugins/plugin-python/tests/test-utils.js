/**
 * Test utilities for plugin-python tests
 */

/**
 * Create a mock detector context
 * @param {Object} overrides - Override default values
 * @returns {Object} Mock context object
 */
export function createMockContext(overrides = {}) {
  return {
    repoRoot: "/tmp/test-repo",
    changedFiles: [],
    sourceFiles: [],
    testFiles: [],
    config: {},
    taskContract: {},
    allowedChangeTypes: [],
    ...overrides
  };
}

/**
 * Create a finding collector for testing
 * @returns {Object} Collector with findings array and addFinding function
 */
export function createFindingCollector() {
  const findings = [];
  return {
    findings,
    addFinding: (finding) => findings.push(finding),
    hasFindings: () => findings.length > 0,
    getFindingsByCode: (code) => findings.filter(f => f.code === code),
    getFindingsBySeverity: (severity) => findings.filter(f => f.severity === severity)
  };
}

/**
 * Create a mock file system
 * @param {Object} files - Map of file paths to content
 * @returns {Object} Mock file system utilities
 */
export function createMockFileSystem(files = {}) {
  const fileMap = new Map(Object.entries(files));

  return {
    addFile: (path, content) => fileMap.set(path, content),
    removeFile: (path) => fileMap.delete(path),
    getFile: (path) => fileMap.get(path),
    hasFile: (path) => fileMap.has(path),
    getAllFiles: () => Array.from(fileMap.keys()),
    clear: () => fileMap.clear()
  };
}

/**
 * Sample Python service file content
 */
export const SAMPLE_PYTHON_SERVICE = `
"""Sample service module for testing."""

from typing import Optional

class RefundService:
    """Handle refund operations."""

    def process_refund(self, order_id: str, amount: float) -> dict:
        """Process a refund for an order."""
        return {"order_id": order_id, "refunded": amount}

    def validate_refund(self, order_id: str) -> bool:
        """Validate if refund is possible."""
        return True

def calculate_refund_amount(order_total: float, items_returned: int) -> float:
    """Calculate the refund amount."""
    return order_total * 0.1 * items_returned
`;

/**
 * Sample Python helper file content (for pattern drift testing)
 */
export const SAMPLE_PYTHON_HELPER = `
"""Sample helper module - may indicate pattern drift."""

def process_refund_helper(order_id: str) -> dict:
    """Helper for refund processing."""
    return {"order_id": order_id, "status": "helper_processed"}

def validate_refund_helper(order_id: str) -> bool:
    """Helper for refund validation."""
    return True
`;

/**
 * Sample FastAPI router file content
 */
export const SAMPLE_FASTAPI_ROUTER = `
"""Sample FastAPI router for testing."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

class RefundRequest(BaseModel):
    order_id: str
    amount: float

class RefundResponse(BaseModel):
    success: bool
    refund_id: str

@router.post("/refunds", response_model=RefundResponse)
async def create_refund(request: RefundRequest):
    """Create a new refund."""
    return {"success": True, "refund_id": "ref-123"}

@router.get("/refunds/{refund_id}")
async def get_refund(refund_id: str):
    """Get refund by ID."""
    return {"refund_id": refund_id, "status": "processed"}
`;

/**
 * Sample pytest test file content
 */
export const SAMPLE_PYTEST_TEST = `
"""Sample pytest tests for refund service."""

import pytest
from services.refund_service import RefundService, calculate_refund_amount

class TestRefundService:
    """Tests for RefundService."""

    def test_process_refund(self):
        """Test refund processing."""
        service = RefundService()
        result = service.process_refund("order-123", 100.0)
        assert result["refunded"] == 100.0

    def test_validate_refund(self):
        """Test refund validation."""
        service = RefundService()
        assert service.validate_refund("order-123") is True

def test_calculate_refund_amount():
    """Test refund amount calculation."""
    result = calculate_refund_amount(100.0, 2)
    assert result == 20.0

@pytest.fixture
def refund_service():
    """Fixture for RefundService."""
    return RefundService()
`;

/**
 * Sample Python model file content
 */
export const SAMPLE_PYTHON_MODEL = `
"""Sample Pydantic models for testing."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class OrderItem(BaseModel):
    """Order item model."""
    product_id: str
    quantity: int
    price: float

class Order(BaseModel):
    """Order model."""
    order_id: str
    items: List[OrderItem]
    total: float
    created_at: datetime

class Refund(BaseModel):
    """Refund model."""
    refund_id: str
    order_id: str
    amount: float
    status: str = "pending"
`;

/**
 * Common test assertions
 */
export const assertions = {
  hasFindingWithCode: (findings, code) =>
    findings.some(f => f.code === code),

  hasWarningFindings: (findings) =>
    findings.some(f => f.severity === "warning"),

  hasErrorFindings: (findings) =>
    findings.some(f => f.severity === "error"),

  findingCount: (findings, code) =>
    findings.filter(f => f.code === code).length,

  allFilesInFinding: (finding, expectedFiles) =>
    expectedFiles.every(f => finding.files.includes(f))
};
