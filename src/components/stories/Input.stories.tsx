import { Meta, StoryObj } from "storybook-solidjs-vite";
import { Button } from "../../components";
import Input from "../Input";
import { createSignal } from "solid-js";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
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

export const WithPlaceholder: Story = {
  args: {
    ...WithFocus.args,
    placeholder: "Enter text here..."
  }
};

export const WithValue: Story = {
  render: () => {
    const valueSignal = createSignal("Hello World");
    const keyEvents = createSignal("");

    return <Input valueSignal={valueSignal} keyEvents={keyEvents} placeholder="Enter text here..." />;
  }
};

export const WithMask: Story = {
  render: () => {
    const valueSignal = createSignal("Hello World");
    const keyEvents = createSignal("");

    return <Input valueSignal={valueSignal} keyEvents={keyEvents} placeholder="Enter text here..." mask="x" password />;
  }
};

type Story = StoryObj<typeof Input>;
