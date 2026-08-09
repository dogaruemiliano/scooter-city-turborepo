/**
 * Scooter-brands-domain shared constants and route helpers.
 */

export const ROUTES = {
  list: "/v1/scooter-brands",
  create: "/v1/scooter-brands",
  update: (id: string): string => `/v1/scooter-brands/${id}`,
  delete: (id: string): string => `/v1/scooter-brands/${id}`,
} as const;
