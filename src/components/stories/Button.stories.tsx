import { Meta, StoryObj } from "storybook-solidjs-vite";
import { Button } from "../../components";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  tags: ["!autodocs"]
};
export default meta;

export const Default: Story = {
  args: {
    title: "Click Me"
  } as any
};

export const WithFocus: Story = {
  args: {
    ...Default.args,
    autofocus: true
  }
};

type Story = StoryObj<typeof Button>;
