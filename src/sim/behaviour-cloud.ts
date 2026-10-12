import { parseIpv4, sameSubnet } from './ip';
import type { Behaviour } from './behaviour';
import { arpReply, isAddressedTo, noteDropped } from './behaviour-shared';
import { DEFAULT_TTL } from './types';

/**
 * The internet, as far as this board is concerned. It answers for addresses
 * that are not on the cable it was reached over, which is what lets a student
 * give a PC a gateway and then watch it reach something outside its own
 * network. Every answer it gives is reported, so nobody has to guess where the
 * reply came from.
 *
 * What it never does is claim an address that belongs on the cable it is
 * attached to. Those addresses belong to real devices, and a cloud that
 * answered for them would make a working network look broken.
 */
export const cloudBehaviour: Behaviour = (ctx) => {
  const { frame, port } = ctx;
  const mine = parseIpv4(port.ip);
  const asked = parseIpv4(frame.dstIp);
  const onThisCable =
    mine !== null && asked !== null && sameSubnet(mine, asked, port.prefix);
  const claimsIt = frame.dstIp === port.ip || !onThisCable;

  if (frame.kind === 'arp-request') {
    if (!claimsIt) return;
    ctx.note({ type: 'answered', timeMs: ctx.timeMs, nodeId: ctx.node.id, ip: frame.dstIp });
    ctx.send(port.name, arpReply(port, frame.dstIp, frame));
    return;
  }

  if (frame.kind === 'arp-reply') return;

  if (!isAddressedTo(frame, port)) {
    noteDropped(ctx, 'not-my-mac', frame.dstIp);
    return;
  }

  if (frame.kind === 'echo-request') {
    if (!claimsIt) {
      // Addressed to an interface on this cable, so it came here by mistake.
      noteDropped(ctx, 'no-route', frame.dstIp);
      return;
    }
    if (frame.dstIp !== port.ip) {
      ctx.note({ type: 'answered', timeMs: ctx.timeMs, nodeId: ctx.node.id, ip: frame.dstIp });
    }
    ctx.send(port.name, {
      kind: 'echo-reply',
      srcMac: port.mac,
      dstMac: frame.srcMac,
      // It answers as the address that was asked for, because that is where the
      // reply claims to come from.
      srcIp: frame.dstIp,
      dstIp: frame.srcIp,
      ttl: DEFAULT_TTL,
    });
    return;
  }
};
