# Release Guide

## First Publish

1. `npm login`
2. `npm whoami`
3. Check package names:
   - `npm view prosemirror-html-table`
   - `npm view tiptap-html-table`
4. `npm run pack:check`
5. `npx changeset`
6. Push to `main`
7. Wait for the Changesets release PR
8. Merge the release PR to publish both packages

## Manual Fallback

```bash
npm run build:packages
npm publish -w prosemirror-html-table --access public
npm publish -w tiptap-html-table --access public
```

## Notes

- Keep the root workspace package `private: true`
- Do not run `npm publish` from the repo root
- Only publish the workspace packages
