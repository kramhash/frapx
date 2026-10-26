import { afterEach, describe, expect, it, vi } from "vitest";
import { canPickDirectory, createDirectorySink, pickDirectorySink } from "../src/directory";

const createDirectory = () => {
  const writable = {
    write: vi.fn(async (_data: Blob) => {}),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {})
  };
  const file = { createWritable: vi.fn(async () => writable) };
  const directory = { getFileHandle: vi.fn(async () => file) };
  return {
    directory: directory as unknown as FileSystemDirectoryHandle,
    getFileHandle: directory.getFileHandle,
    createWritable: file.createWritable,
    writable
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("createDirectorySink", () => {
  it("creates the requested file and closes it after writing the frame", async () => {
    const { directory, getFileHandle, createWritable, writable } = createDirectory();
    const data = new Blob(["frame"], { type: "image/png" });
    const sink = createDirectorySink(directory);

    await sink.write("frame_00001.png", data);
    await sink.close();

    expect(getFileHandle).toHaveBeenCalledExactlyOnceWith("frame_00001.png", { create: true });
    expect(createWritable).toHaveBeenCalledTimes(1);
    expect(writable.write).toHaveBeenCalledExactlyOnceWith(data);
    expect(writable.close).toHaveBeenCalledTimes(1);
    expect(writable.write.mock.invocationCallOrder[0]).toBeLessThan(
      writable.close.mock.invocationCallOrder[0]!
    );
    expect(writable.abort).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "aborts a failed write and preserves its error (abort rejects: %s)",
    async (abortRejects) => {
      const { directory, writable } = createDirectory();
      const error = new Error("disk full");
      writable.write.mockRejectedValue(error);
      if (abortRejects) writable.abort.mockRejectedValue(new Error("abort failed"));

      await expect(createDirectorySink(directory).write("frame.png", new Blob())).rejects.toBe(error);

      expect(writable.abort).toHaveBeenCalledTimes(1);
      expect(writable.close).not.toHaveBeenCalled();
    }
  );
});

describe("directory picking", () => {
  it("reports unsupported operation without window", async () => {
    vi.stubGlobal("window", undefined);

    expect(canPickDirectory()).toBe(false);
    await expect(pickDirectorySink()).rejects.toMatchObject({ name: "NotSupportedError" });
  });

  it.each([{}, { showDirectoryPicker: true }])(
    "reports unsupported operation without a callable picker (%j)",
    async (window) => {
      vi.stubGlobal("window", window);

      expect(canPickDirectory()).toBe(false);
      await expect(pickDirectorySink()).rejects.toMatchObject({ name: "NotSupportedError" });
    }
  );

  it("binds the picker to window and writes into the picked directory", async () => {
    const { directory, getFileHandle, writable } = createDirectory();
    const showDirectoryPicker = vi.fn(async () => directory);
    const window = { showDirectoryPicker };
    vi.stubGlobal("window", window);
    const data = new Blob(["frame"]);

    expect(canPickDirectory()).toBe(true);
    const sink = await pickDirectorySink();
    await sink.write("picked.png", data);

    expect(showDirectoryPicker).toHaveBeenCalledExactlyOnceWith({ mode: "readwrite" });
    expect(showDirectoryPicker.mock.contexts[0]).toBe(window);
    expect(getFileHandle).toHaveBeenCalledExactlyOnceWith("picked.png", { create: true });
    expect(writable.write).toHaveBeenCalledExactlyOnceWith(data);
    expect(writable.close).toHaveBeenCalledTimes(1);
  });

  it("propagates cancellation from the picker", async () => {
    const error = new DOMException("Picker dismissed", "AbortError");
    vi.stubGlobal("window", { showDirectoryPicker: vi.fn().mockRejectedValue(error) });

    await expect(pickDirectorySink()).rejects.toBe(error);
  });
});
