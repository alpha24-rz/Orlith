from pydantic import BaseModel
from typing import List, Dict, Any
import re
from models.document import Document
from services.context import PipelineContext

class ClassificationResult(BaseModel):
    label: str
    raw_score: int
    matched_rules: List[str]
    confidence: float

class DocumentClassifier:
    """Klasifikasi domain/kategori dokumen berdasarkan rules dan heuristic scoring."""
    
    def classify(self, text: str) -> ClassificationResult:
        score = 0
        matched = []
        
        # Academic Rules
        if re.search(r'(?i)\babstract\b', text[:2000]):
            score += 2
            matched.append("abstract")
        if re.search(r'(?i)\bdoi\b\s*[:\.]', text[:1000]):
            score += 3
            matched.append("doi")
        if re.search(r'(?i)\breferences\b', text[-3000:]):
            score += 2
            matched.append("references")
        if re.search(r'(?i)\bkeywords\b', text[:2000]):
            score += 1
            matched.append("keywords")
        if re.search(r'(?i)\bissn\b', text[:1000]):
            score += 3
            matched.append("issn")
        if re.search(r'(?i)\buniversity\b', text[:1500]):
            score += 2
            matched.append("university")
            
        # Evaluation
        if score >= 8:
            label = "Academic"
            # Asymmetrical confidence calculation as requested (not just score/max)
            confidence = min(0.7 + (score - 8) * 0.1, 0.99)
        elif score >= 4:
            label = "Semi-Academic"
            confidence = min(0.5 + (score - 4) * 0.1, 0.7)
        else:
            label = "General"
            confidence = 1.0  # Confident that it is general if no specific rules matched
            
        return ClassificationResult(
            label=label,
            raw_score=score,
            matched_rules=matched,
            confidence=confidence
        )

# Plugin Hook Handler
async def classification_hook(ctx: PipelineContext, document: Document, pages: List[Dict], meta: Dict[str, Any]):
    classifier = DocumentClassifier()
    full_text = " ".join([p.get("text", "") for p in pages])
    result = classifier.classify(full_text)
    
    meta["classification"] = result.model_dump()
