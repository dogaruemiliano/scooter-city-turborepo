import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge } from "@repo/ui/components/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

const meta = {
  title: "Shadcn/Table",
  component: Table,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const invoices = [
  { id: "INV-1001", patient: "Amelia Ross", status: "Paid", amount: "$240.00" },
  { id: "INV-1002", patient: "Daniel Kim", status: "Open", amount: "$180.00" },
  { id: "INV-1003", patient: "Mira Singh", status: "Draft", amount: "$320.00" },
];

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Recent billing activity</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="font-medium">{invoice.id}</TableCell>
            <TableCell>{invoice.patient}</TableCell>
            <TableCell>
              <Badge
                variant={invoice.status === "Paid" ? "secondary" : "outline"}
              >
                {invoice.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right">{invoice.amount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Service</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Consultation</TableCell>
          <TableCell className="text-right">$120.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Imaging review</TableCell>
          <TableCell className="text-right">$80.00</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right">$200.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
