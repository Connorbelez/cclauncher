import { useEffect, useState } from "react";

export interface TerminalSize {
	columns: number;
	rows: number;
}

/**
 * Hook to track the current terminal dimensions.
 * Updates on window resize events.
 */
export function useTerminalSize(): TerminalSize {
	const [size, setSize] = useState<TerminalSize>({
		columns: process.stdout.columns || 80,
		rows: process.stdout.rows || 24,
	});

	useEffect(() => {
		function handleResize() {
			setSize({
				columns: process.stdout.columns || 80,
				rows: process.stdout.rows || 24,
			});
		}

		// Initial check
		handleResize();

		process.stdout.on("resize", handleResize);
		return () => {
			process.stdout.off("resize", handleResize);
		};
	}, []);

	return size;
}
