# Rental inspection photographs

Rental photographs use the existing private `MediaAsset` and `ScooterPhoto` storage. They are separate from the editable public scooter gallery: handover files have `RENTAL_BEFORE`, return files have `RENTAL_AFTER`, and every upload has `isPublic=false`. There is no ordinary edit or delete operation for these evidence files.

Authenticated operator endpoints:

| Method | Path                                                   | Result / permission                                                                                                         |
| ------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/rentals/:id/media?eventType=handover` or `return` | `{items:[{id,fileName,contentType,createdAt}]}`; `rentals.read` with ALL scope                                              |
| POST   | `/v1/rentals/:id/media`                                | Multipart `file` plus `eventType`; one metadata row; handover requires `rentals.handover`, return requires `rentals.return` |
| GET    | `/v1/rentals/:id/media/:mediaId/content`               | Exact private raster bytes; `rentals.read` with ALL scope                                                                   |

Handover uploads require a reserved rental, return uploads require an active rental. Both authorization and phase are checked again after storage, inside the metadata transaction while holding the scooter/rental locks. The server accepts actual PNG/JPEG input up to 8 MiB, checks dimensions before decoding, strips metadata by re-encoding to PNG and enforces the output size. Each event has a 100-file limit. Browser MIME, filename extension and filesystem paths are not trusted. Original client filenames are reduced to a safe display name and are never object-storage keys.

The list and content routes scope every media ID to the rental, scooter and evidence-photo types. The content route verifies byte length and SHA-256 before returning bytes, audits access and sends private/no-store headers. Uploaded files are not public URLs. Selecting a photograph in the inspection UI stores its internal ID; the server verifies it belongs to the correct rental and event before confirming the inspection. Uploading a file alone does not confirm that an inspection was performed.

A failed metadata transaction can have an uncertain outcome. Cleanup removes a fresh uploaded object only after the database confirms it has no MediaAsset reference. A failed reference check preserves the bytes for controlled reconciliation.

## Contractual references

A newly built package pins `rentalMedia` entries containing photo ID, event, asset ID, SHA-256, MIME and filename. The selected handover photos must still be available. It also pins explicitly customer-visible vehicle `vehicleDocuments` copies with document ID, type, asset ID, SHA-256, MIME and filename. Downloads, delivery and evidence export use these fixed references rather than the current scooter catalog.

Ordinary vehicle-document removal is rejected when a retained package references the document. Renewals are added as new documents. Existing media foreign keys and the separation from gallery edits preserve media rows/assets; historical evidence is not overwritten. Legal retention/hold expiry remains a separate privileged and audited procedure.

## Verification

The media service has focused tests for scope and phase checks, sanitized uploads, IDOR, limits, file integrity and uncertain cleanup. Real PostgreSQL integration verifies private metadata creation, event separation, cross-rental refusal and restrictive references to pinned client copies. The test storage adapter is explicit; these checks do not claim an S3 round trip or real-device camera testing.
