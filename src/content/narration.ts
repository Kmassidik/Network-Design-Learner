import { ARP_TIMEOUT_MS } from '../sim/engine-types';
import { MEDIUM, type PingResult, type SimStep } from '../sim/types';

export type LogTone = 'lookup' | 'ping' | 'learn' | 'drop' | 'result';

export interface LogLine {
  /** Simulated time in ms since the ping started. */
  readonly timeMs: number;
  /** Device the line is about, or null for a line about the run as a whole. */
  readonly nodeId: string | null;
  readonly tone: LogTone;
  readonly text: string;
}

/** Milliseconds, at the one decimal place the engine actually measures to. */
function ms(value: number): string {
  return `${value.toFixed(1)} ms`;
}

type Hop = Extract<SimStep, { type: 'hop' }>;
type Learned = Extract<SimStep, { type: 'arp-cache' }>;
type MacLearned = Extract<SimStep, { type: 'mac-cache' }>;
type Dropped = Extract<SimStep, { type: 'dropped' }>;
type Answered = Extract<SimStep, { type: 'answered' }>;
type Looped = Extract<SimStep, { type: 'looped' }>;

function hopLine(step: Hop, labelOf: (nodeId: string) => string): LogLine {
  const from = labelOf(step.from);
  const timeMs = step.timeMs;
  const medium = MEDIUM[step.medium].spoken;
  // A hub and a switch pass on frames that are not theirs. Saying so is the
  // whole difference between asking a question and repeating one.
  const lead = step.repeated ? `${from} repeats` : `${from} sends`;
  switch (step.frame) {
    case 'arp-request':
      return {
        timeMs,
        nodeId: step.from,
        tone: 'lookup',
        text: `${lead} the question "who owns ${step.dstIp}?" out of ${step.port}, ${medium}. Every device on that cable hears it.`,
      };
    case 'arp-reply':
      return {
        timeMs,
        nodeId: step.from,
        tone: 'lookup',
        text: `${lead} the answer out of ${step.port}, ${medium}: ${step.srcIp} is on that cable.`,
      };
    case 'echo-request':
      return {
        timeMs,
        nodeId: step.from,
        tone: 'ping',
        text: `${lead} the ping out of ${step.port}, ${medium}, towards ${step.dstIp}.`,
      };
    case 'echo-reply':
      return {
        timeMs,
        nodeId: step.from,
        tone: 'ping',
        text: `${lead} the reply out of ${step.port}, ${medium}, towards ${step.dstIp}.`,
      };
  }
}

function learnedLine(step: Learned, labelOf: (nodeId: string) => string): LogLine {
  const node = labelOf(step.nodeId);
  return {
    timeMs: step.timeMs,
    nodeId: step.nodeId,
    tone: 'learn',
    text:
      step.learnedFrom === 'request'
        ? `${node} notes the sender of the request: ${step.ip} is at ${step.mac}. It keeps that for next time.`
        : `${node} writes down the address it asked for: ${step.ip} is at ${step.mac}.`,
  };
}

function macLearnedLine(step: MacLearned, labelOf: (nodeId: string) => string): LogLine {
  return {
    timeMs: step.timeMs,
    nodeId: step.nodeId,
    tone: 'learn',
    text: `${labelOf(step.nodeId)} learns that ${step.mac} is on ${step.port}. From now on it sends that device's frames out of one port only.`,
  };
}

function droppedLine(step: Dropped, labelOf: (nodeId: string) => string): LogLine {
  const node = labelOf(step.nodeId);
  const port = step.port ?? 'the port it came in on';
  const text = (() => {
    switch (step.reason) {
      case 'no-route':
        return `${node} has no path to ${step.ip}, and it does not forward anything it has no route for, so the packet stops here.`;
      case 'no-gateway':
        return `${step.ip} is outside every network ${node} is attached to, and ${node} has no gateway set, so there is nowhere to send it.`;
      case 'no-cable':
        return `There is nothing plugged into ${step.port ?? 'that port'} on ${node}, so the frame goes nowhere.`;
      case 'not-my-mac':
        return `${node} is not the device this frame is addressed to, so its interface drops it without a word.`;
      case 'same-port':
        return `${node} already knows that address on ${port}, which is where this frame came in, so there is nowhere to send it.`;
      case 'no-arp-reply':
        return `No device answered for ${step.ip}, so after ${ms(ARP_TIMEOUT_MS)} ${node} gives up.`;
      case 'ttl-expired':
        return `The hop count ran out at ${node}. A frame is thrown away after 64 hops, which usually means two devices are pointing at each other.`;
      case 'blocked':
        return `${node} refused it. It arrived from the outside and nothing inside had asked for it.`;
      case 'wrong-wiring':
        return `The frame goes onto the cable at ${port} and nothing comes out the other end. That copper cable is wired the wrong way round for the two devices it joins: both of them transmit on the same pair of wires, so they cannot hear each other. A crossover cable, or a port that works this out for itself, is what fixes it.`;
      case 'wrong-medium':
        return `There is no point putting the frame on the cable at ${port}: this kind of cable does not fit one of the two devices, so it is not a cable either of them can use.`;
    }
  })();
  return { timeMs: step.timeMs, nodeId: step.nodeId, tone: 'drop', text };
}

function answeredLine(step: Answered, labelOf: (nodeId: string) => string): LogLine {
  return {
    timeMs: step.timeMs,
    nodeId: step.nodeId,
    tone: 'ping',
    text: `${labelOf(step.nodeId)} answers as ${step.ip}, which is nowhere on this board. That is what makes it the way out of the network.`,
  };
}

function loopedLine(step: Looped): LogLine {
  return {
    timeMs: step.timeMs,
    nodeId: null,
    tone: 'drop',
    text: `The frame is still going round after ${step.frames} frames, so this run stopped. Two devices wired into each other in a loop will do that, and a hop count cannot stop it.`,
  };
}

/**
 * Turn what the network did into sentences. The engine emits facts and this
 * turns them into words a first year student can act on, so the explanation can
 * change without touching the simulation.
 */
export function describeSteps(
  steps: readonly SimStep[],
  labelOf: (nodeId: string) => string,
): readonly LogLine[] {
  return steps.map((step) => {
    switch (step.type) {
      case 'hop':
        return hopLine(step, labelOf);
      case 'arp-cache':
        return learnedLine(step, labelOf);
      case 'mac-cache':
        return macLearnedLine(step, labelOf);
      case 'dropped':
        return droppedLine(step, labelOf);
      case 'answered':
        return answeredLine(step, labelOf);
      case 'looped':
        return loopedLine(step);
    }
  });
}

/** The line that reports the measurement, which is the point of the exercise. */
export function describeResult(result: PingResult, labelOf: (nodeId: string) => string): LogLine {
  const from = labelOf(result.srcId);
  if (result.roundTripMs === null) {
    if (result.requestSentMs === null) {
      return {
        timeMs: result.waitedMs,
        nodeId: result.srcId,
        tone: 'result',
        text: `The ping never left ${from}, so there is nothing to time.`,
      };
    }
    return {
      timeMs: result.waitedMs,
      nodeId: result.srcId,
      tone: 'result',
      text: `No reply. ${from} waited ${ms(result.waitedMs)} and then stopped.`,
    };
  }
  const lookup = result.waitedMs - result.roundTripMs;
  const lookupNote =
    lookup > 0
      ? ` The address lookup added ${ms(lookup)} before the ping could go out.`
      : ' The address was already known, so the ping went out straight away.';
  return {
    timeMs: result.waitedMs,
    nodeId: result.srcId,
    tone: 'result',
    text: `Reply from ${result.targetIp} in ${ms(result.roundTripMs)}.${lookupNote}`,
  };
}
