# Release phase runs before the new dyno boots and blocks the release if it
# fails, so a schema that can't migrate leaves the previous version serving
# instead of shipping code against a database it doesn't match.
# `migrate deploy` only applies pending migrations — it never resets or drops.
release: pnpm --filter api db:deploy
web: pnpm --filter api start:prod
