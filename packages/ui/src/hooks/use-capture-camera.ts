"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Owns one camera stream; late permission grants are disposed after closing. */
export function useCaptureCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "unavailable">(
    "starting",
  );
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [attempt, setAttempt] = useState(0);
  const [frameSize, setFrameSize] = useState<{
    width: number;
    height: number;
  }>();

  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (video) video.srcObject = streamRef.current;
  }, []);

  const updateFrameSize = useCallback(() => {
    const video = videoRef.current;
    if (
      !enabled ||
      !streamRef.current ||
      video?.srcObject !== streamRef.current ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    )
      return false;

    const width = video.videoWidth;
    const height = video.videoHeight;
    setFrameSize((previous) =>
      previous?.width === width && previous.height === height
        ? previous
        : { width, height },
    );
    return true;
  }, [enabled]);

  useEffect(() => {
    setFrameSize(undefined);
    if (!enabled) return;
    let active = true;
    let stream: MediaStream | undefined;
    const onTrackEnded = () => {
      if (active) {
        setStatus("unavailable");
        setFrameSize(undefined);
      }
    };
    setStatus("starting");

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      try {
        const supported = navigator.mediaDevices.getSupportedConstraints?.();
        const supportsNativeFrames =
          supported &&
          "resizeMode" in supported &&
          supported.resizeMode === true;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            // Equal, non-required ideals prefer large frames in either device
            // orientation without asking the browser to impose a 16:9 crop.
            // The camera and browser still choose the actual supported size.
            width: { ideal: 3840 },
            height: { ideal: 3840 },
            ...(supportsNativeFrames ? { resizeMode: { ideal: "none" } } : {}),
          },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.getTracks().forEach((track) => {
          track.addEventListener("ended", onTrackEnded);
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (active) setStatus("unavailable");
      }
    }
    void start();
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => {
        track.removeEventListener("ended", onTrackEnded);
        track.stop();
      });
      if (streamRef.current === stream) streamRef.current = null;
      const video = videoRef.current;
      if (video && video.srcObject === stream) video.srcObject = null;
    };
  }, [enabled, facingMode, attempt]);

  return {
    videoRef,
    attachVideo,
    status,
    facingMode,
    frameSize: enabled ? frameSize : undefined,
    updateFrameSize,
    markReady: () => {
      if (updateFrameSize()) setStatus("ready");
    },
    markUnavailable: () => {
      setStatus("unavailable");
      setFrameSize(undefined);
    },
    retry: () => setAttempt((value) => value + 1),
    switchCamera: () =>
      setFacingMode((value) =>
        value === "environment" ? "user" : "environment",
      ),
  };
}

/** Capture every pixel in the browser's camera frame at its actual resolution. */
export async function captureCameraFrame(
  video: HTMLVideoElement,
): Promise<File> {
  if (!video.videoWidth || !video.videoHeight)
    throw new Error("Camera is not ready");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Camera capture is unavailable");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Camera capture failed")),
      "image/jpeg",
      0.92,
    );
  });
  return new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
}
