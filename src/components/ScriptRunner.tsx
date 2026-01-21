import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { SpinnerWithElapsed } from "./Spinner";
import { resolveScriptPath } from "@/lib/projectStore";
import { theme } from "@/theme";

type ScriptState = "running" | "success" | "error";

interface ScriptRunnerProps {
	/** Relative or absolute path to the script */
	scriptPath: string;
	/** Project root path for resolving relative script paths */
	projectPath: string;
	/** Working directory to run the script in (usually the new worktree path) */
	workingDirectory: string;
	/** Called when script completes and user should proceed to launch */
	onComplete: () => void;
	/** Called when user chooses to abort (Escape on error) */
	onAbort: () => void;
}

/**
 * Component that executes a setup script and displays progress.
 * Shows animated spinner while running, success/error states on completion.
 */
export function ScriptRunner({
	scriptPath,
	projectPath,
	workingDirectory,
	onComplete,
	onAbort,
}: ScriptRunnerProps) {
	const [state, setState] = useState<ScriptState>("running");
	const [exitCode, setExitCode] = useState<number | null>(null);
	const [startTime] = useState(() => Date.now());
	const [successDelay, setSuccessDelay] = useState(false);

	const absoluteScriptPath = resolveScriptPath(projectPath, scriptPath);

	// Run the script on mount
	useEffect(() => {
		let isCancelled = false;

		const runScript = async () => {
			try {
				const proc = Bun.spawn(["sh", "-c", absoluteScriptPath], {
					cwd: workingDirectory,
					stdio: ["ignore", "ignore", "ignore"],
					env: { ...process.env },
				});

				const code = await proc.exited;

				if (isCancelled) return;

				setExitCode(code);
				if (code === 0) {
					setState("success");
					setSuccessDelay(true);
				} else {
					setState("error");
				}
			} catch {
				if (isCancelled) return;
				setExitCode(-1);
				setState("error");
			}
		};

		runScript();

		return () => {
			isCancelled = true;
		};
	}, [absoluteScriptPath, workingDirectory]);

	// Auto-proceed after success delay
	useEffect(() => {
		if (successDelay) {
			const timeout = setTimeout(() => {
				onComplete();
			}, 2000);
			return () => clearTimeout(timeout);
		}
	}, [successDelay, onComplete]);

	// Handle keyboard input
	const handleKeyboard = useCallback(
		(key: { name?: string }) => {
			if (state === "error") {
				if (key.name === "escape") {
					onAbort();
				} else if (key.name === "return" || key.name === "space") {
					// Continue anyway on Enter/Space
					onComplete();
				}
			}
		},
		[state, onAbort, onComplete]
	);

	useKeyboard(handleKeyboard);

	const borderColor =
		state === "running"
			? theme.colors.primary
			: state === "success"
				? theme.colors.success
				: theme.colors.error;

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			style={{
				width: "100%",
				height: "100%",
			}}
		>
			<box
				flexDirection="column"
				style={{
					width: "100%",
					flexGrow: 1,
					border: true,
					borderStyle: "double",
					borderColor,
					padding: 2,
				}}
				title={
					state === "running"
						? "Running Setup Script"
						: state === "success"
							? "Setup Complete"
							: "Setup Failed"
				}
			>
				{/* Centered content */}
				<box
					flexDirection="column"
					alignItems="center"
					justifyContent="center"
					flexGrow={1}
					gap={1}
				>
					{/* Status icon and message */}
					{state === "running" && (
						<>
							<SpinnerWithElapsed
								text="Running setup script..."
								startTime={startTime}
							/>
							<box marginTop={1}>
								<text style={{ fg: theme.colors.text.secondary }}>
									{scriptPath}
								</text>
							</box>
						</>
					)}

					{state === "success" && (
						<>
							<box flexDirection="row" gap={1}>
								<text
									style={{ fg: theme.colors.success }}
									attributes={TextAttributes.BOLD}
								>
									✓
								</text>
								<text
									style={{ fg: theme.colors.text.primary }}
									attributes={TextAttributes.BOLD}
								>
									Script completed successfully
								</text>
							</box>
							<box marginTop={1}>
								<text style={{ fg: theme.colors.text.secondary }}>
									Launching Claude Code...
								</text>
							</box>
						</>
					)}

					{state === "error" && (
						<>
							<box flexDirection="row" gap={1}>
								<text
									style={{ fg: theme.colors.error }}
									attributes={TextAttributes.BOLD}
								>
									✗
								</text>
								<text
									style={{ fg: theme.colors.text.primary }}
									attributes={TextAttributes.BOLD}
								>
									Script failed (exit code: {exitCode})
								</text>
							</box>
							<box marginTop={1} flexDirection="column" alignItems="center">
								<text style={{ fg: theme.colors.text.secondary }}>
									Press Enter to continue anyway
								</text>
								<text style={{ fg: theme.colors.text.muted }}>
									or Escape to abort
								</text>
							</box>
						</>
					)}
				</box>

				{/* Script path display at bottom */}
				<box
					flexDirection="column"
					style={{
						marginTop: 2,
						padding: 1,
						border: true,
						borderStyle: "rounded",
						borderColor: theme.colors.border,
					}}
				>
					<text style={{ fg: theme.colors.text.muted }}>Script:</text>
					<text style={{ fg: theme.colors.text.secondary }}>
						{absoluteScriptPath}
					</text>
					<text style={{ fg: theme.colors.text.muted, marginTop: 1 }}>
						Working directory:
					</text>
					<text style={{ fg: theme.colors.text.secondary }}>
						{workingDirectory}
					</text>
				</box>
			</box>
		</box>
	);
}
