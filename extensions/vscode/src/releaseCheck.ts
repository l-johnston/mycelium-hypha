export interface ReleaseCheck {
  installedTags: string[];
  defaultTag: string | null;
  availableOnline: string[];
}

export function availableReleases(releaseTags: string[], pilotTags: string[]): string[] {
  const pilot = new Set(pilotTags);
  return [...new Set(releaseTags.filter((tag) => releasePattern.test(tag) && pilot.has(tag)))]
    .sort((left, right) => compareReleaseTags(right, left));
}

export function findChecksum(releaseBody: string, assetName: string): string | null {
  const escapedName = assetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\`${escapedName}\`\\s*\\|\\s*([0-9a-fA-F]{64})`).exec(releaseBody);
  return match?.[1]?.toLowerCase() ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const releasePattern = /^[0-9]{4}-[0-9]{2}(?:\.[0-9]+)?$/;

function compareReleaseTags(left: string, right: string): number {
  const leftParts = releaseParts(left);
  const rightParts = releaseParts(right);

  return leftParts.year - rightParts.year ||
    leftParts.month - rightParts.month ||
    (leftParts.point < rightParts.point ? -1 : leftParts.point > rightParts.point ? 1 : 0);
}

function releaseParts(tag: string): { year: number; month: number; point: bigint } {
  const [year, month, point = "0"] = tag.split(/[-.]/);
  return { year: Number(year), month: Number(month), point: BigInt(point) };
}
