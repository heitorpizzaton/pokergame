#!/usr/bin/env bash
# Installs the headless asset tools (AGENTS.md §22.1) under tools/. Build-time only: nothing
# here is bundled into the web app. Versions are pinned; see docs/DECISIONS.md (ADR-030).
set -euo pipefail
cd "$(dirname "$0")/../.."

BPY_VERSION="5.0.1"          # Blender as a Python module; the wheel needs Python 3.11
MPFB_REPO="https://github.com/makehumancommunity/mpfb2.git"
MPFB_COMMIT="3edf9df0551765be43563d047888cf7877eb89b4"   # MPFB 2.0.17 (GPL-3 code, CC0 assets)

PYTHON="${PYTHON:-python3.11}"
command -v "$PYTHON" >/dev/null || PYTHON=python3
"$PYTHON" -c 'import sys; assert sys.version_info[:2] == (3, 11), "bpy 5.0 needs Python 3.11"'

if [ ! -x tools/venv/bin/python ]; then
  "$PYTHON" -m venv tools/venv
fi
if ! tools/venv/bin/python -c "import bpy, sys; sys.exit(bpy.app.version_string != '$BPY_VERSION')" 2>/dev/null; then
  tools/venv/bin/pip install --quiet "bpy==$BPY_VERSION"
fi

if [ ! -d tools/mpfb2/.git ]; then
  git clone --quiet --filter=blob:none "$MPFB_REPO" tools/mpfb2
fi
git -C tools/mpfb2 fetch --quiet origin "$MPFB_COMMIT" 2>/dev/null || true
git -C tools/mpfb2 checkout --quiet "$MPFB_COMMIT"

# MPFB is a Blender extension: expose it through a private user-resources folder.
mkdir -p tools/blender-user/extensions/user_default
ln -sfn "$(pwd)/tools/mpfb2/src/mpfb" tools/blender-user/extensions/user_default/mpfb
echo "Asset tools ready: bpy $BPY_VERSION, MPFB2 ${MPFB_COMMIT:0:10}"
