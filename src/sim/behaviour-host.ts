import type { Behaviour } from './behaviour';
import { arpReply, echoReply, isAddressedTo, learn, noteDropped } from './behaviour-shared';

/**
 * A host. It speaks for itself and passes nothing on, which is the whole point
 * of the thing: when a packet stops at a PC that was not the destination, there
 * is nothing wrong, the PC simply does not forward.
 */
export const hostBehaviour: Behaviour = (ctx) => {
  const { frame, port } = ctx;

  if (!isAddressedTo(frame, port)) {
    // On a shared cable every host sees every frame. A network card throws away
    // the ones that carry somebody else's address, without saying so.
    noteDropped(ctx, 'not-my-mac', frame.dstIp);
    return;
  }

  switch (frame.kind) {
    case 'arp-request': {
      learn(ctx, frame.srcIp, frame.srcMac, 'request');
      if (frame.dstIp === port.ip) ctx.send(port.name, arpReply(port, port.ip, frame));
      return;
    }
    case 'arp-reply': {
      learn(ctx, frame.srcIp, frame.srcMac, 'reply');
      ctx.releaseHeld(frame.srcIp, frame.srcMac);
      return;
    }
    case 'echo-request': {
      if (frame.dstIp === port.ip) ctx.send(port.name, echoReply(port, frame));
      else noteDropped(ctx, 'no-route', frame.dstIp);
      return;
    }
    case 'echo-reply':
      // The engine notices the arrival. A host has nothing else to do with it.
      return;
  }
};
