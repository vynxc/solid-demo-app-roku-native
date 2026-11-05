import { Meta, StoryObj } from "storybook-solidjs-vite";
import { Badge } from "../ContentBlock";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  tags: ["!autodocs"]
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  render: () => <Badge>NEW</Badge>
};

export const Top: Story = {
  render: () => <Badge>TOP</Badge>
};

export const Hd: Story = {
  render: () => <Badge>HD</Badge>
};

export const DolbyVision: Story = {
  render: () => <Badge>DV</Badge>
};
