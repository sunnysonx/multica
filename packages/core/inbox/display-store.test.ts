// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useInboxDisplayStore } from "./display-store";

describe("inbox display store", () => {
  beforeEach(() => {
    useInboxDisplayStore.setState({ hierarchy: false });
  });

  it("starts with hierarchy off and toggles it", () => {
    expect(useInboxDisplayStore.getState().hierarchy).toBe(false);
    useInboxDisplayStore.getState().toggleHierarchy();
    expect(useInboxDisplayStore.getState().hierarchy).toBe(true);
    useInboxDisplayStore.getState().toggleHierarchy();
    expect(useInboxDisplayStore.getState().hierarchy).toBe(false);
  });

  it("persists only the preference", () => {
    const partialize = useInboxDisplayStore.persist.getOptions().partialize!;
    expect(partialize(useInboxDisplayStore.getState())).toEqual({ hierarchy: false });
  });
});
