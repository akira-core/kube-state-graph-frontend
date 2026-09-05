import { EDGE_STYLE_BY_TYPE } from '../../shared/constants/colorByEdgeType';
import { ICON_SVG_BY_KIND } from '../../shared/constants/iconSvgByKind';
import type { EdgeType, NodeKind } from '../../shared/constants/types';
import { isFilterableKind } from '../element-filter';

export const ALL_KINDS = (Object.keys(ICON_SVG_BY_KIND) as NodeKind[]).filter(isFilterableKind);
export const ALL_EDGE_TYPES = Object.keys(EDGE_STYLE_BY_TYPE) as EdgeType[];
