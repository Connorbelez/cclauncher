import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SpinnerWithElapsed } from "./Spinner";
import { resolveScriptPath } from "@/lib/projectStore";
import { theme } from "@/theme";

type ScriptState = "running" | "success" | "error" | "aborted";

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

// Pre-compile regex for splitting lines
const LINE_SPLIT_REGEX = /\r?\n/;

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
	const [output, setOutput] = useState<string[]>([]);
	const procRef = useRef<ReturnType<typeof Bun.spawn> | null>(null);

	const absoluteScriptPath = resolveScriptPath(projectPath, scriptPath);

	// Run the script on mount
	useEffect(() => {
		let isCancelled = false;

		const runScript = async () => {
			try {
				// We wrap the script in "sh -c" to ensure it executes correctly
				// and force PTY-like behavior for output if possible, but for now
				// simple pipe is enough to capture output.
				const proc = Bun.spawn(["sh", "-c", absoluteScriptPath], {
					cwd: workingDirectory,
					stdio: ["ignore", "pipe", "pipe"],
					env: { ...process.env, FORCE_COLOR: "1" },
				});

				procRef.current = proc;

				// Stream stdout
				const readStream = async (stream: ReadableStream | null) => {
					if (!stream) return;
					const reader = stream.getReader();
					const decoder = new TextDecoder();

					try {
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;
							const text = decoder.decode(value);
							const lines = text.split(LINE_SPLIT_REGEX);

							// Handle partial lines? For simplicity, we just push chunks or split by newline.
							// To keep it simple in TUI, let's just push lines that have content
							// or accumulate a buffer. For now, simple split is okay.
							// We'll filter out empty strings to avoid gap spam.
							const validLines = lines.filter((l) => l.length > 0);

							setOutput((prev) => {
								const next = [...prev, ...validLines];
								// Keep last 100 lines
								if (next.length > 100) return next.slice(-100);
								return next;
							});
						}
					} catch {
						// Ignore stream errors
					}
				};

				// Start reading streams without awaiting them (fire and forget)
				readStream(proc.stdout);
				readStream(proc.stderr);

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
			} finally {
				procRef.current = null;
			}
		};

		runScript();

		return () => {
			isCancelled = true;
			// Kill process on unmount if valid
			if (procRef.current) {
				procRef.current.kill();
			}
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
			if (key.name === "escape") {
				if (state === "running") {
					// User wants to cancel running script
					if (procRef.current) {
						procRef.current.kill();
					}
					setState("aborted");
				} else {
					// In success/error/aborted state, escape means go back/abort
					onAbort();
				}
				return;
			}

			if (
				(key.name === "return" || key.name === "space") &&
				state !== "running"
			) {
				// In error/success states, enter means continue
				onComplete();
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
				: state === "aborted"
					? theme.colors.warning
					: theme.colors.error;

	// Show last N lines
	const visibleLines = output.slice(-15);

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
					padding: 1,
				}}
				title={
					state === "running"
						? "Running Setup Script"
						: state === "success"
							? "Setup Complete"
							: state === "aborted"
								? "Setup Canceled"
								: "Setup Failed"
				}
			>
				{/* Top Status Area */}
				<box
					flexDirection="column"
					alignItems="center"
					justifyContent="center"
					height={6}
					gap={1}
					style={{ border: false }}
				>
					{/* Status icon and message */}
					{state === "running" && (
						<>
							<SpinnerWithElapsed
								text="Running setup script..."
								startTime={startTime}
							/>
							<text style={{ fg: theme.colors.text.hint }}>
								Press [Esc] to cancel
							</text>
						</>
					)}

					{state === "success" && (
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
					)}

					{state === "error" && (
						<box flexDirection="column" alignItems="center">
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
							<text style={{ fg: theme.colors.text.secondary }}>
								Press Enter to continue anyway or Esc to go back
							</text>
						</box>
					)}

					{state === "aborted" && (
						<box flexDirection="column" alignItems="center">
							<box flexDirection="row" gap={1}>
								<text
									style={{ fg: theme.colors.warning }}
									attributes={TextAttributes.BOLD}
								>
									!
								</text>
								<text
									style={{ fg: theme.colors.text.primary }}
									attributes={TextAttributes.BOLD}
								>
									Script execution canceled
								</text>
							</box>
							<text style={{ fg: theme.colors.text.secondary }}>
								Press Enter to continue launch or Esc to go back
							</text>
						</box>
					)}
				</box>

				{/* Divider */}
				<box marginBottom={0} height={1}>
					<text style={{ fg: theme.colors.border }}>
						{"─".repeat(
							process.stdout.columns ? process.stdout.columns - 4 : 60
						)}
					</text>
				</box>

				{/* Output Console */}
				<box
					flexDirection="column"
					flexGrow={1}
					style={{
						borderColor: theme.colors.border,
						paddingTop: 0,
					}}
				>
					<text style={{ fg: theme.colors.text.muted }}>Output:</text>
					{visibleLines.map((line, i) => (
						<text
							key={`${i}-${line.substring(0, 10)}`}
							style={{ fg: theme.colors.text.secondary }}
						>
							{line}
						</text>
					))}
				</box>

				{/* Footer Script Path */}
				<box marginTop={1}>
					<text style={{ fg: theme.colors.text.muted }}>Running: </text>
					<text style={{ fg: theme.colors.text.hint }}>{scriptPath}</text>
				</box>
			</box>
		</box>
	);
}
