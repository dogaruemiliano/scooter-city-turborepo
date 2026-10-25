"use client";

import { createContext } from "react";

/** Invalidates automatic number suggestions after a scooter is actually created. */
export const ScooterFleetNumberRefreshContext = createContext(0);
