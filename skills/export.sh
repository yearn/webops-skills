#!/bin/bash

# Get the absolute path to the skills directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_SOURCE="$SCRIPT_DIR"
SKILLS_TARGET="$HOME/.claude/skills"

# Create target directory if it doesn't exist
mkdir -p "$SKILLS_TARGET"

# Check if .env file exists in repo root
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ ! -f "$REPO_ROOT/.env" ]; then
    echo "⚠️  WARNING: No .env file found at $REPO_ROOT/.env"
    echo "   Some skills require RPC configuration to function."
    echo "   Copy .env.example and configure your RPC endpoints:"
    echo "   cp $REPO_ROOT/.env.example $REPO_ROOT/.env"
    echo ""
fi

# Create symlinks for all items in skills/ (except export.sh)
for item in "$SKILLS_SOURCE"/*; do
    basename_item=$(basename "$item")

    # Skip export.sh itself
    if [ "$basename_item" = "export.sh" ]; then
        continue
    fi

    # Create symlink
    ln -sf "$item" "$SKILLS_TARGET/$basename_item"
    echo "Linked: $basename_item"
done

# Remove orphaned symlinks from target directory
for link in "$SKILLS_TARGET"/*; do
    if [ -L "$link" ]; then
        basename_link=$(basename "$link")
        source_item="$SKILLS_SOURCE/$basename_link"

        # If the source doesn't exist, remove the symlink
        if [ ! -e "$source_item" ]; then
            rm "$link"
            echo "Removed orphaned symlink: $basename_link"
        fi
    fi
done

echo "Skills export complete!"
