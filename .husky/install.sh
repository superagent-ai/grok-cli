#!/bin/sh

# Install husky hooks
# This script is run after npm install

if [ -z "$CI" ]; then
  echo "Setting up git hooks..."
  npx husky install

  # Make hooks executable
  chmod +x .husky/pre-commit
  chmod +x .husky/pre-push

  echo "✓ Git hooks installed successfully!"
else
  echo "Skipping git hooks installation in CI environment"
fi
