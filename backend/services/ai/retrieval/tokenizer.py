import string

def tokenize_for_bm25(text: str) -> list[str]:
    """
    Normalizes and tokenizes text for BM25 processing.
    - Converts to lowercase
    - Removes punctuation
    - Splits by whitespace
    """
    if not text:
        return []
    text = text.lower()
    # Remove punctuation using translation table
    text = text.translate(str.maketrans('', '', string.punctuation))
    return text.split()
