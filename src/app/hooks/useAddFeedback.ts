import { useEffect, useRef, useState } from "react";
import type { Product } from "../lib/products";

export type AddState = "idle" | "pending" | "added";
export type GetAddState = (product: Product, size: string | null) => AddState;
export const feedbackDuration = 1000;
function selectionKey(product: Product, size: string | null) {
  const variant = product.colors.find(color => color.id === product.colorId)?.variants.find(v => v.value === size);
  return variant ? `${product.id}:${product.colorId}:${variant.id}` : null;
}

// One shared source for both the synchronous guard and button feedback.
export function useAddFeedback(identity: string) {
  const [, render] = useState(0);
  const entries = useRef(new Map<string, { state: AddState; until: number; timer?: ReturnType<typeof setTimeout> }>());
  useEffect(() => () => {
    for (const entry of entries.current.values()) clearTimeout(entry.timer);
    entries.current.clear();
  }, [identity]);
  const getState: GetAddState = (product, size) => {
    const key = selectionKey(product, size);
    const entry = key ? entries.current.get(key) : undefined;
    return entry && (entry.state === "pending" || entry.until > performance.now()) ? entry.state : "idle";
  };
  async function run(product: Product, size: string, action: () => Promise<boolean>) {
    const key = selectionKey(product, size);
    if (!key || getState(product, size) !== "idle") return false;
    const entry: { state: AddState; until: number; timer?: ReturnType<typeof setTimeout> } = { state: "pending", until: 0 };
    entries.current.set(key, entry);
    render(value => value + 1);
    let success = false;
    try { success = await action(); return success; }
    finally {
      if (entries.current.get(key) === entry) {
        if (success) {
          entry.state = "added";
          entry.until = performance.now() + feedbackDuration;
          entry.timer = setTimeout(() => {
            if (entries.current.get(key) === entry) {
              entries.current.delete(key);
              render(value => value + 1);
            }
          }, feedbackDuration);
        } else entries.current.delete(key);
        render(value => value + 1);
      }
    }
  }
  return { getState, run };
}
