# Third-party assets in this project

**Decision taken 2026-10-11: take all sixteen symbols.** All of them are vendored into
`public/symbols/`, byte for byte, with the RDF metadata inside each file left untouched. No file was
edited, cropped or recoloured, so the licence statement each one carries is still the one it shipped
with.

Consequence, stated plainly: **this project is now GPL-2.0-or-later**, because ten of the sixteen
symbols are GPL-2.0 and distributing them together with the application makes the whole thing a work
under that licence. That is what `LICENSE` and the README say.

The symbols are used through `<image href="/symbols/....svg">` on the canvas. The browser scales them
to fit, so the missing `viewBox` in the originals does not need fixing, and they keep their own
colours rather than taking the theme tokens the rest of the interface uses.

## What was examined

`reference/gns3-gui` is a shallow clone of <https://github.com/GNS3/gns3-gui> at
`c776d4ef3764b3db8ed21c8e4eedbd6cd388e5dc` (committed 2026-08-16, cloned 2026-10-11). It is
reference material: nothing in `src/` imports from it, and it is not part of the build. It is listed
in `.gitignore` so a clone of a third-party tree does not end up in this repository's history.

There is no `GNS3/gns3-symbols` repository (GitHub answers 404), so the 16 symbols in
`resources/symbols` are the whole default library that ships with the application. Further symbols
come from a user's own symbols directory or from a GNS3 server.

## The 16 symbols, and what each one is licensed under

Licences below were read out of the RDF metadata embedded in each SVG file. They are not guesses.

| File | What it is | Licence | Author |
| --- | --- | --- | --- |
| `computer.svg` | a desktop PC | Public domain | Andy Fitzsimon |
| `docker_guest.svg` | Docker logo on a PC | Public domain | Andy Fitzsimon |
| `qemu_guest.svg` | QEMU logo on a PC | Public domain | Andy Fitzsimon |
| `vbox_guest.svg` | VirtualBox logo on a PC | Public domain | Andy Fitzsimon |
| `vmware_guest.svg` | VMware logo on a PC | Public domain | Andy Fitzsimon |
| `vpcs_guest.svg` | VPCS logo on a PC | Public domain | Andy Fitzsimon |
| `router.svg` | router | GPL-2.0 | Jeremy Grossmann |
| `ethernet_switch.svg` | switch | GPL-2.0 | Jeremy Grossmann |
| `multilayer_switch.svg` | layer 3 switch | GPL-2.0 | Jeremy Grossmann |
| `hub.svg` | hub | GPL-2.0 | Jeremy Grossmann |
| `firewall.svg` | firewall | GPL-2.0 | Jeremy Grossmann |
| `cloud.svg` | the internet | GPL-2.0 | Jeremy Grossmann |
| `nat.svg` | NAT cloud | GPL-2.0 | Jeremy Grossmann |
| `asa.svg` | Cisco ASA | GPL-2.0 | Jeremy Grossmann |
| `atm_switch.svg` | ATM switch | GPL-2.0 | Jeremy Grossmann |
| `frame_relay_switch.svg` | frame relay switch | GPL-2.0 | Jeremy Grossmann |

The public domain six come from the Etiquette icon set, published through openclipart, and carry
`cc:license rdf:resource="http://web.resource.org/cc/PublicDomain"`.

The other ten carry `cc:license rdf:resource="http://creativecommons.org/licenses/GPL/2.0/"` and
`dc:description: Created for the GNS-3 project (www.gns3.net)`.

## What that meant for this project

Every symbol that would be useful here, a switch, a router, a hub, a firewall, a cloud, is
**GPL-2.0**. The six that are public domain are a PC and five hypervisor logos, and only the PC is of
any use to a CCNA course. Taking all sixteen therefore means the project moved from MIT to
GPL-2.0-or-later, which is what happened.

## Credits

- **Jeremy Grossmann**, for the GNS3 project: router, ethernet_switch, multilayer_switch, hub,
  firewall, cloud, nat, asa, atm_switch, frame_relay_switch. GPL-2.0.
- **Andy Fitzsimon**, Etiquette icon set via openclipart: computer, docker_guest, qemu_guest,
  vbox_guest, vmware_guest, vpcs_guest. Public domain.

## Technical notes

- The files have **no `viewBox`** and are sized in points or centimetres. Each one has to be given a
  box before it can scale, so per-symbol fitting is unavoidable.
- They use between 4 and 133 **hardcoded colours**. They cannot take a theme token, cannot be
  recoloured per device group, and cannot be measured by `theme.contrast.test.ts`. The rest of the
  interface is flat and token-coloured, so they read as a different visual language dropped into it.
- Their sizes are inconsistent: 51x48, 65x59, 72x32, 170x76. In one 148x96 device box some would be
  scaled up and others down, so the boxes would carry visibly different weight.
- Most of the set would never be used in a CCNA course: five hypervisor logos, ATM, frame relay,
  Cisco ASA.
- Several of them follow Cisco's own icon style. Even where a GNS3 file is licensed for reuse,
  reproducing Cisco's trade dress is a separate question from the file's licence.

## The link and cable design, for reference

GNS3's cables are drawn in `reference/gns3-gui/gns3/items/link_item.py` and its
`ethernet_link_item.py` / `serial_link_item.py` subclasses. The useful ideas, none of which are
assets and none of which are copied:

- a cable is a 2 px line, drawn under the devices;
- each end is labelled with the **interface** it is plugged into, which is what makes a cable
  readable rather than decorative;
- a cable carries small status marks in the middle for things like a packet capture in progress;
- hover highlights the cable.

Point 2 is the gap in this project: the canvas draws a cable and its travel time, and does not name
the interface at either end.
