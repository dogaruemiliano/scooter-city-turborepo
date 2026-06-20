import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "./button";
import { Divider } from "./Divider";
import { Input } from "./Input";
import { Text } from "./Text";

const meta = {
  title: "Examples/Form",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const FormShell = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto flex w-full max-w-sm flex-col gap-4">{children}</div>
);

const Field = ({
  label,
  htmlFor,
  hint,
  invalid,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  invalid?: boolean;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
      {label}
    </label>
    {children}
    {hint ? (
      <Text
        as="p"
        size="sm"
        className={invalid ? "text-destructive" : "text-muted-foreground"}
      >
        {hint}
      </Text>
    ) : null}
  </div>
);

export const EmailOtpRequest: Story = {
  render: () => (
    <FormShell>
      <Field label="Email" htmlFor="email-request">
        <Input
          id="email-request"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
        />
      </Field>
      <Button className="w-full">Send code</Button>
    </FormShell>
  ),
};

export const EmailOtpVerify: Story = {
  render: () => (
    <FormShell>
      <Field
        label="Verification code"
        htmlFor="otp-code"
        hint="Enter the 6-digit code we sent to your email."
      >
        <Input
          id="otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
        />
      </Field>
      <Button className="w-full">Verify</Button>
      <Button variant="secondary" className="w-full">
        Resend code
      </Button>
    </FormShell>
  ),
};

export const Full: Story = {
  render: () => <FullForm />,
};

const FullForm = () => {
  const [email, setEmail] = useState("");
  const invalid = email.length > 0 && !email.includes("@");

  return (
    <FormShell>
      <div className="flex flex-col gap-1">
        <Text as="h2" size="2xl" weight="semibold">
          Sign in
        </Text>
        <Text as="p" size="sm" color="secondary">
          Enter your email and we&apos;ll send you a one-time code.
        </Text>
      </div>

      <Field
        label="Email"
        htmlFor="email-full"
        invalid={invalid}
        hint={invalid ? "That doesn't look like a valid email." : undefined}
      >
        <Input
          id="email-full"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          invalid={invalid}
        />
      </Field>

      <Button className="w-full" disabled={invalid || email.length === 0}>
        Send code
      </Button>

      <Divider>or continue with</Divider>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" className="w-full">
          Continue with Google
        </Button>
        <Button variant="secondary" className="w-full">
          Continue with Apple
        </Button>
        <Button variant="secondary" className="w-full">
          Continue with GitHub
        </Button>
      </div>
    </FormShell>
  );
};
