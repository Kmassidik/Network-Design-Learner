import type { Behaviour, BehaviourContext } from './behaviour';
import { arpReply, echoReply, isAddressedTo, learn, noteDropped } from './behaviour-shared';
import type { Frame } from './types';

/**
 * A router holds one address per network it is attached to, and joins them
 * together. It reads the destination address, picks the interface that address
 * is reachable through, and takes one off the hop count on the way out, which
 * is what stops a mistake in the wiring from going round forever.
 */
export const routerBehaviour: Behaviour = (ctx) => {
  const { frame } = ctx;
  if (frame.kind === 'arp-request' || frame.kind === 'arp-reply') {
    // ARP stops at every device that hears it. Only IP gets forwarded, which is
    // why a broadcast cannot cross from one network into another.
    answerForItself(ctx);
    return;
  }
  if (frame.kind === 'echo-request' && ctx.ownsAddress(frame.dstIp)) {
    answerForItself(ctx);
    return;
  }
  if (!isAddressedTo(frame, ctx.port)) {
    noteDropped(ctx, 'not-my-mac', frame.dstIp);
    return;
  }
  forward(ctx);
};

/**
 * The parts every device with addresses on several networks shares: it answers
 * questions about its own addresses, and it remembers what it hears.
 */
export function answerForItself(ctx: BehaviourContext): void {
  const { frame, port } = ctx;
  if (frame.kind === 'arp-request') {
    learn(ctx, frame.srcIp, frame.srcMac, 'request');
    if (ctx.ownsAddress(frame.dstIp)) ctx.send(port.name, arpReply(port, frame.dstIp, frame));
    return;
  }
  if (frame.kind === 'arp-reply') {
    learn(ctx, frame.srcIp, frame.srcMac, 'reply');
    ctx.releaseHeld(frame.srcIp, frame.srcMac);
    return;
  }
  if (frame.kind === 'echo-request' && ctx.ownsAddress(frame.dstIp)) {
    ctx.send(port.name, echoReply(port, frame));
  }
}

/**
 * Take one off the hop count and send the frame on the way the routing table
 * says. A routing table entry that points at a network attached to one of this
 * device's own interfaces is used first, because that network is reached
 * directly; anything else goes to the default gateway.
 */
export function forward(ctx: BehaviourContext): void {
  const { frame } = ctx;

  if (frame.ttl <= 1) {
    noteDropped(ctx, 'ttl-expired', frame.dstIp);
    return;
  }
  const next: Frame = { ...frame, ttl: frame.ttl - 1 };

  const direct = ctx.portForNetwork(frame.dstIp, ctx.port.name);
  if (direct !== null) {
    ctx.resolveAndSend(direct.name, frame.dstIp, { ...next, srcMac: direct.mac });
    return;
  }

  if (ctx.config.gateway !== '') {
    // The arrival interface is not excluded here. Two routers on one cable is a
    // normal arrangement, and a router that refused to send back out of the
    // interface it heard from could never answer its neighbour.
    const via = ctx.portForNetwork(ctx.config.gateway);
    if (via !== null) {
      ctx.resolveAndSend(via.name, ctx.config.gateway, { ...next, srcMac: via.mac });
      return;
    }
  }

  noteDropped(ctx, 'no-route', frame.dstIp);
}
