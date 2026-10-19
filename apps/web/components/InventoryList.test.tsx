import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { InventoryList, makeItems, renderCounter } from "./InventoryList";

const ITEMS = 500;
const items = makeItems(ITEMS);

afterEach(cleanup);

async function rowRendersForOneEquip(optimized: boolean) {
  render(<InventoryList items={items} optimized={optimized} />);
  expect(renderCounter.rows).toBe(ITEMS); // initial mount renders every row once
  renderCounter.rows = 0;
  await userEvent.click(screen.getAllByText("Equip")[0]);
  return renderCounter.rows;
}

describe("InventoryList re-renders", () => {
  it("naive mode re-renders every row when one item is equipped", async () => {
    renderCounter.rows = 0;
    expect(await rowRendersForOneEquip(false)).toBe(ITEMS);
  });

  it("optimized mode re-renders only the changed row", async () => {
    renderCounter.rows = 0;
    expect(await rowRendersForOneEquip(true)).toBe(1);
  });
});
