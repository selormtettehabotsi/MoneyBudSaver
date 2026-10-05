import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response, status
from fastapi.responses import PlainTextResponse, JSONResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user, verify_csrf
from app.models.user import User
from app.services.backup import (
    export_transactions_csv,
    export_budgets_csv,
    export_debts_csv,
    import_transactions_csv,
    export_full_backup_json,
    restore_full_backup_json,
)

router = APIRouter(prefix="/data", tags=["Data Import/Export & Backup"])


@router.get("/export/csv/transactions")
async def download_transactions_csv(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exports all transactions as a CSV file attachment."""
    csv_str = export_transactions_csv(db, current_user.id)
    filename = f"moneycouncil_transactions_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/csv/budgets")
async def download_budgets_csv(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exports all category budgets as a CSV file attachment."""
    csv_str = export_budgets_csv(db, current_user.id)
    filename = f"moneycouncil_budgets_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/csv/debts")
async def download_debts_csv(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exports all debts and loans as a CSV file attachment."""
    csv_str = export_debts_csv(db, current_user.id)
    filename = f"moneycouncil_debts_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/import/csv/transactions", dependencies=[Depends(verify_csrf)])
async def upload_transactions_csv(
    file: UploadFile = File(...),
    create_categories: bool = Form(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Imports transactions from an uploaded CSV file.
    Auto-detects column headers, skips duplicates, and creates missing categories.
    """
    if not file.filename.lower().endswith(".csv") and file.content_type not in ("text/csv", "application/vnd.ms-excel", "text/plain"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a valid .csv spreadsheet.",
        )

    content_bytes = await file.read()
    try:
        csv_text = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            csv_text = content_bytes.decode("latin-1")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to decode CSV file. Please ensure it is UTF-8 encoded.",
            )

    result = import_transactions_csv(db, current_user.id, csv_text, create_missing_categories=create_categories)
    return result


@router.get("/backup/json")
async def download_full_json_backup(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exports complete portable JSON database backup for the authenticated user."""
    data = export_full_backup_json(db, current_user)
    filename = f"moneycouncil_backup_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    return Response(
        content=json.dumps(data, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/restore/json", dependencies=[Depends(verify_csrf)])
async def restore_from_json_backup(
    backup_payload: Dict[str, Any],
    overwrite: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Restores user database from a JSON backup payload.
    """
    try:
        result = restore_full_backup_json(db, current_user, backup_payload, overwrite_existing=overwrite)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Restore failed: {str(e)}",
        )
