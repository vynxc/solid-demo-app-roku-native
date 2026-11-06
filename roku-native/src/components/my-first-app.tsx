import { defineAnchorNode } from '@roku-sdk/rsg-ts';
import { useLaunchConfig } from '@roku-sdk/rsg-ts/runtime';
import { KeyHandler } from '@roku-sdk/components';
import { createElement, setProp, insertNode, onMount, onCleanup } from '@roku-sdk/solid';
import { Config } from '@solidtv/solid';
import { createEffect } from 'solid-js';
import { SceneGraphRenderer } from '../roku/renderer';
import { installBrowserServices, dispatchNativeKey } from '../roku/browser-services';
import { loadBundledFonts } from '../roku/fonts';
import { handleMediaKey } from '../roku/video';
import { postRokuTask } from '../roku/worker-task';

// Replaced by the host build with the shared demo entry point. Keeping it as
// an identifier lets the host tsconfig stay scoped to this package while the
// bundler still resolves and compiles the shared app.
declare const SOLIDTV_SHARED_ENTRY: string;

// The focus manager calls preventDefault() only when this is enabled. The Roku
// KeyHandler uses the return value to decide whether the Scene should handle
// the key; without this an unhandled Back could never exit the channel.
Config.preventDefaultOnHandledKeys = true;

/**
 * Roku host for the shared SolidTV demo. The SceneGraph group is the app root;
 * the renderer builds the shared UI inside it. Browser APIs are shimmed before
 * the shared entry point is imported, and native fonts are measured up front so
 * the first flex pass has real text sizes.
 */
export default defineAnchorNode(
  {
    componentName: 'MyFirstApp',
    extends: 'Group' as const,
    inputFields: {},
    outputFields: {},
  },
  () => {
    const nativeRoot = createElement('group');
    (globalThis as any).__solidtvNativeRoot = nativeRoot;
    (globalThis as any).__SolidTVRokuRenderer = SceneGraphRenderer;

    // Test/deep-link navigation: {"contentId":"/examples"} from an ECP input
    // or launch parameter drives the shared hash router. No effect on normal
    // remote-driven use.
    const { launchParams } = useLaunchConfig<{ contentId?: string; workerTest?: string }>();
    createEffect(() => {
      const raw = launchParams()?.contentId;
      if (!raw) return;
      const value = String(raw);
      const route = value.charAt(0) === '#' ? value : '#/' + value.replace(/^\/+/, '');
      const g = globalThis as any;
      if (typeof g.__solidtvSetRoute === 'function') g.__solidtvSetRoute(route);
      else g.__solidtvInitialRoute = route;
    });

    // Device test hook: `workerTest=1` exercises the SceneGraph Task bridge
    // without adding a user-facing route. Normal launches never touch it.
    createEffect(() => {
      if (!launchParams()?.workerTest) return;
      const label = createElement('label');
      setProp(label, 'text', 'worker: pending');
      setProp(label, 'width', 500);
      setProp(label, 'height', 36);
      setProp(label, 'translation', [1400, 350]);
      setProp(label, 'color', '0xFFFFFFFF');
      insertNode(nativeRoot, label);
      postRokuTask<string>({ op: 'echo', value: 'worker-ok' }, { timeoutMs: 5000 }).result.then(
        (value) => setProp(label, 'text', 'worker: ' + String(value)),
        (error: any) => setProp(label, 'text', 'worker: error ' + String(error?.message || error)),
      );
    });

    onMount(async () => {
      console.log('SOLIDTV_DEMO onMount');
      installBrowserServices();
      try {
        // Start font publication in parallel with the shared app import. The
        // font-version reflow corrects any first-frame metrics; waiting for
        // all faces made the dev-channel launch much slower without changing
        // the final frame.
        const fontsTask = loadBundledFonts(nativeRoot);
        console.log('SOLIDTV_DEMO importing shared src/index.tsx');
        await import(SOLIDTV_SHARED_ENTRY);
        void fontsTask;
        console.log('SOLIDTV_DEMO shared app imported');

      } catch (error: any) {
        console.error('SOLIDTV_DEMO failure ' + String(error?.stack || error));
        const font = createElement('font');
        setProp(font, 'uri', 'pkg:/fonts/Roboto-Regular.ttf');
        setProp(font, 'size', 24);
        insertNode(nativeRoot, font);
        const label = createElement('label');
        setProp(label, 'font', font);
        setProp(label, 'text', String(error?.stack || error));
        setProp(label, 'width', 1800);
        setProp(label, 'height', 950);
        setProp(label, 'wrap', true);
        setProp(label, 'color', '0xFFFFFFFF');
        insertNode(nativeRoot, label);
      }
    });

    onCleanup(() => {
      const renderer = (globalThis as any).__rokuRenderer;
      if (renderer && typeof renderer.destroy === 'function') renderer.destroy();
      (globalThis as any).__rokuRenderer = undefined;
    });

    return (
      <KeyHandler
        handleAllKeys
        gainFocus
        onKeyEvent={({ key, press }: any) => {
          if (press && handleMediaKey(key)) return true;
          return dispatchNativeKey(key, press);
        }}
      >
        {nativeRoot as any}
      </KeyHandler>
    );
  },
);
