"""
Usage Routes — DocuMind AI
===========================
Endpoint untuk mengakses statistik biaya penggunaan model AI.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any

from core.database import get_db
from models import Workspace
from models.usage_log import UsageLog
from api.deps import get_user_workspace

router = APIRouter(prefix="/usage", tags=["Usage"])


@router.get("/{workspace_id}")
async def get_usage_summary(
    workspace: Workspace = Depends(get_user_workspace),
    db: AsyncSession = Depends(get_db),
):
    """
    Ambil ringkasan total token dan estimasi biaya pemakaian model AI di workspace.
    """
    # 1. Total usage
    totals_query = select(
        func.sum(UsageLog.prompt_tokens).label("prompt"),
        func.sum(UsageLog.completion_tokens).label("completion"),
        func.sum(UsageLog.total_tokens).label("total"),
        func.sum(UsageLog.estimated_cost_usd).label("cost")
    ).where(UsageLog.workspace_id == workspace.id)

    totals_res = await db.execute(totals_query)
    totals = totals_res.fetchone()

    prompt_tokens = totals.prompt or 0
    completion_tokens = totals.completion or 0
    total_tokens = totals.total or 0
    estimated_cost_usd = float(totals.cost or 0.0)

    # 2. Breakdown by provider
    provider_query = select(
        UsageLog.provider,
        func.sum(UsageLog.estimated_cost_usd).label("cost"),
        func.sum(UsageLog.total_tokens).label("tokens")
    ).where(UsageLog.workspace_id == workspace.id).group_by(UsageLog.provider)

    provider_res = await db.execute(provider_query)
    providers = {
        row[0]: {"cost": float(row[1] or 0.0), "tokens": int(row[2] or 0)}
        for row in provider_res.all()
    }

    # 3. Breakdown by model
    model_query = select(
        UsageLog.model,
        func.sum(UsageLog.estimated_cost_usd).label("cost"),
        func.sum(UsageLog.total_tokens).label("tokens")
    ).where(UsageLog.workspace_id == workspace.id).group_by(UsageLog.model)

    model_res = await db.execute(model_query)
    models = {
        row[0]: {"cost": float(row[1] or 0.0), "tokens": int(row[2] or 0)}
        for row in model_res.all()
    }

    # 4. Total queries/calls counted
    count_query = select(func.count(UsageLog.id)).where(UsageLog.workspace_id == workspace.id)
    count_res = await db.execute(count_query)
    total_calls = count_res.scalar_one()

    return {
        "workspace_id": workspace.id,
        "summary": {
            "total_calls": total_calls,
            "total_tokens": total_tokens,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_cost_usd": estimated_cost_usd,
        },
        "by_provider": providers,
        "by_model": models
    }


@router.get("/{workspace_id}/breakdown")
async def get_usage_breakdown(
    workspace: Workspace = Depends(get_user_workspace),
    db: AsyncSession = Depends(get_db),
):
    """
    Ambil rincian biaya pemakaian harian untuk 14 hari terakhir.
    """
    today = datetime.now(timezone.utc).date()
    date_list = [today - timedelta(days=i) for i in range(13, -1, -1)]
    start_date = date_list[0]

    # Query usage per day
    daily_query = select(
        func.date(UsageLog.created_at).label("day"),
        func.sum(UsageLog.estimated_cost_usd).label("cost"),
        func.sum(UsageLog.total_tokens).label("tokens")
    ).where(
        UsageLog.workspace_id == workspace.id,
        UsageLog.created_at >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    ).group_by(func.date(UsageLog.created_at))

    daily_res = await db.execute(daily_query)
    daily_map = {
        str(row[0]): {"cost": float(row[1] or 0.0), "tokens": int(row[2] or 0)}
        for row in daily_res.all()
    }

    breakdown = []
    for d in date_list:
        d_str = d.strftime("%b %d")  # e.g., "Jun 11"
        d_key_str = d.isoformat()

        day_data = daily_map.get(d_key_str, {"cost": 0.0, "tokens": 0})
        breakdown.append({
            "date": d_str,
            "cost": day_data["cost"],
            "tokens": day_data["tokens"]
        })

    return {
        "workspace_id": workspace.id,
        "breakdown": breakdown
    }
