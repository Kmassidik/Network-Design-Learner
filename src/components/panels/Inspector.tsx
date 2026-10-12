import type { ReactElement } from 'react';
import type { ArpEntry, MacEntry, NodeStats } from '../../sim/engine-types';
import { KIND, hasAddresses } from '../../sim/kinds';
import {
  broadcastAddress,
  formatIpv4,
  hostCount,
  maskFromPrefix,
  networkAddress,
  parseIpv4,
} from '../../sim/ip';
import {
  MEDIUM,
  MEDIUMS,
  addressedPorts,
  linkCarries,
  primaryPort,
  sharedMediums,
  supportsMedium,
  wiringFor,
  type Medium,
  type NodeConfig,
  type Port,
  type SimLink,
  type SimNode,
  type Wiring,
} from '../../sim/types';
import { Term } from './Tooltip';

export interface InspectorProps {
  readonly node: SimNode | null;
  readonly link: SimLink | null;
  /** How much is selected in total, so several things can be spoken about at once. */
  readonly selectionCount: number;
  readonly onDeleteSelection: () => void;
  readonly labelOf: (nodeId: string) => string;
  /** The device a cable end is plugged into, needed for the wiring rule. */
  readonly nodeOf: (nodeId: string) => SimNode | null;
  /** Labels of the devices this one can reach without a router. */
  readonly neighbours: readonly string[];
  readonly arp: readonly ArpEntry[];
  readonly macs: readonly MacEntry[];
  readonly flows: number;
  readonly stats: NodeStats | null;
  readonly onChangeConfig: (id: string, config: NodeConfig) => void;
  readonly onChangeLink: (id: string, change: { medium?: Medium; wiring?: Wiring }) => void;
  readonly onClearAddresses: () => void;
}

/** One interface: its name, its address, its mask and its hardware address. */
function PortFields({ port, onChange }: { port: Port; onChange: (next: Port) => void }): ReactElement {
  const address = parseIpv4(port.ip);
  return (
    <div className="port-block">
      <h3 className="rail-subtitle">
        <Term text={port.name} topic="port" />
      </h3>
      <label className="field">
        <span className="field-label">Address</span>
        <input
          className="input"
          value={port.ip}
          spellCheck={false}
          aria-invalid={port.ip !== '' && address === null}
          onChange={(event) => onChange({ ...port, ip: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">Mask</span>
        <span className="field-row">
          <input
            className="input"
            type="range"
            min={8}
            max={30}
            step={1}
            value={port.prefix}
            aria-label={`${port.name} mask length in bits`}
            onChange={(event) => onChange({ ...port, prefix: Number(event.target.value) })}
          />
          <span className="num prefix-value">
            /{port.prefix} ({formatIpv4(maskFromPrefix(port.prefix))})
          </span>
        </span>
      </label>
      <label className="field">
        <span className="field-label">Hardware address</span>
        <input
          className="input"
          value={port.mac}
          spellCheck={false}
          onChange={(event) => onChange({ ...port, mac: event.target.value })}
        />
      </label>
      {address === null ? (
        <p className="field-hint">No usable address here yet.</p>
      ) : (
        <p className="field-hint">
          Network <span className="num">{formatIpv4(networkAddress(address, port.prefix))}</span>,
          broadcast <span className="num">{formatIpv4(broadcastAddress(address, port.prefix))}</span>,{' '}
          <span className="num">{hostCount(port.prefix)}</span> addresses to hand out.
        </p>
      )}
    </div>
  );
}

export function Inspector({
  node,
  link,
  selectionCount,
  onDeleteSelection,
  labelOf,
  nodeOf,
  neighbours,
  arp,
  macs,
  flows,
  stats,
  onChangeConfig,
  onChangeLink,
  onClearAddresses,
}: InspectorProps): ReactElement {
  if (selectionCount > 1) {
    return (
      <section className="section">
        <h2 className="rail-title">{selectionCount} selected</h2>
        <p className="muted">
          Drag any of them to move the whole group together, or remove them all at once.
        </p>
        <button type="button" className="btn" onClick={onDeleteSelection}>
          Delete them
        </button>
      </section>
    );
  }

  if (node === null && link === null) {
    return (
      <section className="section">
        <h2 className="rail-title">Inspector</h2>
        <p className="muted">Select a device or a cable to change it.</p>
      </section>
    );
  }

  if (node === null && link !== null) {
    const spec = MEDIUM[link.medium];
    const a = nodeOf(link.a.node);
    const b = nodeOf(link.b.node);
    const offered = a === null || b === null ? MEDIUMS : sharedMediums(a.kind, b.kind);
    const carries = a === null || b === null ? true : linkCarries(link, a, b);
    const needed = a === null || b === null ? 'straight' : wiringFor(a.kind, b.kind);
    return (
      <section className="section">
        <h2 className="rail-title">Cable</h2>
        <dl className="readout">
          <div className="readout-row">
            <dt>From</dt>
            <dd>
              {labelOf(link.a.node)} {link.a.port}
            </dd>
          </div>
          <div className="readout-row">
            <dt>To</dt>
            <dd>
              {labelOf(link.b.node)} {link.b.port}
            </dd>
          </div>
        </dl>

        <label className="field">
          <span className="field-label">Made of</span>
          <select
            className="select"
            value={link.medium}
            onChange={(event) => onChangeLink(link.id, { medium: event.target.value as Medium })}
          >
            {offered.map((medium) => (
              <option key={medium} value={medium}>
                {MEDIUM[medium].label} ({MEDIUM[medium].connector})
              </option>
            ))}
          </select>
        </label>

        {link.medium === 'utp' ? (
          <fieldset className="field">
            <legend className="field-label">Which way round the wires go</legend>
            <label className="choice">
              <input
                type="radio"
                name={`wiring-${link.id}`}
                checked={link.wiring === 'straight'}
                onChange={() => onChangeLink(link.id, { wiring: 'straight' })}
              />
              <span>Straight through</span>
            </label>
            <label className="choice">
              <input
                type="radio"
                name={`wiring-${link.id}`}
                checked={link.wiring === 'crossover'}
                onChange={() => onChangeLink(link.id, { wiring: 'crossover' })}
              />
              <span>Crossover</span>
            </label>
          </fieldset>
        ) : null}

        <p className="field-hint">{spec.note}</p>
        <p className="field-hint">
          One frame takes <span className="num">{spec.oneWayMs} ms</span> to cross this cable, one
          way. A ping crosses it twice, once each direction, so on its own this cable adds{' '}
          <span className="num">{(spec.oneWayMs * 2).toFixed(1)} ms</span> to the round trip.
        </p>

        {carries ? null : (
          <p className="notice">
            Nothing crosses this cable. Two devices of the same sort, both computers or both
            switches, transmit on the same pair of wires, so a cable between them has to be a{' '}
            {needed}. Wire it that way, or turn on a port that works it out for itself.
          </p>
        )}
      </section>
    );
  }

  if (node === null) return <section className="section" />;

  const spec = KIND[node.kind];
  const config = node.config;
  const addressed = addressedPorts(config);
  const shown = primaryPort(config);

  const setPort = (index: number, next: Port) => {
    onChangeConfig(node.id, {
      ...config,
      ports: config.ports.map((port, at) => (at === index ? next : port)),
    });
  };

  const hasTables = addressed.length > 0 || arp.length > 0 || macs.length > 0 || stats !== null;

  return (
    <section className="section">
      <h2 className="rail-title">
        {node.label} <span className="kind-note">{spec.label}</span>
      </h2>

      {hasAddresses(node.kind) ? (
        config.ports.map((port, index) => (
          <PortFields key={port.name} port={port} onChange={(next) => setPort(index, next)} />
        ))
      ) : (
        <p className="muted">{config.ports.length} ports, no address of its own.</p>
      )}

      {node.kind === 'pc' || node.kind === 'router' || node.kind === 'firewall' ? (
        <label className="field">
          <Term text="Gateway" topic="gateway" />
          <input
            className="input"
            value={config.gateway}
            spellCheck={false}
            placeholder="nothing set"
            aria-invalid={config.gateway !== '' && parseIpv4(config.gateway) === null}
            onChange={(event) => onChangeConfig(node.id, { ...config, gateway: event.target.value })}
          />
        </label>
      ) : null}

      {node.kind === 'firewall' ? (
        <label className="field">
          <span className="field-label">Faces the outside</span>
          <select
            className="select"
            value={config.outerPort}
            onChange={(event) => onChangeConfig(node.id, { ...config, outerPort: event.target.value })}
          >
            {config.ports.map((port) => (
              <option key={port.name} value={port.name}>
                {port.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {supportsMedium(node.kind, 'utp') ? (
        <label className="choice">
          <input
            type="checkbox"
            checked={config.autoMdix}
            onChange={(event) =>
              onChangeConfig(node.id, { ...config, autoMdix: event.target.checked })
            }
          />
          <Term text="Ports work the cable out by themselves" topic="auto-mdix" />
        </label>
      ) : null}

      {shown === null || addressed.length === 0 ? null : (
        <dl className="readout">
          <div className="readout-row">
            <dt>Same network as this device</dt>
            <dd>{neighbours.length === 0 ? 'nothing else' : neighbours.join(', ')}</dd>
          </div>
          {addressed.length > 1 ? (
            <div className="readout-row">
              <dt>Networks it joins</dt>
              <dd className="num">{addressed.length}</dd>
            </div>
          ) : null}
        </dl>
      )}

      {hasTables ? (
        <details className="disclosure">
          <summary>Tables</summary>
          <div className="disclosure-body">
            {addressed.length > 0 ? (
              <>
                <h3 className="rail-subtitle">Addresses it knows</h3>
                {arp.length === 0 ? (
                  <p className="muted">Nothing learned yet.</p>
                ) : (
                  <table className="arp num">
                    <tbody>
                      {arp.map((entry) => (
                        <tr key={entry.ip}>
                          <td>{entry.ip}</td>
                          <td>{entry.mac}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : null}

            {node.kind === 'switch' ? (
              <>
                <h3 className="rail-subtitle">Address on each port</h3>
                {macs.length === 0 ? (
                  <p className="muted">Nothing learned yet.</p>
                ) : (
                  <table className="arp num">
                    <tbody>
                      {macs.map((entry) => (
                        <tr key={entry.mac}>
                          <td>{entry.mac}</td>
                          <td>{entry.port}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : null}

            {node.kind === 'firewall' ? (
              <dl className="readout">
                <div className="readout-row">
                  <dt>Conversations let out</dt>
                  <dd className="num">{flows}</dd>
                </div>
              </dl>
            ) : null}

            {stats === null ? null : (
              <dl className="readout">
                <div className="readout-row">
                  <dt>Frames sent</dt>
                  <dd className="num">{stats.framesSent}</dd>
                </div>
                <div className="readout-row">
                  <dt>Frames received</dt>
                  <dd className="num">{stats.framesReceived}</dd>
                </div>
                <div className="readout-row">
                  <dt>Thrown away on arrival</dt>
                  <dd className="num">{stats.framesDropped}</dd>
                </div>
              </dl>
            )}

            <button type="button" className="btn" onClick={onClearAddresses}>
              Forget every address
            </button>
          </div>
        </details>
      ) : null}
    </section>
  );
}
