# Rezumat tehnologii — Turborepo Full Template v2

Document pregătit pentru a fi folosit ca input în Claude Chat la redactarea introducerii lucrării de licență. Acoperă: monorepo, structura proiectului, autentificare, autorizare, baza de date, module, rutare, controllere, theme, Storybook.

---

## 📦 Tipologie generală

**Tip proiect:** Monorepo full-stack (web + mobile + API + UI library partajată), gândit ca template reutilizabil.

- **Manager workspace:** pnpm v9 cu `pnpm-workspace.yaml` (`apps/*` + `packages/*`)
- **Orchestrator build/dev/test:** Turborepo v2 (cache de task-uri, `dependsOn`, TUI)
- **Limbaj:** TypeScript 5.9 strict pe toate pachetele
- **Validare schemă end-to-end:** Zod v4 (folosit la env, DTO-uri NestJS prin `nestjs-zod`, contract API)
- **Lint/format:** ESLint 9 (flat config partajat `@repo/eslint-config`) + Prettier + `lefthook` (git hooks) + `lint-staged`
- **Containerizare DB locală:** Docker Compose (Postgres 16 Alpine pe portul 5434)
- **CI hooks:** Lefthook

## 🏗️ Structura monorepo

```
apps/
├─ api/        NestJS 11 REST API
├─ web/        Next.js 16 (App Router, React 19, Tailwind v4)
└─ mobile/     Expo SDK 55 + React Native 0.83 + expo-router
packages/
├─ api-shared/        Tipuri/Zod schemas/rute partajate (single source of truth)
├─ theme/             Design tokens (web/Tailwind)
├─ theme-native/      Design tokens + Unistyles config (mobile)
├─ ui/                Componente React (web) cu Storybook
├─ ui-native/         Componente React Native (Dec*)
├─ eslint-config/     Config ESLint partajat
└─ typescript-config/ tsconfig-uri partajate
```

## 🖥️ Backend (`apps/api`)

**Framework:** NestJS 11 (arhitectură modulară pe IoC/DI, decoratori, controllere + services + modules).

**Librării principale:**

- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` — kernel HTTP pe Express
- `@nestjs/config` — config tipat + validat cu Zod
- `@nestjs/swagger` — OpenAPI auto-generat (Swagger UI la `/api-docs`)
- `nestjs-zod` — pipe global de validare body/query + interceptor de serializare răspunsuri (`@ZodResponse`)
- `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` — strategie JWT
- `jose` — JWT semnare/verificare cu rotire de chei
- `@nestjs/throttler` — rate limiting (guard global)
- `@nestjs/schedule` — cron jobs (cleanup tokenuri/sesiuni expirate)
- `@nestjs/terminus` — healthcheck (`/healthz`)
- `nestjs-pino` + `pino-http` + `pino-pretty` — logging structurat JSON + request IDs
- `class-validator` + `class-transformer` — fallback DTO clasic
- `bcrypt` — hashing parole (pentru viitor; momentan auth e fără parolă)
- `cookie-parser` — sesiuni pe cookie-uri HttpOnly
- `nodemailer` — livrare email prin SMTP
- `google-auth-library` — verificare ID-token Google OAuth

**Structură modulară** (`apps/api/src/`):

```
app.module.ts        Root: leagă ConfigModule, LoggerModule, PrismaModule,
                     MailerModule, SmsModule, AuditModule, UsersModule,
                     HealthModule, AuthModule.forRoot(buildAuthConfig(env))
auth/                Subsistem auth (vezi mai jos)
audit/               Append-only event log (LOGIN_SUCCESS, OAUTH_LINKED, etc.)
common/              Middleware (request-id), logger config
config/              loadEnv() cu Zod + ConfigModule ce expune `ENV` token DI
health/              /healthz prin @nestjs/terminus
mailer/              Service + SMTP implementation
sms/                 Service + impls (SMSO.ro / dev console)
users/               UsersService injectat în auth
prisma/              PrismaService (extinde PrismaClient cu driver adapter PgPool)
```

**Module dinamice:** `AuthModule.forRoot(config)` returnează un `DynamicModule` care **adaugă submodule pe baza flag-urilor de env** (`AUTH_EMAIL_OTP_ENABLED`, `AUTH_GOOGLE_ENABLED`, `AUTH_APPLE_ENABLED`). Metodele dezactivate nu doar se ascund — rutele lor nu există (404), providerii nu sunt înregistrați, env vars nu sunt cerute.

**Rutare & controllere:** Decoratori NestJS (`@Controller('v1/auth/email-otp')`, `@Post('request')`, `@UseGuards()`, `@Public()`, `@CurrentUser()`). Toate rutele sunt prefixate `/v1/...` și documentate cu `@ZodResponse({ type })` care alimentează OpenAPI.

## 🔐 Autentificare & autorizare

**Filosofie:** sesiuni pe **cookie-uri HttpOnly SameSite=Lax**, fără NextAuth/authjs, fără parolă în varianta v1 (doar OTP + OAuth).

**Metode de auth implementate ca submodule independente:**

- **Email OTP** — cod cu 6 cifre trimis pe email
- **SMS transport** — infrastructură păstrată pentru notificări sau verificarea telefonului
- **Google OAuth** — verificare ID-token
- **Apple Sign-in** — capturează email-ul la prima conectare (Apple îl trimite doar atunci)

**Fluxul de tokenuri:**

- Access token JWT (scurt, ~15 min), semnat RS256 de API și verificat local în web prin JWKS
- Refresh token rotativ — un rând în DB per valoare emisă vreodată, cu **HMAC SHA-256** peppered (`REFRESH_TOKEN_HMAC_SECRET`)
- **Reuse detection** prin câmpul `previousJti` → dacă cineva folosește un token deja rotit, se arde toată sesiunea
- **Multi-instance refresh rotation** cu lock PostgreSQL pe rând și traversarea lanțului `previousJti` într-o fereastră scurtă de grație (vezi ADR `docs/adr/0003`)
- OTP-urile sunt stocate hash-uite (`OTP_HMAC_SECRET`), niciodată plaintext; `attemptsCount` blochează brute force

**Autorizare:**

- `JwtAuthGuard` înregistrat global ca `APP_GUARD` → toate rutele sunt protejate by default
- Decoratorul `@Public()` marchează excepții (login, healthcheck, OpenAPI)
- `JwtStrategy` (Passport) extrage tokenul din cookie HttpOnly
- quota persistente limitează emailurile OTP, iar throttling-ul NestJS oferă protecție separată pentru burst-uri și trafic global

**Cleanup:** Cron job-ul (`@nestjs/schedule`) șterge refresh tokens expirate, challenge-uri OTP vechi, ferestre de quota expirate și sesiuni revocate suficient de vechi.

## 🗄️ Baza de date

- **Engine:** PostgreSQL 16
- **ORM:** Prisma 7 (cu schimbări majore față de v6)
  - Generator nou: `prisma-client` (nu `prisma-client-js`)
  - **WebAssembly query compiler**, fără binar Rust (`engineType = "client"`)
  - **Driver adapter obligatoriu**: `@prisma/adapter-pg` cu pool `pg` configurat explicit
  - Client generat în `src/generated/prisma/`, import de acolo (nu din `@prisma/client`)
  - Conexiunea trăiește în `prisma.config.ts`, nu în `schema.prisma`

**Modele principale** (toate cu `onDelete: Cascade` legat de `User`, mai puțin `AuditEvent` cu `SetNull` pentru compliance):

- `User` — email/phone + timestamps de verificare (fără passwordHash în v1)
- `Session` — un rând per "device logat", folosit pentru "active devices" + "logout other devices"
- `RefreshToken` — un rând per valoare emisă, cu chaining prin `previousJti`
- `OtpChallenge` — challenge-uri OTP cu UUID opac, scop, cooldown de resend și limită de încercări
- `OtpDeliveryQuota` — contoare atomice pe ferestre fixe pentru limitarea livrărilor OTP
- `AuthAccount` — identități OAuth linkuite (`provider + providerId` unic)
- `AuditEvent` — append-only log supraviețuiește ștergerii userului

## 🌐 Frontend Web (`apps/web`)

- **Framework:** Next.js 16 cu **App Router**
- **React:** 19.2 cu **React Compiler** (`babel-plugin-react-compiler`)
- **Styling:** Tailwind CSS v4 (cu `@tailwindcss/postcss`)
- **Tipare/contract:** consumă `@repo/api-shared` (Zod schemas + tipuri) și `@repo/ui` (componente)
- Layout: `src/app/layout.tsx`, pagini sub `src/app/`

## 📱 Frontend Mobile (`apps/mobile`)

- **Framework:** Expo SDK 55 + React Native 0.83 + React 19
- **Rutare:** `expo-router` (file-based routing, ex.: `app/(drawer)/_layout.tsx`)
- **Navigare:** `@react-navigation/native` + `bottom-tabs` + `drawer` + `elements`
- **Styling:** `react-native-unistyles` v3 (theming reactiv, breakpoints, dark mode)
- **Animații/gestures:** `react-native-reanimated` v4 + `react-native-gesture-handler` + `react-native-worklets`
- **Componente vizuale:** `@gorhom/bottom-sheet`, `expo-blur`, `expo-glass-effect`, `expo-image`, `expo-symbols`, `react-native-edge-to-edge`
- **Native modules:** `react-native-nitro-modules` (FFI moderne pentru RN)
- Componente custom prefixate `Dec*` în `@repo/ui-native` (`DecButton`, `DecCard`, `DecInput`, etc.)

## 🎨 Design system & theme

**Single source of truth:** `packages/theme/src/tokens/` — niciun hex/px/durată hardcoded nicăieri.

**Categorii de tokens** (toate `as const`):

- `primitives.ts` — paletă de culori brute
- `semantic.ts` — tokens semantice (background, foreground, accent...) cu light/dark
- `spacing.ts`, `radius.ts`, `typography.ts`, `shadow.ts`, `motion.ts` (duration + easing), `z-index.ts`, `breakpoints.ts`

**Distribuție pe platforme:**

- `@repo/theme` exportă: TS tokens, CSS variables (`./css`), **Tailwind preset** (`./tailwind`)
- `@repo/theme-native` reambalează aceleași tokens pentru Unistyles (`configure` runtime + `unistyles.d.ts` augmentare TypeScript)
- Build script `tsx scripts/build-tokens.ts` generează `tokens.css` și `tokens.native.ts`

## 📚 Storybook (`packages/ui`)

- **Storybook 10** pe **Vite 7** (`@storybook/react-vite`)
- Plugin Tailwind v4 (`@tailwindcss/vite`) ca să citească același preset
- O poveste per componentă: `Button.stories.tsx`, `Card.stories.tsx`, `Input.stories.tsx`, `Select.stories.tsx`, `BottomSheet.stories.tsx`, `Snackbar.stories.tsx`, `Badge.stories.tsx`, `Form.stories.tsx`, `Divider.stories.tsx`, `Text.stories.tsx`
- Rulează cu `pnpm --filter @repo/ui dev` (portul 6006)

## 🔗 Contract API end-to-end

- **OpenAPI:** generat din decoratorii NestJS + Zod schemas → `openapi.json` în root
- **Tipuri partajate:** `@repo/api-shared` conține schemas Zod (`*InputSchema`/`*Schema`), nume cookie, path-uri de rută, și un helper `api-fetch.ts` — toate consumate identic de web, mobile și API
- Convenție de naming: schema Zod = `LoginInputSchema`, clasă NestJS = `LoginInput`, fără sufix `Dto`

## 🧪 Testing

- **Unit:** Jest 30 cu `ts-jest`
- **E2E API:** Jest + Supertest
- **E2E Web:** Playwright (planificat)

## 📖 Documentație internă

- `docs/adr/` — Architecture Decision Records (de ce am ales cookies, de ce rotația multi-instanță e implementată așa, etc.)
- `docs/auth/` — documentație cross-cutting pentru subsistemul de auth
- README per app + per package
