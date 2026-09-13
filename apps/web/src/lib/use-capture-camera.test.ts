import {
  captureCameraFrame,
  useCaptureCamera,
} from "@repo/ui/hooks/use-capture-camera";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices",
);
const getUserMedia = vi.fn();
const getSupportedConstraints = vi.fn();

beforeEach(() => {
  getUserMedia.mockReset();
  getSupportedConstraints.mockReset().mockReturnValue({ resizeMode: true });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, getSupportedConstraints },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalMediaDevices)
    Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  else Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("shared useCaptureCamera", () => {
  it("retries a rejected permission request and only becomes ready when a frame is available", async () => {
    const { stream, stop } = cameraStream();
    getUserMedia
      .mockRejectedValueOnce(new Error("Permission denied"))
      .mockResolvedValueOnce(stream);
    const { result } = renderHook(() => useCaptureCamera(true));
    const video = document.createElement("video");
    act(() => result.current.attachVideo(video));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    act(() => result.current.retry());
    await waitFor(() => expect(video.srcObject).toBe(stream));
    expect(result.current.status).toBe("starting");
    act(() => result.current.markReady());
    expect(result.current.status).toBe("starting");
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });
    act(() => result.current.markReady());
    expect(result.current.status).toBe("ready");
    expect(result.current.frameSize).toEqual({ width: 640, height: 480 });
    expect(stop).not.toHaveBeenCalled();
  });

  it("requests large native frames with flexible dimensions and no required ratio", async () => {
    const { stream } = cameraStream();
    getUserMedia.mockResolvedValue(stream);
    renderHook(() => useCaptureCamera(true));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());

    const request = getUserMedia.mock.calls[0]?.[0] as MediaStreamConstraints;
    const constraints = request.video as MediaTrackConstraints;
    const width = constraints.width as ConstrainULongRange;
    const height = constraints.height as ConstrainULongRange;
    expect(width.ideal).toBeGreaterThan(1920);
    expect(height.ideal).toBe(width.ideal);
    expect(width.exact).toBeUndefined();
    expect(width.min).toBeUndefined();
    expect(height.exact).toBeUndefined();
    expect(height.min).toBeUndefined();
    expect(constraints.aspectRatio).toBeUndefined();
    expect(constraints).toEqual(
      expect.objectContaining({ resizeMode: { ideal: "none" } }),
    );
  });

  it.each([{}, undefined])(
    "works without reported resizeMode support (%j)",
    async (supported) => {
      const { stream } = cameraStream();
      getUserMedia.mockResolvedValue(stream);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: supported
          ? { getUserMedia, getSupportedConstraints: () => supported }
          : { getUserMedia },
      });
      const { result } = renderHook(() => useCaptureCamera(true));
      const video = document.createElement("video");
      act(() => result.current.attachVideo(video));
      await waitFor(() => expect(video.srcObject).toBe(stream));
      expect(getUserMedia.mock.calls[0]?.[0].video).not.toHaveProperty(
        "resizeMode",
      );
    },
  );

  it("updates the actual frame size on video resize without imposing viewport orientation", async () => {
    const { stream } = cameraStream();
    getUserMedia.mockResolvedValue(stream);
    const { result, unmount } = renderHook(() => useCaptureCamera(true));
    const video = document.createElement("video");
    act(() => result.current.attachVideo(video));
    expect(result.current.frameSize).toBeUndefined();
    await waitFor(() => expect(video.srcObject).toBe(stream));

    setVideoSize(video, 3840, 2160);
    act(() => result.current.markReady());
    expect(result.current.frameSize).toEqual({ width: 3840, height: 2160 });
    setVideoSize(video, 2160, 3840);
    act(() => result.current.updateFrameSize());
    expect(result.current.frameSize).toEqual({ width: 2160, height: 3840 });

    const lastValidSize = result.current.frameSize;
    setVideoSize(video, 0, 0);
    act(() => result.current.updateFrameSize());
    expect(result.current.frameSize).toBe(lastValidSize);
    unmount();
    setVideoSize(video, 640, 480);
    expect(result.current.updateFrameSize()).toBe(false);
  });

  it("clears frame dimensions while retrying and after a track ends", async () => {
    const first = cameraStream();
    const second = cameraStream();
    let grantSecond!: (stream: MediaStream) => void;
    getUserMedia.mockResolvedValueOnce(first.stream).mockReturnValueOnce(
      new Promise<MediaStream>((resolve) => {
        grantSecond = resolve;
      }),
    );
    const { result } = renderHook(() => useCaptureCamera(true));
    const video = document.createElement("video");
    act(() => result.current.attachVideo(video));
    await waitFor(() => expect(video.srcObject).toBe(first.stream));
    setVideoSize(video, 1920, 1080);
    act(() => result.current.markReady());
    expect(result.current.frameSize).toEqual({ width: 1920, height: 1080 });

    act(() => result.current.retry());
    expect(first.stop).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("starting");
    expect(result.current.frameSize).toBeUndefined();
    act(() => result.current.markReady());
    expect(result.current.status).toBe("starting");
    await act(async () => grantSecond(second.stream));
    act(() => result.current.markReady());
    expect(result.current.frameSize).toEqual({ width: 1920, height: 1080 });
    act(() => second.track.dispatchEvent(new Event("ended")));
    expect(result.current.status).toBe("unavailable");
    expect(result.current.frameSize).toBeUndefined();
  });

  it("releases the rear camera when switching and ignores a stale permission grant", async () => {
    const first = cameraStream();
    const second = cameraStream();
    let grantFirst!: (stream: MediaStream) => void;
    getUserMedia
      .mockReturnValueOnce(
        new Promise<MediaStream>((resolve) => {
          grantFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(second.stream);
    const { result, unmount } = renderHook(() => useCaptureCamera(true));
    const video = document.createElement("video");
    act(() => result.current.attachVideo(video));
    act(() => result.current.switchCamera());
    await waitFor(() => expect(video.srcObject).toBe(second.stream));
    expect(getUserMedia).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { ideal: "user" } }),
      }),
    );
    await act(async () => {
      grantFirst(first.stream);
    });
    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).not.toHaveBeenCalled();
    expect(video.srcObject).toBe(second.stream);
    unmount();
    expect(second.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });

  it("stops tracks when disabled and starts a new camera when reenabled", async () => {
    const first = cameraStream();
    const second = cameraStream();
    getUserMedia
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream);
    const { result, rerender } = renderHook(
      ({ enabled }) => useCaptureCamera(enabled),
      { initialProps: { enabled: true } },
    );
    const video = document.createElement("video");
    act(() => result.current.attachVideo(video));
    await waitFor(() => expect(video.srcObject).toBe(first.stream));
    setVideoSize(video, 1920, 1080);
    act(() => result.current.markReady());
    expect(result.current.frameSize).toBeDefined();
    rerender({ enabled: false });
    expect(result.current.frameSize).toBeUndefined();
    expect(first.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    rerender({ enabled: true });
    await waitFor(() => expect(video.srcObject).toBe(second.stream));
    expect(second.stop).not.toHaveBeenCalled();
  });
});

describe("captureCameraFrame", () => {
  it.each([
    { name: "portrait viewport", viewport: [300, 600], frame: [3840, 2160] },
    { name: "landscape viewport", viewport: [1600, 900], frame: [2160, 3840] },
    { name: "native 4:3 frame", viewport: [400, 800], frame: [3264, 2448] },
  ])(
    "exports the full native image regardless of $name",
    async ({ viewport, frame: [width, height] }) => {
      const video = document.createElement("video");
      setVideoSize(video, width!, height!);
      const getViewport = vi
        .spyOn(video, "getBoundingClientRect")
        .mockReturnValue({
          width: viewport[0],
          height: viewport[1],
        } as DOMRect);
      const drawImage = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        drawImage,
      } as unknown as CanvasRenderingContext2D);
      const toBlob = vi
        .spyOn(HTMLCanvasElement.prototype, "toBlob")
        .mockImplementation(function (this: HTMLCanvasElement, callback) {
          expect(this.width).toBe(width);
          expect(this.height).toBe(height);
          callback(new Blob(["photo"], { type: "image/jpeg" }));
        });
      const file = await captureCameraFrame(video);
      expect(file.type).toBe("image/jpeg");
      expect(file.size).toBe(5);
      expect(drawImage).toHaveBeenCalledExactlyOnceWith(
        video,
        0,
        0,
        width,
        height,
      );
      expect(toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        "image/jpeg",
        expect.any(Number),
      );
      expect(getViewport).not.toHaveBeenCalled();
    },
  );

  it("rejects an unavailable frame before attempting capture", async () => {
    const video = document.createElement("video");
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    await expect(captureCameraFrame(video)).rejects.toThrow(
      "Camera is not ready",
    );
    expect(getContext).not.toHaveBeenCalled();
  });
});

function cameraStream() {
  const stop = vi.fn();
  const track = Object.assign(new EventTarget(), { stop });
  return {
    stream: { getTracks: () => [track] } as unknown as MediaStream,
    stop,
    track,
  };
}

function setVideoSize(video: HTMLVideoElement, width: number, height: number) {
  Object.defineProperties(video, {
    videoWidth: { value: width, configurable: true },
    videoHeight: { value: height, configurable: true },
  });
}
