import type { Behaviour } from './behaviour';
import { noteDropped } from './behaviour-shared';
import { BROADCAST_MAC } from './types';

/**
 * A switch learns which hardware address answers on which port, and then stops
 * shouting. A frame for an address it has seen goes out of one port; a frame
 * for an address it has not seen, or one addressed to everybody, still goes out
 * of all of them. That difference from a hub is the whole reason switches
 * replaced them.
 */
export const switchBehaviour: Behaviour = (ctx) => {
  const { frame, port } = ctx;

  ctx.learnMac(frame.srcMac, port.name);

  if (frame.dstMac === BROADCAST_MAC) {
    ctx.repeat(frame);
    return;
  }

  const outgoing = ctx.state.macTable.get(frame.dstMac);
  if (outgoing === undefined) {
    // Nobody here has seen that address yet, so it has to ask the whole board.
    ctx.repeat(frame);
    return;
  }

  if (outgoing === port.name) {
    // It arrived on the very port that address lives on, so there is nowhere to
    // send it. This is the filtering a hub cannot do.
    noteDropped(ctx, 'same-port', frame.dstIp, outgoing);
    return;
  }

  ctx.send(outgoing, frame);
};
