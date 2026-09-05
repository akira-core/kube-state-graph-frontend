import cytoscape from 'cytoscape';

import { NETWORK_HOP_DASH_PATTERN } from '../../../shared/constants/colorByEdgeType';
import { EDGE_RELATION_LINK, EDGE_RELATION_TRANSPORT } from '../../../shared/constants/edgeRelation';
import { INGRESS_LABEL_KEY, INGRESS_LABEL_VALUE } from '../../../shared/constants/ingressGateway';
import { SHOWCASE_GRAPH } from '../../../shared/fixtures/showcaseGraph';
import { DARK_TOKENS } from '../../../shared/theme/tokens';
import { normalizeGraph } from '../../graph-data';

import { getStylesheet } from './getStylesheet';

// Cross-layer test. normalize (which SETS the data fields) and getStylesheet (which
// DECLARES the selectors) are each unit-tested, but nothing joins them — they meet only
// through a selector string, so a rename on either side would leave both suites green and
// every dashed edge solid on canvas. This runs the real pipeline into a headless cytoscape
// and reads the line-style cytoscape actually computes per edge.
function build(payload: unknown): cytoscape.Core {
  const { elements, errors } = normalizeGraph(payload);
  expect(errors).toEqual([]);
  return cytoscape({
    headless: true,
    styleEnabled: true,
    elements,
    style: getStylesheet({ theme: DARK_TOKENS }),
  });
}

// cy.style() is typed `any`; String() keeps the assertions honest without a cast (a missing
// value would surface as "undefined" and fail loudly rather than silently pass).
const styleOf = (cy: cytoscape.Core, id: string, prop: string): string => String(cy.$id(id).style(prop));

const lineStyleOf = (cy: cytoscape.Core, id: string): string => {
  expect(cy.$id(id).nonempty()).toBe(true);
  return styleOf(cy, id, 'line-style');
};

// cytoscape reports line-dash-pattern back as a space-joined string, not the array given.
const DASH_PATTERN = NETWORK_HOP_DASH_PATTERN.join(' ');
const dashPatternOf = (cy: cytoscape.Core, id: string): string => styleOf(cy, id, 'line-dash-pattern');

describe('dashed edges end-to-end (normalize → stylesheet → cytoscape)', () => {
  describe('the provisioned showcase fixture', () => {
    // The demo dashboard IS the fixture: reading it here means the committed showcase and
    // the code cannot drift apart, and a corrupted inline payload fails loudly right here.
    const payload = SHOWCASE_GRAPH;

    let cy: cytoscape.Core;
    beforeAll(() => {
      cy = build(payload);
    });
    afterAll(() => {
      cy.destroy();
    });

    it.each([
      ['e-svc-3', 'gateway → nats-svc, the producer’s hop onto the broker'],
      ['e-svc-1', 'consumer → nats-svc, the consumer’s hop onto the broker'],
    ])('dashes the relation=transport edge %s (%s)', (id) => {
      expect(lineStyleOf(cy, id)).toBe('dashed');
      expect(dashPatternOf(cy, id)).toBe(DASH_PATTERN);
    });

    it.each([
      ['e-ing-0', 'pod → ingress-svc'],
      ['e-sel-6', 'ingress-svc → ingress-pod'],
      ['e-ing-1', 'ingress-pod → backend-svc'],
    ])('dashes the ingress-path edge %s (%s)', (id) => {
      expect(lineStyleOf(cy, id)).toBe('dashed');
      expect(dashPatternOf(cy, id)).toBe(DASH_PATTERN);
    });

    it('leaves the relation=link edge solid — it is the real dependency, not a hop', () => {
      expect(cy.$id('e-p2p-0').data('relation')).toBe(EDGE_RELATION_LINK);
      expect(lineStyleOf(cy, 'e-p2p-0')).toBe('solid');
    });

    it.each([
      ['e-svc-0', 'unlabelled pod-calls-service'],
      ['e-p2p-1', 'unlabelled pod-calls-pod'],
      ['e-ptn-0', 'pod-to-node'],
      ['e-sw-0', 'switch-to-switch'],
      ['e-pvc-0', 'pod-mounts-pvc'],
    ])('leaves %s solid (%s)', (id) => {
      expect(lineStyleOf(cy, id)).toBe('solid');
    });

    it('dashes nothing beyond the transport + ingress edges', () => {
      const dashed = cy
        .edges()
        .filter((e) => (e.style('line-style') as unknown as string) === 'dashed')
        .map((e) => e.id())
        .sort();
      expect(dashed).toEqual(['e-ing-0', 'e-ing-1', 'e-sel-6', 'e-svc-1', 'e-svc-3']);
    });
  });

  describe('an edge that is both ingress-path and transport', () => {
    // Not something the showcase should stage (a gateway hop labelled transport is not a
    // real backend shape), but the two rules do overlap by construction — pin that they
    // agree so the declaration order between them never becomes load-bearing.
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'pod/client', name: 'client', type: 'pod' } },
          {
            data: {
              id: 'service/igw',
              name: 'igw',
              type: 'service',
              labels: { [INGRESS_LABEL_KEY]: INGRESS_LABEL_VALUE },
            },
          },
        ],
        edges: [
          {
            data: {
              id: 'e-both',
              source: 'pod/client',
              target: 'service/igw',
              type: 'pod-calls-service',
              labels: { relation: EDGE_RELATION_TRANSPORT },
            },
          },
        ],
      },
    };

    it('resolves to the same dashed stroke either rule would produce', () => {
      const cy = build(payload);
      const edge = cy.$id('e-both');
      expect(edge.data('ingressPath')).toBe(true);
      expect(edge.data('relation')).toBe(EDGE_RELATION_TRANSPORT);
      expect(edge.style('line-style')).toBe('dashed');
      expect(dashPatternOf(cy, 'e-both')).toBe(DASH_PATTERN);
      cy.destroy();
    });
  });
});
