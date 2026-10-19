"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { Item } from "@earthquest/types";

/** Counts row renders so the cost of re-rendering is visible in tests and the UI. */
export const renderCounter = { rows: 0 };

/** Order of sprites in items.v1.svg. */
const KIND_ORDER = ["weapon", "armor", "consumable", "quest"];

interface RowProps {
  item: Item;
  equipped: boolean;
  onToggle: (id: string) => void;
}

function RowView({ item, equipped, onToggle }: RowProps) {
  renderCounter.rows++;
  return (
    <li style={{ display: "flex", gap: 8, padding: "2px 0", alignItems: "center" }}>
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          backgroundImage: "url(/sprites/items.v1.svg)",
          backgroundPosition: `-${KIND_ORDER.indexOf(item.kind) * 32}px 0`,
        }}
      />
      <span style={{ flex: 1 }}>
        {item.name} <small style={{ opacity: 0.6 }}>×{item.quantity}</small>
      </span>
      <button onClick={() => onToggle(item.id)}>{equipped ? "Unequip" : "Equip"}</button>
    </li>
  );
}

const MemoRow = memo(RowView);

export function makeItems(count: number): Item[] {
  const kinds = ["weapon", "armor", "consumable", "quest"] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    name: `Item ${i}`,
    kind: kinds[i % kinds.length],
    quantity: (i % 9) + 1,
  }));
}

export function InventoryList({ items, optimized }: { items: Item[]; optimized: boolean }) {
  const [equipped, setEquipped] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const visible = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase())),
    [items, filter],
  );

  // Stable identity (functional update, no captured state) lets memoized rows skip re-rendering.
  const toggleStable = useCallback((id: string) => {
    setEquipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const Row = optimized ? MemoRow : RowView;

  return (
    <div>
      <input
        aria-label="filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter items"
      />
      <ul style={{ listStyle: "none", padding: 0, maxHeight: 420, overflow: "auto" }}>
        {visible.map((item) => (
          <Row
            key={item.id}
            item={item}
            equipped={equipped.has(item.id)}
            // Naive mode creates a new function per row per render, which defeats any memoization.
            onToggle={optimized ? toggleStable : (id) => toggleStable(id)}
          />
        ))}
      </ul>
    </div>
  );
}
