import { Meta, StoryObj } from "storybook-solidjs-vite";
import FlexGrow from "../FlexGrow";
import Gradients from "../Gradients";

const meta: Meta<typeof Gradients> = {
  title: "Page/Gradients",
  component: Gradients,
  tags: ["!autodocs"]
};

export default meta;

type Story = StoryObj<typeof Gradients>;

export const Default: Story = {};
