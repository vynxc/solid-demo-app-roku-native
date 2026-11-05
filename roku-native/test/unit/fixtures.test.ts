import { describe, expect, it } from "vitest";
import { createFixtureApi } from "../../src/fixtures.mjs";

describe("offline fixture API", () => {
  it("serves a configuration with an asset base", async () => {
    const api = createFixtureApi();
    const config = await api.get("/configuration");
    expect(config.images.base_url).toBe("pkg:/assets/");
    expect(config.images.secure_base_url).toBe("pkg:/assets/");
  });

  it("paginates deterministic results", async () => {
    const api = createFixtureApi();
    const first = await api.get("/movie/popular?page=1");
    const second = await api.get("/movie/popular?page=2");
    expect(first.results).toHaveLength(20);
    expect(first.total_pages).toBe(100);
    expect(first.results[0].id).toBe(1);
    expect(second.results[0].id).toBe(21);
    expect(first.results[0].id).not.toBe(second.results[0].id);
  });

  it("returns movie, tv and person details", async () => {
    const api = createFixtureApi();
    const movie = await api.get("/movie/1");
    expect(movie.title).toBe("Ocean Signal 1");
    expect(movie.media_type).toBe("movie");
    const tv = await api.get("/tv/2");
    expect(tv.name).toBe("The Last Observatory 2");
    expect(tv.media_type).toBe("tv");
    const person = await api.get("/person/1");
    expect(person.name).toBe("Demo Person 1");
    expect(person.media_type).toBe("person");
  });

  it("serves credits, combined credits, videos, images and genres", async () => {
    const api = createFixtureApi();
    const credits = await api.get("/movie/1/credits");
    expect(credits.cast).toHaveLength(12);
    const combined = await api.get("/person/1/combined_credits");
    expect(combined.cast).toHaveLength(20);
    const videos = await api.get("/movie/1/videos");
    expect(videos.results).toEqual([]);
    const images = await api.get("/movie/1/images");
    expect(images.backdrops).toEqual([]);
    const genres = await api.get("/genre/movie/list");
    expect(genres.genres.length).toBeGreaterThan(0);
  });

  it("maps poster/backdrop paths to stable asset files", () => {
    const api = createFixtureApi();
    expect(api.imageUrl("/poster-3.png")).toBe("pkg:/assets/offline/poster-3.png");
    expect(api.imageUrl("/backdrop-7.png")).toBe("pkg:/assets/offline/backdrop-7.png");
    expect(api.imageUrl("/backdrop-8.png")).toBe("pkg:/assets/offline/backdrop-0.png");
    expect(api.imageUrl(null)).toBe("pkg:/assets/offline/poster-1.png");
  });

  it("injects API and image failures for error-state tests", async () => {
    const api = createFixtureApi({ fail: true });
    await expect(api.get("/movie/1")).rejects.toThrow("Injected offline API failure");
    expect(api.imageUrl("/poster-1.png")).toBe("pkg:/assets/offline-missing.png");

    const images = createFixtureApi({ failImages: true });
    expect(images.imageUrl("/poster-1.png")).toBe("pkg:/assets/offline-missing.png");
  });

  it("rejects unknown endpoints instead of returning empty data", async () => {
    const api = createFixtureApi();
    await expect(api.get("/not-a-tmdb-endpoint")).rejects.toThrow("Offline fixture has no endpoint");
  });
});
