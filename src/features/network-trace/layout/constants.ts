// Geometry the network trace adds on top of the shared `sankey-canvas` set: residual blocks,
// the anchor card, ownership lines and the clients table. Card sizes, slot rows, ribbon
// thickness and column gaps are the shared numbers so trace cards match storage cards.

/** Residual block length (its height follows the ribbon scale) and the gap to its label. */
export const RES_LEN = 34;
export const RES_GAP = 8;
/** Room on both sides for residual labels, which hang outside the outermost cards. */
export const PAD_SIDE = 122;
export const ANCHOR_W = 152;
/**
 * Ownership line width: carries no amount, so it must not weigh like a ribbon; but a
 * `fill: none` path is hit-tested by its stroke, so it cannot be hairline-thin either.
 */
export const OWN_T = 2.4;

/** Kinds drawn with the dashed "device" border (k8s node / pod, the NetApp three). */
export const DEVICE_KINDS: readonly string[] = ['node', 'pod', 'netapp-node', 'netapp-aggr', 'netapp-svm'];

/**
 * The clients table on a leaf card: one row per client, every row listed, columns aligned
 * in the card's monospace body. Widths are in character cells; `budget` is the clip
 * length. A column no client fills is not drawn, so a port with one IP is not a wide table.
 */
export interface ClientCol {
  key: 'hostname' | 'ip' | 'owner';
  budget: number;
}
export const CLIENT_COLS: readonly ClientCol[] = [
  { key: 'hostname', budget: 24 },
  { key: 'ip', budget: 15 },
  { key: 'owner', budget: 18 },
];
/** Approximate advance of one monospace cell at the card body's 10px size. */
export const CLIENT_CELL_W = 6.1;
export const CLIENT_COL_GAP = 2;
export const CLIENT_PAD = 10;

/** Extra vertical room between the k8s partition and the client partition of a k8s-band column. */
export const BAND_GAP = 56;
/** Extra horizontal room where one band ends and the next begins (on top of COL_GAP). */
export const BAND_COL_GAP = 48;
