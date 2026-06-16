import argparse
import sys
import os

# Add backend directory to sys.path so we can import core modules
sys.path.append(os.path.join(os.path.dirname(__file__), "../backend"))

try:
    import chromadb
    from core.chroma import get_workspace_collection, get_chroma_client
except ImportError as e:
    print(f"Error importing required modules. Make sure you run this in the backend environment. Error: {e}")
    sys.exit(1)

def check_chroma(workspace_id: str):
    client = get_chroma_client()
    
    # List all collections to see what we have
    collections = client.list_collections()
    print("Available Collections:")
    for c in collections:
        print(f" - {c.name}")
        
    print(f"\nTarget Workspace: {workspace_id}")
    collection_name = f"workspace_{workspace_id}"
    
    try:
        collection = client.get_collection(collection_name)
    except Exception as e:
        print(f"Collection '{collection_name}' not found. Error: {e}")
        return

    count = collection.count()
    print(f"\nCollection Name: {collection.name}")
    print(f"Total Vectors (Chunks): {count}")
    
    if count > 0:
        print("\nFetching sample data (first 3 chunks)...")
        results = collection.peek(limit=3)
        for i in range(len(results["ids"])):
            print("-" * 40)
            print(f"ID: {results['ids'][i]}")
            print(f"Metadata: {results['metadatas'][i]}")
            snippet = results["documents"][i][:100].replace("\n", " ") + "..."
            print(f"Text Snippet: {snippet}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check ChromaDB collection for a workspace.")
    parser.add_argument("--workspace", required=True, help="Workspace ID (e.g., ws_01)")
    args = parser.parse_args()
    
    check_chroma(args.workspace)
