/** Human-facing identity; the database ID remains the route/relation key. */
export function scooterDisplayCode(scooter: {
  fleetNumber: number;
  brandCode: string;
}): string {
  return `${String(scooter.fleetNumber).padStart(3, "0")} ${scooter.brandCode}`;
}
