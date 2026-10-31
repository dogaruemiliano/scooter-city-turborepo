-- CHECK constraints must explicitly exclude NULL, because SQL UNKNOWN passes CHECK.
ALTER TABLE "Scooter" DROP CONSTRAINT "Scooter_limiter_configuration_check";
ALTER TABLE "Scooter" ADD CONSTRAINT "Scooter_limiter_configuration_check" CHECK (
  "limiterKind" = 'UNKNOWN'
  OR (
    "maxSpeedKmh" IS NOT NULL AND "maxSpeedKmh" > 0
    AND NULLIF(TRIM("maxSpeedSource"), '') IS NOT NULL
    AND NULLIF(TRIM("configurationEvidence"), '') IS NOT NULL
    AND (
      ("limiterKind" = 'LIMITED' AND "limiterKmh" IS NOT NULL AND "limiterKmh" > 0 AND "limiterKmh" <= "maxSpeedKmh")
      OR ("limiterKind" = 'NO_LIMITER' AND "limiterKmh" IS NULL)
    )
  )
);
