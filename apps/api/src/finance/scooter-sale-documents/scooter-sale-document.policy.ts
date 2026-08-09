export function scooterSaleDocumentUploadScope(input: {
  scooterSaleId: string;
  uploadedByUserId: string;
}): string {
  return [
    "scooter-sale-document",
    input.scooterSaleId,
    input.uploadedByUserId,
  ].join(":");
}
