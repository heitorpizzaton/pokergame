# tools/

Build-time asset tools (AGENTS.md §22.1), installed by `npm run assets:setup`
(`scripts/assets/setup.sh`) and ignored by Git:

- `venv/`: Python 3.11 virtual environment with Blender as a module (`bpy`, pinned).
- `mpfb2/`: MPFB2 cloned at a pinned commit (GPL-3.0 code, with its `LICENSE.md`; CC0 assets).
- `blender-user/`: a private Blender user-resources folder that exposes MPFB2 as an extension.

Nothing here is bundled into the web app.
