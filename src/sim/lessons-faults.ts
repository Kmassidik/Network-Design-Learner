import { portsFor } from './kinds';
import type { Board } from './lesson';
import {
  cable,
  device,
  withLink as recabled,
  withPatch as reconfigured,
  withPort as reinterfaced,
  withoutLink as uncabled,
} from './lesson-kit';
import type { Topology } from './types';

/*
 * Boards that are handed over broken. A reader gets the symptom and nothing
 * else: the task says what to do, never what is wrong.
 *
 * Every board carries the one change that puts it right, written as code. That
 * is not decoration: it is what lets a test prove the board has exactly one
 * fault, by running the goal before the repair and after it.
 *
 * The builders come from lesson-kit, so a board here and the matching board in
 * lessons-guided.ts are built the same way. They are named as they read best in
 * this file: a device reconfigured, an interface reinterfaced, a cable recabled
 * or taken out.
 */

/**
 * Two computers on different networks, the router that joins them, and one
 * address that nobody holds. PC1's gateway is 192.168.1.54, which is on PC1's
 * cable but belongs to no device, so the question "who owns this address?" is
 * asked and nobody can answer. The router is at 192.168.1.1.
 */
function gatewayNobodyOwns(): Topology {
  const pc1 = device('pc1', 'pc', 'PC1', 300, 240, 0, {
    ports: portsFor('pc', 0, ['192.168.1.2'], 24),
    gateway: '192.168.1.54',
  });
  const r1 = device('r1', 'router', 'R1', 700, 240, 1, {
    ports: portsFor('router', 1, ['192.168.1.1', '192.168.2.1'], 24),
  });
  const pc2 = device('pc2', 'pc', 'PC2', 1100, 240, 2, {
    ports: portsFor('pc', 2, ['192.168.2.2'], 24),
    gateway: '192.168.2.1',
  });
  return {
    nodes: [pc1, r1, pc2],
    links: [cable('l1', pc1, 'eth0', r1, 'eth0'), cable('l2', r1, 'eth1', pc2, 'eth0')],
  };
}

/**
 * Two computers joined by a serial link. A serial link is a wide area cable
 * that only routers can take, so neither computer has a socket for it and not
 * one frame crosses. The addresses are fine; the cable is not.
 */
function cableOneEndHasNoSocketFor(): Topology {
  const pc1 = device('pc1', 'pc', 'PC1', 340, 240, 0, {
    ports: portsFor('pc', 0, ['192.168.1.1'], 24),
  });
  const pc2 = device('pc2', 'pc', 'PC2', 760, 240, 1, {
    ports: portsFor('pc', 1, ['192.168.1.2'], 24),
  });
  return { nodes: [pc1, pc2], links: [cable('l1', pc1, 'eth0', pc2, 'eth0', 'serial')] };
}

/**
 * Two hubs joined to each other twice, with a computer on one and the internet
 * uplink on the other. A hub repeats whatever it hears out of every other port,
 * so the two cables make a circle and every frame goes round it for ever.
 * Nothing at layer two can count the laps and stop it, so the run ends when the
 * frame count passes its safety limit, and the ping never gets across the
 * sluggish wide area link to the cloud. One of the two cables between the hubs
 * has to go.
 */
function loopBetweenTwoHubs(): Topology {
  const pc1 = device('pc1', 'pc', 'PC1', 220, 200, 0, {
    ports: portsFor('pc', 0, ['192.168.1.10'], 24),
    gateway: '192.168.1.1',
  });
  const hub1 = device('hub1', 'hub', 'HUB1', 600, 200, 1);
  const hub2 = device('hub2', 'hub', 'HUB2', 600, 460, 2);
  const r1 = device('r1', 'router', 'R1', 980, 460, 3, {
    ports: portsFor('router', 3, ['192.168.1.1', '203.0.113.1'], 24),
  });
  const net = device('net', 'cloud', 'NET', 1360, 460, 4, {
    ports: portsFor('cloud', 4, ['203.0.113.2'], 24),
  });
  return {
    nodes: [pc1, hub1, hub2, r1, net],
    links: [
      cable('l1', pc1, 'eth0', hub1, 'eth0'),
      cable('l2', hub1, 'eth1', hub2, 'eth1'),
      // The second cable between the two hubs. Together with l2 it closes the
      // circle, which is the whole fault.
      cable('l3', hub1, 'eth2', hub2, 'eth2'),
      cable('l4', hub2, 'eth0', r1, 'eth0'),
      cable('l5', r1, 'eth1', net, 'eth0', 'serial'),
    ],
  };
}

/**
 * Two computers on one cable whose masks are too long for the pair of
 * addresses. A /26 carves that cable into 192.168.1.0/26 and 192.168.1.64/26,
 * and the two addresses fall on either side of the boundary, so each computer
 * decides the other one is somewhere else. Neither has a gateway, so the packet
 * has nowhere to be handed to and the ping never leaves PC1.
 */
function maskTooLong(): Topology {
  const pc1 = device('pc1', 'pc', 'PC1', 340, 240, 0, {
    ports: portsFor('pc', 0, ['192.168.1.10'], 26),
  });
  const pc2 = device('pc2', 'pc', 'PC2', 760, 240, 1, {
    ports: portsFor('pc', 1, ['192.168.1.70'], 26),
  });
  return { nodes: [pc1, pc2], links: [cable('l1', pc1, 'eth0', pc2, 'eth0')] };
}

/**
 * Two networks with a router at each end, and the first router's default route
 * pointed at an address that is on none of its own networks. R1 holds
 * 192.168.1.1 towards PC1 and 192.168.2.1 towards R2, but its gateway is
 * 192.168.4.1. It cannot reach that address and it has no other idea where to
 * send the packet, so it drops it and reports no route. R1's gateway should be
 * 192.168.2.2, the second router on its own cable.
 */
function routerPointedTheWrongWay(): Topology {
  const pc1 = device('pc1', 'pc', 'PC1', 240, 240, 0, {
    ports: portsFor('pc', 0, ['192.168.1.2'], 24),
    gateway: '192.168.1.1',
  });
  const r1 = device('r1', 'router', 'R1', 620, 240, 1, {
    ports: portsFor('router', 1, ['192.168.1.1', '192.168.2.1'], 24),
    gateway: '192.168.4.1',
  });
  const r2 = device('r2', 'router', 'R2', 1000, 240, 2, {
    ports: portsFor('router', 2, ['192.168.2.2', '192.168.3.1'], 24),
    gateway: '192.168.2.1',
  });
  const pc2 = device('pc2', 'pc', 'PC2', 1380, 240, 3, {
    ports: portsFor('pc', 3, ['192.168.3.2'], 24),
    gateway: '192.168.3.1',
  });
  return {
    nodes: [pc1, r1, r2, pc2],
    links: [
      cable('l1', pc1, 'eth0', r1, 'eth0'),
      cable('l2', r1, 'eth1', r2, 'eth0'),
      cable('l3', r2, 'eth1', pc2, 'eth0'),
    ],
  };
}

/**
 * A firewall with its interfaces described the wrong way round. `outerPort`
 * says which interface faces the outside, and it is set to eth0, which is the
 * one facing PC1 on the inside. Every frame arriving from the inside is then
 * treated as arriving from the outside and refused, so a ping that started on
 * the inside never gets out. It should be eth1, the interface facing the
 * internet.
 */
function firewallFacingTheWrongWay(): Topology {
  const pc1 = device('pc1', 'pc', 'PC1', 280, 240, 0, {
    ports: portsFor('pc', 0, ['192.168.1.2'], 24),
    gateway: '192.168.1.254',
  });
  const fw = device('fw', 'firewall', 'FW', 680, 240, 1, {
    ports: portsFor('firewall', 1, ['192.168.1.254', '203.0.113.1'], 24),
    gateway: '203.0.113.2',
    outerPort: 'eth0',
  });
  const net = device('net', 'cloud', 'NET', 1080, 240, 2, {
    ports: portsFor('cloud', 2, ['203.0.113.2'], 24),
  });
  return {
    nodes: [pc1, fw, net],
    links: [cable('l1', pc1, 'eth0', fw, 'eth0'), cable('l2', fw, 'eth1', net, 'eth0')],
  };
}

const GATEWAY_NOBODY_OWNS: Board = {
  id: 'fault-gateway-nobody-owns',
  title: 'A gateway nobody owns',
  about:
    'PC1 and PC2 sit on different networks with a router between them, and the ping from PC1 is never answered.',
  task: 'Ping PC2 from PC1. It times out. Watch what PC1 does before it gives up, and find out what is missing on the board.',
  point:
    'A gateway has to be an address some device really holds on your own cable. If nobody answers when the computer asks who owns it, the packet has nowhere to go and the ping runs out of patience.',
  topic: 'gateway',
  topology: gatewayNobodyOwns(),
  goal: { from: 'pc1', to: 'pc2' },
  fault:
    'PC1\u2019s gateway is 192.168.1.54, and no device on that cable holds 192.168.1.54. PC1 asks who owns it, nobody answers, and the ping dies waiting. The router at 192.168.1.1, the address of the interface facing PC1, is the gateway it should have.',
  repair: (topology) => reconfigured(topology, 'pc1', { gateway: '192.168.1.1' }),
};

const CABLE_ONE_END_HAS_NO_SOCKET_FOR: Board = {
  id: 'fault-cable-one-end-has-no-socket-for',
  title: 'A cable one end has no socket for',
  about: 'Two computers joined by a serial link, a kind of cable neither of them can take.',
  task: 'Ping PC2 from PC1. Nothing arrives at all, so work out which part of this board can never work.',
  point:
    'A cable has to fit the socket at both ends. A serial link is built for routers, so two computers joined by one cannot exchange a single frame, however sensible their addresses are.',
  topic: 'port',
  topology: cableOneEndHasNoSocketFor(),
  goal: { from: 'pc1', to: 'pc2' },
  fault:
    'The two computers are joined by a serial link. Only a router has a socket for one, so the cable fits neither end, and not one frame crosses it.',
  repair: (topology) => recabled(topology, 'l1', { medium: 'utp' }),
};

const LOOP_BETWEEN_TWO_HUBS: Board = {
  id: 'fault-loop-between-two-hubs',
  title: 'A circle between two hubs',
  about: 'Two hubs joined by two cables, with a computer and an internet uplink hanging off them.',
  task: 'Ping the cloud at 203.0.113.2 from PC1. The reply never arrives and the run gives up. Watch the frames on the canvas and find out what keeps them moving.',
  point:
    'A hub repeats every frame out of every other port, so two cables between the same two hubs make a circle and each frame is put back into it for ever. Nothing at layer two counts the laps, so the flood is only stopped by taking away one of the cables that closes the circle.',
  topic: 'broadcast',
  topology: loopBetweenTwoHubs(),
  goal: { from: 'pc1', to: 'net' },
  fault:
    'HUB1 and HUB2 are joined by two cables as well as to the computer and the uplink, which makes a circle between them. Each hub repeats every frame out of every other port, so the frames go round the circle for ever and the run stops when the frame count passes its safety limit, before the ping can cross the internet link. One of the two cables between the hubs has to go.',
  repair: (topology) => uncabled(topology, 'l3'),
};

const MASK_TOO_LONG: Board = {
  id: 'fault-mask-too-long',
  title: 'A mask too long for the cable',
  about: 'Two computers on one cable whose masks each say the other one is somewhere else.',
  task: 'Ping PC2 from PC1. The ping never leaves PC1. Work out which setting on the two computers is keeping the packet where it is.',
  point:
    'The mask is what tells a computer which addresses are neighbours. A mask that is too long puts a real neighbour outside your own network, and with no gateway there is nowhere else to send the packet.',
  topic: 'subnet-mask',
  topology: maskTooLong(),
  goal: { from: 'pc1', to: 'pc2' },
  fault:
    'Both interfaces use a /26 mask, which cuts that one cable into two networks: 192.168.1.0/26 around PC1 and 192.168.1.64/26 around PC2. Each computer puts the other one outside its own network, and neither has a gateway, so PC1 refuses to send the packet at all. Widening PC1\u2019s mask to /24 puts both addresses in one network.',
  repair: (topology) => reinterfaced(topology, 'pc1', 'eth0', { prefix: 24 }),
};

const ROUTER_POINTED_THE_WRONG_WAY: Board = {
  id: 'fault-router-pointed-the-wrong-way',
  title: 'A router pointed the wrong way',
  about:
    'Two networks with a router at each end, and a ping from PC1 that stops at the first router it meets.',
  task: 'Ping PC2 from PC1. The reply never comes. Follow the packet as far as it gets, then find the setting that stops it there.',
  point:
    'A default route has to name an address on one of the router\u2019s own networks, held by a device that knows the way further on. A gateway that is on none of those networks leaves the router with nothing to do with the packet but drop it.',
  topic: 'gateway',
  topology: routerPointedTheWrongWay(),
  goal: { from: 'pc1', to: 'pc2' },
  fault:
    'R1\u2019s default route is 192.168.4.1, an address on none of the networks R1 is attached to. R1 has no way to reach it and no other idea where the packet should go, so it drops the packet and reports that it has no route. Its gateway should be 192.168.2.2, the address of the second router on R1\u2019s own cable.',
  repair: (topology) => reconfigured(topology, 'r1', { gateway: '192.168.2.2' }),
};

const FIREWALL_FACING_THE_WRONG_WAY: Board = {
  id: 'fault-firewall-facing-the-wrong-way',
  title: 'A firewall facing the wrong way',
  about:
    'A firewall between a computer on the inside and the internet, and a ping from the inside that is refused.',
  task: 'Ping the cloud at 203.0.113.2 from PC1. The firewall refuses it even though the ping started on the inside, where a conversation like that should be allowed out. Work out why.',
  point:
    'A stateful firewall judges a frame by the interface it arrives on. Tell it that the inside interface is the one facing the outside, and it will refuse the very traffic you wanted to let out.',
  topic: 'firewall-state',
  topology: firewallFacingTheWrongWay(),
  goal: { from: 'pc1', to: 'net' },
  fault:
    'The firewall\u2019s outer interface is set to eth0, the interface facing PC1 on the inside. Frames from the inside are therefore treated as arriving from the outside, and since nothing inside had been let out first, they are refused. The outer interface is eth1, the one facing the internet.',
  repair: (topology) => reconfigured(topology, 'fw', { outerPort: 'eth1' }),
};

/**
 * The boards handed over broken. Each one says what the reader should see and
 * never what is wrong; `fault` is the answer for a reader who gives up, and
 * `repair` is that answer written as the one change that fixes the board, so a
 * test can prove each board has exactly one fault in it.
 */
export const FAULTS: readonly Board[] = [
  GATEWAY_NOBODY_OWNS,
  CABLE_ONE_END_HAS_NO_SOCKET_FOR,
  LOOP_BETWEEN_TWO_HUBS,
  MASK_TOO_LONG,
  ROUTER_POINTED_THE_WRONG_WAY,
  FIREWALL_FACING_THE_WRONG_WAY,
];
