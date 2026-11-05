/**
 * Native Roku SceneGraph video adapter with the same surface as the shared
 * `src/video.js` (shaka/DOM) module. Playback is a single `Video` node whose
 * `content` is a `ContentNode`; it is added as the bottom-most child of the
 * shared app root so the SolidTV UI renders on top of it.
 */

import { createElement, insertNode, setProp, tmTransaction } from "@roku-sdk/solid";

const LOG = "ROKU_VIDEO";
const WIDTH = 1920;
const HEIGHT = 1080;
/** How long load() waits for the node to acknowledge a new content URL. */
const ACCEPT_TIMEOUT_MS = 3000;

export const state = {
  playingState: false
};

let video: any = null;
let content: any = null;
let parent: any = null;
let rootOverride: any = null;
let currentPosition = 0;
let currentDuration = 0;
let lastState = "none";
let activeSession = false;
let durationIsMs = true;
let backdrop: any = null;
let pendingAccept: (() => void) | null = null;

/** Attach the Video node to an explicit SceneGraph group instead of the app root. */
export function setVideoRoot(root: any): void {
  rootOverride = root || null;
  if (rootOverride && video) attach(rootOverride);
}

/** Event handlers must never throw into the SceneGraph field-change bridge. */
/** This firmware reports position/duration in milliseconds. */
function toSeconds(value: any): number {
  const n = Number(value);
  if (!isFinite(n) || n < 0) return 0;
  return durationIsMs ? n / 1000 : n;
}

function safe(handler: (value: any) => void) {
  return (value: any) => {
    try {
      handler(value);
    } catch (error) {
      console.error(LOG + " handler failure " + String(error));
    }
  };
}

function accept(): void {
  const resolve = pendingAccept;
  pendingAccept = null;
  if (resolve) resolve();
}

function attach(target: any): void {
  parent = target || null;
  if (!video || !parent) return;
  // The shared Player is a full-screen video with no controls. Put the black
  // backdrop and the Video last so they paint over the page background (which
  // otherwise hides the video). The Player unmounts destroy()s them.
  if (backdrop) insertNode(parent, backdrop);
  insertNode(parent, video);
}

function appRoot(): any {
  return rootOverride || (globalThis as any).__solidtvNativeRoot || null;
}

function ensureAttached(): void {
  const target = appRoot();
  if (target && parent !== target) attach(target);
}

/** Only accept a passed-in element if it is a SceneGraph node (an r/t pair). */
function asScenegraphNode(element: any): any {
  return element && element.r !== undefined && typeof element.t === "string" ? element : null;
}

export async function init(element?: any): Promise<void> {
  if (video) {
    ensureAttached();
    return;
  }

  video = createElement("video");
  content = createElement("contentNode");
  backdrop = createElement("rectangle");
  setProp(backdrop, "width", WIDTH);
  setProp(backdrop, "height", HEIGHT);
  setProp(backdrop, "translation", [0, 0]);
  setProp(backdrop, "color", "0x000000FF");
  activeSession = true;
  (globalThis as any).__rokuPosLog = 0;

  setProp(video, "width", WIDTH);
  setProp(video, "height", HEIGHT);
  setProp(video, "translation", [0, 0]);
  setProp(video, "enableUI", false);
  setProp(video, "notificationInterval", 1);
  setProp(content, "url", "");
  setProp(video, "content", content);
  ensureAttached();

  setProp(
    video,
    "onState",
    safe((value: any) => {
      lastState = String(value);
      state.playingState = lastState === "playing";
      if (lastState === "buffering" || lastState === "playing" || lastState === "paused") accept();
      if (lastState === "error") console.error(LOG + " state=error");
    })
  );
  setProp(
    video,
    "onPosition",
    safe((value: any) => {
      currentPosition = toSeconds(value);
    })
  );
  setProp(
    video,
    "onDuration",
    safe((value: any) => {
      const n = Number(value);
      if (isFinite(n) && n > 0) durationIsMs = n > 10000;
      currentDuration = toSeconds(value);
    })
  );
  setProp(
    video,
    "onErrorCode",
    safe((value: any) => {
      state.playingState = false;
      console.error(LOG + " errorCode=" + String(value));
      accept();
    })
  );
  setProp(
    video,
    "onErrorMsg",
    safe((value: any) => {
      state.playingState = false;
      console.error(LOG + " errorMsg=" + String(value));
      accept();
    })
  );

  const target = rootOverride || asScenegraphNode(element) || appRoot();
  if (!target) {
    console.error(LOG + " init: no SceneGraph root available");
    return;
  }
  attach(target);
}

export async function load(config: { streamUrl: string }): Promise<void> {
  const streamUrl = config && config.streamUrl;
  if (!streamUrl) {
    console.error(LOG + " load: missing streamUrl");
    throw new Error(LOG + " load: missing streamUrl");
  }
  if (!video || !content) {
    console.error(LOG + " load: player not initialized");
    throw new Error("Player not initialized yet");
  }

  ensureAttached();
  // Stop the previous stream first, otherwise the node keeps the old manifest.
  setProp(video, "control", "stop");

  currentPosition = 0;
  currentDuration = 0;
  lastState = "none";
  state.playingState = false;

  const accepted = new Promise<void>(resolve => {
    pendingAccept = resolve;
  });
  // Assigning content starts manifest retrieval; playback is left to play().
  setProp(content, "url", streamUrl);
  const timer: any = setTimeout(accept, ACCEPT_TIMEOUT_MS);
  await accepted;
  if (typeof clearTimeout === "function") clearTimeout(timer);
}

export function play(): void {
  if (!video) {
    console.error(LOG + " play: player not initialized");
    return;
  }
  ensureAttached();
  setProp(video, "control", lastState === "paused" ? "resume" : "play");
  state.playingState = true;
}

export function pause(): void {
  if (!video) {
    console.error(LOG + " pause: player not initialized");
    return;
  }
  setProp(video, "control", "pause");
  state.playingState = false;
}

/** Write-only `seek` field; the value is seconds from the start of the stream. */
/** Remote media keys while the Player route is mounted. */
export function handleMediaKey(key: string): boolean {
  if (!activeSession) return false;
  switch (String(key || "").toLowerCase()) {
    case "play":
    case "playpause":
      if (state.playingState) pause();
      else play();
      return true;
    case "pause":
      pause();
      return true;
    case "stop":
      pause();
      return true;
    case "fwd":
    case "fastforward":
      seek(currentPosition + 10);
      return true;
    case "rev":
    case "rewind":
      seek(currentPosition - 10);
      return true;
    case "instantreplay":
      seek(currentPosition - 10);
      return true;
    default:
      return false;
  }
}

export function seek(seconds: number): void {
  if (!video) return;
  const target = typeof seconds === "number" && isFinite(seconds) && seconds > 0 ? seconds : 0;
  setProp(video, "seek", target);
}

export async function destroy(): Promise<void> {
  if (video) {
    // Clearing `control` starts a transaction, so the removal below is flushed.
    setProp(video, "control", "stop");
    if (parent) tmTransaction.removeNode(parent, video);
  }
  if (backdrop && parent) tmTransaction.removeNode(parent, backdrop);
  backdrop = null;
  activeSession = false;
  accept();
  video = null;
  content = null;
  parent = null;
  currentPosition = 0;
  currentDuration = 0;
  lastState = "none";
  state.playingState = false;
}

export function getCurrentTime(): number {
  return currentPosition;
}

export function getVideoDuration(): number {
  return currentDuration;
}

function toMmSs(seconds: number): string {
  if (typeof seconds !== "number" || !isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes + ":" + (rest < 10 ? "0" + rest : String(rest));
}

export function getTimeFormat(): string {
  return toMmSs(currentPosition) + " : " + toMmSs(currentDuration);
}

export default {
  init,
  load,
  play,
  pause,
  seek,
  handleMediaKey,
  getCurrentTime,
  getVideoDuration,
  getTimeFormat,
  state,
  destroy
};
