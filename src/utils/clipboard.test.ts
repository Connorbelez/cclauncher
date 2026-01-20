import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readClipboard, writeClipboard } from "./clipboard";

const createTextStream = (text: string) =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

describe("Clipboard utility", () => {
  const originalSpawn = Bun.spawn;
  let spawnMock: ReturnType<typeof vi.fn>;
  let platformSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    spawnMock = vi.fn();
    Bun.spawn = spawnMock as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    platformSpy?.mockRestore();
    vi.restoreAllMocks();
  });

  const setPlatform = (value: string) => {
    platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue(value);
  };

  it("uses macOS commands for write and read", async () => {
    setPlatform("darwin");
    const stdin = {
      write: vi.fn().mockResolvedValue(undefined),
      end: vi.fn(),
    };
    spawnMock
      .mockReturnValueOnce({ stdin, exited: Promise.resolve(0) })
      .mockReturnValueOnce({
        stdout: createTextStream("hello\r\nworld"),
        exited: Promise.resolve(0),
      });

    await writeClipboard("test");
    const result = await readClipboard();

    expect(spawnMock).toHaveBeenNthCalledWith(1, ["pbcopy"], {
      stdin: "pipe",
    });
    expect(spawnMock).toHaveBeenNthCalledWith(2, ["pbpaste"], {
      stdout: "pipe",
    });
    expect(stdin.write).toHaveBeenCalledWith("test");
    expect(result).toBe("hello\nworld");
  });

  it("uses Windows commands for write and read", async () => {
    setPlatform("win32");
    const stdin = {
      write: vi.fn().mockResolvedValue(undefined),
      end: vi.fn(),
    };
    spawnMock
      .mockReturnValueOnce({ stdin, exited: Promise.resolve(0) })
      .mockReturnValueOnce({
        stdout: createTextStream("win"),
        exited: Promise.resolve(0),
      });

    await writeClipboard("clip");
    await readClipboard();

    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      ["powershell", "-NoProfile", "-Command", "Set-Clipboard"],
      { stdin: "pipe" }
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      ["powershell", "-NoProfile", "-Command", "Get-Clipboard"],
      { stdout: "pipe" }
    );
  });

  it("uses Linux commands by default", async () => {
    setPlatform("linux");
    const stdin = {
      write: vi.fn().mockResolvedValue(undefined),
      end: vi.fn(),
    };
    spawnMock
      .mockReturnValueOnce({ stdin, exited: Promise.resolve(0) })
      .mockReturnValueOnce({
        stdout: createTextStream("linux"),
        exited: Promise.resolve(0),
      });

    await writeClipboard("clip");
    await readClipboard();

    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      ["xclip", "-selection", "clipboard"],
      { stdin: "pipe" }
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      ["xclip", "-selection", "clipboard", "-o"],
      { stdout: "pipe" }
    );
  });

  it("logs and swallows errors on write", async () => {
    setPlatform("darwin");
    spawnMock.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(writeClipboard("oops")).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "[clipboard] Failed to write clipboard:",
      expect.any(Error)
    );
  });

  it("logs and returns empty string on read failure", async () => {
    setPlatform("darwin");
    spawnMock.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(readClipboard()).resolves.toBe("");

    expect(errorSpy).toHaveBeenCalledWith(
      "[clipboard] Failed to read clipboard:",
      expect.any(Error)
    );
  });
});
