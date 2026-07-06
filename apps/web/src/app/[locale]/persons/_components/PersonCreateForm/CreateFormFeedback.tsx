import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components";

import type { Feedback } from "./types";

export function CreateFormFeedback({ feedback }: { feedback: Feedback }) {
  return (
    <Alert variant={feedback.kind === "error" ? "destructive" : "default"}>
      <AlertTitle>{feedback.title}</AlertTitle>
      <AlertDescription>
        {feedback.messages.length === 1 ? (
          feedback.messages[0]
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {feedback.messages.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
