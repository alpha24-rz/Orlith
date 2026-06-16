import pytest
from services.ai.evaluation.metrics import calculate_mrr, calculate_recall_at_k, calculate_ndcg

def test_calculate_mrr():
    assert calculate_mrr(1) == 1.0
    assert calculate_mrr(2) == 0.5
    assert calculate_mrr(10) == 0.1
    assert calculate_mrr(0) == 0.0
    assert calculate_mrr(-1) == 0.0

def test_calculate_recall_at_k():
    assert calculate_recall_at_k(1, 5) == 1
    assert calculate_recall_at_k(5, 5) == 1
    assert calculate_recall_at_k(6, 5) == 0
    assert calculate_recall_at_k(10, 10) == 1
    assert calculate_recall_at_k(11, 10) == 0
    assert calculate_recall_at_k(0, 5) == 0

def test_calculate_ndcg():
    assert calculate_ndcg(1) == 1.0
    assert abs(calculate_ndcg(2) - 0.6309) < 0.001
    assert abs(calculate_ndcg(3) - 0.5) < 0.001
    assert calculate_ndcg(0) == 0.0
    assert calculate_ndcg(6, k=5) == 0.0
