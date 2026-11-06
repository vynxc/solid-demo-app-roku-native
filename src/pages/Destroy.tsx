import { createSignal, For, onMount } from "solid-js";

import { Hero } from "../components";
import { setGlobalBackground } from "../state";

const Destroy = (props) => {
  const [heroIndex, setHeroIndex] = createSignal(0);

  onMount(() => setGlobalBackground("#333"));

  function onDown() {
    if (heroIndex() >= 19) return false;
    setHeroIndex((p) => p + 1);
    return true;
  }

  function onUp() {
    if (heroIndex() === 0) return false;
    setHeroIndex((p) => p - 1);
    return true;
  }

  function animateOut(node) {
    try {
      const controller = node.animate(
        { y: 200, alpha: 0 },
        { duration: 500, easing: "ease-in-out" }
      );
      if (controller && controller.start) {
        return controller.start().waitUntilStopped();
      }
    } catch (error) {
      console.warn("Destroy animateOut failed", error);
    }
    return Promise.resolve();
  }

  function animateIn(node) {
    node.alpha = 0;
    node.y = -100;
    let controller = null;
    setTimeout(() => {
      try {
        controller = node.animate(
          { y: 0, alpha: 1 },
          { duration: 500, easing: "ease-in-out" }
        );
        controller.start();
      } catch (error) {
        console.warn("Destroy animateIn failed", error);
      }
    }, 0);
    setTimeout(() => {
      try { controller?.stop(); node.stopAnimations?.(); } catch (error) { /* already stopped */ }
      node.alpha = 1;
      node.y = 0;
    }, 800);
    return Promise.resolve();
  }

  return (
    <view x={300} y={200} onDown={onDown} onUp={onUp}>
      <view
        src={"assets/up.svg"}
        width={350}
        height={200}
        x={450}
        y={-200}
        rotation={Math.PI}
      />
      {/* For is reactive on the native runtime where a keyed Show on this
          preload resource is not; a one-item slice keeps the same keyed
          recreate semantics without relying on Show's resource path. */}
      <For each={props.data.heroRow.items()?.slice(heroIndex(), heroIndex() + 1)}>
        {(item) => (
          <Hero
            id="Hero"
            autofocus
            item={item}
            title={item.title}
            onDestroy={animateOut}
            onCreate={animateIn}
          />
        )}
      </For>
    </view>
  );
};

export default Destroy;
