import json
import os
import random
import logging
from typing import List, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from models import Document, Workspace
from sqlalchemy import select
from models.chunk import Chunk
from services.ai.gateway import LLMGateway

logger = logging.getLogger(__name__)

DATASET_DIR = os.path.join(os.path.dirname(__file__), "../../../data/eval_datasets")

def load_dataset(dataset_type: str) -> List[Dict]:
    file_path = os.path.join(DATASET_DIR, f"{dataset_type}.json")
    if not os.path.exists(file_path):
        return []
    with open(file_path, "r") as f:
        return json.load(f)

def save_dataset(dataset_type: str, data: List[Dict]):
    if not os.path.exists(DATASET_DIR):
        os.makedirs(DATASET_DIR)
    file_path = os.path.join(DATASET_DIR, f"{dataset_type}.json")
    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)

async def generate_synthetic_dataset(workspace_id: str, db: AsyncSession, sample_size: int = 10) -> List[Dict]:
    """Generates synthetic eval datasets using the LLMGateway."""
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError(f"Workspace {workspace_id} not found.")

    gateway = LLMGateway(db)
    chat_adapter, model_name = await gateway.get_chat_provider(workspace)

    stmt = select(Chunk).join(Document).where(Document.workspace_id == workspace_id, Document.status == "ready")
    result = await db.execute(stmt)
    chunks = result.scalars().all()
    
    if not chunks:
        logger.warning(f"No chunks found in workspace {workspace_id}.")
        return []

    sampled_chunks = random.sample(chunks, min(sample_size, len(chunks)))
    dataset = []

    for c in sampled_chunks:
        uid = f"{c.document_id}_{c.chunk_index}"
        prompt = (
            f"Given the following text chunk, generate 3 distinct questions that can be answered by the text.\n"
            f"1. A 'direct' question (factual, straightforward).\n"
            f"2. A 'paraphrase' question (using synonyms and alternative phrasing).\n"
            f"3. A 'reasoning' question (requires synthesizing or deduction from the text).\n\n"
            f"Output exactly valid JSON in this array format:\n"
            f"[\n"
            f"  {{\"category\": \"direct\", \"query\": \"...\"}},\n"
            f"  {{\"category\": \"paraphrase\", \"query\": \"...\"}},\n"
            f"  {{\"category\": \"reasoning\", \"query\": \"...\"}}\n"
            f"]\n\n"
            f"Text Chunk:\n{c.content}"
        )

        try:
            response_stream = chat_adapter.stream_response(
                messages=[{"role": "user", "content": prompt}],
                model=model_name,
                temperature=0.7
            )
            
            accumulated = ""
            async for chunk in response_stream:
                accumulated += chunk
                
            import re
            json_str = accumulated
            match = re.search(r'\[.*\]', accumulated, re.DOTALL)
            if match:
                json_str = match.group(0)
                
            generated_qs = json.loads(json_str)
            for q in generated_qs:
                dataset.append({
                    "type": "synthetic",
                    "category": q.get("category", "direct"),
                    "query": q.get("query"),
                    "expected_chunk_uid": uid
                })
        except Exception as e:
            logger.error(f"Failed to generate questions for chunk {uid}: {e}")

    return dataset
