import { Meta, StoryObj } from "storybook-solidjs-vite";
import { Poster, PosterTitle } from "../../components";

const meta: Meta<typeof Poster> = {
  title: "Components/Poster",
  component: Poster,
  tags: ["!autodocs"]
};
type Story = StoryObj<typeof Poster>;

export const Default: Story = {
  args: {
    item: {
      src: "/assets/ktx/image-1.ktx",
      shortTitle: "Sci-Fi Adventure",
      backdrop: "/assets/ktx/image-1.ktx",
      title: "The Cosmic Explorer"
    }
  } as any
};

export default meta;
