export const createRandomPoster = () => {
	const id = Math.floor(Math.random() * 26) + 1;
	const titleSeed = Math.floor(Math.random() * 10000);

	return {
		src: `/assets/ktx/image-${id}.ktx`,
		tileSrc: `/assets/ktx/image-${id}.ktx`,
		backdrop: `/assets/ktx/image-${id}.ktx`,
		href: `/entity/movie/${titleSeed}`,
		shortTitle: `Poster ${titleSeed}`,
		title: `Demo Title ${titleSeed}`,
		overview: `Demo overview for poster ${titleSeed}.`,
		item: { id: titleSeed, media_type: "movie" },
		entityInfo: {
			type: "movie",
			id: String(titleSeed)
		},
		heroContent: {
			title: `Demo Title ${titleSeed}`,
			description: `Demo overview for poster ${titleSeed}.`
		}
	};
};

export const createBrowseMockFetcher = (totalItems = 84, pageSize = 21) => {
	const items = Array.from({ length: totalItems }, () => createRandomPoster());

	return async (page: number) => {
		const start = Math.max(0, (page - 1) * pageSize);
		const end = start + pageSize;
		return items.slice(start, end);
	};
};

export const FIXED_POSTERS = [
  {
    src: "/assets/ktx/image-1.ktx",
    tileSrc: "/assets/ktx/image-1.ktx",
    backdrop: "/assets/ktx/image-1.ktx",
    href: "/entity/movie/1001",
    shortTitle: "Poster 1001",
    title: "Demo Title 1001",
    overview: "Demo overview for poster 1001.",
    item: { id: 1001, media_type: "movie" },
    entityInfo: { type: "movie", id: "1001" },
    heroContent: { title: "Demo Title 1001", description: "Demo overview for poster 1001." }
  },
  {
    src: "/assets/ktx/image-2.ktx",
    tileSrc: "/assets/ktx/image-2.ktx",
    backdrop: "/assets/ktx/image-2.ktx",
    href: "/entity/movie/1002",
    shortTitle: "Poster 1002",
    title: "Demo Title 1002",
    overview: "Demo overview for poster 1002.",
    item: { id: 1002, media_type: "movie" },
    entityInfo: { type: "movie", id: "1002" },
    heroContent: { title: "Demo Title 1002", description: "Demo overview for poster 1002." }
  },
  {
    src: "/assets/ktx/image-3.ktx",
    tileSrc: "/assets/ktx/image-3.ktx",
    backdrop: "/assets/ktx/image-3.ktx",
    href: "/entity/movie/1003",
    shortTitle: "Poster 1003",
    title: "Demo Title 1003",
    overview: "Demo overview for poster 1003.",
    item: { id: 1003, media_type: "movie" },
    entityInfo: { type: "movie", id: "1003" },
    heroContent: { title: "Demo Title 1003", description: "Demo overview for poster 1003." }
  },
  {
    src: "/assets/ktx/image-4.ktx",
    tileSrc: "/assets/ktx/image-4.ktx",
    backdrop: "/assets/ktx/image-4.ktx",
    href: "/entity/movie/1004",
    shortTitle: "Poster 1004",
    title: "Demo Title 1004",
    overview: "Demo overview for poster 1004.",
    item: { id: 1004, media_type: "movie" },
    entityInfo: { type: "movie", id: "1004" },
    heroContent: { title: "Demo Title 1004", description: "Demo overview for poster 1004." }
  },
  {
    src: "/assets/ktx/image-5.ktx",
    tileSrc: "/assets/ktx/image-5.ktx",
    backdrop: "/assets/ktx/image-5.ktx",
    href: "/entity/movie/1005",
    shortTitle: "Poster 1005",
    title: "Demo Title 1005",
    overview: "Demo overview for poster 1005.",
    item: { id: 1005, media_type: "movie" },
    entityInfo: { type: "movie", id: "1005" },
    heroContent: { title: "Demo Title 1005", description: "Demo overview for poster 1005." }
  },
  {
    src: "/assets/ktx/image-6.ktx",
    tileSrc: "/assets/ktx/image-6.ktx",
    backdrop: "/assets/ktx/image-6.ktx",
    href: "/entity/movie/1006",
    shortTitle: "Poster 1006",
    title: "Demo Title 1006",
    overview: "Demo overview for poster 1006.",
    item: { id: 1006, media_type: "movie" },
    entityInfo: { type: "movie", id: "1006" },
    heroContent: { title: "Demo Title 1006", description: "Demo overview for poster 1006." }
  },
  {
    src: "/assets/ktx/image-7.ktx",
    tileSrc: "/assets/ktx/image-7.ktx",
    backdrop: "/assets/ktx/image-7.ktx",
    href: "/entity/movie/1007",
    shortTitle: "Poster 1007",
    title: "Demo Title 1007",
    overview: "Demo overview for poster 1007.",
    item: { id: 1007, media_type: "movie" },
    entityInfo: { type: "movie", id: "1007" },
    heroContent: { title: "Demo Title 1007", description: "Demo overview for poster 1007." }
  }
];
