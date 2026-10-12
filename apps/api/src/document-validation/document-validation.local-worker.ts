import { handler } from "./document-validation.lambda";
import { DOCUMENT_VALIDATION_MAX_RUNTIME_MS } from "./document-validation.types";

// This entry point is executed only by LocalDocumentValidationClient, never imported by Nest.
if (process.env.NODE_ENV === "production" || !process.send) process.exit(1);
const deadline = Date.now() + DOCUMENT_VALIDATION_MAX_RUNTIME_MS;
const timer = setTimeout(
  () => process.exit(1),
  DOCUMENT_VALIDATION_MAX_RUNTIME_MS,
);
process.once("disconnect", () => process.exit(1));
process.once("message", (input: unknown) => {
  void handler(input, { getRemainingTimeInMillis: () => deadline - Date.now() })
    .then((result) => {
      process.send!(result, () => {
        clearTimeout(timer);
        process.exit(0);
      });
    })
    .catch(() => process.exit(1));
});
