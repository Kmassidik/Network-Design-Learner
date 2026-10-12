import type { GlossaryKey } from '../content/glossary';
import { formatIpv4, networkAddress, parseIpv4 } from './ip';
import { MEDIUM, portAt, type DropReason, type PingResult, type SimStep, type SimNode, type Topology } from './types';

/**
 * What to tell a reader whose ping did not arrive: what stopped it, why, and
 * the smallest change that fixes it. Built from the run that just happened and
 * the board it happened on, so the numbers in it are the reader's own.
 */
export interface Correction {
  /** One line naming what stopped it. */
  readonly headline: string;
  /** Why, in the reader's numbers. */
  readonly detail: string;
  /** The smallest change that makes it work. */
  readonly fix: string;
  /**
   * Which glossary term explains the idea behind it, and therefore which link a
   * reader can follow. Typed against the glossary on purpose: a term that gets
   * renamed stops the build rather than quietly losing its link.
   */
  readonly topic: GlossaryKey | null;
}

/**
 * The reasons that stop a ping outright. A shared cable produces its own drops
 * (a computer ignoring a frame addressed to somebody else, a switch refusing to
 * send one back out of the port it came in on) and those are normal, not the
 * reason anything failed.
 */
const BLOCKING: readonly DropReason[] = [
  'no-gateway',
  'no-route',
  'wrong-wiring',
  'wrong-medium',
  'blocked',
  'ttl-expired',
  'no-arp-reply',
];

/** How far apart two addresses are, described rather than computed at the reader. */
function networksOf(node: SimNode, portName: string): { address: string; network: string } | null {
  const port = portAt(node.config, portName);
  if (port === null || port.ip === '') return null;
  const value = parseIpv4(port.ip);
  if (value === null) return null;
  return {
    address: `${port.ip}/${port.prefix}`,
    network: `${formatIpv4(networkAddress(value, port.prefix))}/${port.prefix}`,
  };
}

/**
 * The correction for a run, or null when the run was fine. Returns the first
 * reason that actually stopped the packet, so a reader is told one thing rather
 * than everything the run happened to log.
 */
export function correct(result: PingResult, topology: Topology): Correction | null {
  if (result.roundTripMs !== null) return null;

  const looped = result.steps.find((step) => step.type === 'looped');
  if (looped !== undefined) {
    return {
      headline: 'The frame never stops going round',
      detail:
        'It has passed the same devices hundreds of times, which means the wiring has a loop in it: two devices are joined to each other in a circle, so every frame is repeated back into the circle for ever.',
      fix: 'Break the loop by removing one of the cables that closes the circle.',
      topic: null,
    };
  }

  const stop = result.steps.find(
    (step): step is Extract<SimStep, { type: 'dropped' }> =>
      step.type === 'dropped' && BLOCKING.includes(step.reason),
  );
  if (stop === undefined) return null;

  const node = topology.nodes.find((candidate) => candidate.id === stop.nodeId);
  const where = node?.label ?? 'the device it stopped at';
  const port = stop.port ?? '';

  switch (stop.reason) {
    case 'no-gateway': {
      const own = node === undefined ? null : networksOf(node, port);
      return {
        headline: `${where} decided the address was somewhere else`,
        detail:
          own === null
            ? `${stop.ip} is not in the same network as ${where}, and ${where} has no gateway, so it has nowhere to hand the packet to.`
            : `${stop.ip} is not in the same network as ${where}. Its ${port} is ${own.address}, which is the network ${own.network}, and that does not contain ${stop.ip}.`,
        fix: `Either widen the mask on ${where} until both addresses fall in one network, or set a gateway to a device that can reach ${stop.ip}.`,
        topic: 'subnet-mask',
      };
    }

    case 'no-route': {
      const hasGateway = node !== undefined && node.config.gateway !== '';
      return {
        headline: `${where} has no route to that network`,
        detail: hasGateway
          ? `It is connected to its own networks only, and its gateway ${node?.config.gateway ?? ''} does not lead towards ${stop.ip}.`
          : `${where} is connected to its own networks only. Anything outside them has nowhere to go, and ${stop.ip} is outside them.`,
        fix: hasGateway
          ? 'Point its gateway at a device that does know the way, or put a router between the two networks.'
          : 'Set its gateway to the address of a router that can reach the destination.',
        topic: 'gateway',
      };
    }

    case 'wrong-wiring':
      return {
        headline: 'Nothing crosses this cable',
        detail:
          'Both devices at the ends of this cable are the same sort, so they transmit on the same pair of wires and neither can hear the other. The frames go onto the cable and stop there.',
        fix: 'Change this cable to a crossover, or turn on the ports that work it out by themselves.',
        topic: 'auto-mdix',
      };

    case 'wrong-medium':
      return {
        headline: 'This kind of cable does not fit',
        detail:
          'One of the two devices has no socket for this kind of cable, so it is not a cable either of them can use.',
        fix: `Use a kind both ends have a socket for, which here means ${MEDIUM.utp.label.toLowerCase()} or ${MEDIUM.wireless.label.toLowerCase()}.`,
        topic: 'port',
      };

    case 'blocked':
      return {
        headline: 'The firewall refused it',
        detail:
          'It arrived on the interface that faces the outside, and nothing inside had asked for it. The firewall only lets in answers to conversations that started inside.',
        fix: 'Start the conversation from the inside, or change which interface faces the outside.',
        topic: 'firewall-state',
      };

    case 'ttl-expired':
      return {
        headline: 'The hop count ran out',
        detail:
          'A frame is thrown away after 64 devices have handled it. This one got there, which means two devices are handing it back and forth to each other.',
        fix: 'Look at the gateways on the way: one of them points back at a device that points at it.',
        topic: 'gateway',
      };

    case 'no-arp-reply':
      return {
        headline: `Nobody answered for ${stop.ip}`,
        detail:
          `${where} asked which interface owns ${stop.ip}, and no device on the cable said it was theirs. A device that is not there, or is not on that cable, cannot answer.`,
        fix: `Check the address is right, and that the device holding it is plugged into the same cable as ${where}.`,
        topic: 'arp',
      };

    case 'no-cable':
      return {
        headline: `${where} has nothing to send it out of`,
        detail: `There is no cable in ${port}, so the frame goes nowhere at all.`,
        fix: 'Plug a cable into that port, or send it out of one that has one.',
        topic: 'port',
      };

    default:
      return null;
  }
}
