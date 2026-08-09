-- Maintenance types are reference data required by the production API, not
-- development-only fixtures. Keep stable codes aligned with the idempotent
-- maintenance seed; later operator edits are intentionally left untouched.
INSERT INTO "MaintenanceType" (
  "id",
  "name",
  "code",
  "intervalKm",
  "intervalMonths",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES
  ('seed-maintenance-type-engine-oil-change', 'Engine oil change', 'ENGINE_OIL_CHANGE', 2000, 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-transmission-oil-change', 'Transmission oil change', 'TRANSMISSION_OIL_CHANGE', 6000, 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-spark-plug', 'Spark plug', 'SPARK_PLUG', 6000, 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-air-filter', 'Air filter', 'AIR_FILTER', 4000, 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-fuel-filter', 'Fuel filter', 'FUEL_FILTER', NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-cvt-belt', 'CVT belt', 'CVT_BELT', 10000, 24, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-variator-rollers', 'Variator rollers', 'VARIATOR_ROLLERS', 8000, 24, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-variator', 'Variator', 'VARIATOR', NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-clutch', 'Clutch', 'CLUTCH', NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-front-brake-pads', 'Front brake pads', 'FRONT_BRAKE_PADS', NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-rear-brake-pads', 'Rear brake pads', 'REAR_BRAKE_PADS', NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-brake-fluid', 'Brake fluid', 'BRAKE_FLUID', NULL, 24, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-battery', 'Battery', 'BATTERY', NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-front-tyre', 'Front tyre', 'FRONT_TYRE', NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-maintenance-type-rear-tyre', 'Rear tyre', 'REAR_TYRE', NULL, NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
