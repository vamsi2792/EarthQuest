"use client";

import { useMemo, useState } from "react";
import { InventoryList, makeItems } from "../../components/InventoryList";

export default function Inventory() {
  const [optimized, setOptimized] = useState(true);
  const items = useMemo(() => makeItems(3000), []);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <h1>Inventory (3000 items)</h1>
      <label>
        <input type="checkbox" checked={optimized} onChange={(e) => setOptimized(e.target.checked)} /> Optimized
        (memoized rows)
      </label>
      <InventoryList items={items} optimized={optimized} />
    </main>
  );
}
