import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { BadRequestError, UnprocessableEntityError } from "../errors/AppError";

/** Hard cap on a fetched cover image. Matches the multer upload limit. */
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

const ipv4ToInt = (ip: string): number =>
  ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;

const IPV4_BLOCKED_RANGES: ReadonlyArray<[string, number]> = [
  ["0.0.0.0", 8], // "this host"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata at 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

const isBlockedIPv4 = (ip: string): boolean =>
  IPV4_BLOCKED_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
  });

const isBlockedIPv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase().split("%")[0] ?? "";
  if (normalized === "::" || normalized === "::1") return true; // unspecified, loopback
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true; // link-local
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique-local
  if (normalized.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:10.0.0.1) inherits the IPv4 rules.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped?.[1]) return isBlockedIPv4(mapped[1]);
  return false;
};

const isBlockedAddress = (ip: string): boolean =>
  isIP(ip) === 6 ? isBlockedIPv6(ip) : isBlockedIPv4(ip);

/**
 * Rejects URLs that resolve to an address inside the deployment's own network.
 *
 * Without this check, an authenticated user could use the cover-image importer
 * as a proxy to reach cloud metadata endpoints or internal services that trust
 * the server's network position.
 */
const assertPublicUrl = async (raw: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestError("URL must use http or https");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new BadRequestError("URL resolves to a non-public address");
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnprocessableEntityError(`Could not resolve host ${host}`);
  }

  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new BadRequestError("URL resolves to a non-public address");
  }

  return url;
};

/** Reads a response body, aborting as soon as it exceeds `MAX_BYTES`. */
const readCapped = async (response: Response): Promise<Buffer> => {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new UnprocessableEntityError("Image is larger than the 5 MB limit");
  }

  const body = response.body;
  if (!body) throw new UnprocessableEntityError("Response had no body");

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        throw new UnprocessableEntityError("Image is larger than the 5 MB limit");
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return Buffer.concat(chunks);
};

/**
 * Downloads an image from a user-supplied URL.
 *
 * Redirects are followed manually so every hop is re-validated — a public URL
 * that 302s to `169.254.169.254` would otherwise sail through the first check.
 */
export const fetchRemoteImage = async (raw: string): Promise<Buffer> => {
  let target = await assertPublicUrl(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "image/*" },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new UnprocessableEntityError("Redirect without a location header");
      }
      target = await assertPublicUrl(new URL(location, target).toString());
      continue;
    }

    if (!response.ok) {
      throw new UnprocessableEntityError(
        `Failed to fetch image: HTTP ${response.status}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw new UnprocessableEntityError("URL does not point to an image");
    }

    return readCapped(response);
  }

  throw new UnprocessableEntityError("Too many redirects");
};
