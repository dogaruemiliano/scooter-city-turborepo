"use client";

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent } from "./card";
import { SearchField } from "./search-field";
import { SheetSelect } from "./sheet-select";
import { Label } from "./label";
import { ListFilterSheet } from "./list-filter-sheet";
import {
  ListEmpty,
  ListItems,
  ListLayout,
  ListPagination,
  ListStatus,
} from "./list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = {
  title: "Collections/List",
  component: ListLayout,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof ListLayout>;
export default meta;
type Story = StoryObj<typeof meta>;

const examples = [
  {
    id: "one",
    title: "Scooter 12",
    description: "Inspect the front brake.",
    status: "open",
  },
  {
    id: "two",
    title: "Scooter 24",
    description: "Replace the rear tyre.",
    status: "in_progress",
  },
  {
    id: "three",
    title: "Scooter 36",
    description: "Check the charging connector.",
    status: "open",
  },
];

function CollectionExample({ readOnly = false }: { readOnly?: boolean }) {
  const [filter, setFilter] = useState({ status: "all" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const filtered = examples.filter(
    (item) =>
      (filter.status === "all" || item.status === filter.status) &&
      item.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="mx-auto flex max-w-(--breakpoint-lg) flex-col gap-6 p-4 md:p-8">
      <header>
        <h1 className="text-xl font-semibold">Service</h1>
        <p className="text-sm text-muted-foreground">
          Sample records for the shared list preview.
        </p>
      </header>
      <ListLayout
        filters={
          readOnly ? undefined : (
            <ListFilterSheet
              value={filter}
              defaultValue={{ status: "all" }}
              title="Filters"
              description="Choose which service records to show."
              appliedCount={filter.status === "all" ? 0 : 1}
              applyLabel="Apply filters"
              resetLabel="Reset filters"
              cancelLabel="Cancel"
              onApply={(next) => {
                setFilter(next);
                setPage(0);
              }}
            >
              {({ value, setValue }) => (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="preview-status">Status</Label>
                  <SheetSelect
                    id="preview-status"
                    label="Status"
                    value={value.status}
                    onValueChange={(status) => setValue({ status })}
                    options={[
                      { value: "all", label: "All" },
                      { value: "open", label: "Open" },
                      { value: "in_progress", label: "In progress" },
                    ]}
                  />
                </div>
              )}
            </ListFilterSheet>
          )
        }
        action={
          readOnly ? undefined : (
            <Button type="button">Create new scooter</Button>
          )
        }
        search={
          <SearchField
            label="Search scooters"
            placeholder="Search scooters"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            clearLabel="Clear search"
            onClear={() => {
              setSearch("");
              setPage(0);
            }}
          />
        }
        footer={
          <ListPagination
            canPrevious={page > 0}
            canNext={(page + 1) * 2 < filtered.length}
            onPrevious={() => setPage(page - 1)}
            onNext={() => setPage(page + 1)}
            previousLabel="Previous"
            nextLabel="Next"
            label="List pages"
          />
        }
      >
        <ListItems
          items={filtered.slice(page * 2, page * 2 + 2)}
          getItemKey={(item) => item.id}
          empty={<ListEmpty>No records match these filters.</ListEmpty>}
          renderItem={(item) => (
            <Card as="article">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium">{item.title}</h2>
                  <Badge variant="secondary">
                    {item.status === "open" ? "Open" : "In progress"}
                  </Badge>
                </div>
                <p>{item.description}</p>
                <details>
                  <summary className="cursor-pointer text-sm text-link">
                    Work details
                  </summary>
                  <p className="pt-3 text-sm text-muted-foreground">
                    Custom item content can include work controls, notes, and
                    actions.
                  </p>
                </details>
              </CardContent>
            </Card>
          )}
        />
      </ListLayout>
    </div>
  );
}

export const Default: Story = { render: () => <CollectionExample /> };
export const ReadOnly: Story = { render: () => <CollectionExample readOnly /> };
export const Empty: Story = {
  render: () => (
    <ListLayout className="p-4">
      <ListEmpty action={<Button>Clear filters</Button>}>
        No records match these filters.
      </ListEmpty>
    </ListLayout>
  ),
};
export const Loading: Story = {
  render: () => (
    <ListLayout className="p-4">
      <ListStatus
        loading
        initial
        loadingLabel="Loading records…"
        retryLabel="Retry"
      />
    </ListLayout>
  ),
};
export const RefreshError: Story = {
  render: () => (
    <ListLayout className="p-4" summary="Showing previously loaded results.">
      <ListStatus
        error="Could not update records."
        loadingLabel="Updating results…"
        retryLabel="Retry"
        onRetry={() => {}}
      />
      <ListItems
        items={examples}
        getItemKey={(item) => item.id}
        renderItem={(item) => <ListEmpty>{item.title}</ListEmpty>}
      />
    </ListLayout>
  ),
};
export const FinancialTable: Story = {
  render: () => (
    <ListLayout className="p-4" summary="Company accounts">
      <h2 className="text-base font-medium">Bank accounts</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Sample account</TableCell>
            <TableCell className="text-right">1,250.00 RON</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </ListLayout>
  ),
};
