#!/bin/sh
# Install git hooks for this repo
HOOK=.git/hooks/pre-commit
cat > "$HOOK" << 'EOF'
#!/bin/sh

# Auto-format staged files
STAGED=$(git diff --cached --name-only --diff-filter=d)
if [ -n "$STAGED" ]; then
  echo "$STAGED" | xargs npx prettier --write --ignore-unknown 2>/dev/null
  echo "$STAGED" | xargs git add
fi

# Scan staged changes for secrets
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --verbose
  if [ $? -ne 0 ]; then
    echo "gitleaks: secrets detected in staged changes. Commit blocked."
    exit 1
  fi
else
  echo "Warning: gitleaks not installed, skipping secret scan"
fi
EOF
chmod +x "$HOOK"
echo "Pre-commit hook installed"
