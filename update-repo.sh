# File: update-repo.sh

#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

# --- Step 1: Verify Git Configuration ---
echo "Verifying remote repository..."
git remote -v
echo "Remote verified. You should be pushing to your repository."
echo ""

# --- Step 2: Check the Status (Optional but Recommended) ---
echo "Showing a summary of changes (this will be a lot!)..."
git status -s
echo ""
echo "Status check complete. The above shows all new and deleted files."
echo ""

# --- Step 3: Stage All Changes ---
echo "Staging all changes (new, modified, and deleted files)..."
git add .
echo "All changes staged."
echo ""

# --- Step 4: Commit the Changes ---
# Use a clear, descriptive message for this massive update.
COMMIT_MESSAGE="feat: Complete architectural overhaul to Mindshard Studio v2.1 with Backend and Frontend successfully being served locally."
echo "Committing with message: \"$COMMIT_MESSAGE\""
git commit -m "$COMMIT_MESSAGE"
echo "Commit successful."
echo ""

# --- Step 5: Push to the Remote Repository ---
# Assuming your main branch is 'main'. Change to 'master' if needed.
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
echo "Pushing changes to the '$BRANCH_NAME' branch on the remote..."
git push origin "$BRANCH_NAME"
echo ""

echo "✅ --- Repository update complete! --- ✅"
