import { portsFor } from './kinds';
import type { Board } from './lesson';
import { device, link, withConfig, withLink, withPort } from './lesson-kit';
import type { SimLink, Wiring } from './types';

/*
 * The guided lessons. Each board is handed over with exactly one thing wrong,
 * and its `task` names the change that puts it right, so a reader can follow
 * the instruction, press Check, and watch the ping arrive. The matching board
 * in lessons-faults.ts is the same fault with the instruction taken away.
 *
 * A board is built the way the palette builds one: every device comes out of
 * the catalogue with `defaultConfig`, and only the addresses a lesson is
 * teaching about are set by hand with `portsFor`. Hardware addresses are never
 * written here, because they come out of `serial`, and `serial` is unique
 * within a board so that no two interfaces can share one.
 */

/**
 * One copper cable between two interfaces, by device id. Every board here is
 * written out as a literal, and joins two devices that transmit on the same
 * pair of wires, so a crossover cable is the wiring that works; auto-detection
 * is left on everywhere so the wiring never matters.
 */
function utp(
  id: string,
  a: readonly [string, string],
  b: readonly [string, string],
  wiring: Wiring = 'crossover',
): SimLink {
  return link(id, { node: a[0], port: a[1] }, { node: b[0], port: b[1] }, wiring);
}

/* Lesson one. The addresses are named once so the prose and the board cannot
 * drift apart: the fault text quotes the same two numbers the ports carry. */
const NEIGHBOURS_PC1 = '192.168.1.130';
const NEIGHBOURS_PC2 = '192.168.1.2';

/**
 * The mask, not the address, decides who is a neighbour. PC1 carries a /25 that
 * cuts 192.168.1.0 in half, and it sits on one side of the cut while PC2 sits
 * on the other, so PC1 never treats PC2 as somebody it can speak to directly.
 */
const MAKE_THEM_NEIGHBOURS: Board = {
  id: 'guided-make-them-neighbours',
  title: 'Make them neighbours',
  about:
    'Two computers on one cable that cannot reach each other, because one of the masks is too long to include them both.',
  task: `Change PC1\u2019s mask from /25 to /24 and leave its address at ${NEIGHBOURS_PC1}. Then press Check: the ping from PC1 to PC2 arrives.`,
  point:
    'The mask decides who is a neighbour, not how alike the addresses look. Two addresses in one network talk to each other directly, and a mask one bit too long puts the same two addresses in different networks.',
  topology: {
    nodes: [
      device('pc1', 'pc', 'PC1', 320, 260, 0, {
        ports: portsFor('pc', 0, [NEIGHBOURS_PC1], 25),
      }),
      device('pc2', 'pc', 'PC2', 760, 260, 1, {
        ports: portsFor('pc', 1, [NEIGHBOURS_PC2], 24),
      }),
    ],
    links: [utp('l1', ['pc1', 'eth0'], ['pc2', 'eth0'])],
  },
  goal: { from: 'pc1', to: 'pc2' },
  topic: 'subnet-mask',
  fault: `PC1 carries the mask /25, which splits 192.168.1.0 into 192.168.1.0 to 192.168.1.127 and 192.168.1.128 to 192.168.1.255. PC1 is at ${NEIGHBOURS_PC1}, in the upper half, and PC2 is at ${NEIGHBOURS_PC2}, in the lower half, so PC1 decides PC2 is on another network and never asks it for its hardware address.`,
  repair: (topology) => withPort(topology, 'pc1', 'eth0', { prefix: 24 }),
};

/* Lesson two: one network on the near side, another on the far side, and a
 * router already standing between them. */
const WAY_OUT_PC1 = '192.168.1.10';
const WAY_OUT_PC2 = '192.168.2.10';
const WAY_OUT_NEAR = '192.168.1.1';
const WAY_OUT_FAR = '192.168.2.1';

/**
 * A computer that has to reach a network it is not attached to. The router is
 * already there with an interface on each side; what is missing is the one
 * address PC1 has to hand anything it cannot deliver itself.
 */
const GIVE_IT_A_WAY_OUT: Board = {
  id: 'guided-give-it-a-way-out',
  title: 'Give it a way out',
  about:
    'A computer with no gateway that has to reach another network through a router that is already in place.',
  task: `Set PC1\u2019s gateway to ${WAY_OUT_NEAR}, the router interface on its own cable. Then press Check: the ping reaches the computer on the far network.`,
  point:
    'A device only knows the networks it is attached to. Anything outside them has to be handed to a gateway, and with that box empty there is nowhere for the packet to go, so the ping stops at the computer that sent it.',
  topology: {
    nodes: [
      device('pc1', 'pc', 'PC1', 260, 260, 0, {
        ports: portsFor('pc', 0, [WAY_OUT_PC1], 24),
      }),
      device('r1', 'router', 'R1', 560, 260, 1, {
        ports: portsFor('router', 1, [WAY_OUT_NEAR, WAY_OUT_FAR], 24),
      }),
      device('pc2', 'pc', 'PC2', 860, 260, 2, {
        ports: portsFor('pc', 2, [WAY_OUT_PC2], 24),
        gateway: WAY_OUT_FAR,
      }),
    ],
    links: [
      utp('l1', ['pc1', 'eth0'], ['r1', 'eth0']),
      utp('l2', ['r1', 'eth1'], ['pc2', 'eth0']),
    ],
  },
  goal: { from: 'pc1', to: 'pc2' },
  topic: 'gateway',
  fault: `PC1 has no gateway set. ${WAY_OUT_PC2} is outside 192.168.1.0/24, so PC1 works out that it cannot deliver the packet itself and then has nowhere to hand it on. The ping stops at PC1 and never reaches the router.`,
  repair: (topology) =>
    withConfig(topology, 'pc1', (config) => ({ ...config, gateway: WAY_OUT_NEAR })),
};

/* Lesson three: the oldest cable fault there is, with both ports unable to
 * sort it out for themselves. */
const CABLE_PC1 = '192.168.1.1';
const CABLE_PC2 = '192.168.1.2';

/**
 * Two computers of the same sort, a straight through cable, and no
 * auto-detection at either end. Both ends transmit on the same pair of wires,
 * so the cable joins transmit to transmit and nothing crosses it.
 */
const A_CABLE_BOTH_ENDS_CAN_USE: Board = {
  id: 'guided-a-cable-both-ends-can-use',
  title: 'A cable both ends can use',
  about:
    'Two computers joined by a straight through cable, with auto-detection turned off at both ends, so nothing crosses it.',
  task: 'Change the cable between the two computers from straight through to crossover. Then press Check: the ping arrives.',
  point:
    'Two devices of the same sort transmit on the same pair of wires. A straight through cable joins transmit to transmit, so neither computer hears the other and every frame dies on the cable.',
  topology: {
    nodes: [
      device('pc1', 'pc', 'PC1', 320, 260, 0, {
        ports: portsFor('pc', 0, [CABLE_PC1], 24),
        autoMdix: false,
      }),
      device('pc2', 'pc', 'PC2', 760, 260, 1, {
        ports: portsFor('pc', 1, [CABLE_PC2], 24),
        autoMdix: false,
      }),
    ],
    links: [utp('l1', ['pc1', 'eth0'], ['pc2', 'eth0'], 'straight')],
  },
  goal: { from: 'pc1', to: 'pc2' },
  topic: 'auto-mdix',
  fault:
    'The cable is straight through and both computers have auto-detection turned off. Two computers are the same sort of device, so they transmit on the same pair of wires and cannot hear each other. Nothing crosses this cable at all.',
  repair: (topology) => withLink(topology, 'l1', { wiring: 'crossover' }),
};

/* Lesson four: the same three devices as lesson six, with the firewall pointed
 * the wrong way instead of the computer missing its gateway. */
const OUTWARDS_PC = '192.168.1.10';
const OUTWARDS_INSIDE = '192.168.1.254';
const OUTWARDS_OUTSIDE = '203.0.113.1';
const OUTWARDS_CLOUD = '203.0.113.2';

/**
 * A firewall keeps a note of what goes out so that the answers may come back,
 * and it reads that note for frames arriving on the interface that faces the
 * outside. Point that setting at the inside port and frames from inside are
 * treated as uninvited arrivals.
 */
const POINT_THE_FIREWALL_OUTWARDS: Board = {
  id: 'guided-point-the-firewall-outwards',
  title: 'Point the firewall outwards',
  about:
    'A firewall whose outside interface is set to the port facing the inside, so traffic from the inside is treated as arriving from outside.',
  task: 'Change the firewall\u2019s outer interface from eth0 to eth1, the port the internet cloud is plugged into. Then press Check.',
  point:
    'A stateful firewall lets back in only the answers to conversations that started inside, and it tells which frames those are by the interface they arrive on. Point that setting at the inside port and every frame from the inside looks like something that arrived uninvited.',
  topology: {
    nodes: [
      device('pc1', 'pc', 'PC1', 260, 260, 0, {
        ports: portsFor('pc', 0, [OUTWARDS_PC], 24),
        gateway: OUTWARDS_INSIDE,
      }),
      device('fw1', 'firewall', 'FW1', 560, 260, 1, {
        ports: portsFor('firewall', 1, [OUTWARDS_INSIDE, OUTWARDS_OUTSIDE], 24),
        gateway: OUTWARDS_CLOUD,
        // The fault: eth0 faces the inside, so the outside port has to be eth1.
        outerPort: 'eth0',
      }),
      device('net1', 'cloud', 'Internet', 860, 260, 2, {
        ports: portsFor('cloud', 2, [OUTWARDS_CLOUD], 24),
      }),
    ],
    links: [
      utp('l1', ['pc1', 'eth0'], ['fw1', 'eth0']),
      utp('l2', ['fw1', 'eth1'], ['net1', 'eth0']),
    ],
  },
  goal: { from: 'pc1', to: 'net1' },
  topic: 'firewall-state',
  fault:
    'The firewall\u2019s outer interface is set to eth0, which is the port that faces the inside. A frame arriving from PC1 therefore counts as arriving from the outside, and nothing inside asked for it, so the firewall refuses it.',
  repair: (topology) =>
    withConfig(topology, 'fw1', (config) => ({ ...config, outerPort: 'eth1' })),
};

/* Lesson five: a router that is wired to the far network but has no address to
 * speak on it with. */
const NO_ADDRESS_PC1 = '192.168.1.10';
const NO_ADDRESS_PC2 = '192.168.2.10';
const NO_ADDRESS_NEAR = '192.168.1.1';
const NO_ADDRESS_FAR = '192.168.2.1';

/**
 * A router needs an address on every network it joins, because that address is
 * how it asks which device owns an address on that cable. With none on eth1 it
 * cannot even start on the far network, so the packet stops at the router.
 */
const AN_INTERFACE_WITH_NO_ADDRESS: Board = {
  id: 'guided-an-interface-with-no-address',
  title: 'An interface with no address',
  about:
    'A router joining two networks whose second interface has no address at all, so the far network cannot be reached.',
  task: `Give the router\u2019s eth1 the address ${NO_ADDRESS_FAR} with the mask /24. Then press Check: the ping crosses to the far network.`,
  point:
    'A router needs an address on every network it joins. With no address on eth1 the router cannot ask which device owns an address on that cable, so the second network is invisible to it.',
  topology: {
    nodes: [
      device('pc1', 'pc', 'PC1', 260, 260, 0, {
        ports: portsFor('pc', 0, [NO_ADDRESS_PC1], 24),
        gateway: NO_ADDRESS_NEAR,
      }),
      device('r1', 'router', 'R1', 560, 260, 1, {
        // eth1 is left without an address, which is the fault.
        ports: portsFor('router', 1, [NO_ADDRESS_NEAR], 24),
      }),
      device('pc2', 'pc', 'PC2', 860, 260, 2, {
        ports: portsFor('pc', 2, [NO_ADDRESS_PC2], 24),
        gateway: NO_ADDRESS_FAR,
      }),
    ],
    links: [
      utp('l1', ['pc1', 'eth0'], ['r1', 'eth0']),
      utp('l2', ['r1', 'eth1'], ['pc2', 'eth0']),
    ],
  },
  goal: { from: 'pc1', to: 'pc2' },
  topic: 'port',
  fault: `The router\u2019s eth1 has no address at all. R1 has an address on the 192.168.1.0/24 cable only, so when the packet for ${NO_ADDRESS_PC2} arrives it has no interface in that network to send it out of, and the packet stops at the router.`,
  repair: (topology) => withPort(topology, 'r1', 'eth1', { ip: NO_ADDRESS_FAR, prefix: 24 }),
};

/* Lesson six: everything a small site needs to reach the outside, with the one
 * address that makes it work left out. */
const INTERNET_PC = '192.168.1.1';
const INTERNET_INSIDE = '192.168.1.254';
const INTERNET_OUTSIDE = '203.0.113.1';
const INTERNET_CLOUD = '203.0.113.2';

/**
 * A computer, a firewall and the cloud that stands in for the internet. The
 * firewall is already set up correctly; PC1 has nothing to hand outside traffic
 * to, so the cloud may as well not be there. The cloud is the way this board
 * shows the outside world: it answers for any address that is not on the board.
 */
const REACH_THE_INTERNET: Board = {
  id: 'guided-reach-the-internet',
  title: 'Reach the internet',
  about:
    'A computer, a firewall and an internet cloud, where the computer has no gateway and so cannot reach anything outside its own network.',
  task: `Set PC1\u2019s gateway to ${INTERNET_INSIDE}, the firewall interface on its own cable. Then press Check: the ping reaches the cloud.`,
  point:
    'The cloud stands in for everything beyond your network: it answers for addresses that are not on the board at all. None of that is reachable without a gateway, because a computer knows only its own network and has nowhere else to look.',
  topology: {
    nodes: [
      device('pc1', 'pc', 'PC1', 260, 260, 0, {
        ports: portsFor('pc', 0, [INTERNET_PC], 24),
      }),
      device('fw1', 'firewall', 'FW1', 560, 260, 1, {
        ports: portsFor('firewall', 1, [INTERNET_INSIDE, INTERNET_OUTSIDE], 24),
        gateway: INTERNET_CLOUD,
        outerPort: 'eth1',
      }),
      device('net1', 'cloud', 'Internet', 860, 260, 2, {
        ports: portsFor('cloud', 2, [INTERNET_CLOUD], 24),
      }),
    ],
    links: [
      utp('l1', ['pc1', 'eth0'], ['fw1', 'eth0']),
      utp('l2', ['fw1', 'eth1'], ['net1', 'eth0']),
    ],
  },
  goal: { from: 'pc1', to: 'net1' },
  topic: 'gateway',
  fault: `PC1 has no gateway set. ${INTERNET_CLOUD} is outside 192.168.1.0/24, so PC1 has no way to hand the packet on and the ping stops at PC1 before it ever reaches the firewall.`,
  repair: (topology) =>
    withConfig(topology, 'pc1', (config) => ({ ...config, gateway: INTERNET_INSIDE })),
};

/**
 * Every guided board, in the order they are meant to be worked through: the
 * mask, the gateway, the cable, the firewall, the interface, and the way out to
 * the internet.
 */
export const GUIDED: readonly Board[] = [
  MAKE_THEM_NEIGHBOURS,
  GIVE_IT_A_WAY_OUT,
  A_CABLE_BOTH_ENDS_CAN_USE,
  POINT_THE_FIREWALL_OUTWARDS,
  AN_INTERFACE_WITH_NO_ADDRESS,
  REACH_THE_INTERNET,
];
