#!/bin/bash
set -euo pipefail

# Get the absolute path to the skills directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_SOURCE="$SCRIPT_DIR"
SKILLS_TARGETS=(
    "$HOME/.claude/skills"
    "$HOME/.codex/skills"
)

# Check if .env file exists in repo root
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ ! -f "$REPO_ROOT/.env" ]; then
    echo "⚠️  WARNING: No .env file found at $REPO_ROOT/.env"
    echo "   Some skills require RPC configuration to function."
    echo "   Copy .env.example and configure your RPC endpoints:"
    echo "   cp $REPO_ROOT/.env.example $REPO_ROOT/.env"
    echo ""
fi

for SKILLS_TARGET in "${SKILLS_TARGETS[@]}"; do
    # Create target directory if it doesn't exist
    mkdir -p "$SKILLS_TARGET"

    # Create symlinks for all skill directories
    for item in "$SKILLS_SOURCE"/*; do
        basename_item=$(basename "$item")

        # Skip if item is a symlink (prevents recursive linking)
        if [ -L "$item" ]; then
            continue
        fi

        # Skip non-skill files and directories
        if [ ! -f "$item/SKILL.md" ]; then
            continue
        fi

        # Remove existing symlink/file if it exists to prevent nested symlinks
        target_path="$SKILLS_TARGET/$basename_item"
        if [ -e "$target_path" ] || [ -L "$target_path" ]; then
            if [ ! -L "$target_path" ]; then
                echo "Refusing to overwrite non-symlink: $target_path"
                exit 1
            fi
            rm "$target_path"
        fi

        # Create symlink
        ln -s "$item" "$target_path"
        echo "Linked: $basename_item -> $SKILLS_TARGET"
    done

    # Remove orphaned symlinks from target directory
    for link in "$SKILLS_TARGET"/*; do
        if [ -L "$link" ]; then
            basename_link=$(basename "$link")
            link_target=$(readlink "$link")
            source_item="$SKILLS_SOURCE/$basename_link"

            # If a symlink managed by this repo points to a removed source, remove it.
            if [[ "$link_target" == "$SKILLS_SOURCE/"* && ! -e "$source_item" ]]; then
                rm "$link"
                echo "Removed orphaned symlink: $basename_link from $SKILLS_TARGET"
            fi
        fi
    done
done

echo "Skills export complete!"
