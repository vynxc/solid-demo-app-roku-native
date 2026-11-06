import { createEffect, createSignal, For, Show } from "solid-js";
import { ElementNode } from "@solidtv/solid";
import { Poster } from "../components";
import { setGlobalBackground } from "../state";

const Loops = (props) => {
  const [allItems, setAllItems] = createSignal<any[]>([]);
  const [displayedItems, setDisplayedItems] = createSignal<any[]>([]);
  const [resetCounter, setResetCounter] = createSignal(1);
  const displaySize = 5;
  const bufferSize = 2; // Number of items to load ahead
  let currentIndex = 0,
    solidLogo;

  createEffect(() => {
    // Flatten all rows into a single array, add empty item for initial offscreen item
    const all = [{}, ...props.data.rows.map((row) => row.items()).flat()];
    setAllItems(all);
    setDisplayedItems(all.slice(0, displaySize + bufferSize));
  });

  function updateDisplayedItems() {
    const items = allItems();
    const start = Math.max(currentIndex, 0);
    const end = Math.min(currentIndex + displaySize + bufferSize, items.length);
    setDisplayedItems(items.slice(start, end));
  }

  function reset(_e, elm) {
    currentIndex = 0;
    setResetCounter((r) => r + 1);
    updateDisplayedItems();
    elm.children[1].setFocus();
    return true;
  }

  function shiftLeft(_e, elm) {
    if (currentIndex > 0) {
      currentIndex = Math.max(0, currentIndex - 1);
      elm.children[0].setFocus();
      updateDisplayedItems();
    }
    return true;
  }

  function shiftRight(_e, elm) {
    if (currentIndex < allItems().length - 1) {
      currentIndex = Math.min(allItems().length - 1, currentIndex + 1);
      elm.children[2].setFocus();
      updateDisplayedItems();
    }
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
      console.warn("Infinite animateOut failed", error);
    }
    return Promise.resolve();
  }

  function animateIn(node) {
    node.alpha = 0;
    node.y = -100;
    // onCreate runs before the node is committed; start on the next tick so
    // the native animator sees the final node. If the animation never starts,
    // the fallback below still makes the row visible.
    let controller = null;
    setTimeout(() => {
      try {
        controller = node.animate(
          { y: 55, alpha: 1 },
          { duration: 500, easing: "ease-in-out" }
        );
        controller.start();
      } catch (error) {
        console.warn("Infinite animateIn failed", error);
      }
    }, 0);
    setTimeout(() => {
      try { controller?.stop(); node.stopAnimations?.(); } catch (error) { /* already stopped */ }
      node.alpha = 1;
      node.y = 55;
    }, 800);
    return Promise.resolve();
  }

  setGlobalBackground("#000000");

  const titleRowStyles = {
    fontFamily: "Raleway",
    fontSize: 24,
    height: 32,
    lineHeight: 32
  };

  const withTransition = { x: { duration: 250 } };

  return (
    <>
      <view
        ref={solidLogo}
        width={300}
        height={150}
        x={162}
        y={80}
        zIndex={105}
      >
        <text x={80} fontSize={28} color={0xf6f6f699}>
          Built With:
        </text>
        <view y={32} src="./assets/solidWord.png" width={280} height={52} />
        <view x={0} y={110} src="./assets/tmdb.png" width={80} height={41} />
        <text
          x={90}
          y={110}
          contain="width"
          width={160}
          fontSize={12}
          color={0xf6f6f699}
        >
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </text>
      </view>

      <view x={160} y={300} height={300}>
        <text style={titleRowStyles}>Infinite Item List</text>
        <Show when={resetCounter()} keyed>
          <view
            autofocus={allItems()}
            onDestroy={animateOut}
            onCreate={animateIn}
            onFocus={(elm) => elm.children[1]?.setFocus()}
            onLeft={shiftLeft}
            onRight={shiftRight}
            onUp={reset}
            onDown={reset}
            y={55}
          >
            <For each={displayedItems()}>
              {(item, index) => {
                const isEdgeItem = () =>
                  index() === 0 || index() === displayedItems().length - 1;
                return (
                  <Poster
                    {...item}
                    x={index() * 210 - 210}
                    alpha={1}
                    transition={withTransition}
                  />
                );
              }}
            </For>
          </view>
        </Show>
      </view>
    </>
  );
};

export default Loops;
