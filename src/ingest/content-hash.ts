import { createHash } from "node:crypto";

export function contentHash(xml: string): Buffer {
  return createHash("sha256").update(xml, "utf-8").digest();
}
