"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  DragDropProvider,
  DragOverlay,
  useDroppable,
  type DragDropEventHandlers,
} from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  PointerSensor,
  PointerActivationConstraints,
  Accessibility,
} from "@dnd-kit/dom";
import { RestrictToElement } from "@dnd-kit/dom/modifiers";
import { OptimisticSortingPlugin } from "@dnd-kit/dom/sortable";
import { Trash2Icon } from "lucide-react";
import { motion, spacing, opacity } from "@repo/theme";
import { cn } from "../lib/utils";
import { insertSortableItem, sameSortableOrder } from "../lib/sortable-order";

/** A controlled grid; trailing content is never draggable or a reorder target. */
export function SortableGrid<Item extends { id: string }>({
  items,
  renderItem,
  getItemLabel,
  instructions,
  disabled = false,
  onOrderChange,
  onInteractionChange,
  onItemPress,
  removal,
  className,
  axis = "both",
  longPress = false,
  children,
}: {
  items: readonly Item[];
  renderItem: (item: Item) => ReactNode;
  getItemLabel: (item: Item) => string;
  instructions: string;
  disabled?: boolean;
  onOrderChange: (ids: string[]) => Promise<boolean>;
  onInteractionChange?: (busy: boolean) => void;
  onItemPress?: (item: Item) => void;
  removal?: {
    label: string;
    activeLabel: string;
    onRemove: (item: Item) => Promise<boolean>;
  };
  className?: string;
  axis?: "both" | "vertical";
  longPress?: boolean;
  children?: ReactNode;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const deleteArea = useRef<HTMLDivElement>(null);
  const deleteId = useId();
  const overDelete = useRef(false);
  const [deleteHovered, setDeleteHovered] = useState(false);
  function markDelete(hovered: boolean) {
    overDelete.current = hovered;
    setDeleteHovered(hovered);
  }
  function isOverDelete(x: number, y: number) {
    const area = deleteArea.current;
    const rect = area?.getBoundingClientRect();
    const reveal = area
      ?.closest<HTMLElement>('[data-slot="sortable-delete-reveal"]')
      ?.getBoundingClientRect();
    return Boolean(
      rect &&
      reveal &&
      x >= Math.max(rect.left, reveal.left) &&
      x <= Math.min(rect.right, reveal.right) &&
      y >= Math.max(rect.top, reveal.top) &&
      y <= Math.min(rect.bottom, reveal.bottom),
    );
  }
  const suppressClick = useRef(false);
  const instructionId = useId();
  const group = useId();
  const [preview, setPreview] = useState<string[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const order = useRef<string[]>([]);
  const initial = useRef<string[]>([]);
  const inside = useRef(true);
  const interactionBusy = active !== null || saving;
  useEffect(() => {
    onInteractionChange?.(interactionBusy);
    return () => onInteractionChange?.(false);
  }, [interactionBusy, onInteractionChange]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  function project(ids: string[]) {
    if (sameSortableOrder(order.current, ids)) return;
    order.current = ids;
    setPreview(ids);
  }

  const handleMove: DragDropEventHandlers["onDragMove"] = (event, manager) => {
    const source = event.operation.source;
    if (!source || !grid.current) return;
    const cards = Array.from(
      grid.current.querySelectorAll<HTMLElement>("[data-sortable-id]"),
    );
    const bounds = grid.current.getBoundingClientRect();
    // Ignore the temporary translation while cards animate into new grid slots.
    const layoutRect = (card: HTMLElement) =>
      card.offsetWidth
        ? {
            left: bounds.left + card.offsetLeft,
            top: bounds.top + card.offsetTop,
            right: bounds.left + card.offsetLeft + card.offsetWidth,
            bottom: bounds.top + card.offsetTop + card.offsetHeight,
            width: card.offsetWidth,
            height: card.offsetHeight,
          }
        : card.getBoundingClientRect();
    if (event.operation.activatorEvent instanceof KeyboardEvent) {
      // Own keyboard insertion too: collision updates during React's reflow
      // must not repeatedly move the source after a single arrow key.
      event.preventDefault();
      const nativeEvent = event.nativeEvent;
      if (!(nativeEvent instanceof KeyboardEvent)) return;
      const firstTop = cards[0] ? layoutRect(cards[0]).top : undefined;
      const columns =
        cards.filter((card) => layoutRect(card).top === firstTop).length || 1;
      const from = order.current.indexOf(String(source.id));
      if (
        axis === "vertical" &&
        ["ArrowLeft", "ArrowRight"].includes(nativeEvent.code)
      )
        return;
      const delta = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -columns,
        ArrowDown: columns,
      }[nativeEvent.code];
      if (delta === undefined) return;
      const to = from + delta;
      if (
        removal &&
        deleteArea.current &&
        nativeEvent.code === "ArrowDown" &&
        to >= cards.length
      ) {
        markDelete(true);
        const rect = deleteArea.current.getBoundingClientRect();
        void manager.actions.setDropTarget(deleteId);
        void manager.actions.move({
          to: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          propagate: false,
        });
        return;
      }
      if (overDelete.current) {
        if (nativeEvent.code !== "ArrowUp") return;
        markDelete(false);
        const target = cards[from];
        if (!target) return;
        const rect = layoutRect(target);
        void manager.actions.setDropTarget(source.id);
        void manager.actions.move({
          to: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          propagate: false,
        });
        return;
      }
      const target = cards[to];
      if (!target) return;
      const rect = layoutRect(target);
      project(
        insertSortableItem(
          order.current,
          String(source.id),
          target.dataset.sortableId!,
          delta < 0 ? "before" : "after",
        ),
      );
      void manager.actions.setDropTarget(source.id);
      void manager.actions.move({
        to: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        propagate: false,
      });
      return;
    }
    const rawPoint = event.to ?? event.operation.position.current;
    const point =
      axis === "vertical"
        ? { x: bounds.left + bounds.width / 2, y: rawPoint.y }
        : rawPoint;
    const removeHit = Boolean(removal && isOverDelete(point.x, point.y));
    markDelete(removeHit);
    if (removeHit) {
      inside.current = false;
      void manager.actions.setDropTarget(deleteId);
      return;
    }
    inside.current =
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom;
    if (!inside.current) return;
    for (const card of cards) {
      const rect = layoutRect(card);
      if (
        point.x < rect.left ||
        point.x > rect.right ||
        point.y < rect.top ||
        point.y > rect.bottom
      )
        continue;
      project(
        insertSortableItem(
          order.current,
          String(source.id),
          card.dataset.sortableId!,
          (
            axis === "vertical"
              ? point.y >= rect.top + rect.height / 2
              : point.x >=
                rect.right - rect.width * motion.gesture.sortableTrailingZone
          )
            ? "after"
            : "before",
        ),
      );
      break;
    }
  };

  const byId = new Map(items.map((item) => [item.id, item]));
  const displayed = preview
    ? preview.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    : items;
  return (
    <DragDropProvider
      modifiers={
        axis === "vertical"
          ? [RestrictToElement.configure({ element: () => grid.current })]
          : undefined
      }
      plugins={(defaults) => [
        ...defaults.filter((plugin) => plugin !== Accessibility),
        Accessibility.configure({
          screenReaderInstructions: { draggable: instructions },
        }),
      ]}
      sensors={(defaults) => [
        ...defaults.filter((sensor) => sensor !== PointerSensor),
        PointerSensor.configure({
          activationConstraints: (event) =>
            longPress || event.pointerType === "touch"
              ? [
                  new PointerActivationConstraints.Delay({
                    value: motion.duration.normal,
                    tolerance: spacing[2],
                  }),
                ]
              : [
                  new PointerActivationConstraints.Distance({
                    value: spacing[2],
                  }),
                ],
        }),
      ]}
      onBeforeDragStart={(event) => {
        if (disabled || saving) event.preventDefault();
      }}
      onDragStart={(event) => {
        suppressClick.current = true;
        initial.current = items.map((item) => item.id);
        order.current = initial.current;
        inside.current = true;
        markDelete(false);
        setPreview(initial.current);
        setActive(String(event.operation.source!.id));
      }}
      onDragMove={handleMove}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={async (event) => {
        const removeHit = Boolean(
          removal &&
          !disabled &&
          !event.canceled &&
          (event.nativeEvent instanceof PointerEvent
            ? isOverDelete(event.nativeEvent.clientX, event.nativeEvent.clientY)
            : overDelete.current && event.operation.target?.id === deleteId),
        );
        setActive(null);
        markDelete(false);
        if (removeHit && removal) {
          const item = items.find(
            (item) => item.id === String(event.operation.source?.id),
          );
          setPreview(null);
          if (!item) return;
          setSaving(true);
          try {
            await removal.onRemove(item);
          } finally {
            setSaving(false);
          }
          return;
        }
        // A pointer-up can arrive before the last throttled pointer-move.
        if (event.nativeEvent instanceof PointerEvent && grid.current) {
          const bounds = grid.current.getBoundingClientRect();
          const { clientX, clientY } = event.nativeEvent;
          inside.current =
            (axis === "vertical" ||
              (clientX >= bounds.left && clientX <= bounds.right)) &&
            clientY >= bounds.top &&
            clientY <= bounds.bottom;
        }
        if (
          event.canceled ||
          !inside.current ||
          !event.operation.target ||
          sameSortableOrder(initial.current, order.current)
        ) {
          setPreview(null);
          return;
        }
        setSaving(true);
        try {
          await onOrderChange([...order.current]);
        } finally {
          setPreview(null);
          setSaving(false);
        }
      }}
    >
      <span id={instructionId} className="sr-only">
        {instructions}
      </span>
      <div
        ref={grid}
        className={cn("relative", className)}
        onKeyDownCapture={(event) => {
          if (event.key !== "Enter" || interactionBusy || !onItemPress) return;
          const target = event.target as HTMLElement;
          const card = target.closest<HTMLElement>("[data-sortable-id]");
          if (!card || target !== card) return;
          const item = byId.get(card.dataset.sortableId!);
          if (!item) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
          onItemPress(item);
        }}
        onPointerDownCapture={() => {
          suppressClick.current = false;
        }}
      >
        {displayed.map((item, index) => (
          <SortableGridItem
            key={item.id}
            id={item.id}
            index={index}
            group={group}
            disabled={disabled || saving}
            label={getItemLabel(item)}
            instructions={instructionId}
            onPress={
              onItemPress
                ? () => {
                    if (!suppressClick.current && !saving) onItemPress(item);
                  }
                : undefined
            }
            reducedMotion={reducedMotion}
          >
            {renderItem(item)}
          </SortableGridItem>
        ))}
        {children}
      </div>
      {removal ? (
        <DeleteDropArea
          id={deleteId}
          open={Boolean(active) && !disabled}
          areaRef={deleteArea}
          hovered={deleteHovered}
          label={removal.label}
          activeLabel={removal.activeLabel}
        />
      ) : null}
      <DragOverlay
        dropAnimation={
          reducedMotion
            ? null
            : {
                duration: motion.duration.normal,
                easing: motion.easing.standard,
              }
        }
        className="pointer-events-none z-overlay transition-opacity duration-fast ease-standard motion-reduce:transition-none"
        style={{ opacity: deleteHovered ? opacity.dragGhost : undefined }}
      >
        {(source) => {
          const item = byId.get(String(source.id));
          return item ? (
            <div
              aria-hidden="true"
              className={cn(
                "h-full cursor-grabbing overflow-hidden rounded-xl border-2 bg-control shadow-lg",
                deleteHovered ? "border-destructive" : "border-primary",
              )}
            >
              {renderItem(item)}
            </div>
          ) : null;
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}

function SortableGridItem({
  id,
  index,
  group,
  disabled,
  label,
  instructions,
  reducedMotion,
  children,
  onPress,
}: {
  id: string;
  onPress?: () => void;
  index: number;
  group: string;
  disabled: boolean;
  label: string;
  instructions: string;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const { ref, isDragSource } = useSortable({
    id,
    index,
    group,
    disabled,
    plugins: (defaults) =>
      defaults.filter((plugin) => plugin !== OptimisticSortingPlugin),
    transition: reducedMotion
      ? null
      : {
          duration: motion.duration.normal,
          easing: motion.easing.standard,
          idle: true,
        },
  });
  return (
    <div
      ref={ref}
      data-sortable-id={id}
      role="button"
      tabIndex={disabled && !onPress ? -1 : 0}
      onClick={(event) => {
        if (
          !(event.target as HTMLElement).closest(
            "button, a, input, select, textarea",
          )
        )
          onPress?.();
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          event.target === event.currentTarget &&
          onPress
        ) {
          event.preventDefault();
          onPress();
        }
      }}
      aria-label={label}
      aria-describedby={instructions}
      aria-disabled={disabled && !onPress}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-xl border border-border bg-control outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !disabled && "cursor-grab active:cursor-grabbing",
        isDragSource &&
          "rounded-dashed-surface border-(length:--dashed-surface-border-width) border-dashed border-primary",
      )}
    >
      <div
        className={isDragSource ? "pointer-events-none" : undefined}
        style={{ opacity: isDragSource ? opacity.dragGhost : undefined }}
      >
        {children}
      </div>
    </div>
  );
}

/** A temporary target distinct from reorder slots and native file uploads. */
function DeleteDropArea({
  id,
  open,
  areaRef,
  hovered,
  label,
  activeLabel,
}: {
  id: string;
  open: boolean;
  areaRef: React.RefObject<HTMLDivElement | null>;
  hovered: boolean;
  label: string;
  activeLabel: string;
}) {
  const { ref } = useDroppable({ id, disabled: !open });
  return (
    <div
      data-slot="sortable-delete-collapse"
      data-open={open || undefined}
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-normal ease-decelerate motion-reduce:transition-none",
        open
          ? "grid-rows-[1fr] opacity-100"
          : "pointer-events-none grid-rows-[0fr] opacity-0",
      )}
    >
      <div
        data-slot="sortable-delete-reveal"
        className="min-h-0 overflow-hidden"
      >
        <div className="pt-4">
          <div
            ref={(node) => {
              areaRef.current = node;
              ref(node);
            }}
            data-slot="sortable-delete-area"
            data-hovered={hovered || undefined}
            className={cn(
              "flex min-h-20 w-full items-center justify-center gap-3 rounded-dashed-surface border-(length:--dashed-surface-border-width) border-dashed border-destructive bg-destructive-subtle p-4 text-center text-sm font-semibold text-destructive transition-colors duration-fast ease-standard",
              hovered &&
                "border-solid bg-destructive text-destructive-foreground",
            )}
          >
            <Trash2Icon aria-hidden="true" className="size-6 shrink-0" />
            <span role="status" aria-live="polite">
              {hovered ? activeLabel : label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
