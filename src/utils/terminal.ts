/**
 * Reset terminal keyboard mode by disabling Kitty keyboard protocol.
 * This ensures spawned processes inherit a terminal in standard mode.
 *
 * The Kitty keyboard protocol uses a stack-based system where enabling
 * pushes a mode and disabling pops it. The escape sequence \x1b[<u
 * pops the current keyboard mode, restoring the previous state.
 *
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */
export function resetKeyboardMode(): void {
  process.stdout.write("\x1b[<u");
}

/**
 * Reset terminal input state before spawning a child TUI.
 * Disables raw mode and common input protocols that can "stack" across apps.
 */
export function resetTerminalForChild(): void {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e9da0001-9545-4aee-8bfe-0a658987fe33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/utils/terminal.ts:resetTerminalForChild:entry',message:'resetTerminalForChild entry',data:{stdinIsTTY:process.stdin.isTTY,stdoutIsTTY:process.stdout.isTTY},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // Best-effort reset; some stdin streams don't allow this.
    }
  }

  // Disable features that can interfere with child input handling.
  // - Kitty keyboard protocol: pop current mode
  // - Bracketed paste, mouse tracking, focus events
  process.stdout.write(
    "\x1b[0m\x1b[?25h\x1b[?1049l\x1b[?1l\x1b[<u\x1b[?2004l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l\x1b[?1004l"
  );
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/e9da0001-9545-4aee-8bfe-0a658987fe33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/utils/terminal.ts:resetTerminalForChild:afterWrite',message:'resetTerminalForChild wrote escape sequences',data:{wroteEscapes:true},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  if (process.stdin.isTTY) {
    try {
      Bun.spawnSync(["stty", "sane"], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e9da0001-9545-4aee-8bfe-0a658987fe33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/utils/terminal.ts:resetTerminalForChild:stty',message:'stty sane executed',data:{sttyExecuted:true},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
    } catch {
      // Best-effort reset; ignore if stty is unavailable.
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/e9da0001-9545-4aee-8bfe-0a658987fe33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/utils/terminal.ts:resetTerminalForChild:stty',message:'stty sane failed',data:{sttyExecuted:false},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
    }
  }
}
