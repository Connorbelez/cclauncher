import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import { useKeyboard } from "@opentui/react";

interface FocusContextType {
  focusedId: string | undefined;
  register: (id: string) => void;
  unregister: (id: string) => void;
  focusId: (id: string) => void;
  editMode: boolean;
  setEditMode: (editMode: boolean) => void;
  setFocusedId: (id: string) => void;
  isModalOpen: boolean;
  setModalOpen: (isOpen: boolean) => void;
  setExitGuard: (
    id: string,
    guard: (key: {
      name: string;
      shift?: boolean;
      ctrl?: boolean;
      meta?: boolean;
    }) => boolean
  ) => void;
  clearExitGuard: (id: string) => void;
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

/**
 * Supplies focus management, keyboard navigation, edit-mode and modal state, and per-item exit guards to descendant components via FocusContext.
 *
 * The provider tracks a registry of focusable IDs, manages the currently focused ID and edit mode, allows components to register/unregister themselves, and exposes APIs to set/clear exit guards that can intercept keyboard-driven focus changes.
 *
 * @param children - React nodes that will receive the focus context
 * @param order - Initial focus order; the first item (if any) is used as the initial focused ID
 * @returns A React element rendering the FocusContext provider wired with focus management state and APIs
 */
export function FocusProvider({
  children,
  order,
}: {
  children: React.ReactNode;
  order: string[];
}) {
  const [registry, setRegistry] = useState<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | undefined>(
    order[0] || undefined
  );
  const [editMode, setEditMode] = useState(false);
  const [isModalOpen, setModalOpen] = useState(false);
  const exitGuards = useMemo(
    () =>
      new Map<
        string,
        (key: {
          name: string;
          shift?: boolean;
          ctrl?: boolean;
          meta?: boolean;
        }) => boolean
      >(),
    []
  );

  const register = useCallback((id: string) => {
    setRegistry((prev) => [...prev, id]); // Add to the focusable list
    setFocusedId((curr) => curr ?? id); // Focus the first thing that registers
  }, []);

  const unregister = useCallback(
    (id: string) => {
      setRegistry((prev) => prev.filter((item) => item !== id)); // Remove from list
      exitGuards.delete(id);
      setFocusedId((curr) => (curr === id ? undefined : curr));
    },
    [exitGuards]
  );
  // Global Tab navigation handler
  useKeyboard((key) => {
    const guard = focusedId ? exitGuards.get(focusedId) : undefined;
    if (guard && guard(key)) {
      return;
    }
    if (isModalOpen) {
      return;
    }
    if (key.name === "tab") {
      const index = registry.indexOf(focusedId || "");
      const nextIndex = key.shift
        ? (index - 1 + registry.length) % registry.length
        : (index + 1) % registry.length;
      setEditMode(!editMode);
      setFocusedId(registry[nextIndex]);
    }

    if (key.name === "e" && focusedId === "model_selection") {
      console.log("Entering edit mode");
      setFocusedId("model_details");
      setEditMode(!editMode);
    }

    if (key.name === "escape" && editMode) {
      console.log("Exiting edit mode");
      setEditMode(false);
      setFocusedId("model_selection");
    }

    if (focusedId === "model_selection" && key.name === "n") {
      console.log("Creating new model");
      setFocusedId("new_model");
    }

    if (key.name === "right" && focusedId === "model_selection") {
      setFocusedId("model_details");
    }

    if (key.name === "left" && focusedId === "model_details") {
      setFocusedId("model_selection");
    }

    // 'g' to toggle git worktree selector
    if (key.name === "g" && focusedId === "model_selection") {
      setFocusedId("worktree_selection");
    }
  });

  const setExitGuard = useCallback(
    (
      id: string,
      guard: (key: {
        name: string;
        shift?: boolean;
        ctrl?: boolean;
        meta?: boolean;
      }) => boolean
    ) => {
      exitGuards.set(id, guard);
    },
    [exitGuards]
  );

  const clearExitGuard = useCallback(
    (id: string) => {
      exitGuards.delete(id);
    },
    [exitGuards]
  );

  const value = useMemo(
    () => ({
      focusedId,
      register,
      unregister,
      focusId: (id: string) => setFocusedId(id),
      editMode,
      setEditMode,
      setFocusedId,
      isModalOpen,
      setModalOpen,
      setExitGuard,
      clearExitGuard,
    }),
    [
      focusedId,
      register,
      unregister,
      editMode,
      setFocusedId,
      isModalOpen,
      setModalOpen,
      setExitGuard,
      clearExitGuard,
    ]
  );

  return (
    <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
  );
}

export const useFocusContext = () => {
  const context = useContext(FocusContext);
  if (!context)
    throw new Error("useFocusContext must be used within FocusProvider");
  return context;
};

export const useFocusState = (id: string) => {
  const context = useContext(FocusContext);
  if (!context)
    throw new Error("useFocusState must be used within FocusProvider");
  const {
    register,
    unregister,
    focusedId,
    editMode,
    setEditMode,
    setFocusedId,
    isModalOpen,
    setModalOpen,
    setExitGuard,
    clearExitGuard,
  } = context;

  useEffect(() => {
    register(id); // I am here! Add me to the Tab order.
    return () => unregister(id); // I am gone! Remove me from the Tab order.
  }, [id, register, unregister]);

  return {
    isFocused: focusedId === id,
    focus: () => context.focusId(id),
    editMode,
    setEditMode,
    setFocusedId,
    focusedId,
    isModalOpen,
    setModalOpen,
    setExitGuard,
    clearExitGuard,
  };
};
