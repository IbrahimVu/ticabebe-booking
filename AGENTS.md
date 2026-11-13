# TiCaBeBe project

- Repository: `https://github.com/IbrahimVu/ticabebe-booking.git`; production branch: `main`.
- Live site: `https://ibrahimvu.github.io/ticabebe-booking/`.
- Edit frontend source in `public/`, backend schema in `supabase/`. The root frontend files and `schema.sql` are generated publishing copies. Do not edit those copies directly.
- The user wants requested app changes validated, committed and pushed from this project without manual browser uploads, unless they explicitly request a preview/draft or say not to publish. Respect the user's scope and preserve unrelated work.
- Run `node scripts/deploy.mjs "Clear description"` to test, synchronize publishing files, commit and push. It requires `main`, the exact configured origin, and a remote history compatible with the local branch. Never force-push. Investigate and resolve any concurrent remote changes before continuing.
- GitHub Pages is configured to deploy from `main` at `/(root)`. GitHub's built-in Pages workflow publishes new pushes. The repository workflow validates the source and generated copies; it does not need a second Pages deployment.
- For browser checks, use `node scripts/build-preview.mjs` then `node tests/preview-smoke.mjs`. The standalone HTML is a local demo only and is ignored by Git. `tests/ui-smoke.mjs` requires the local server.
- Git Credential Manager authenticates Git. Do not read/print stored credentials, put tokens in remote URLs, or upload passwords, service-role keys, secret keys or environment files. Public Supabase publishable key and the explicitly approved admin email are intentional frontend configuration.
- The user's latest security request remains open: review authentication/data security and address their requirement about encrypted login transport. Do not claim application-layer encrypted login is implemented: current Supabase password login uses HTTPS/TLS and a JSON request body. Do not replace TLS with ad hoc client hashing or hardcoded encryption keys.
