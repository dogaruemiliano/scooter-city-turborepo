/**
 * DI tokens for the ports the finance domain declares.
 *
 * The domain describes what it needs (`LedgerAccountResolverPort`); the
 * infrastructure layer provides it. A token is what lets NestJS wire the two
 * together without the domain importing Prisma — interfaces do not survive to
 * runtime, so they cannot be injection keys on their own.
 */
export const LEDGER_ACCOUNT_RESOLVER = Symbol("LedgerAccountResolverPort");
