import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components";

import type { Feedback } from "./types";

export function FeedbackAlert({ feedback }: { feedback: Feedback }) {
  return (
    <Alert variant={feedback.kind === "error" ? "destructive" : "default"}>
      <AlertTitle>{feedback.title}</AlertTitle>
      <AlertDescription>
        {feedback.messages.map((message) => (
          <span key={message} className="block">
            {message}
          </span>
        ))}
      </AlertDescription>
    </Alert>
  );
}
