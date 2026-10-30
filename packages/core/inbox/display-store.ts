"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createWorkspaceAwareStorage, registerForWorkspaceRehydration } from "../platform/workspace-storage";
import { defaultStorage } from "../platform/storage";

/**
 * How the inbox list is laid out, as opposed to which rows it shows. Kept out
 * of the filter store so it is remembered across sessions and survives
 * "Clear filters".
 */
interface InboxDisplayState {
  hierarchy: boolean;
  toggleHierarchy: () => void;
}

export const useInboxDisplayStore = create<InboxDisplayState>()(
  persist(
    (set) => ({
      hierarchy: false,
      toggleHierarchy: () => set((state) => ({ hierarchy: !state.hierarchy })),
    }),
    {
      name: "multica_inbox_display",
      storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
      partialize: (state) => ({ hierarchy: state.hierarchy }),
    },
  ),
);

registerForWorkspaceRehydration(() => useInboxDisplayStore.persist.rehydrate());
