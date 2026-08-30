import type cytoscape from 'cytoscape';

import { clusterCollapseToggle } from './clusterCollapseToggle';

interface FakeApi {
  isExpandable: jest.Mock;
  isCollapsible: jest.Mock;
  expand: jest.Mock;
  collapse: jest.Mock;
}

function makeApi(overrides: Partial<Record<keyof FakeApi, boolean>> = {}): FakeApi {
  return {
    isExpandable: jest.fn(() => overrides.isExpandable ?? false),
    isCollapsible: jest.fn(() => overrides.isCollapsible ?? false),
    expand: jest.fn(),
    collapse: jest.fn(),
  };
}

function makeNode(flags: boolean | Record<string, boolean>): cytoscape.NodeSingular {
  const data = typeof flags === 'boolean' ? { isCluster: flags } : flags;
  return {
    data: (key: string): unknown => data[key],
  } as unknown as cytoscape.NodeSingular;
}

describe('clusterCollapseToggle', () => {
  it('expands a currently-collapsed cluster (isExpandable → expand)', () => {
    const api = makeApi({ isExpandable: true });
    const node = makeNode(true);
    clusterCollapseToggle(node, api as unknown as cytoscape.ExpandCollapseApi);
    expect(api.expand).toHaveBeenCalledWith(node);
    expect(api.collapse).not.toHaveBeenCalled();
  });

  it('collapses a currently-expanded cluster (not expandable but collapsible → collapse)', () => {
    const api = makeApi({ isExpandable: false, isCollapsible: true });
    const node = makeNode(true);
    clusterCollapseToggle(node, api as unknown as cytoscape.ExpandCollapseApi);
    expect(api.collapse).toHaveBeenCalledWith(node);
    expect(api.expand).not.toHaveBeenCalled();
  });

  it('does nothing for a non-cluster node (guard: never touches the api)', () => {
    const api = makeApi({ isExpandable: true, isCollapsible: true });
    const node = makeNode(false);
    clusterCollapseToggle(node, api as unknown as cytoscape.ExpandCollapseApi);
    expect(api.expand).not.toHaveBeenCalled();
    expect(api.collapse).not.toHaveBeenCalled();
    expect(api.isExpandable).not.toHaveBeenCalled();
  });
  it('collapses a storage-cluster group on double-tap', () => {
    // Non-selectable like `cluster`, so the +/- cue never appears on it; without this
    // gesture the folder-glyph collapsed state would be unreachable.
    const api = makeApi({ isExpandable: false, isCollapsible: true });
    const node = makeNode({ isStorageCluster: true });
    clusterCollapseToggle(node, api as unknown as cytoscape.ExpandCollapseApi);
    expect(api.collapse).toHaveBeenCalledWith(node);
    expect(api.expand).not.toHaveBeenCalled();
  });

  it('expands a collapsed storage-cluster group on double-tap', () => {
    const api = makeApi({ isExpandable: true });
    const node = makeNode({ isStorageCluster: true });
    clusterCollapseToggle(node, api as unknown as cytoscape.ExpandCollapseApi);
    expect(api.expand).toHaveBeenCalledWith(node);
    expect(api.collapse).not.toHaveBeenCalled();
  });

  it('is a no-op on a selectable container that has its own collapse cue', () => {
    const api = makeApi({ isExpandable: true, isCollapsible: true });
    const node = makeNode({ isController: true });
    clusterCollapseToggle(node, api as unknown as cytoscape.ExpandCollapseApi);
    expect(api.expand).not.toHaveBeenCalled();
    expect(api.collapse).not.toHaveBeenCalled();
  });
});
