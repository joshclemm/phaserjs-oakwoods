Irwin theme scaffold

This folder is the target location for the future Irwin asset pack.

Current state:
- `src/themes/themes.ts` registers `irwin` as a selectable theme.
- `public/assets/irwin/assets.json` currently reuses the Oak Woods files by pointing `basePath` at `assets/oakwoods`.
- The empty `background/`, `character/`, and `decorations/` folders are where the real Irwin files should go later.

When the Irwin art is ready:
1. Put the real files into this folder tree.
2. Change `basePath` in `public/assets/irwin/assets.json` to `assets/irwin`.
3. Update the file paths, keys, and any frame dimensions in that manifest as needed.
