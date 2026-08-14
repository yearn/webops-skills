#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://artifacts.yearn.dev";
export const RETENTIONS = ["1d", "7d", "30d", "90d", "1y", "archive"] as const;
export type Retention = (typeof RETENTIONS)[number];

export type PostArtifactInput = {
  file: string;
  repository?: string;
  scanner?: string;
  ref?: string;
  commit?: string;
  name?: string;
  retention?: Retention;
  serviceUrl?: string;
  apiKey: string;
};

export type PostArtifactResult = { key: string; url: string };

export function buildHeaders(input: PostArtifactInput): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${input.apiKey}`,
    "content-type": "application/octet-stream"
  };
  const provenance: Record<string, string | undefined> = {
    "x-report-repository": input.repository,
    "x-report-scanner": input.scanner,
    "x-report-ref": input.ref,
    "x-report-commit": input.commit
  };
  for (const [header, value] of Object.entries(provenance)) {
    if (value) headers[header] = value;
  }
  return headers;
}

export function publishUrl(input: PostArtifactInput): string {
  const name = input.name || basename(input.file);
  const base = (input.serviceUrl || DEFAULT_URL).replace(/\/+$/, "");
  const prefix = input.retention && input.retention !== "30d" ? `/${input.retention}` : "";
  return `${base}${prefix}/${encodeURIComponent(name)}`;
}

export function parseRetention(value = "30d"): Retention {
  if (!RETENTIONS.includes(value as Retention)) {
    throw new Error(`invalid --retention: expected ${RETENTIONS.join(", ")}`);
  }
  return value as Retention;
}

export async function postArtifact(
  input: PostArtifactInput,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<PostArtifactResult> {
  const body = await readFile(input.file);
  const response = await (options.fetchImpl ?? fetch)(publishUrl(input), {
    method: "POST",
    headers: buildHeaders(input),
    body: new Uint8Array(body)
  });
  if (!response.ok) {
    throw new Error(`publish failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as PostArtifactResult;
}

export function parseArgs(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    parsed[key] = rawValue ?? argv[++i];
  }
  return parsed;
}

export function inputFromArgs(
  args: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env
): PostArtifactInput {
  if (!args.file) throw new Error("missing required --file");
  const apiKey = env.ARTIFACTS_API_KEY;
  if (!apiKey) throw new Error("missing ARTIFACTS_API_KEY");
  return {
    file: args.file,
    repository: args.repository,
    scanner: args.scanner,
    ref: args.ref,
    commit: args.commit,
    name: args.name,
    retention: parseRetention(args.retention),
    serviceUrl: args.url || env.ARTIFACTS_URL,
    apiKey
  };
}

async function main() {
  const result = await postArtifact(inputFromArgs(parseArgs(process.argv.slice(2))));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
