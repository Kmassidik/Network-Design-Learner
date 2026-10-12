import type { Behaviour } from './behaviour';
import { isAddressedTo, noteDropped } from './behaviour-shared';
import { answerForItself, forward } from './behaviour-router';

/** One conversation: who spoke to whom. */
function flowKey(from: string, to: string): string {
  return `${from}>${to}`;
}

/**
 * A firewall joins two networks like a router, and keeps a note of what went
 * out. A conversation that started inside may be answered; anything arriving
 * from the outside that nobody asked for is refused. That is a stateful
 * firewall, and it is why a ping from the inside works and a ping from the
 * outside never arrives.
 */
export const firewallBehaviour: Behaviour = (ctx) => {
  const { frame, port } = ctx;

  if (frame.kind === 'arp-request' || frame.kind === 'arp-reply') {
    answerForItself(ctx);
    return;
  }
  if (frame.kind === 'echo-request' && ctx.ownsAddress(frame.dstIp)) {
    answerForItself(ctx);
    return;
  }
  if (!isAddressedTo(frame, port)) {
    noteDropped(ctx, 'not-my-mac', frame.dstIp);
    return;
  }

  if (port.name === ctx.config.outerPort) {
    // Arriving from the outside. It is only let in if it answers something this
    // device watched go out.
    const answersSomething = frame.kind === 'echo-reply' && ctx.state.flows.has(flowKey(frame.dstIp, frame.srcIp));
    if (!answersSomething) {
      noteDropped(ctx, 'blocked', frame.dstIp, port.name);
      return;
    }
    forward(ctx);
    return;
  }

  if (frame.kind === 'echo-request') ctx.state.flows.add(flowKey(frame.srcIp, frame.dstIp));
  forward(ctx);
};
