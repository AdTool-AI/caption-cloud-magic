import type { IncomingHttpHeaders, Server } from 'node:http';
import type { Buffer } from 'node:buffer';

export const LOCAL_FRONTEND: 'http://127.0.0.1:5173';
export const LOCAL_API: 'http://127.0.0.1:4174';
export const AWS_API: 'https://api-prod.useadtool.ai';

export interface AwsProxyResponse {
  status: number | undefined;
  headers: IncomingHttpHeaders;
  body: Buffer;
}
export type AwsProxyUpstream = (
  path: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer,
) => Promise<AwsProxyResponse>;

export const awsRequest: AwsProxyUpstream;
export function createAwsLocalProxy(options: {
  allow: (path: string, method: string, headers: IncomingHttpHeaders) => unknown | Promise<unknown>;
  upstream?: AwsProxyUpstream;
}): Server;
