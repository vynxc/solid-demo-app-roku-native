// Auto-generated TypeScript declarations for XML component import.
// DO NOT EDIT — this file is regenerated during build.
//
// Source component: WorkerTask
// Extends: Task

import type { INodeProps } from "@roku-sdk/components";
import type { TypedXmlComponent } from "@roku-sdk/interfaces";

interface WorkerTaskFields {
    request: Record<string, unknown>;
    response: Record<string, unknown>;
}

export interface IWorkerTaskProps extends INodeProps, Partial<WorkerTaskFields> {}

declare const _default: TypedXmlComponent<"WorkerTask", WorkerTaskFields>;
export default _default;

declare module "@roku-sdk/solid" {
    namespace JSX {
        interface IntrinsicElements {
            workerTask: IWorkerTaskProps;
        }
    }
}

declare module "@roku-sdk/solid/jsx-runtime" {
    namespace JSX {
        interface IntrinsicElements {
            workerTask: IWorkerTaskProps;
        }
    }
}

declare module "solid-js" {
    namespace JSX {
        interface IntrinsicElements {
            workerTask: IWorkerTaskProps;
        }
    }
}
