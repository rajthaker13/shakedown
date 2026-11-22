# Shakedown web app

The dashboard, landing page and documentation, built with Next.js and Supabase.
From the repository root, `make setup` installs it and copies `.env.example` to `.env.local`; fill that with the URL and keys `supabase start` prints.
`make dev` then serves it at http://localhost:3400.
`npm test` runs the unit tests, `npm run lint` the linter and `npx tsc --noEmit` the type check; see the repository README for deployment.
