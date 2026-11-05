export interface FixtureApi {
  get(request: string): Promise<any>;
  imageUrl(path: any, size?: string): string;
  loadConfig?(): Promise<any>;
  [key: string]: any;
}

export function createFixtureApi(options?: { fail?: boolean; failImages?: boolean }): FixtureApi;
