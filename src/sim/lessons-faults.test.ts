import { describe, expect, it } from 'vitest';
import type { GlossaryKey } from '../content/glossary';
import { checkGoal } from './lesson';
import { FAULTS } from './lessons-faults';
import { portAt, type SimLink, type SimNode, type Topology } from './types';

/*
 * A board that is handed over broken is only honest if three things hold: it
 * does not work as given, the correction tells the reader the thing it is
 * supposed to, and this one change and nothing else makes it work. Those three
 * are what the tests below check, board by board.
 */

/** The correction a board is meant to produce, so a wrong diagnosis cannot pass silently. */
interface Expected {
  /** The one line the reader is shown, in the reader's own numbers. */
  readonly headline: string;
  /** The glossary entry the correction links the reader to, or null when none fits. */
  readonly topic: GlossaryKey | null;
}

/**
 * What each board's correction has to say. Spelling these out means a board
 * whose fault changes without its wording changing fails the test, which is
 * exactly the drift a reader would otherwise be told about wrongly.
 */
const EXPECTED: Record<string, Expected> = {
  'fault-gateway-nobody-owns': {
    headline: 'Nobody answered for 192.168.1.54',
    topic: 'arp',
  },
  'fault-cable-one-end-has-no-socket-for': {
    headline: 'This kind of cable does not fit',
    topic: 'port',
  },
  'fault-loop-between-two-hubs': {
    headline: 'The frame never stops going round',
    topic: null,
  },
  'fault-mask-too-long': {
    headline: 'PC1 decided the address was somewhere else',
    topic: 'subnet-mask',
  },
  'fault-router-pointed-the-wrong-way': {
    headline: 'R1 has no route to that network',
    topic: 'gateway',
  },
  'fault-firewall-facing-the-wrong-way': {
    headline: 'The firewall refused it',
    topic: 'firewall-state',
  },
};

/**
 * Everything that differs between two boards, one readable line per field. A
 * repair that quietly tidies something else up as well would show up here as a
 * second line, which is how the "one change" promise is kept.
 */
function differences(before: Topology, after: Topology): readonly string[] {
  const found: string[] = [];

  const nodesBefore: Record<string, SimNode> = Object.fromEntries(
    before.nodes.map((node) => [node.id, node]),
  );
  const nodesAfter: Record<string, SimNode> = Object.fromEntries(
    after.nodes.map((node) => [node.id, node]),
  );
  for (const [id, one] of Object.entries(nodesBefore)) {
    const other = nodesAfter[id];
    if (other === undefined) {
      found.push(`${id} removed`);
      continue;
    }
    if (one.kind !== other.kind) found.push(`${id}.kind`);
    if (one.config.gateway !== other.config.gateway) found.push(`${id}.gateway`);
    if (one.config.outerPort !== other.config.outerPort) found.push(`${id}.outerPort`);
    if (one.config.autoMdix !== other.config.autoMdix) found.push(`${id}.autoMdix`);
    for (const port of one.config.ports) {
      const same = other.config.ports.find((candidate) => candidate.name === port.name);
      if (same === undefined) {
        found.push(`${id}.${port.name} removed`);
        continue;
      }
      if (port.ip !== same.ip) found.push(`${id}.${port.name}.ip`);
      if (port.prefix !== same.prefix) found.push(`${id}.${port.name}.prefix`);
      if (port.mac !== same.mac) found.push(`${id}.${port.name}.mac`);
    }
  }
  for (const id of Object.keys(nodesAfter)) if (nodesBefore[id] === undefined) found.push(`${id} added`);

  const linksBefore: Record<string, SimLink> = Object.fromEntries(
    before.links.map((link) => [link.id, link]),
  );
  const linksAfter: Record<string, SimLink> = Object.fromEntries(
    after.links.map((link) => [link.id, link]),
  );
  for (const [id, one] of Object.entries(linksBefore)) {
    const other = linksAfter[id];
    if (other === undefined) {
      found.push(`${id} removed`);
      continue;
    }
    if (one.medium !== other.medium) found.push(`${id}.medium`);
    if (one.wiring !== other.wiring) found.push(`${id}.wiring`);
    if (one.a.node !== other.a.node || one.a.port !== other.a.port) found.push(`${id}.a`);
    if (one.b.node !== other.b.node || one.b.port !== other.b.port) found.push(`${id}.b`);
  }
  for (const id of Object.keys(linksAfter)) if (linksBefore[id] === undefined) found.push(`${id} added`);

  return found;
}

describe('the boards handed over broken', () => {
  it('has a distinct id for each one', () => {
    const ids = FAULTS.map((board) => board.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('expects exactly the boards that exist, and no others', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(FAULTS.map((board) => board.id).sort());
  });

  it('plugs every cable into an interface that exists', () => {
    for (const board of FAULTS) {
      for (const link of board.topology.links) {
        for (const end of [link.a, link.b]) {
          const node = board.topology.nodes.find((candidate) => candidate.id === end.node);
          expect(node, `${board.id}: ${link.id} names ${end.node}`).toBeDefined();
          if (node === undefined) continue;
          expect(portAt(node.config, end.port), `${board.id}: ${link.id} uses ${end.port}`).not.toBeNull();
        }
      }
    }
  });

  it('puts at most one cable in an interface', () => {
    for (const board of FAULTS) {
      const used = board.topology.links.flatMap((link) => [
        `${link.a.node}:${link.a.port}`,
        `${link.b.node}:${link.b.port}`,
      ]);
      expect(new Set(used).size, `${board.id} puts two cables in one interface`).toBe(used.length);
    }
  });

  for (const board of FAULTS) {
    describe(board.id, () => {
      it('does not work as handed over', () => {
        const result = checkGoal(board.topology, board.goal);
        expect(result.met, `${board.id} already works before it is repaired`).toBe(false);
      });

      it('tells the reader the fault it was built to have', () => {
        const expected = EXPECTED[board.id];
        expect(expected, `no expectation is written for ${board.id}`).toBeDefined();
        if (expected === undefined) return;
        const result = checkGoal(board.topology, board.goal);
        expect(result.correction, `${board.id} hands over a failure with nothing to say about it`).not.toBeNull();
        expect(result.correction?.headline).toBe(expected.headline);
        expect(result.correction?.topic).toBe(expected.topic);
        expect(board.fault.length).toBeGreaterThan(0);
      });

      it('works after the repair and nothing else', () => {
        const repaired = board.repair(board.topology);
        expect(checkGoal(repaired, board.goal).met, `${board.id} is still broken after its repair`).toBe(
          true,
        );
      });

      it('repairs it with exactly one change', () => {
        const changed = differences(board.topology, board.repair(board.topology));
        expect(changed, `${board.id} changes ${changed.join(', ')}`).toHaveLength(1);
      });

      it('pings from one device to a different one', () => {
        expect(board.goal.from).not.toBe(board.goal.to);
      });
    });
  }
});
