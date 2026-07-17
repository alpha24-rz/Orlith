#!/bin/bash
set -e

# Navigate to the backend directory where the script is located
cd "$(dirname "$0")"

# Expect token as environment variable HF_TOKEN or first argument
token="$HF_TOKEN"
if [ -z "$token" ]; then
    token="$1"
fi

if [ -z "$token" ]; then
    echo "Error: Hugging Face Access Token must be provided as HF_TOKEN env var or as the first argument."
    echo "Usage: ./push_to_hf.sh <YOUR_HF_TOKEN> [optional_commit_message]"
    exit 1
fi

commit_msg="Update backend: deploy from unified backend directory"
if [ -n "$2" ]; then
    commit_msg="$2"
fi

echo "=== Creating temporary work directory for deployment ==="
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

repo_url="https://alpha24-rz:${token}@huggingface.co/spaces/alpha24-rz/orlith-ai"

echo "=== Cloning current Hugging Face Space repository ==="
git clone --depth 1 "$repo_url" "$tmp_dir/hf_repo"
cd "$tmp_dir/hf_repo"

echo "=== Syncing backend files to Hugging Face Space repository ==="
# Remove old files (excluding .git and storage directories)
find . -maxdepth 1 ! -name '.' ! -name '.git' ! -name 'data' ! -name 'uploads' -exec rm -rf {} +

# Copy updated files from backend directory
cp -r "$OLDPWD/"* .
cp -f "$OLDPWD/.gitattributes" . 2>/dev/null || true
cp -f "$OLDPWD/.gitignore" . 2>/dev/null || true

# Remove unwanted directories and scripts if copied
rm -rf venv data uploads push_to_hf.sh
find . -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
find . -name '*.pyc' -type f -delete 2>/dev/null || true
find . -name '.pytest_cache' -type d -exec rm -rf {} + 2>/dev/null || true


echo "=== Staging and Committing ==="
git config user.name "Alpha ORLITH"
git config user.email "alpha24@users.noreply.huggingface.co"
git add -A
if git commit -m "$commit_msg"; then
    echo "=== Pushing to Hugging Face Spaces ==="
    git push origin main --force
    echo "=== Successfully deployed backend to Hugging Face Spaces! ==="
else
    echo "=== No changes detected, space is already up to date! ==="
fi
