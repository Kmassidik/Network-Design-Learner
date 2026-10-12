/*
 * How big a device is on the board. It lives on its own, with no layer around
 * it, because two layers need it and neither owns it: the canvas draws the box,
 * and the board tests check that two devices handed to a reader are not sitting
 * on top of each other. Putting it in the components folder made the tests for
 * the boards depend on the interface, which is the wrong way round.
 */

/** Size of a device box in world units. The canvas pans and zooms over these. */
export const NODE_W = 176;
export const NODE_H = 144;

/**
 * Where the picture sits inside the box. It is deliberately close to square:
 * the third-party symbols range from nearly square (a computer) to more than
 * twice as wide as they are tall (a switch), and a picture box that is wide and
 * short shrinks every square symbol to nothing while leaving empty space either
 * side of it.
 */
export const PICTURE_BOX = { x: -60, y: -68, width: 120, height: 86 };
