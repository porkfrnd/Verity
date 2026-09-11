import type { Investigation } from "../../shared/types.js";

const store = new Map<string, Investigation>();

export function saveInvestigation(inv: Investigation): void {
  store.set(inv.id, inv);
  if (store.size > 200) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
}

export function getInvestigation(id: string): Investigation | undefined {
  return store.get(id);
}

export function clearInvestigations(): void {
  store.clear();
}
