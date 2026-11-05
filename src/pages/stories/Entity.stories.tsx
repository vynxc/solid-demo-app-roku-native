import { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { Router, Route } from "@solidjs/router";
import Entity from "../Entity";
import { FIXED_POSTERS } from "./utils";

const meta: Meta<typeof Entity> = {
  title: "Page/Entity",
  component: Entity,
  tags: ["!autodocs"]
};

export default meta;

type Story = StoryObj<typeof Entity>;

const createEntityPayload = (type: "movie" | "series", id: number) => {
  const [entity] = createSignal({
    id,
    type,
    backgroundImage: "/assets/ktx/image-8.ktx",
    heroContent: {
      title: type === "movie" ? "The Demo Movie" : "The Demo Series",
      description:
        "This is a mocked entity payload for Storybook. It validates hero content, actions, and horizontal rows without API calls.",
      badges: ["HD", "CC"],
      voteAverage: 8.4,
      voteCount: 3201,
      metaText: type === "movie" ? "2h 05min   07/14/2025" : "2022 - 2026"
    }
  });

  const [recommendations] = createSignal(FIXED_POSTERS);
  const [credits] = createSignal(FIXED_POSTERS);

  return { entity, recommendations, credits };
};

export const MovieEntity: Story = {
  render: () => {
    const data = createEntityPayload("movie", 101);

    return (
      <Router>
        <Route path="*all" component={() => <Entity data={data} />} />
      </Router>
    );
  }
};

export const TvEntity: Story = {
  render: () => {
    const data = createEntityPayload("series", 202);

    return (
      <Router>
        <Route path="*all" component={() => <Entity data={data} />} />
      </Router>
    );
  }
};
