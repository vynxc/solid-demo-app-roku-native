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
          />
        )}
      </For>
    </view>
  );
};

export default Destroy;
