import type { Behaviour } from './behaviour';

/**
 * A hub is a repeater and nothing else. It does not read the address on a
 * frame, does not remember which port anything is on, and sends whatever
 * arrives out of every other port. Everyone on it shares one conversation at a
 * time, whether they are part of it or not.
 */
export const hubBehaviour: Behaviour = (ctx) => {
  ctx.repeat(ctx.frame);
};
