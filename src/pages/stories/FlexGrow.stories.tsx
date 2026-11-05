import { Meta, StoryObj } from "storybook-solidjs-vite";
import FlexGrow from "../FlexGrow";

const meta: Meta<typeof FlexGrow> = {
  title: "Page/FlexGrow",
  component: FlexGrow,
  tags: ["!autodocs"]
};

export default meta;

type Story = StoryObj<typeof FlexGrow>;

export const Default: Story = {};

