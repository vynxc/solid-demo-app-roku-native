import { globalBackground } from "../state.js";
import {
  type IntrinsicNodeStyleProps, type AnimationSettings, hexColor } from "@solidtv/solid";
import { createEffect, on, onMount } from "solid-js";
import theme from "theme";

export default function Background() {
  const params = new URLSearchParams(window.location.search);
  const disableBG = params.get("disableBG") === "true";

  let bg1, bg2, heroMask;
  let active = 0;
  const alpha = 1;
  const animationSettings = {
    duration: 550,
    easing: "ease-in-out"
  } satisfies Partial<AnimationSettings>;
  const bgStyles = {
    alpha,
    color: 0xffffffff
  } satisfies IntrinsicNodeStyleProps;

  onMount(() => {
    if (disableBG) {
      heroMask.src = "";
      heroMask.colorLeft = "#000000";
      heroMask.colorRight = "#00000000";
      return;
    }
  });

  function changeBackgrounds(img: string | number) {
    if (disableBG) {
      heroMask.src = "";
      heroMask.colorLeft = "#000000";
      heroMask.colorRight = "#00000000";
      return;
    }

    if (typeof img !== "string") {
      bg1.color = img;
      bg1.src = "";
      bg1.alpha = 1;
      active = 1;
      bg2.alpha = 0;
      heroMask.alpha = 0;
      return;
    } else {
      bg1.color = 0xffffffff;
      heroMask.alpha = 1;
    }

    const currentBg = active === 1 ? bg2 : bg1;
    const nextBg = active === 1 ? bg1 : bg2;

    currentBg.src = img;
    if (active === 0) {
      // First time
      currentBg.alpha = 1;
    } else {
      currentBg.alpha = 0.01;
      currentBg.animate({ alpha: 1 }, animationSettings).start();
    }

    nextBg.animate({ alpha: 0.01 }, animationSettings).start();
    active = active === 1 ? 2 : 1;
  }

  // Run once with the current value as well as on changes. The native app
  // can resolve its first offline page before this component mounts; a
  // deferred-only listener then misses the initial backdrop and leaves the
  // white fallback visible for the rest of the session.
  createEffect(
    on(globalBackground, (img: string | number) => {
      // Ignore the initial empty signal: treating it as a crossfade source
      // leaves bg1 opaque white and starts the first real backdrop on bg2,
      // where a stalled/slow first-frame animation can hide it indefinitely.
      // The first real image is loaded directly into bg1 instead.
      if (img !== '' && img !== undefined && img !== null) changeBackgrounds(img);
    })
  );

  return (
    <>
      <view width={1920} height={1080} zIndex={-5}>
        <view ref={bg1} style={bgStyles} />
        <view ref={bg2} style={bgStyles} alpha={0} />
        <view
          ref={heroMask}
          src="./assets/hero-mask-inverted.png"
          color={0x000000ff}
          width={1920}
          height={1080}
        />
        {/* <view
          ref={heroMask}
          effects={{
            radialGradient: {
              colors: ["#000000FF", "#00000000", 0x000000ff],
              stops: [0, 0.4, 1.0],
              height: 720,
              width: 1920,
              pivot: [0.8, 0],
            },
          }}
        /> */}
      </view>
    </>
  );
}
