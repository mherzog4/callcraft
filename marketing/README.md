# CallCraft marketing site

The public marketing site is a dependency-free static site deployed separately from the stateful CallCraft application.

- Production: <https://callcraft-oss.vercel.app>
- Vercel project: `mherzog4s-projects/callcraft`
- Project root: `marketing/`

## Local preview

Serve this directory with any static file server:

```bash
npx serve marketing
```

## Deploy

```bash
vercel --cwd marketing --prod
```

`vercel.json` supplies clean URLs, immutable asset caching, and security headers. The operational Next.js application remains at the repository root and is not deployed by this Vercel project because it requires a persistent SQLite volume and worker process.
