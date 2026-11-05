import { Meta, StoryObj } from "storybook-solidjs-vite";
import FlexGrow from "../FlexGrow";
import Gradients from "../Gradients";
import LayoutPage from "../Layout";

const meta: Meta<typeof LayoutPage> = {
  title: "Page/Layout",
  component: LayoutPage,
  tags: ["!autodocs"]
};

export default meta;

type Story = StoryObj<typeof LayoutPage>;

export const Default: Story = {};
