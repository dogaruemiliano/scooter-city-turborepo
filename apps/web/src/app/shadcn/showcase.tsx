"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Progress,
  ProgressLabel,
  ProgressValue,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components";

export function ShadcnShowcase() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-2">
      <ShowcaseSection
        title="Buttons and badges"
        description="Primary interaction variants, sizes, and semantic labels."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        title="Card and avatar"
        description="Composable surfaces and identity primitives."
      >
        <Card>
          <CardHeader>
            <CardTitle>Workspace summary</CardTitle>
            <CardDescription>
              Shared primitives from the cross-platform token contract.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">Stable</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <AvatarGroup>
              <Avatar>
                <AvatarFallback>ED</AvatarFallback>
                <AvatarBadge />
              </Avatar>
              <Avatar>
                <AvatarFallback>UI</AvatarFallback>
              </Avatar>
              <AvatarGroupCount>+3</AvatarGroupCount>
            </AvatarGroup>
            <span className="text-sm text-muted-foreground">
              5 contributors
            </span>
          </CardContent>
          <CardFooter className="text-sm text-muted-foreground">
            Updated from the Mist preset.
          </CardFooter>
        </Card>
      </ShowcaseSection>

      <ShowcaseSection
        title="Form controls"
        description="Inputs share focus, invalid, disabled, and placeholder roles."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="showcase-name">Name</Label>
            <Input id="showcase-name" placeholder="Ada Lovelace" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="showcase-role">Role</Label>
            <Select defaultValue="engineer">
              <SelectTrigger id="showcase-role" className="w-full">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="engineer">Engineer</SelectItem>
                <SelectItem value="designer">Designer</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="showcase-message">Message</Label>
          <Textarea id="showcase-message" placeholder="Write a short note…" />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Label className="flex items-center gap-2">
            <Checkbox defaultChecked />
            Email updates
          </Label>
          <Label className="flex items-center gap-2">
            <Switch defaultChecked />
            Automatic theme
          </Label>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        title="Feedback"
        description="Alerts, progress, loading states, and separators."
      >
        <Alert>
          <AlertTitle>Theme generated</AlertTitle>
          <AlertDescription>
            Web uses OKLCH and native receives gamut-mapped sRGB.
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>Destructive state</AlertTitle>
          <AlertDescription>
            The semantic foreground and subtle surface remain paired.
          </AlertDescription>
        </Alert>
        <Progress value={68}>
          <ProgressLabel>Migration progress</ProgressLabel>
          <ProgressValue />
        </Progress>
        <Separator />
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        title="Disclosure and tabs"
        description="Structured content with keyboard-accessible navigation."
      >
        <Tabs defaultValue="tokens">
          <TabsList>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="platforms">Platforms</TabsTrigger>
          </TabsList>
          <TabsContent value="tokens" className="rounded-lg border p-4">
            Flat semantic color roles with structured non-color scales.
          </TabsContent>
          <TabsContent value="platforms" className="rounded-lg border p-4">
            Exact OKLCH on web and generated sRGB on React Native.
          </TabsContent>
        </Tabs>
        <Accordion>
          <AccordionItem value="preset">
            <AccordionTrigger>Which preset is active?</AccordionTrigger>
            <AccordionContent>
              Nova with the Mist palette, small radius, Lucide, and Manrope.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="native">
            <AccordionTrigger>
              How are native colors generated?
            </AccordionTrigger>
            <AccordionContent>
              Culori gamut-maps every authored OKLCH value to sRGB at build
              time.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ShowcaseSection>

      <ShowcaseSection
        title="Menus and overlays"
        description="Portal-based primitives share elevation and scrim tokens."
      >
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Open menu
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Workspace</DropdownMenuLabel>
                <DropdownMenuItem>
                  Settings
                  <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem checked>
                  Notifications
                </DropdownMenuCheckboxItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                Delete workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              Open popover
            </PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>Preset details</PopoverTitle>
                <PopoverDescription>
                  The selected preset is applied through shared tokens.
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>

          <Dialog>
            <DialogTrigger render={<Button />}>Open dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Publish theme changes?</DialogTitle>
                <DialogDescription>
                  This demonstrates the shared overlay, popover, border, and
                  focus roles.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
                <DialogClose render={<Button />}>Publish</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" />}>
              Hover for tooltip
            </TooltipTrigger>
            <TooltipContent>Shared tooltip elevation</TooltipContent>
          </Tooltip>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        title="Data table"
        description="A responsive table using the same border and muted roles."
        className="lg:col-span-2"
      >
        <Table>
          <TableCaption>Common package exports</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Primitive</TableHead>
              <TableHead>Foundation</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Dialog</TableCell>
              <TableCell>Base UI</TableCell>
              <TableCell>
                <Badge variant="secondary">Ready</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Select</TableCell>
              <TableCell>Base UI</TableCell>
              <TableCell>
                <Badge variant="secondary">Ready</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Theme</TableCell>
              <TableCell>OKLCH → sRGB</TableCell>
              <TableCell>
                <Badge>Generated</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </ShowcaseSection>
    </div>
  );
}

function ShowcaseSection({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm ${className ?? ""}`}
    >
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
