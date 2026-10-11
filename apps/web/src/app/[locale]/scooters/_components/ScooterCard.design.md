# Scooter card

## Overview

The card supports fleet operators scanning scooter identity and recorded operational information. It extends the existing visual system; all styling and motion values come from `@repo/theme` and the shared UI components.

## Colors

Use the card surface and border for the container. Rental state and technical health have separate labels, icons, and semantic colors. Unknown values use muted styling; color never replaces the written state. Insurance and instrument warnings remain separate from technical health.

## Typography

The scooter display code is the strongest text. The registration plate always sits beneath the code, followed by brand and model on the next line, at every screen size. Supporting attributes and footer metadata use smaller text. Allow long identities, names, and translated labels to wrap.

## Layout

The list uses one column, expanding to two at the theme's `xl` breakpoint. Cards fill their grid cells, with the footer anchored below the main content. The loading skeleton follows the same grid and card structure.

A modest photo sits beside the identity and uses contain fitting to preserve the whole scooter. Rental and health information occupy two labeled columns. Footer content wraps when space is limited.

## Elevation & Depth

Borders and separators establish hierarchy. Hover strengthens the card border; keyboard focus displays the shared focus ring around the details link.

## Components

- The footer shows the renter or a localized “not recorded” value. Next payment appears only for an explicitly rented scooter, with a fallback when its date is absent or invalid.
- Recorded mileage appears in the footer; missing mileage is omitted, while zero remains valid.
- Active records expose a full-card details link and a separate quick-actions menu for details and editing. Deleted records show their record status and omit these controls.
- Missing photos and failed images have distinct localized placeholders. Missing registration distinguishes an unregistered scooter from an absent plate.
- `ScooterCardDetails` accepts optional photo, rental, health, renter, and next-payment presentation data. `ScooterList` currently passes only the list API item, so these details remain unknown or unrecorded in the live list.

## Do's and Don'ts

- Do preserve the distinction between rental state, technical health, and individual recorded warnings.
- Do source future presentation details from explicit data contracts; the component does not provide photo upload or persistence.
- Don't infer availability or roadworthiness from missing data, insurance, instrument flags, or deleted status.
- Don't substitute stock imagery or invented renter, payment, or status information for null values.
