import type { GlossaryKey } from '../content/glossary';
import { correct, type Correction } from './diagnose';
import { Network } from './engine';
import { primaryPort, type Topology } from './types';

/**
 * What a reader is asked to make true. The check is the application's own: it
 * runs the ping in the simulation and looks at whether the reply came back, so
 * no lesson can claim success that the simulation does not agree with.
 */
export interface Goal {
  /** The device the ping starts from. */
  readonly from: string;
  /** The device it has to reach, whose first address is the target. */
  readonly to: string;
}

export interface Lesson {
  readonly id: string;
  readonly title: string;
  /** One sentence: what this board is about. */
  readonly about: string;
  /** What to do, in the reader's words. */
  readonly task: string;
  /** What to notice once it works, which is the actual teaching. */
  readonly point: string;
  /** The board the reader is handed. */
  readonly topology: Topology;
  readonly goal: Goal;
  /** Where to read more, when there is somewhere good. */
  readonly topic: GlossaryKey | null;
}

/**
 * A board handed over broken, with the fault named and, more usefully, with the
 * one change that puts it right written as code. That is what lets a test prove
 * the board has exactly one fault: the goal fails as handed over, and succeeds
 * after this single change and nothing else.
 */
export interface Board extends Lesson {
  /** What is wrong with it, in the reader's words. */
  readonly fault: string;
  /** The single change that makes the goal work. */
  readonly repair: (topology: Topology) => Topology;
}

export interface GoalResult {
  /** True when the ping in the goal arrives. */
  readonly met: boolean;
  /** What is stopping it when it does not, in the reader's own numbers. */
  readonly correction: Correction | null;
}

/**
 * Run the goal's ping and report whether it arrives. The target is the first
 * address the destination has, which is the address a reader would ping by
 * hand, and a board that cannot even be run counts as not met rather than as an
 * error, because a lesson is allowed to be handed over unusable.
 */
export function checkGoal(topology: Topology, goal: Goal): GoalResult {
  const target = topology.nodes.find((node) => node.id === goal.to);
  const address = target === undefined ? '' : (primaryPort(target.config)?.ip ?? '');
  if (address === '') return { met: false, correction: null };
  try {
    const result = new Network(topology).ping(goal.from, address);
    return { met: result.roundTripMs !== null, correction: correct(result, topology) };
  } catch {
    return { met: false, correction: null };
  }
}
