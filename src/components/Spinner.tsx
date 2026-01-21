import { useEffect, useState } from "react";
import { theme } from "@/theme";

// Braille dot spinner frames for smooth animation
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface SpinnerProps {
	/** Text to display next to the spinner */
	text?: string;
	/** Color for the spinner (defaults to primary) */
	color?: string;
	/** Animation speed in milliseconds (default: 80) */
	speed?: number;
}

/**
 * Animated braille dot spinner component.
 */
export function Spinner({
	text,
	color = theme.colors.primary,
	speed = 80,
}: SpinnerProps) {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
		}, speed);

		return () => clearInterval(interval);
	}, [speed]);

	const frame = SPINNER_FRAMES[frameIndex];

	return (
		<box flexDirection="row" gap={1}>
			<text style={{ fg: color }}>{frame}</text>
			{text && <text style={{ fg: theme.colors.text.primary }}>{text}</text>}
		</box>
	);
}

interface ElapsedTimeProps {
	/** Start time in milliseconds (Date.now()) */
	startTime: number;
	/** Color for the elapsed time (defaults to muted) */
	color?: string;
}

/**
 * Display elapsed time since start, updating every second.
 */
export function ElapsedTime({
	startTime,
	color = theme.colors.text.muted,
}: ElapsedTimeProps) {
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setElapsed(Math.floor((Date.now() - startTime) / 1000));
		}, 1000);

		return () => clearInterval(interval);
	}, [startTime]);

	const minutes = Math.floor(elapsed / 60);
	const seconds = elapsed % 60;
	const display =
		minutes > 0
			? `${minutes}m ${seconds.toString().padStart(2, "0")}s`
			: `${seconds}s`;

	return <text style={{ fg: color }}>{display}</text>;
}

interface SpinnerWithElapsedProps extends SpinnerProps {
	/** Start time in milliseconds (Date.now()) */
	startTime: number;
}

/**
 * Spinner with elapsed time display.
 */
export function SpinnerWithElapsed({
	text,
	color = theme.colors.primary,
	speed = 80,
	startTime,
}: SpinnerWithElapsedProps) {
	const [frameIndex, setFrameIndex] = useState(0);
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		const spinnerInterval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
		}, speed);

		return () => clearInterval(spinnerInterval);
	}, [speed]);

	useEffect(() => {
		const elapsedInterval = setInterval(() => {
			setElapsed(Math.floor((Date.now() - startTime) / 1000));
		}, 1000);

		return () => clearInterval(elapsedInterval);
	}, [startTime]);

	const frame = SPINNER_FRAMES[frameIndex];
	const minutes = Math.floor(elapsed / 60);
	const seconds = elapsed % 60;
	const elapsedDisplay =
		minutes > 0
			? `${minutes}m ${seconds.toString().padStart(2, "0")}s`
			: `${seconds}s`;

	return (
		<box flexDirection="row" gap={1}>
			<text style={{ fg: color }}>{frame}</text>
			{text && <text style={{ fg: theme.colors.text.primary }}>{text}</text>}
			<text style={{ fg: theme.colors.text.muted }}>({elapsedDisplay})</text>
		</box>
	);
}
