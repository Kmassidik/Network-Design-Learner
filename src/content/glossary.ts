/*
 * One entry per term the interface uses. `short` is what a tooltip shows and
 * `body` is the panel text, so a term is explained once and referenced
 * everywhere else by its key.
 */

export interface GlossaryEntry {
  readonly term: string;
  readonly short: string;
  readonly body: string;
}

export const GLOSSARY = {
  ip: {
    term: 'IP address',
    short: 'The number that says where a device is, like a street address.',
    body: 'Every device on a network has one. When a program sends data, it names the destination by this address, and the network works out how to get there.',
  },
  'subnet-mask': {
    term: 'Subnet mask',
    short: 'Says which part of an address is the network and which part is the device.',
    body: 'Written as /24, which means the first 24 bits name the network and the last 8 name the device. Two addresses are neighbours when their network parts match.',
  },
  mac: {
    term: 'MAC address',
    short: 'The name burned into a network card. It never changes.',
    body: 'Deliveries on one cable are made to a MAC address, not an IP address. A card reads every frame it sees and keeps only the ones carrying its own MAC address.',
  },
  arp: {
    term: 'ARP',
    short: 'The question one device asks to find the card that owns an IP address.',
    body: 'A device knows an IP address but needs a MAC address to put on the frame, so it shouts "who has this address?" to the whole cable. The owner answers, and the answer is remembered.',
  },
  'arp-table': {
    term: 'ARP table',
    short: 'The list a device keeps of addresses it has already looked up.',
    body: 'Once a device has asked, it does not ask again. This is why the first message to a new destination is slower than the ones after it.',
  },
  icmp: {
    term: 'ICMP',
    short: 'The small message behind ping: "are you there?" and "yes".',
    body: 'A ping sends one ICMP message asking for an answer and measures how long the answer takes to come back.',
  },
  broadcast: {
    term: 'Broadcast',
    short: 'A frame addressed to everyone on the cable.',
    body: 'Written as ff:ff:ff:ff:ff:ff. Every card accepts it. ARP uses broadcasts because the device does not yet know who to address.',
  },
  'round-trip': {
    term: 'Round trip time',
    short: 'How long the answer took to come back, measured from the question.',
    body: 'The ping starts its stopwatch when the request leaves and stops it when the reply arrives. Nothing is estimated: the two times come from the simulation itself.',
  },
  subnet: {
    term: 'Subnet',
    short: 'A group of addresses that can reach each other without a router.',
    body: 'Two devices on the same subnet talk directly. Anything outside it needs a router, which is the next lesson.',
  },
  gateway: {
    term: 'Gateway',
    short: 'The address of the device that handles everything outside this network.',
    body: 'A device compares the destination with its own address and mask. If they are in the same network it delivers directly; if not, it hands the packet to its gateway and lets that device work it out. With no gateway set, anything outside the network has nowhere to go and the packet stops here.',
  },
  'mac-table': {
    term: 'MAC table',
    short: 'A switch\u2019s list of which address it has seen on which port.',
    body: 'A switch fills this in by watching the source address of every frame it carries. Until an address is in the table, frames for it have to be sent out of every port, because the switch has no idea which one leads there.',
  },
  'firewall-state': {
    term: 'Conversation',
    short: 'A request that went out, which the firewall then allows the answer to.',
    body: 'A firewall that keeps track of conversations can let an answer back in without opening a hole for everything. That is why a ping started inside works, while the same ping started outside is refused.',
  },
  port: {
    term: 'Port',
    short: 'A socket on a device, with a name, that a cable plugs into.',
    body: 'Each port has its own hardware address, and on a router or a firewall its own IP address as well. Naming ports is what lets a cable say what it is plugged into, and what lets a switch remember which device is on which one.',
  },
  'auto-mdix': {
    term: 'Ports that work the cable out by themselves',
    short: 'Straight through or crossover, sorted out by the port.',
    body: 'Two devices of the same sort, two computers or two switches, transmit on the same pair of wires, so a cable between them has to be a crossover. A computer and a switch are opposites, so a straight through cable is the one that works. A port that auto-detects accepts either, which is what nearly every port made this century does, and why the cable in the box almost never matters any more.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/**
 * Where to send a reader who wants the theory behind a correction. Kept in one
 * place, and deliberately few: a link nobody follows is worse than no link, so
 * these are the plainest explanations of each idea that exist.
 */
export const READ_MORE: Partial<Record<GlossaryKey, string>> = {
  'subnet-mask': 'https://en.wikipedia.org/wiki/Subnetwork',
  gateway: 'https://en.wikipedia.org/wiki/Default_gateway',
  arp: 'https://en.wikipedia.org/wiki/Address_Resolution_Protocol',
  'auto-mdix': 'https://en.wikipedia.org/wiki/Medium-dependent_interface',
  'firewall-state': 'https://en.wikipedia.org/wiki/Stateful_firewall',
  port: 'https://en.wikipedia.org/wiki/Port_(computer_networking)',
};
