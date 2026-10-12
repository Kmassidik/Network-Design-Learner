/*
 * IPv4 helpers. An address is a plain number from 0 to 4294967295 here, and it
 * is turned back into dotted quad form only when someone has to read it.
 */

const DOTTED_QUAD = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const SPACE = 0x100000000; // 2^32, the number of addresses in the whole space

/** Returns the address as a number, or null when the text is not an address. */
export function parseIpv4(text: string): number | null {
  const match = DOTTED_QUAD.exec(text.trim());
  if (match === null) return null;
  let value = 0;
  for (const octet of match.slice(1, 5)) {
    const part = Number(octet);
    if (part > 255) return null;
    // Multiplication rather than a shift: shifting past bit 31 would turn the
    // top half of the address space negative.
    value = value * 256 + part;
  }
  return value;
}

export function formatIpv4(value: number): string {
  const v = value % SPACE;
  return [
    Math.floor(v / 0x1000000),
    Math.floor(v / 0x10000) % 256,
    Math.floor(v / 256) % 256,
    v % 256,
  ].join('.');
}

/** The address bits that identify the subnet, with the host bits cleared. */
export function maskFromPrefix(prefix: number): number {
  return prefix === 0 ? 0 : SPACE - 2 ** (32 - prefix);
}

export function networkAddress(ip: number, prefix: number): number {
  return Math.floor(ip / 2 ** (32 - prefix)) * 2 ** (32 - prefix);
}

/**
 * The last address in the subnet, which is the subnet's broadcast address.
 * For a /31 or a /32 there is no room for one, so this returns the address
 * itself; the UI only offers prefixes from 8 to 30 for that reason.
 */
export function broadcastAddress(ip: number, prefix: number): number {
  return (networkAddress(ip, prefix) + 2 ** (32 - prefix) - 1) % SPACE;
}

export function sameSubnet(a: number, b: number, prefix: number): boolean {
  return networkAddress(a, prefix) === networkAddress(b, prefix);
}

/** How many addresses in a subnet can be given to a device. */
export function hostCount(prefix: number): number {
  return Math.max(0, 2 ** (32 - prefix) - 2);
}

/** The lowest and highest prefix the interface offers. */
export const MIN_PREFIX = 8;
export const MAX_PREFIX = 30;

export function clampPrefix(prefix: number): number {
  if (!Number.isFinite(prefix)) return MIN_PREFIX;
  return Math.min(MAX_PREFIX, Math.max(MIN_PREFIX, Math.round(prefix)));
}
