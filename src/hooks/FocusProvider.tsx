import { useKeyboard } from "@opentui/react";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

interface Key {
	name?: string;
	shift?: boolean;
	ctrl?: boolean;
	meta?: boolean;
}

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
	setExitGuard: (id: string, guard: (key: Key) => boolean) => void;
	clearExitGuard: (id: string) => void;
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

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
		() => new Map<string, (key: Key) => boolean>(),
		[]
	);

	const register = useCallback((id: string) => {
		setRegistry((prev) => [...prev, id]);
		setFocusedId((curr) => curr ?? id);
	}, []);

	const unregister = useCallback((id: string) => {
		setRegistry((prev) => prev.filter((item) => item !== id));
	}, []);

	const handleTab = useCallback(
		(shift: boolean) => {
			const index = registry.indexOf(focusedId || "");
			const nextIndex = shift
				? (index - 1 + registry.length) % registry.length
				: (index + 1) % registry.length;
			setEditMode(!editMode);
			setFocusedId(registry[nextIndex]);
		},
		[registry, focusedId, editMode]
	);

	const handleKeyRegistry = useCallback(
		(name: string) => {
			if (focusedId === "model_selection") {
				if (name === "e" || name === "right") {
					setFocusedId("model_details");
					if (name === "e") setEditMode(!editMode);
				} else if (name === "n") {
					setFocusedId("new_model");
				} else if (name === "g") {
					setFocusedId("worktree_selection");
				}
			} else if (focusedId === "model_details" && name === "left") {
				setFocusedId("model_selection");
			}
		},
		[focusedId, editMode]
	);

	const handleGlobalKeys = useCallback(
		(key: { name?: string; shift?: boolean }) => {
			const guard = focusedId ? exitGuards.get(focusedId) : undefined;
			if (guard?.(key) || isModalOpen) return;

			const name = key.name || "";
			if (name === "tab") {
				handleTab(Boolean(key.shift));
			} else if (name === "escape" && editMode) {
				setEditMode(false);
				setFocusedId("model_selection");
			} else {
				handleKeyRegistry(name);
			}
		},
		[focusedId, isModalOpen, editMode, handleTab, handleKeyRegistry, exitGuards]
	);

	useKeyboard(handleGlobalKeys);

	const contextValue = useMemo(
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
			setExitGuard: (id: string, guard: (key: Key) => boolean) =>
				exitGuards.set(id, guard),
			clearExitGuard: (id: string) => exitGuards.delete(id),
		}),
		[focusedId, register, unregister, editMode, isModalOpen, exitGuards]
	);

	return (
		<FocusContext.Provider value={contextValue}>
			{children}
		</FocusContext.Provider>
	);
}

export const useFocusContext = () => {
	const context = useContext(FocusContext);
	if (!context) {
		throw new Error("useFocusContext must be used within FocusProvider");
	}
	return context;
};

export const useFocusState = (id: string) => {
	const context = useFocusContext();

	useEffect(() => {
		context.register(id);
		return () => context.unregister(id);
	}, [id, context.register, context.unregister]);

	return {
		isFocused: context.focusedId === id,
		focus: () => context.focusId(id),
		editMode: context.editMode,
		setEditMode: context.setEditMode,
		setFocusedId: context.setFocusedId,
		focusedId: context.focusedId,
		isModalOpen: context.isModalOpen,
		setModalOpen: context.setModalOpen,
		setExitGuard: context.setExitGuard,
		clearExitGuard: context.clearExitGuard,
	};
};
