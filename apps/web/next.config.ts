import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.20.10.3"],
  reactCompiler: true,
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
