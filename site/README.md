# site/ — maintenance page

Static page for mohonaut.com, served by Cloudflare Pages (root directory `site`, no build command,
production branch `main`, preview deployments off). Until launch the domain shows only a neutral
"under maintenance" page: no project name, no description, `noindex`, `Disallow: /`.

The earlier "coming soon" page and `.well-known/security.txt` are in git history (commit 5f16787);
restore them, without the noindex rules, when the project goes public. Phase 4 replaces this folder
with the Next.js app.
