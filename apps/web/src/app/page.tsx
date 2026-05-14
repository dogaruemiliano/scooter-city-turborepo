import { cookies } from "next/headers";
import { ThemeToggle } from "../components/ThemeToggle";
import { resolveThemePreference, THEME_COOKIE_NAME } from "../lib/theme-cookie";

const RADIUS_SAMPLES = [
  { label: "rounded-sm", className: "rounded-sm" },
  { label: "rounded-md", className: "rounded-md" },
  { label: "rounded-lg", className: "rounded-lg" },
  { label: "rounded-xl", className: "rounded-xl" },
  { label: "rounded-2xl", className: "rounded-2xl" },
  { label: "rounded-pill", className: "rounded-pill" },
] as const;

const SHADOW_SAMPLES = [
  { label: "shadow-sm", className: "shadow-sm" },
  { label: "shadow-md", className: "shadow-md" },
  { label: "shadow-lg", className: "shadow-lg" },
  { label: "shadow-xl", className: "shadow-xl" },
] as const;

export default async function Home() {
  const initialPreference = resolveThemePreference(
    (await cookies()).get(THEME_COOKIE_NAME)?.value,
  );

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold text-text-primary">
            @repo/theme
          </span>
          <ThemeToggle initialPreference={initialPreference} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 space-y-12">
        <section className="space-y-2">
          <h1 className="text-4xl font-bold text-text-primary">Token demo</h1>
          <p className="text-base text-text-secondary">
            Every color, radius, and shadow on this page comes from
            <code className="font-mono text-text-primary"> @repo/theme</code>.
            Toggle the theme to see semantic tokens flip.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">Surfaces</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SurfaceSwatch label="surface-page" className="bg-surface-page" />
            <SurfaceSwatch
              label="surface-raised"
              className="bg-surface-raised"
            />
            <SurfaceSwatch
              label="surface-sunken"
              className="bg-surface-sunken"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">Text</h2>
          <div className="space-y-1">
            <p className="text-text-primary">text-primary — primary copy</p>
            <p className="text-text-secondary">
              text-secondary — supporting copy
            </p>
            <p className="text-text-tertiary">text-tertiary — quiet copy</p>
            <p className="text-text-disabled">text-disabled — disabled state</p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">Radius</h2>
          <div className="flex flex-wrap gap-4">
            {RADIUS_SAMPLES.map(({ label, className }) => (
              <div
                key={label}
                className={`bg-surface-raised border border-border-default px-4 py-3 text-sm text-text-secondary ${className}`}
              >
                {label}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">Shadow</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {SHADOW_SAMPLES.map(({ label, className }) => (
              <div
                key={label}
                className={`bg-surface-raised rounded-md p-4 text-sm text-text-secondary ${className}`}
              >
                {label}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">Action</h2>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="rounded-md bg-surface-action px-4 py-2 text-sm font-semibold text-text-on-action shadow-sm hover:bg-surface-action-hover active:bg-surface-action-active"
            >
              Primary button
            </button>
            <button
              type="button"
              className="rounded-md border border-border-default bg-surface-raised px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-sunken"
            >
              Secondary button
            </button>
            <a
              href="#"
              className="text-sm font-medium text-text-link hover:text-text-link-hover"
            >
              Link styling
            </a>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">Status</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatusBanner
              tone="success"
              title="Success"
              body="Order placed successfully."
            />
            <StatusBanner
              tone="warning"
              title="Heads up"
              body="Your trial ends in 3 days."
            />
            <StatusBanner
              tone="danger"
              title="Something went wrong"
              body="We couldn't reach the server."
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function SurfaceSwatch({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div
      className={`${className} border border-border-subtle rounded-lg p-6 shadow-sm`}
    >
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="mt-2 text-base font-medium text-text-primary">
        Aa Bb 123
      </div>
    </div>
  );
}

const STATUS_CLASSES = {
  success: "bg-surface-success-subtle border-border-success",
  warning: "bg-surface-warning-subtle border-border-default",
  danger: "bg-surface-danger-subtle border-border-danger",
} as const;

function StatusBanner({
  tone,
  title,
  body,
}: {
  tone: keyof typeof STATUS_CLASSES;
  title: string;
  body: string;
}) {
  return (
    <div className={`${STATUS_CLASSES[tone]} border rounded-md p-4`}>
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="mt-1 text-sm text-text-secondary">{body}</div>
    </div>
  );
}
