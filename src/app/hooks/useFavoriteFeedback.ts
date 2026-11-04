import { useEffect, useRef, useState } from "react";
import { feedbackDuration } from "./useAddFeedback";

export function useFavoriteFeedback(identity: string) {
  const [, render] = useState(0);
  const entries = useRef(new Map<number, { pending: boolean; until: number; timer?: ReturnType<typeof setTimeout> }>());
  useEffect(() => () => {
    for (const entry of entries.current.values()) clearTimeout(entry.timer);
    entries.current.clear();
  }, [identity]);
  function state(id: number): "idle" | "pending" | "cooldown" {
    const entry = entries.current.get(id);
    return entry?.pending ? "pending" : entry && entry.until > performance.now() ? "cooldown" : "idle";
  }
  const blocked = (id: number) => state(id) !== "idle";
  async function run(id: number, action: () => Promise<boolean>) {
    if (blocked(id)) return false;
    const entry = { pending: true, until: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    entries.current.set(id, entry);
    render(value => value + 1);
    let success = false;
    try { success = await action(); return success; }
    finally {
      if (entries.current.get(id) === entry) {
        if (success) {
          entry.pending = false;
          entry.until = performance.now() + feedbackDuration;
          entry.timer = setTimeout(() => {
            if (entries.current.get(id) === entry) {
              entries.current.delete(id);
              render(value => value + 1);
            }
          }, feedbackDuration);
        } else entries.current.delete(id);
        render(value => value + 1);
      }
    }
  }
  return { blocked, state, run };
}
