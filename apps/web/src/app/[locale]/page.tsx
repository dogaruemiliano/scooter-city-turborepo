import Link from "next/link";

import { localizePath, resolveRouteLocale } from "../../i18n/paths";

const RADIUS_SAMPLES = [
  { label: "rounded-sm", className: "rounded-sm" },
  { label: "rounded-md", className: "rounded-md" },
  { label: "rounded-lg", className: "rounded-lg" },
  { label: "rounded-xl", className: "rounded-xl" },
  { label: "rounded-2xl", className: "rounded-2xl" },
  { label: "rounded-full", className: "rounded-full" },
] as const;

const SHADOW_SAMPLES = [
  { label: "shadow-sm", className: "shadow-sm" },
  { label: "shadow-md", className: "shadow-md" },
  { label: "shadow-lg", className: "shadow-lg" },
  { label: "shadow-xl", className: "shadow-xl" },
] as const;

interface HomeProps {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: HomeProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 py-12">
      <section className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">Flat shadcn theme contract</h1>
          <p className="max-w-2xl text-muted-foreground">
            The web keeps the authored OKLCH values while React Native consumes
            generated sRGB equivalents from the same source.
          </p>
        </div>
        <Link
          href={localizePath("/shadcn", locale)}
          className="inline-flex w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Open component showcase
        </Link>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Core surfaces</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SurfaceSwatch label="background" className="bg-background" />
          <SurfaceSwatch label="card" className="bg-card" />
          <SurfaceSwatch label="muted" className="bg-muted" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Text roles</h2>
        <div className="space-y-1">
          <p>foreground — primary copy</p>
          <p className="text-muted-foreground">
            muted-foreground — supporting copy
          </p>
          <p className="text-disabled-foreground">
            disabled-foreground — disabled state
          </p>
          <p className="text-link hover:text-link-hover">link — interactive</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Radius</h2>
        <div className="flex flex-wrap gap-4">
          {RADIUS_SAMPLES.map(({ label, className }) => (
            <div
              key={label}
              className={`${className} border border-border bg-card px-4 py-3 text-sm text-muted-foreground`}
            >
              {label}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Shadow</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {SHADOW_SAMPLES.map(({ label, className }) => (
            <div
              key={label}
              className={`${className} rounded-md bg-card p-4 text-sm text-muted-foreground`}
            >
              {label}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Status</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <StatusBanner
            className="border-success bg-success-subtle text-success"
            title="Success"
          />
          <StatusBanner
            className="border-warning bg-warning-subtle text-warning"
            title="Warning"
          />
          <StatusBanner
            className="border-info bg-info-subtle text-info"
            title="Information"
          />
          <StatusBanner
            className="border-destructive bg-destructive-subtle text-destructive"
            title="Destructive"
          />
        </div>
      </section>
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
      className={`${className} rounded-lg border border-border p-6 shadow-sm`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-base font-medium">Aa Bb 123</div>
    </div>
  );
}

function StatusBanner({
  className,
  title,
}: {
  className: string;
  title: string;
}) {
  return (
    <div className={`${className} rounded-md border p-4`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm">Semantic state token</div>
    </div>
  );
}
