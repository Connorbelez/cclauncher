import type { SelectOption } from "@opentui/core";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import path from "path";
import { spawn } from "child_process";
import { useEffect, useMemo, useState } from "react";
import { useFocusState } from "@/hooks/FocusProvider";
import { useGitWorktrees } from "@/hooks/useGitWorktrees";

const CLAUDE_COMMAND = process.env.CLAUDE_CODE_COMMAND ?? "claude";

export function GitWorktreeSelector() {
    const { isFocused, focusedId } = useFocusState("worktree_selection");
    const { state, refresh } = useGitWorktrees();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const options: SelectOption[] = useMemo(() => {
        return state.worktrees.map((worktree) => {
            const label = `${worktree.isMain ? "★" : "•"} ${path.basename(worktree.path)}`;
            const branchLabel = worktree.branch ? ` ${worktree.branch}` : "detached";
            const headLabel = worktree.head ? worktree.head.slice(0, 7) : "unknown";
            const description = `${branchLabel} · ${headLabel} · ${worktree.path}`;
            return {
                name: label,
                description,
                value: worktree,
            };
        });
    }, [state.worktrees]);

    useEffect(() => {
        if (selectedIndex >= options.length) {
            setSelectedIndex(Math.max(options.length - 1, 0));
        }
    }, [options.length, selectedIndex]);

    useKeyboard((key) => {
        if (!isFocused) return;

        if (key.name === "r") {
            setStatusMessage("Refreshing worktrees...");
            void refresh().finally(() => setStatusMessage(null));
        }

        if (key.name === "return" && options[selectedIndex]) {
            const selection = options[selectedIndex]?.value as { path: string };
            if (!selection?.path) return;
            setStatusMessage(`Launching Claude Code in ${selection.path}...`);
            const child = spawn(CLAUDE_COMMAND, [], {
                cwd: selection.path,
                stdio: "inherit",
                shell: true,
            });
            child.on("error", (error) => {
                setStatusMessage(`Launch failed: ${error.message}`);
            });
        }
    });

    if (focusedId !== "worktree_selection") {
        return null;
    }

    return (
        <scrollbox
            title="Git Worktrees"
            style={{
                width: "100%",
                height: "80%",
                border: true,
                borderStyle: "rounded",
                rootOptions: {
                    backgroundColor: "#1b1f33",
                },
                wrapperOptions: {
                    backgroundColor: "#16192b",
                },
                viewportOptions: {
                    backgroundColor: "#121420",
                },
                contentOptions: {
                    backgroundColor: "#10121c",
                },
                scrollbarOptions: {
                    showArrows: true,
                    trackOptions: {
                        foregroundColor: "#7aa2f7",
                        backgroundColor: "#414868",
                    },
                },
            }}
        >
            <box flexDirection="column" gap={1}>
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD}>Select a worktree to spark a new Claude Code session.</text>
                    <text attributes={TextAttributes.DIM}>
                        Command: {CLAUDE_COMMAND} (set CLAUDE_CODE_COMMAND to override)
                    </text>
                    {state.repoRoot && (
                        <text attributes={TextAttributes.DIM}>Repo: {state.repoRoot}</text>
                    )}
                </box>
                {state.status === "loading" && (
                    <box>
                        <text>Discovering worktrees...</text>
                    </box>
                )}
                {state.status === "no_repo" && (
                    <box flexDirection="column" gap={1}>
                        <text>No git repository found in this directory.</text>
                        <text attributes={TextAttributes.DIM}>Tip: open the app inside a git repo to explore worktrees.</text>
                    </box>
                )}
                {state.status === "error" && (
                    <box flexDirection="column" gap={1}>
                        <text>Git unavailable or returned an error.</text>
                        <text attributes={TextAttributes.DIM}>{state.error}</text>
                    </box>
                )}
                {state.status === "ready" && options.length === 0 && (
                    <box flexDirection="column" gap={1}>
                        <text>No worktrees detected yet.</text>
                        <text attributes={TextAttributes.DIM}>Run git worktree add to create a new workspace.</text>
                    </box>
                )}
                {state.status === "ready" && options.length > 0 && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.DIM}>
                            {options.length} worktree{options.length === 1 ? "" : "s"} ready to explore.
                        </text>
                        <select
                            focused={isFocused}
                            style={{ width: "100%", height: "100%" }}
                            options={options}
                            onChange={(index) => setSelectedIndex(index)}
                            onSelect={(index) => setSelectedIndex(index)}
                        />
                    </box>
                )}
                <box flexDirection="row" gap={2}>
                    <text attributes={TextAttributes.DIM}>return: launch</text>
                    <text attributes={TextAttributes.DIM}>r: refresh</text>
                    <text attributes={TextAttributes.DIM}>tab: switch screen</text>
                </box>
                {statusMessage && (
                    <box>
                        <text attributes={TextAttributes.DIM}>{statusMessage}</text>
                    </box>
                )}
            </box>
        </scrollbox>
    );
}
