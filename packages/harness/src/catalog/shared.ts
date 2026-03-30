import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CapabilityOrigin } from "./types";

type FrontmatterValue = boolean | string;

interface ParsedDocument {
  path: string;
  source: string;
  body: string;
  metadata: Record<string, FrontmatterValue>;
}

export interface CapabilityEntry extends ParsedDocument {
  id: string;
  origin: CapabilityOrigin;
}

export function listCapabilityEntries(
  rootDir: string,
  filename: string,
  origin: CapabilityOrigin,
): CapabilityEntry[] {
  if (!existsSync(rootDir)) {
    return [];
  }

  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const filePath = join(rootDir, entry.name, filename);
      if (!existsSync(filePath)) {
        return null;
      }

      const source = readFileSync(filePath, "utf-8");
      const parsed = parseFrontmatter(source);

      return {
        id: entry.name,
        origin,
        path: filePath,
        source,
        body: parsed.body,
        metadata: parsed.metadata,
      };
    })
    .filter((entry): entry is CapabilityEntry => entry !== null);
}

export function sortCapabilityEntries<T extends { id: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const aName = "name" in a && typeof a.name === "string" ? a.name : a.id;
    const bName = "name" in b && typeof b.name === "string" ? b.name : b.id;
    return aName.localeCompare(bName);
  });
}

export function parseName(id: string, body: string, metadata: Record<string, FrontmatterValue>): string {
  const metadataName = metadata.name;
  if (typeof metadataName === "string" && metadataName.trim().length > 0) {
    return metadataName.trim();
  }

  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading;
  }

  return humanize(id);
}

export function parseDescription(
  body: string,
  metadata: Record<string, FrontmatterValue>,
  fallback = "Reusable capability definition.",
): string {
  const metadataDescription = metadata.description;
  if (typeof metadataDescription === "string" && metadataDescription.trim().length > 0) {
    return metadataDescription.trim();
  }

  const firstParagraph = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .filter((line) => !line.startsWith("---"))
    .find((line) => !line.includes(":") || line.startsWith("Use "));

  return firstParagraph ?? fallback;
}

export function parseBooleanMetadata(
  metadata: Record<string, FrontmatterValue>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = metadata[key];
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }

  return defaultValue;
}

export function parseStringMetadata(
  metadata: Record<string, FrontmatterValue>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseFrontmatter(source: string): { metadata: Record<string, FrontmatterValue>; body: string } {
  if (!source.startsWith("---\n")) {
    return { metadata: {}, body: source };
  }

  const closing = source.indexOf("\n---\n", 4);
  if (closing === -1) {
    return { metadata: {}, body: source };
  }

  const rawFrontmatter = source.slice(4, closing);
  const body = source.slice(closing + 5).replace(/^\n+/, "");
  const metadata: Record<string, FrontmatterValue> = {};

  for (const rawLine of rawFrontmatter.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf(":");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    metadata[key] = normalizeMetadataValue(value);
  }

  return { metadata, body };
}

function normalizeMetadataValue(value: string): FrontmatterValue {
  const unquoted = value.replace(/^['"]|['"]$/g, "").trim();
  if (unquoted.toLowerCase() === "true") return true;
  if (unquoted.toLowerCase() === "false") return false;
  return unquoted;
}

function humanize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
