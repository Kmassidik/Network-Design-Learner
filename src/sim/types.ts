/** Everything the palette can place. */
export type NodeKind = 'pc' | 'hub' | 'switch' | 'router' | 'firewall' | 'cloud';

/**
 * What a cable is made of, in the words a first year student meets. The kind is
 * not decoration: it decides how long a frame spends travelling, and which
 * devices can take it at all.
 */
export type Medium = 'utp' | 'fibre' | 'serial' | 'wireless';

export interface MediumSpec {
  /** What it is called when there is room for the whole name. */
  readonly label: string;
  /** The short name for a cable on the canvas. */
  readonly short: string;
  /** The plug on the end, which is how a student usually recognises it. */
  readonly connector: string;
  /** How a sentence refers to it: "asks out of eth0, over the copper cable". */
  readonly spoken: string;
  /** One-way travel time in ms, as this simulator models that medium. */
  readonly oneWayMs: number;
  /** One plain sentence: what it is, and when you would meet it. */
  readonly note: string;
}

export const MEDIUM: Record<Medium, MediumSpec> = {
  utp: {
    label: 'Copper twisted pair',
    short: 'Copper',
    connector: 'RJ45',
    spoken: 'over the copper cable',
    oneWayMs: 0.5,
    note: 'The ordinary network cable in a building, with the plug that clicks. Nearly every link in a small network is one of these.',
  },
  fibre: {
    label: 'Fibre optic',
    short: 'Fibre',
    connector: 'LC',
    spoken: 'over the fibre cable',
    oneWayMs: 2.5,
    note: 'Glass strand, used between buildings or across a city. The cable is fast and thin, but the equipment at each end costs more.',
  },
  serial: {
    label: 'Serial wide area link',
    short: 'Serial',
    connector: 'V.35',
    spoken: 'over the serial link',
    oneWayMs: 20,
    note: 'An older wide area link between two routers. Tens of milliseconds of travel time, which is why a distant site feels slow.',
  },
  wireless: {
    label: 'Wireless',
    short: 'Wi-Fi',
    connector: 'antenna',
    spoken: 'over the air',
    oneWayMs: 3,
    note: 'Radio. Everyone sharing the channel takes turns, so it is slower and less predictable than a cable.',
  },
};

export const MEDIUMS: readonly Medium[] = ['utp', 'fibre', 'serial', 'wireless'];

/**
 * How the pairs of wires inside a copper cable are joined. Two devices that
 * transmit on the same pair cannot hear each other, so which way round the
 * cable is wired decides whether it works at all.
 */
export type Wiring = 'straight' | 'crossover';

/** Whether a device behaves like an end station or like a switch, for the wiring rule. */
export type PortRole = 'end' | 'switchlike';

const PORT_ROLE: Record<NodeKind, PortRole> = {
  pc: 'end',
  router: 'end',
  firewall: 'end',
  cloud: 'end',
  hub: 'switchlike',
  switch: 'switchlike',
};

/** Which medium each kind of device has a socket for. */
const MEDIA_BY_KIND: Record<NodeKind, readonly Medium[]> = {
  pc: ['utp', 'wireless'],
  hub: ['utp'],
  switch: ['utp', 'fibre'],
  router: ['utp', 'fibre', 'serial'],
  firewall: ['utp', 'fibre'],
  cloud: ['utp', 'serial'],
};

/** The media both ends of a possible cable can take. */
export function sharedMediums(a: NodeKind, b: NodeKind): readonly Medium[] {
  return MEDIUMS.filter(
    (medium) => MEDIA_BY_KIND[a].includes(medium) && MEDIA_BY_KIND[b].includes(medium),
  );
}

export function supportsMedium(kind: NodeKind, medium: Medium): boolean {
  return MEDIA_BY_KIND[kind].includes(medium);
}

/**
 * Which way round a copper cable has to be wired between these two devices.
 * Two of the same sort, two computers or two switches, transmit on the same
 * pair, so they need a crossover. A computer and a switch are opposites, so a
 * straight through cable is the one that works.
 */
export function wiringFor(a: NodeKind, b: NodeKind): Wiring {
  return PORT_ROLE[a] === PORT_ROLE[b] ? 'crossover' : 'straight';
}

/**
 * Whether data actually gets across this cable. A cable has to fit both ports
 * before anything else, and copper is the only medium where the wiring matters,
 * and only when neither port can sort it out for itself: a port that
 * auto-detects accepts either cable, which is what every port made this century
 * does.
 */
export function linkCarries(link: SimLink, a: SimNode, b: SimNode): boolean {
  if (!supportsMedium(a.kind, link.medium) || !supportsMedium(b.kind, link.medium)) return false;
  if (link.medium !== 'utp') return true;
  if (a.config.autoMdix || b.config.autoMdix) return true;
  return link.wiring === wiringFor(a.kind, b.kind);
}

/**
 * What a device is configured with. Not every field applies to every kind, and
 * each one says which kinds read it.
 */
export interface NodeConfig {
  /** Interfaces, in order. The kind decides how many there are. */
  readonly ports: readonly Port[];
  /**
   * Where to send anything this device cannot reach directly. Read by a PC, a
   * router and a firewall. Empty means it has nowhere to send it, so the packet
   * stops there. For a router this is its default route.
   */
  readonly gateway: string;
  /**
   * Firewall only: the interface that faces the outside. Frames arriving there
   * are refused unless they answer something that went out first.
   */
  readonly outerPort: string;
  /**
   * Whether this device's ports work out straight through and crossover wiring
   * for themselves. Every port made this century does, so it starts on. Turn it
   * off to see the rule that used to bite.
   */
  readonly autoMdix: boolean;
}

/**
 * One interface on a device. A router has several, one per network it is
 * attached to, which is the whole reason it can join two of them together.
 */
export interface Port {
  /** The name printed on the device and beside the cable, e.g. "eth0". */
  readonly name: string;
  /** Address on this interface, dotted quad. Empty for a device that works below IP. */
  readonly ip: string;
  /** Mask length that goes with `ip`, in bits. */
  readonly prefix: number;
  /** Hardware address of this interface. */
  readonly mac: string;
}

export interface SimNode {
  readonly id: string;
  readonly kind: NodeKind;
  /** What the canvas prints under the device, e.g. "PC1". */
  readonly label: string;
  /** Canvas position in world units. The canvas pans and zooms over it. */
  readonly x: number;
  readonly y: number;
  readonly config: NodeConfig;
}

/** One end of a cable: a device and the interface it is plugged into. */
export interface LinkEnd {
  readonly node: string;
  readonly port: string;
}

export interface SimLink {
  readonly id: string;
  readonly a: LinkEnd;
  readonly b: LinkEnd;
  readonly medium: Medium;
  /** How a copper cable is wired. Ignored by every other medium. */
  readonly wiring: Wiring;
}

export interface Topology {
  readonly nodes: readonly SimNode[];
  readonly links: readonly SimLink[];
}

/** The address every interface listens to regardless of its own. */
export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';

/** The starting hop count of a frame. A router takes one off every time it forwards. */
export const DEFAULT_TTL = 64;

export type FrameKind = 'arp-request' | 'arp-reply' | 'echo-request' | 'echo-reply';

/** A frame as it looks on the wire. */
export interface Frame {
  readonly kind: FrameKind;
  readonly srcMac: string;
  readonly dstMac: string;
  readonly srcIp: string;
  readonly dstIp: string;
  /** Hops left before a router throws the frame away. */
  readonly ttl: number;
}

export type DropReason =
  /** This device has no path to that address at all. */
  | 'no-route'
  /** The address is outside every network here and no gateway is set. */
  | 'no-gateway'
  /** The interface it was sent out of has no cable in it. */
  | 'no-cable'
  /** The frame carries an address that is not this interface's. */
  | 'not-my-mac'
  /** A switch already knows that address on the port the frame came in on. */
  | 'same-port'
  /** Nobody answered the question about which interface owns an address. */
  | 'no-arp-reply'
  /** Forwarded too many times. */
  | 'ttl-expired'
  /** A firewall refused it. */
  | 'blocked'
  /** The cable is wired the wrong way round for the two devices it joins. */
  | 'wrong-wiring'
  /** The cable does not fit one of the ports it is plugged into. */
  | 'wrong-medium';

/**
 * One thing that happened, in the order it happened. The log renders these and
 * the canvas animates the `hop` entries, so the picture and the text cannot
 * disagree about what the network did.
 */
export type SimStep =
  | {
      readonly type: 'hop';
      /** Simulated time the frame left `from`, in ms since the ping started. */
      readonly timeMs: number;
      readonly from: string;
      readonly to: string;
      readonly linkId: string;
      /** The interface it left by, which is what makes a cable readable. */
      readonly port: string;
      readonly frame: FrameKind;
      /** The address the frame is aimed at, which is what a log line names. */
      readonly dstIp: string;
      /** The address the frame claims to come from. */
      readonly srcIp: string;
      /**
       * True when this device passed on a frame that was not its own, which is
       * what a hub and a switch do with a broadcast. Worth saying out loud: it
       * is the difference between asking and repeating.
       */
      readonly repeated: boolean;
      /** One-way travel time across the cable, in ms. */
      readonly travelMs: number;
      readonly medium: Medium;
    }
  | {
      readonly type: 'arp-cache';
      readonly timeMs: number;
      readonly nodeId: string;
      readonly ip: string;
      readonly mac: string;
      /** Whether the entry came out of a request or out of the reply to one. */
      readonly learnedFrom: 'request' | 'reply';
    }
  | {
      readonly type: 'mac-cache';
      readonly timeMs: number;
      readonly nodeId: string;
      readonly mac: string;
      readonly port: string;
    }
  | {
      readonly type: 'dropped';
      readonly timeMs: number;
      readonly nodeId: string;
      readonly reason: DropReason;
      readonly ip: string;
      readonly port?: string;
    }
  | {
      /** The internet cloud answered for an address that is not on the board. */
      readonly type: 'answered';
      readonly timeMs: number;
      readonly nodeId: string;
      readonly ip: string;
    }
  | {
      /**
       * The frame budget ran out, which means the wiring has a loop in it. A
       * loop at layer two is not something a TTL can stop, so it has to be
       * noticed from the outside.
       */
      readonly type: 'looped';
      readonly timeMs: number;
      readonly frames: number;
    };

export interface PingResult {
  readonly srcId: string;
  readonly targetIp: string;
  readonly steps: readonly SimStep[];
  /** When the ping request left the source. Null when it never left. */
  readonly requestSentMs: number | null;
  /** When the reply arrived back at the source. Null when it never did. */
  readonly replyArrivedMs: number | null;
  /** Round trip in ms, measured from request leaving to reply arriving. */
  readonly roundTripMs: number | null;
  /** What the user waited, including the address lookup the first ping needs. */
  readonly waitedMs: number;
}

/** The port a device uses when nothing else is said. */
export function portAt(config: NodeConfig, name: string): Port | null {
  return config.ports.find((port) => port.name === name) ?? null;
}

/** The first interface that has an address, which is where a device speaks from. */
export function primaryPort(config: NodeConfig): Port | null {
  return config.ports.find((port) => port.ip !== '') ?? config.ports[0] ?? null;
}

/** The interfaces with addresses. A switch has none, a router has one per network. */
export function addressedPorts(config: NodeConfig): readonly Port[] {
  return config.ports.filter((port) => port.ip !== '');
}
