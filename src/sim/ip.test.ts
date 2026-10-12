import { describe, expect, it } from 'vitest';
import {
  broadcastAddress,
  clampPrefix,
  formatIpv4,
  hostCount,
  maskFromPrefix,
  networkAddress,
  parseIpv4,
  sameSubnet,
} from './ip';

/** Addresses are easier to read as text, so that is how they are written here. */
function at(text: string): number {
  const value = parseIpv4(text);
  if (value === null) throw new Error(`test wrote an address that does not parse: ${text}`);
  return value;
}

describe('reading addresses', () => {
  it('reads dotted quad form and refuses anything else', () => {
    expect(parseIpv4('192.168.1.1')).toBe(at('192.168.1.1'));
    expect(parseIpv4(' 10.0.0.255 ')).not.toBeNull();
    expect(parseIpv4('255.255.255.255')).not.toBeNull();
    expect(parseIpv4('256.0.0.1')).toBeNull();
    expect(parseIpv4('192.168.1')).toBeNull();
    expect(parseIpv4('192.168.1.1.1')).toBeNull();
    expect(parseIpv4('192.168.1.')).toBeNull();
    expect(parseIpv4('')).toBeNull();
  });

  it('prints an address back the way it was written', () => {
    expect(formatIpv4(at('192.168.1.130'))).toBe('192.168.1.130');
    expect(formatIpv4(at('0.0.0.0'))).toBe('0.0.0.0');
    expect(formatIpv4(at('255.255.255.255'))).toBe('255.255.255.255');
  });

  it('keeps the two halves of the space apart', () => {
    // The bottom half is the case a signed 32 bit shift would get wrong.
    expect(parseIpv4('255.255.255.255')).toBe(4294967295);
    expect(parseIpv4('128.0.0.0')).toBe(2147483648);
    expect(formatIpv4(2147483648)).toBe('128.0.0.0');
  });
});

describe('subnet arithmetic', () => {
  it('turns a mask length into a mask', () => {
    expect(maskFromPrefix(8)).toBe(at('255.0.0.0'));
    expect(maskFromPrefix(24)).toBe(at('255.255.255.0'));
    expect(maskFromPrefix(30)).toBe(at('255.255.255.252'));
    expect(maskFromPrefix(32)).toBe(at('255.255.255.255'));
    expect(maskFromPrefix(0)).toBe(0);
  });

  it('works out the subnet an address sits in', () => {
    expect(formatIpv4(networkAddress(at('192.168.1.130'), 25))).toBe('192.168.1.128');
    expect(formatIpv4(networkAddress(at('192.168.1.130'), 24))).toBe('192.168.1.0');
    expect(formatIpv4(networkAddress(at('10.1.2.3'), 8))).toBe('10.0.0.0');
  });

  it('works out the address that reaches everyone in the subnet', () => {
    expect(formatIpv4(broadcastAddress(at('192.168.1.130'), 25))).toBe('192.168.1.255');
    expect(formatIpv4(broadcastAddress(at('192.168.1.130'), 24))).toBe('192.168.1.255');
    expect(formatIpv4(broadcastAddress(at('10.1.2.3'), 8))).toBe('10.255.255.255');
  });

  it('says whether two addresses are neighbours', () => {
    expect(sameSubnet(at('192.168.1.1'), at('192.168.1.2'), 24)).toBe(true);
    expect(sameSubnet(at('192.168.1.1'), at('192.168.2.2'), 24)).toBe(false);
    // /16 pulls both of those into one subnet, which is the lesson.
    expect(sameSubnet(at('192.168.1.1'), at('192.168.2.2'), 16)).toBe(true);
    expect(sameSubnet(at('192.168.1.1'), at('192.168.1.130'), 25)).toBe(false);
  });

  it('counts the addresses a subnet can hand out', () => {
    expect(hostCount(24)).toBe(254);
    expect(hostCount(30)).toBe(2);
    expect(hostCount(16)).toBe(65534);
  });

  it('holds the mask length inside what the interface offers', () => {
    expect(clampPrefix(24)).toBe(24);
    expect(clampPrefix(2)).toBe(8);
    expect(clampPrefix(31)).toBe(30);
    expect(clampPrefix(Number.NaN)).toBe(8);
    expect(clampPrefix(23.6)).toBe(24);
  });
});
