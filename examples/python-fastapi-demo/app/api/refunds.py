from fastapi import APIRouter

router = APIRouter()


@router.post("/refunds/{refund_id}/approve")
def approve_refund(refund_id: str) -> dict[str, str]:
    return {"refund_id": refund_id, "status": "approved"}
