import fs from "node:fs";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveScriptExecution } from "@/lib/scriptExecution";
import { theme } from "@/theme";
import { getSetupMarkerPath } from "@/utils/launchTempDir";
import { logger } from "@/utils/logger";
import { SpinnerWithElapsed } from "./Spinner";

type ScriptState =
	| "running"
	| "success"
	| "error"
	| "aborted"
	| "external_running";

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
	/** Whether to spawn in a separate terminal window */
	spawnInTerminal?: boolean;
	/** Optional terminal application name/path */
	terminalApp?: string;
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
	spawnInTerminal,
	terminalApp,
}: ScriptRunnerProps) {
	const [state, setState] = useState<ScriptState>("running");
	const [exitCode, setExitCode] = useState<number | null>(null);
	const [startTime] = useState(() => Date.now());
	const [successDelay, setSuccessDelay] = useState(false);
	const [output, setOutput] = useState<string[]>([]);
	const procRef = useRef<ReturnType<typeof Bun.spawn> | null>(null);
	const watcherRef = useRef<Timer | null>(null);

	const hasRunRef = useRef(false);

	const scriptExecution = resolveScriptExecution(projectPath, scriptPath);
	const scriptIdentifier =
		scriptExecution.kind === "file"
			? scriptExecution.resolvedPath
			: scriptExecution.command;

	// Run the script on mount
	useEffect(() => {
		if (hasRunRef.current) return;
		hasRunRef.current = true;

		let isCancelled = false;

		const runScript = async () => {
			if (spawnInTerminal) {
				setState("external_running");

				// Import dynamically to avoid loading OS-specific stuff unnecessarily
				const { launchExternalTerminal } = await import(
					"@/utils/terminalLauncher"
				);

				const success = await launchExternalTerminal(
					workingDirectory,
					scriptExecution,
					terminalApp
				);

				if (!success) {
					if (!isCancelled) {
						setState("error");
						setOutput((p) => [...p, "Failed to launch external terminal."]);
					}
					return;
				}

				// Start polling for completion marker
				const markerFile = getSetupMarkerPath(workingDirectory);

				// Poll every 500ms
				watcherRef.current = setInterval(() => {
					if (fs.existsSync(markerFile)) {
						if (watcherRef.current) clearInterval(watcherRef.current);

						let exitCodeFromMarker: number | null = null;
						try {
							const content = fs.readFileSync(markerFile, "utf8").trim();
							const parsed = Number.parseInt(content, 10);
							exitCodeFromMarker = Number.isNaN(parsed) ? null : parsed;
						} catch (err) {
							logger.error(`Failed to read marker file ${markerFile}`, err);
						}

						// Cleanup marker
						try {
							fs.unlinkSync(markerFile);
						} catch (err) {
							logger.error(`Failed to cleanup marker file ${markerFile}`, err);
						}

						if (!isCancelled) {
							if (exitCodeFromMarker === 0) {
								setState("success");
								setSuccessDelay(true);
							} else {
								setExitCode(exitCodeFromMarker ?? -1);
								setState("error");
							}
						}
					}
				}, 500);
			} else {
				// Internal execution (existing logic)
				try {
					if (!scriptIdentifier) {
						setExitCode(-1);
						setState("error");
						setOutput((p) => [...p, "Script not configured."]);
						return;
					}

					if (
						scriptExecution.kind === "file" &&
						!fs.existsSync(scriptExecution.resolvedPath)
					) {
						setExitCode(-1);
						setState("error");
						setOutput((p) => [
							...p,
							`Script not found: ${scriptExecution.resolvedPath}`,
						]);
						return;
					}

					const proc =
						scriptExecution.kind === "file"
							? Bun.spawn(["bash", scriptExecution.resolvedPath], {
									cwd: workingDirectory,
									stdio: ["ignore", "pipe", "pipe"],
									env: { ...process.env, FORCE_COLOR: "1" },
								})
							: Bun.spawn(["bash", "-lc", scriptExecution.command], {
									cwd: workingDirectory,
									stdio: ["ignore", "pipe", "pipe"],
									env: { ...process.env, FORCE_COLOR: "1" },
								});

					procRef.current = proc;

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
								const validLines = lines.filter((l) => l.length > 0);

								setOutput((prev) => {
									const next = [...prev, ...validLines];
									if (next.length > 100) return next.slice(-100);
									return next;
								});
							}
						} catch {
							// Ignore stream errors
						}
					};

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
			}
		};

		runScript();

		return () => {
			isCancelled = true;
			if (procRef.current) {
				procRef.current.kill();
			}
			if (watcherRef.current) {
				clearInterval(watcherRef.current);
			}
		};
	}, [
		scriptExecution.kind,
		scriptIdentifier,
		workingDirectory,
		spawnInTerminal,
		terminalApp,
		scriptExecution.command,
		scriptExecution,
	]);

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
				if (state === "running" || state === "external_running") {
					// User wants to cancel
					if (procRef.current) {
						procRef.current.kill();
					}
					setState("aborted");
				} else {
					onAbort();
				}
				return;
			}

			if (
				(key.name === "return" || key.name === "space") &&
				state !== "running"
			) {
				// Allow manual continuation for external scripts too
				onComplete();
			}
		},
		[state, onAbort, onComplete]
	);

	useKeyboard(handleKeyboard);

	const borderColor =
		state === "running" || state === "external_running"
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
						: state === "external_running"
							? "Running External Script"
							: state === "success"
								? "Setup Complete"
								: state === "aborted"
									? "Setup Canceled"
									: "Setup Failed"
				}
			>
				{/* Top Status Area */}
				<box
					alignItems="center"
					flexDirection="column"
					gap={1}
					height={6}
					justifyContent="center"
					style={{ border: false }}
				>
					{/* Status icon and message */}
					{state === "running" && (
						<>
							<SpinnerWithElapsed
								startTime={startTime}
								text="Running setup script..."
							/>
							<text style={{ fg: theme.colors.text.hint }}>
								Press [Esc] to cancel
							</text>
						</>
					)}

					{state === "external_running" && (
						<>
							<SpinnerWithElapsed
								startTime={startTime}
								text="Waiting for external setup script..."
							/>
							<text style={{ fg: theme.colors.text.secondary }}>
								Script is running in: {terminalApp || "External Terminal"}
							</text>
							<text style={{ fg: theme.colors.text.hint }}>
								[Enter] I have finished manually [Esc] Cancel
							</text>
						</>
					)}

					{state === "success" && (
						<box flexDirection="row" gap={1}>
							<text
								attributes={TextAttributes.BOLD}
								style={{ fg: theme.colors.success }}
							>
								✓
							</text>
							<text
								attributes={TextAttributes.BOLD}
								style={{ fg: theme.colors.text.primary }}
							>
								Script completed successfully
							</text>
						</box>
					)}

					{state === "error" && (
						<box alignItems="center" flexDirection="column">
							<box flexDirection="row" gap={1}>
								<text
									attributes={TextAttributes.BOLD}
									style={{ fg: theme.colors.error }}
								>
									✗
								</text>
								<text
									attributes={TextAttributes.BOLD}
									style={{ fg: theme.colors.text.primary }}
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
						<box alignItems="center" flexDirection="column">
							<box flexDirection="row" gap={1}>
								<text
									attributes={TextAttributes.BOLD}
									style={{ fg: theme.colors.warning }}
								>
									!
								</text>
								<text
									attributes={TextAttributes.BOLD}
									style={{ fg: theme.colors.text.primary }}
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
				<box height={1} marginBottom={0}>
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
					{visibleLines.length > 0 ? (
						visibleLines.map((line, i) => (
							<text
								key={`${i}-${line.substring(0, 10)}`}
								style={{ fg: theme.colors.text.secondary }}
							>
								{line}
							</text>
						))
					) : (
						<text style={{ fg: theme.colors.text.hint, marginTop: 1 }}>
							{spawnInTerminal
								? "(Logs shown in external window)"
								: "(No output yet)"}
						</text>
					)}
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
