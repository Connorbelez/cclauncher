type ClipboardCommand = {
  cmd: string[];
};

const MAC_WRITE: ClipboardCommand = { cmd: ["pbcopy"] };
const MAC_READ: ClipboardCommand = { cmd: ["pbpaste"] };
const WINDOWS_WRITE: ClipboardCommand = {
  cmd: ["powershell", "-NoProfile", "-Command", "Set-Clipboard"],
};
const WINDOWS_READ: ClipboardCommand = {
  cmd: ["powershell", "-NoProfile", "-Command", "Get-Clipboard"],
};
const LINUX_WRITE: ClipboardCommand = {
  cmd: ["xclip", "-selection", "clipboard"],
};
const LINUX_READ: ClipboardCommand = {
  cmd: ["xclip", "-selection", "clipboard", "-o"],
};

function getCommands() {
  switch (process.platform) {
    case "darwin":
      return { write: MAC_WRITE, read: MAC_READ };
    case "win32":
      return { write: WINDOWS_WRITE, read: WINDOWS_READ };
    default:
      return { write: LINUX_WRITE, read: LINUX_READ };
  }
}

export async function writeClipboard(text: string): Promise<void> {
  const { write } = getCommands();
  try {
    const proc = Bun.spawn(write.cmd, { stdin: "pipe" });
    if (proc.stdin) {
      await proc.stdin.write(text);
      proc.stdin.end();
    }
    await proc.exited;
  } catch (error) {
    console.error("[clipboard] Failed to write clipboard:", error);
  }
}

export async function readClipboard(): Promise<string> {
  const { read } = getCommands();
  try {
    const proc = Bun.spawn(read.cmd, { stdout: "pipe" });
    const output = proc.stdout ? await new Response(proc.stdout).text() : "";
    await proc.exited;
    return output.replace(/\r\n/g, "\n");
  } catch (error) {
    console.error("[clipboard] Failed to read clipboard:", error);
    return "";
  }
}
