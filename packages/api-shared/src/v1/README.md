# Versioned API contracts

Everything in this directory belongs to the `/v1/*` API.

## Import pattern

```ts
import { v1 } from "@repo/api-shared";

const input = v1.auth.refreshTokenInputSchema;
const route = v1.auth.ROUTES.refresh;
type User = v1.auth.SessionUser;
```

Do not import internal files directly from application packages.

## Layout

```text
v1/
├── index.ts
├── auth/
│   ├── index.ts
│   ├── auth.constants.ts
│   ├── auth.schemas.ts
│   ├── email-otp.schemas.ts
│   ├── google.schemas.ts
│   ├── apple.schemas.ts
│   ├── oauth-email.schemas.ts
│   └── otp-challenge.schemas.ts
├── common/
│   ├── index.ts
│   └── common.schemas.ts
└── users/
    ├── index.ts
    └── users.schemas.ts
```

## Naming

| Contract                    | Schema variable             | Inferred type / DTO        |
| --------------------------- | --------------------------- | -------------------------- |
| Request body                | `*InputSchema`              | `*Input`                   |
| Response body               | `*Schema`                   | Resource name              |
| OpenAPI input component     | `.meta({ id: "*Input" })`   | `*Input`                   |
| OpenAPI serialized response | `.meta({ id: "Resource" })` | Generated `ResourceOutput` |

Rules:

1. Do not use a `Dto` suffix.
2. Give every public schema a stable `.meta({ id })`.
3. Use `.strict()` for request bodies.
4. Use `@ZodResponse` for API responses.
5. Keep output schemas non-strict so serialization can strip extra fields.
6. Use verb-prefixed request names such as `VerifyEmailOtpInput`.

## Adding a schema

```ts
export const requestPasswordResetInputSchema = z
  .object({
    email: emailSchema,
  })
  .strict()
  .meta({ id: "RequestPasswordResetInput" });

export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetInputSchema
>;
```

Then:

1. Export it from the domain barrel.
2. Wrap it with `createZodDto()` in the API.
3. Use it in the controller.
4. Run the relevant tests and regenerate OpenAPI.

## Versioning

Before a public release, contracts may change while the template is being
built. After consumers depend on a released version:

- Additive optional fields may remain in the same version.
- Breaking changes require a new version namespace and route prefix.

Generated clients and `openapi.json` are downstream artifacts. Do not patch
generated types to hide a schema mismatch; fix the source schema instead.
