/** Synthetic data for repeatable, explicitly labelled offline demo runs. */
const names = ['Ocean Signal', 'The Last Observatory', 'Northern Lights', 'Paper Planets', 'Quiet Orbit', 'Parallel Roads', 'Amber City', 'Open Horizon'];
const genres = [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }, { id: 35, name: 'Comedy' }, { id: 37, name: 'Western' }, { id: 16, name: 'Animation' }];

function title(id, type = 'movie') {
  return {
    id, media_type: type, title: `${names[(id - 1) % names.length]} ${id}`, name: `${names[(id - 1) % names.length]} ${id}`,
    original_title: names[(id - 1) % names.length], original_name: names[(id - 1) % names.length],
    overview: 'Synthetic offline demo content for native rendering, navigation, layout and resource tests. These records are not live TMDB results.',
    adult: false, poster_path: `/poster-${id}.png`, backdrop_path: `/backdrop-${id}.png`,
    release_date: '2026-01-01', first_air_date: '2025-01-01', last_air_date: '2026-01-01',
    runtime: 100, episode_run_time: [45], vote_average: 7.5, vote_count: 120,
    genres, status: 'Released', tagline: 'An offline SolidTV demonstration',
    number_of_seasons: 2, number_of_episodes: 12,
    production_companies: [], production_countries: [], spoken_languages: [],
    videos: { results: [] }, images: { backdrops: [], posters: [] }
  };
}

function person(id) {
  return { id, name: `Demo Person ${id}`, media_type: 'person', profile_path: `/person-${id}.png`, birthday: '1980-01-01', deathday: null, place_of_birth: 'Offline dataset', known_for_department: 'Acting', biography: 'A synthetic person used to exercise the native details and credits routes.', also_known_as: [], gender: 0 };
}

export function createFixtureApi({ fail = false, failImages = false } = {}) {
  return {
    async get(request) {
      if (fail) throw new Error('Injected offline API failure');
      const url = new URL(request, 'https://offline.invalid');
      const route = url.pathname;
      const id = Number(route.match(/\/(\d+)/)?.[1] || 1);
      const type = route.includes('/tv') ? 'tv' : 'movie';
      const page = Math.max(1, Number(url.searchParams.get('page') || 1));
      const results = Array.from({ length: 20 }, (_, n) => title((page - 1) * 20 + n + 1, type));
      if (route === '/configuration') return { images: { base_url: 'pkg:/assets/', secure_base_url: 'pkg:/assets/' } };
      if (route.startsWith('/genre/')) return { genres };
      if (route.endsWith('/combined_credits')) return { id, cast: results, crew: [] };
      if (route.endsWith('/credits')) return { id, cast: Array.from({ length: 12 }, (_, n) => person(n + 1)), crew: [] };
      if (route.endsWith('/videos')) return { id, results: [] };
      if (route.endsWith('/images')) return { id, backdrops: [], posters: [], profiles: [] };
      if (/^\/person\/\d+$/.test(route)) return person(id);
      if (/^\/(movie|tv)\/\d+$/.test(route)) return title(id, type);
      if (/^\/(trending|discover|search|movie|tv)/.test(route)) return { page, total_pages: 100, total_results: 2000, results };
      throw new Error(`Offline fixture has no endpoint: ${route}`);
    },
    imageUrl(image) {
      if (fail || failImages) return 'pkg:/assets/offline-missing.png';
      const text = String(image);
      const id = Number(text.match(/(\d+)/)?.[1] || 1);
      const kind = text.toLowerCase().includes('backdrop') ? 'backdrop' : 'poster';
      return `pkg:/assets/offline/${kind}-${id % 8}.png`;
    }
  };
}
