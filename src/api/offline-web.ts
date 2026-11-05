// Deterministic data source for the web side of the visual parity harness.
// Loaded only by Vite in `--mode offline`; normal dev/build uses src/api/index.
// The fixture module is shared with the native host so both renderers see the
// exact same titles, ids, images and dimensions.
// @ts-ignore -- plain ESM shared with the native host
import { createFixtureApi } from "../../roku-native/src/fixtures.mjs";

const api = createFixtureApi();
const toWebAsset = (url: unknown) => String(url).replace(/^pkg:\/assets\//, "/");

export const getImageUrl = (path: string | null | undefined, _size?: string) =>
  toWebAsset(api.imageUrl(path));

export const pickImageBaseUrl = () => "/";

const loadConfig = () => api.get("/configuration");

export default {
  get: (path: string) => api.get(path),
  loadConfig,
};
