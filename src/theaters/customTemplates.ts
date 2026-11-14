import {
  CustomTheaterLayout,
  CustomSeat,
  CustomLabel,
  CustomLegendItem,
  SavedCustomLayout,
} from './customTheaterTypes';
import { UPLUS_STAGE_ROWS, UPLUS_BALCONY_SEATS } from './uPlusStage';

export const CURRENT_SCHEMA_VERSION = 2;
export const DEFAULT_SEAT_COLOR = '#ffffff';
export const DEFAULT_STAGE_BG_COLOR = '#1e293b';
export const DEFAULT_STAGE_TEXT_COLOR = '#f8fafc';
export const DEFAULT_STAGE_BORDER_COLOR = '#334155';
export const DEFAULT_LABEL_TEXT_COLOR = '#334155';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_REGEX.test(value.trim());
}

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (isValidHexColor(value)) {
    return value.trim().toLowerCase();
  }
  return fallback;
}

export function getReadableTextColor(hexColor: string): '#ffffff' | '#0f172a' {
  const safeHex = sanitizeHexColor(hexColor, DEFAULT_SEAT_COLOR);
  const r = parseInt(safeHex.slice(1, 3), 16);
  const g = parseInt(safeHex.slice(3, 5), 16);
  const b = parseInt(safeHex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq < 150 ? '#ffffff' : '#0f172a';
}

export function sanitizeAndMigrateLayout(raw: Partial<CustomTheaterLayout>): {
  layout: CustomTheaterLayout;
  hadInvalidColors: boolean;
} {
  let hadInvalidColors = false;

  const seats: CustomSeat[] = Array.isArray(raw.seats)
    ? raw.seats
        .filter((seat): seat is CustomSeat => Boolean(seat && typeof seat === 'object'))
        .map((seat) => {
          let validColor: string | undefined = undefined;
          if (seat.color !== undefined && seat.color !== null && seat.color !== '') {
            if (isValidHexColor(seat.color)) {
              validColor = seat.color.trim().toLowerCase();
            } else {
              validColor = DEFAULT_SEAT_COLOR;
              hadInvalidColors = true;
            }
          }
          return {
            ...seat,
            color: validColor,
          };
        })
    : [];

  const labels: CustomLabel[] = Array.isArray(raw.labels)
    ? raw.labels
        .filter((lbl): lbl is CustomLabel => Boolean(lbl && typeof lbl === 'object'))
        .map((lbl) => {
          if (lbl.isStageBanner) {
            const nextBg =
              lbl.bgColor !== undefined && lbl.bgColor !== null && lbl.bgColor !== ''
                ? isValidHexColor(lbl.bgColor)
                  ? lbl.bgColor.trim().toLowerCase()
                  : ((hadInvalidColors = true), DEFAULT_STAGE_BG_COLOR)
                : DEFAULT_STAGE_BG_COLOR;

            const nextText =
              lbl.color !== undefined && lbl.color !== null && lbl.color !== ''
                ? isValidHexColor(lbl.color)
                  ? lbl.color.trim().toLowerCase()
                  : ((hadInvalidColors = true), DEFAULT_STAGE_TEXT_COLOR)
                : DEFAULT_STAGE_TEXT_COLOR;

            const nextBorder =
              lbl.borderColor !== undefined &&
              lbl.borderColor !== null &&
              lbl.borderColor !== ''
                ? isValidHexColor(lbl.borderColor)
                  ? lbl.borderColor.trim().toLowerCase()
                  : ((hadInvalidColors = true), DEFAULT_STAGE_BORDER_COLOR)
                : DEFAULT_STAGE_BORDER_COLOR;

            return {
              ...lbl,
              bgColor: nextBg,
              color: nextText,
              borderColor: nextBorder,
            };
          }

          let nextColor = lbl.color;
          if (lbl.color !== undefined && lbl.color !== null && lbl.color !== '') {
            if (isValidHexColor(lbl.color)) {
              nextColor = lbl.color.trim().toLowerCase();
            } else {
              nextColor = DEFAULT_LABEL_TEXT_COLOR;
              hadInvalidColors = true;
            }
          }

          let nextBg = lbl.bgColor;
          if (lbl.bgColor !== undefined && lbl.bgColor !== null && lbl.bgColor !== '') {
            if (isValidHexColor(lbl.bgColor)) {
              nextBg = lbl.bgColor.trim().toLowerCase();
            } else {
              nextBg = '#f8fafc';
              hadInvalidColors = true;
            }
          }

          let nextBorder = lbl.borderColor;
          if (
            lbl.borderColor !== undefined &&
            lbl.borderColor !== null &&
            lbl.borderColor !== ''
          ) {
            if (isValidHexColor(lbl.borderColor)) {
              nextBorder = lbl.borderColor.trim().toLowerCase();
            } else {
              nextBorder = '#cbd5e1';
              hadInvalidColors = true;
            }
          }

          return {
            ...lbl,
            color: nextColor,
            bgColor: nextBg,
            borderColor: nextBorder,
          };
        })
    : [];

  const legend: CustomLegendItem[] = Array.isArray(raw.legend)
    ? raw.legend
        .filter((item): item is CustomLegendItem => Boolean(item && typeof item === 'object'))
        .map((item) => {
          const validColor = isValidHexColor(item.color)
            ? item.color.trim().toLowerCase()
            : ((hadInvalidColors = true), DEFAULT_SEAT_COLOR);
          return {
            id: typeof item.id === 'string' && item.id ? item.id : nextUniqueId('legend'),
            color: validColor,
            label: typeof item.label === 'string' ? item.label : '',
          };
        })
    : [];

  return {
    layout: {
      version: CURRENT_SCHEMA_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      name: typeof raw.name === 'string' && raw.name ? raw.name : '새 커스텀 좌석배치도',
      savedId: typeof raw.savedId === 'string' ? raw.savedId : undefined,
      shareCode:
        typeof raw.shareCode === 'string' && /^[A-Z0-9\-]{4,32}$/.test(raw.shareCode)
          ? raw.shareCode
          : undefined,
      isPublic: typeof raw.isPublic === 'boolean' ? raw.isPublic : undefined,
      updatedAt:
        typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      canvasWidth: typeof raw.canvasWidth === 'number' ? raw.canvasWidth : 1200,
      canvasHeight: typeof raw.canvasHeight === 'number' ? raw.canvasHeight : 800,
      gridSize: typeof raw.gridSize === 'number' ? raw.gridSize : 20,
      snapToGrid: raw.snapToGrid !== false,
      seats,
      labels,
      legend,
    },
    hadInvalidColors,
  };
}

let idCounter = 0;
function nextUniqueId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}-${Math.random().toString(36).substring(2, 7)}`;
}

export function generateValidFirestoreDocId(prefix = 'layout'): string {
  idCounter += 1;
  const rand = Math.random().toString(36).replace(/[^a-zA-Z0-9]/g, '').substring(0, 6);
  return `${prefix}_${Date.now()}_${idCounter}_${rand}`;
}

export function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SEAT-${part1}-${part2}`;
}

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function createBlankLayout(name = '새 커스텀 좌석배치도'): CustomTheaterLayout {
  const stageBanner: CustomLabel = {
    id: nextUniqueId('stage'),
    text: 'STAGE',
    x: 400,
    y: 40,
    width: 400,
    height: 38,
    fontSize: 14,
    fontWeight: 'black',
    color: DEFAULT_STAGE_TEXT_COLOR,
    bgColor: DEFAULT_STAGE_BG_COLOR,
    borderColor: DEFAULT_STAGE_BORDER_COLOR,
    borderRadius: 6,
    isStageBanner: true,
  };

  return {
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name,
    updatedAt: new Date().toISOString(),
    canvasWidth: 1200,
    canvasHeight: 800,
    gridSize: 20,
    snapToGrid: true,
    seats: [],
    labels: [stageBanner],
    legend: [],
  };
}

// ==============================================================
// 깊은 복사 헬퍼 (원본 참조 분리 및 모든 좌석/라벨/범례 ID 새로 생성)
// ==============================================================
export function cloneLayoutWithNewIds(
  source: CustomTheaterLayout,
  options?: { newName?: string; preserveSavedId?: boolean }
): CustomTheaterLayout {
  const { layout: sanitized } = sanitizeAndMigrateLayout(source);
  const groupIdMap = new Map<string, string>();
  const clonedSeats: CustomSeat[] = sanitized.seats.map((seat) => {
    let mappedGroupId = seat.groupId;
    if (seat.groupId) {
      if (!groupIdMap.has(seat.groupId)) {
        groupIdMap.set(seat.groupId, nextUniqueId('grp'));
      }
      mappedGroupId = groupIdMap.get(seat.groupId);
    }
    return {
      ...seat,
      id: nextUniqueId('seat'),
      groupId: mappedGroupId,
    };
  });

  const clonedLabels: CustomLabel[] = sanitized.labels.map((lbl) => ({
    ...lbl,
    id: nextUniqueId(lbl.isStageBanner ? 'stage' : 'label'),
  }));

  const clonedLegend: CustomLegendItem[] = (sanitized.legend || []).map((item) => ({
    ...item,
    id: nextUniqueId('legend'),
  }));

  return {
    ...sanitized,
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: options?.newName ?? sanitized.name,
    savedId: options?.preserveSavedId ? sanitized.savedId : undefined,
    shareCode: options?.preserveSavedId ? sanitized.shareCode : undefined,
    isPublic: options?.preserveSavedId ? sanitized.isPublic : undefined,
    updatedAt: new Date().toISOString(),
    seats: clonedSeats,
    labels: clonedLabels,
    legend: clonedLegend,
  };
}

// ==============================================================
// LG SIGNATURE Hall 배치도 데이터 (읽기 전용 원본 참조용)
// ==============================================================
interface LGPreciseRowDef {
  rowName: string;
  leftIndent: number;
  leftSeats: number[];
  centerIndent: number;
  centerSeats: number[];
  rightIndent: number;
  rightSeats: number[];
}

const LG_F1_OP_TOP: readonly LGPreciseRowDef[] = [
  { rowName: 'OP1열', leftIndent: 9, leftSeats: [], centerIndent: 1, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25], rightIndent: 9, rightSeats: [] },
  { rowName: 'OP2열', leftIndent: 6, leftSeats: [7, 8, 9], centerIndent: 1, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], rightIndent: 0, rightSeats: [29, 30, 31] },
  { rowName: 'OP3열', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 1, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
];

const LG_F1_OP_BOTTOM: readonly LGPreciseRowDef[] = [
  { rowName: 'OP4열', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 1, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
  { rowName: 'OP5열', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
];

const LG_F1_MAIN_UPPER: readonly LGPreciseRowDef[] = [
  { rowName: '1열', leftIndent: 9, leftSeats: [], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 9, rightSeats: [] },
  { rowName: '2열', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
  { rowName: '3열', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
  { rowName: '4열', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33] },
  { rowName: '5열', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33] },
  { rowName: '6열', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33] },
  { rowName: '7열', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34] },
  { rowName: '8열', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34] },
  { rowName: '9열', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34] },
  { rowName: '10열', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34] },
  { rowName: '11열', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34] },
  { rowName: '12열', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33] },
  { rowName: '13열', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
  { rowName: '14열', leftIndent: 7, leftSeats: [8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 7, rightSeats: [29, 30] },
  { rowName: '15열', leftIndent: 9, leftSeats: [], centerIndent: 1, centerSeats: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 9, rightSeats: [] },
  { rowName: '16열', leftIndent: 9, leftSeats: [], centerIndent: 5, centerSeats: [15, 16, 17, 18, 19, 20, 21, 22], rightIndent: 9, rightSeats: [] },
];

const LG_F1_MAIN_LOWER: readonly LGPreciseRowDef[] = [
  { rowName: '17열', leftIndent: 0, leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34, 35, 36, 37] },
  { rowName: '18열', leftIndent: 0, leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34, 35, 36, 37] },
  { rowName: '19열', leftIndent: 0, leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34, 35, 36, 37] },
  { rowName: '20열', leftIndent: 0, leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34, 35, 36, 37] },
];

const LG_F2_ROWS: readonly LGPreciseRowDef[] = [
  { rowName: '1열', leftIndent: 0, leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], centerIndent: 2, centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45] },
  { rowName: '2열', leftIndent: 1, leftSeats: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], centerIndent: 1, centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29], rightIndent: 0, rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44] },
  { rowName: '3열', leftIndent: 2, leftSeats: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], centerIndent: 1, centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], rightIndent: 0, rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43] },
  { rowName: '4열', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13], centerIndent: 0, centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], rightIndent: 0, rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42] },
  { rowName: '5열', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13], centerIndent: 0, centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32], rightIndent: 0, rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42] },
  { rowName: '6열', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9, 10, 11, 12, 13], centerIndent: 0, centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], rightIndent: 0, rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41] },
  { rowName: '7열', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9, 10, 11, 12, 13], centerIndent: 0, centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32], rightIndent: 0, rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41] },
  { rowName: '8열', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9, 10, 11, 12, 13], centerIndent: 0, centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32], rightIndent: 0, rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41] },
];

const LG_F3_ROWS: readonly LGPreciseRowDef[] = [
  { rowName: '1열', leftIndent: 0, leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], centerIndent: 2, centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43] },
  { rowName: '2열', leftIndent: 1, leftSeats: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], centerIndent: 1, centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42] },
  { rowName: '3열', leftIndent: 1, leftSeats: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], centerIndent: 1, centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29], rightIndent: 0, rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42] },
  { rowName: '4열', leftIndent: 2, leftSeats: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], centerIndent: 0, centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], rightIndent: 0, rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41] },
  { rowName: '5열', leftIndent: 2, leftSeats: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], centerIndent: 0, centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], rightIndent: 0, rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41] },
  { rowName: '6열', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9, 10, 11, 12], centerIndent: 0, centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], rightIndent: 0, rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40] },
  { rowName: '7열', leftIndent: 5, leftSeats: [6, 7, 8, 9, 10, 11, 12], centerIndent: 0, centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], rightIndent: 0, rightSeats: [32, 33, 34, 35, 36, 37, 38] },
  { rowName: '8열', leftIndent: 12, leftSeats: [], centerIndent: 1, centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 12, rightSeats: [] },
];

export function createLGSignatureHallCopy(): CustomTheaterLayout {
  const canvasWidth = 1320;
  const seatW = 22;
  const seatH = 24;
  const stepX = 24;
  const stepY = 27;
  const aisleGap = 16;

  // 통일된 중앙/통로 축 (centerX = 660, center 19 slots = 456px)
  const centerStartX = 432;
  const centerWidth = 19 * stepX; // 456
  const rightStartX = centerStartX + centerWidth + aisleGap; // 904

  const seats: CustomSeat[] = [];
  const labels: CustomLabel[] = [];

  // 1. STAGE 배너
  labels.push({
    id: nextUniqueId('stage'),
    text: 'STAGE',
    x: 410,
    y: 30,
    width: 500,
    height: 36,
    fontSize: 14,
    fontWeight: 'black',
    color: '#f8fafc',
    bgColor: '#1e293b',
    borderColor: '#334155',
    borderRadius: 6,
    isStageBanner: true,
  });

  const pushPreciseRow = (
    floor: string,
    row: LGPreciseRowDef,
    y: number,
    maxLeftSlots: number
  ) => {
    const leftStartX = centerStartX - aisleGap - maxLeftSlots * stepX;
    const outerLeftIndent = maxLeftSlots - (row.leftIndent + row.leftSeats.length);
    const totalLeftIndent = row.leftIndent + (outerLeftIndent > 0 ? outerLeftIndent : 0);

    // 좌측 열 라벨
    labels.push({
      id: nextUniqueId('label'),
      text: row.rowName,
      x: leftStartX - 42,
      y: y + 15,
      fontSize: 10,
      fontWeight: 'bold',
      color: '#334155',
    });

    // 우측 열 라벨
    const rightEndX =
      floor === '1층' ? rightStartX + 9 * stepX : rightStartX + 13 * stepX;
    labels.push({
      id: nextUniqueId('label'),
      text: row.rowName,
      x: rightEndX + 10,
      y: y + 15,
      fontSize: 10,
      fontWeight: 'bold',
      color: '#334155',
    });

    row.leftSeats.forEach((num, idx) => {
      seats.push({
        id: nextUniqueId('seat'),
        floor,
        row: row.rowName,
        seatNumber: num,
        x: leftStartX + (totalLeftIndent + idx) * stepX,
        y,
        width: seatW,
        height: seatH,
        rotation: 0,
      });
    });

    row.centerSeats.forEach((num, idx) => {
      seats.push({
        id: nextUniqueId('seat'),
        floor,
        row: row.rowName,
        seatNumber: num,
        x: centerStartX + (row.centerIndent + idx) * stepX,
        y,
        width: seatW,
        height: seatH,
        rotation: 0,
      });
    });

    row.rightSeats.forEach((num, idx) => {
      seats.push({
        id: nextUniqueId('seat'),
        floor,
        row: row.rowName,
        seatNumber: num,
        x: rightStartX + idx * stepX,
        y,
        width: seatW,
        height: seatH,
        rotation: 0,
      });
    });
  };

  // ======================= 1층 객석 =======================
  let curY = 100;
  labels.push({
    id: nextUniqueId('label'),
    text: '1층',
    x: 92,
    y: curY,
    width: 44,
    height: 22,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    bgColor: '#fbbf24',
    borderColor: '#f59e0b',
    borderRadius: 4,
  });
  labels.push({
    id: nextUniqueId('label'),
    text: '1층 객석 (OP1~OP5열, 1~23열, BL/BR 발코니석)',
    x: 520,
    y: curY + 15,
    fontSize: 12,
    fontWeight: 'semibold',
    color: '#475569',
  });

  curY += 34;

  // OP1 ~ OP3
  LG_F1_OP_TOP.forEach((row) => {
    pushPreciseRow('1층', row, curY, 9);
    curY += stepY;
  });

  curY += 10; // OP3 - OP4 간격

  // OP4 ~ OP5
  LG_F1_OP_BOTTOM.forEach((row) => {
    pushPreciseRow('1층', row, curY, 9);
    curY += stepY;
  });

  curY += 14; // OP5 - 1열 간격

  const row1StartY = curY;

  // 1열 ~ 16열
  LG_F1_MAIN_UPPER.forEach((row) => {
    pushPreciseRow('1층', row, curY, 9);
    curY += stepY;
  });

  // 1층 BL / BR 발코니 (5열~10열 옆)
  const f1BalconyY = row1StartY + 4 * stepY;
  const f1LeftStartX = centerStartX - aisleGap - 9 * stepX; // 200
  const f1RightEndX = rightStartX + 9 * stepX; // 1120

  labels.push({
    id: nextUniqueId('label'),
    text: 'BL',
    x: f1LeftStartX - 96,
    y: f1BalconyY - 24,
    width: 32,
    height: 20,
    fontSize: 10,
    fontWeight: 'black',
    color: '#1e293b',
    bgColor: '#c6e0b4',
    borderColor: '#334155',
    borderRadius: 2,
  });
  labels.push({
    id: nextUniqueId('label'),
    text: 'BR',
    x: f1RightEndX + 64,
    y: f1BalconyY - 24,
    width: 32,
    height: 20,
    fontSize: 10,
    fontWeight: 'black',
    color: '#1e293b',
    bgColor: '#c6e0b4',
    borderColor: '#334155',
    borderRadius: 2,
  });

  for (let n = 1; n <= 6; n++) {
    const by = f1BalconyY + (n - 1) * stepY;
    seats.push({
      id: nextUniqueId('seat'),
      floor: '1층',
      row: 'BL',
      seatNumber: n,
      x: f1LeftStartX - 92,
      y: by,
      width: 24,
      height: 24,
      rotation: 0,
    });
    seats.push({
      id: nextUniqueId('seat'),
      floor: '1층',
      row: 'BR',
      seatNumber: n,
      x: f1RightEndX + 68,
      y: by,
      width: 24,
      height: 24,
      rotation: 0,
    });
  }

  curY += 20; // 16열 - 17열 메인 통로

  // 17열 ~ 20열
  LG_F1_MAIN_LOWER.forEach((row) => {
    pushPreciseRow('1층', row, curY, 9);
    curY += stepY;
  });

  // 21열 ~ 23열 + SOUND CONSOLE
  const y21 = curY;
  const f1Row21: LGPreciseRowDef = {
    rowName: '21열',
    leftIndent: 0,
    leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    centerIndent: 0,
    centerSeats: [10, 11, 12, 13],
    rightIndent: 0,
    rightSeats: [29, 30, 31, 32, 33, 34, 35, 36, 37],
  };
  pushPreciseRow('1층', f1Row21, y21, 9);
  [25, 26, 27, 28].forEach((num, idx) => {
    seats.push({
      id: nextUniqueId('seat'),
      floor: '1층',
      row: '21열',
      seatNumber: num,
      x: centerStartX + (15 + idx) * stepX,
      y: y21,
      width: seatW,
      height: seatH,
      rotation: 0,
    });
  });

  curY += stepY;
  const y22 = curY;
  const f1Row22: LGPreciseRowDef = {
    rowName: '22열',
    leftIndent: 0,
    leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    centerIndent: 0,
    centerSeats: [10, 11, 12],
    rightIndent: 0,
    rightSeats: [29, 30, 31, 32, 33, 34, 35, 36, 37],
  };
  pushPreciseRow('1층', f1Row22, y22, 9);
  [26, 27, 28].forEach((num, idx) => {
    seats.push({
      id: nextUniqueId('seat'),
      floor: '1층',
      row: '22열',
      seatNumber: num,
      x: centerStartX + (16 + idx) * stepX,
      y: y22,
      width: seatW,
      height: seatH,
      rotation: 0,
    });
  });

  curY += stepY;
  const y23 = curY;
  const f1Row23: LGPreciseRowDef = {
    rowName: '23열',
    leftIndent: 1,
    leftSeats: [2, 3, 4, 5, 6, 7, 8, 9],
    centerIndent: 0,
    centerSeats: [],
    rightIndent: 0,
    rightSeats: [29, 30, 31, 32, 33, 34, 35, 36],
  };
  pushPreciseRow('1층', f1Row23, y23, 9);

  // Sound Console 박스 라벨
  labels.push({
    id: nextUniqueId('label'),
    text: 'SOUND CONSOLE (음향 콘솔)',
    x: centerStartX + 4 * stepX + 4,
    y: y21,
    width: 11 * stepX - 10,
    height: 3 * stepY - 5,
    fontSize: 11,
    fontWeight: 'black',
    color: '#0f172a',
    bgColor: '#f8fafc',
    borderColor: '#1e293b',
    borderRadius: 6,
  });

  // ======================= 2층 객석 =======================
  curY += 72;
  labels.push({
    id: nextUniqueId('label'),
    text: '2층',
    x: 92,
    y: curY,
    width: 44,
    height: 22,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    bgColor: '#fbbf24',
    borderColor: '#f59e0b',
    borderRadius: 4,
  });
  labels.push({
    id: nextUniqueId('label'),
    text: '2층 객석 (1~8열, BL/BR 발코니석)',
    x: 560,
    y: curY + 15,
    fontSize: 12,
    fontWeight: 'semibold',
    color: '#475569',
  });

  curY += 36;
  const f2LeftStartX = centerStartX - aisleGap - 13 * stepX; // 104
  const f2RightEndX = rightStartX + 13 * stepX; // 1216

  labels.push({
    id: nextUniqueId('label'),
    text: 'BL',
    x: f2LeftStartX,
    y: curY,
    width: 30,
    height: 20,
    fontSize: 10,
    fontWeight: 'black',
    color: '#1e293b',
    bgColor: '#c6e0b4',
    borderColor: '#334155',
    borderRadius: 2,
  });
  labels.push({
    id: nextUniqueId('label'),
    text: 'BR',
    x: f2RightEndX - 30,
    y: curY,
    width: 30,
    height: 20,
    fontSize: 10,
    fontWeight: 'black',
    color: '#1e293b',
    bgColor: '#c6e0b4',
    borderColor: '#334155',
    borderRadius: 2,
  });

  curY += 24;
  for (let n = 1; n <= 4; n++) {
    seats.push({
      id: nextUniqueId('seat'),
      floor: '2층',
      row: 'BL',
      seatNumber: n,
      x: f2LeftStartX + 3,
      y: curY + (n - 1) * stepY,
      width: 24,
      height: 24,
      rotation: 0,
    });
    seats.push({
      id: nextUniqueId('seat'),
      floor: '2층',
      row: 'BR',
      seatNumber: n,
      x: f2RightEndX - 27,
      y: curY + (n - 1) * stepY,
      width: 24,
      height: 24,
      rotation: 0,
    });
  }

  curY += 4 * stepY + 18;
  LG_F2_ROWS.forEach((row) => {
    pushPreciseRow('2층', row, curY, 13);
    curY += stepY;
  });

  // ======================= 3층 객석 =======================
  curY += 48;
  labels.push({
    id: nextUniqueId('label'),
    text: '3층',
    x: 92,
    y: curY,
    width: 44,
    height: 22,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    bgColor: '#fbbf24',
    borderColor: '#f59e0b',
    borderRadius: 4,
  });
  labels.push({
    id: nextUniqueId('label'),
    text: '3층 객석 (1~8열)',
    x: 605,
    y: curY + 15,
    fontSize: 12,
    fontWeight: 'semibold',
    color: '#475569',
  });

  curY += 36;
  LG_F3_ROWS.forEach((row) => {
    pushPreciseRow('3층', row, curY, 13);
    curY += stepY;
  });

  return {
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: 'LG SIGNATURE Hall 복사본',
    updatedAt: new Date().toISOString(),
    canvasWidth,
    canvasHeight: curY + 50,
    gridSize: 20,
    snapToGrid: true,
    seats,
    labels,
    legend: [],
  };
}

// ==============================================================
// U+ STAGE (End Stage) 배치도 복사본 생성 (원본 UPLUS_STAGE_ROWS 참조, 불변 깊은 복사)
// ==============================================================
export function createUPlusStageCopy(): CustomTheaterLayout {
  const canvasWidth = 1100;
  const canvasHeight = 820;
  const centerX = canvasWidth / 2; // 550
  const seatW = 26;
  const seatH = 26;
  const stepX = 29; // 26 + 3px gap
  const stepY = 30;
  const mainSlotsWidth = 21 * stepX - 3; // 606
  const mainStartX = Math.round(centerX - mainSlotsWidth / 2); // 247

  const seats: CustomSeat[] = [];
  const labels: CustomLabel[] = [];

  // 타이틀 라벨
  labels.push({
    id: nextUniqueId('label'),
    text: 'U+ STAGE (End Stage)',
    x: centerX - 105,
    y: 28,
    fontSize: 16,
    fontWeight: 'black',
    color: '#0B1E48',
  });

  // STAGE 배너
  labels.push({
    id: nextUniqueId('stage'),
    text: 'STAGE',
    x: centerX - 220,
    y: 44,
    width: 440,
    height: 36,
    fontSize: 14,
    fontWeight: 'black',
    color: '#0B1E48',
    bgColor: '#EBF1F6',
    borderColor: '#CBD5E1',
    borderRadius: 4,
    isStageBanner: true,
  });

  // 본당 A~Q열
  const baseRowY = 122;
  let upperCount = 0;

  UPLUS_STAGE_ROWS.forEach((row, idx) => {
    const y = row.isAfterWalkway
      ? baseRowY + upperCount * stepY + 24 + (idx - upperCount) * stepY
      : baseRowY + idx * stepY;

    if (!row.isAfterWalkway) {
      upperCount += 1;
    }

    // 좌측/우측 열 라벨
    labels.push({
      id: nextUniqueId('label'),
      text: row.rowName,
      x: mainStartX - 38,
      y: y + 17,
      fontSize: 11,
      fontWeight: 'bold',
      color: '#0f172a',
    });
    labels.push({
      id: nextUniqueId('label'),
      text: row.rowName,
      x: mainStartX + mainSlotsWidth + 16,
      y: y + 17,
      fontSize: 11,
      fontWeight: 'bold',
      color: '#0f172a',
    });

    row.seats.forEach((seatNum, sIdx) => {
      const slot = row.leftIndent + sIdx;
      seats.push({
        id: nextUniqueId('seat'),
        floor: '1층',
        row: row.rowName,
        seatNumber: seatNum,
        customLabel: String(seatNum).padStart(2, '0'),
        x: mainStartX + slot * stepX,
        y,
        width: seatW,
        height: seatH,
        rotation: 0,
      });
    });
  });

  // 좌측 BL / 우측 BR 발코니 (C열 높이인 baseRowY + 2 * stepY 부터 시작)
  const balconyStartY = baseRowY + 2 * stepY;
  const balconyStepY = 31;
  const blX = mainStartX - 96;
  const brX = mainStartX + mainSlotsWidth + 70;

  labels.push({
    id: nextUniqueId('label'),
    text: 'BL',
    x: blX + 4,
    y: balconyStartY - 12,
    fontSize: 12,
    fontWeight: 'black',
    color: '#DC2626',
  });
  labels.push({
    id: nextUniqueId('label'),
    text: 'BR',
    x: brX + 4,
    y: balconyStartY - 12,
    fontSize: 12,
    fontWeight: 'black',
    color: '#DC2626',
  });

  UPLUS_BALCONY_SEATS.forEach((n, idx) => {
    const by = balconyStartY + idx * balconyStepY;
    seats.push({
      id: nextUniqueId('seat'),
      floor: '1층',
      row: 'BL',
      seatNumber: n,
      customLabel: String(n).padStart(2, '0'),
      x: blX,
      y: by,
      width: seatW,
      height: seatH,
      rotation: 0,
    });
    seats.push({
      id: nextUniqueId('seat'),
      floor: '1층',
      row: 'BR',
      seatNumber: n,
      customLabel: String(n).padStart(2, '0'),
      x: brX,
      y: by,
      width: seatW,
      height: seatH,
      rotation: 0,
    });
  });

  // 하단 안내 문구 라벨
  const bottomY = baseRowY + UPLUS_STAGE_ROWS.length * stepY + 56;
  labels.push({
    id: nextUniqueId('label'),
    text: '1층 B, D, F, H, J, L, N열은 16번 좌석이 없으며, 15번과 17번이 연석입니다.',
    x: centerX - 235,
    y: bottomY,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
  });
  labels.push({
    id: nextUniqueId('label'),
    text: 'BL, BR, O, P, Q열은 게이트 입장 후 계단으로 이동 가능합니다.',
    x: centerX - 195,
    y: bottomY + 22,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563eb',
  });

  return {
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: 'U+ STAGE (End Stage) 복사본',
    updatedAt: new Date().toISOString(),
    canvasWidth,
    canvasHeight,
    gridSize: 20,
    snapToGrid: true,
    seats,
    labels,
    legend: [],
  };
}

export function parseFirestoreTimestampIso(val: unknown): string {
  if (
    val &&
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val) {
    return val;
  }
  return new Date().toISOString();
}

export function sortSavedLayoutsDesc(list: SavedCustomLayout[]): SavedCustomLayout[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.updatedAt || b.savedAt).getTime() -
      new Date(a.updatedAt || a.savedAt).getTime()
  );
}

export function formatLayoutUpdatedAtShort(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${d} ${hh}:${mm}`;
}

export function parseFirestoreSavedLayoutDoc(
  docId: string,
  data: Record<string, unknown>
): SavedCustomLayout | null {
  try {
    const createdIso = parseFirestoreTimestampIso(data.createdAt);
    const updatedIso = parseFirestoreTimestampIso(data.updatedAt || data.createdAt);
    const isPublic = data.isPublic === true;
    const ownerId = typeof data.ownerId === 'string' ? data.ownerId : undefined;
    const ownerEmail = typeof data.ownerEmail === 'string' ? data.ownerEmail : undefined;
    const { layout: sanitized } = sanitizeAndMigrateLayout({
      version: typeof data.version === 'number' ? data.version : CURRENT_SCHEMA_VERSION,
      schemaVersion:
        typeof data.schemaVersion === 'number'
          ? data.schemaVersion
          : CURRENT_SCHEMA_VERSION,
      name: typeof data.name === 'string' ? data.name : '새 커스텀 좌석배치도',
      savedId: docId,
      shareCode: typeof data.shareCode === 'string' ? data.shareCode : undefined,
      isPublic,
      updatedAt: updatedIso,
      canvasWidth: typeof data.canvasWidth === 'number' ? data.canvasWidth : 1200,
      canvasHeight: typeof data.canvasHeight === 'number' ? data.canvasHeight : 800,
      gridSize: typeof data.gridSize === 'number' ? data.gridSize : 20,
      snapToGrid: data.snapToGrid !== false,
      seats: Array.isArray(data.seats) ? data.seats : [],
      labels: Array.isArray(data.labels) ? data.labels : [],
      legend: Array.isArray(data.legend) ? data.legend : [],
    });
    sanitized.savedId = docId;
    sanitized.isPublic = isPublic;
    sanitized.shareCode =
      typeof data.shareCode === 'string' ? data.shareCode : sanitized.shareCode;

    return {
      id: docId,
      name: sanitized.name,
      ownerId,
      ownerEmail,
      isPublic,
      shareCode: sanitized.shareCode,
      savedAt: createdIso,
      updatedAt: updatedIso,
      seatCount:
        typeof data.seatCount === 'number'
          ? data.seatCount
          : sanitized.seats.filter((s) => !s.isDisabled).length,
      layout: sanitized,
    };
  } catch (err) {
    console.warn('Failed to parse saved layout document:', docId, err);
    return null;
  }
}

// ==============================================================
// 공용 배치도 프리셋: '두 번째 아이' (수정 권한: vorhang@lgart.com)
// ==============================================================
export const SECOND_CHILD_DOC_ID = 'public_second_child';
export const SECOND_CHILD_NAME = '두 번째 아이';
export const SECOND_CHILD_OWNER_EMAIL = 'vorhang@lgart.com';
export const SECOND_CHILD_SHARE_CODE = 'SEAT-SECN-CHLD';
export const SECOND_CHILD_DELETED_STORAGE_KEY = 'deleted_builtin_second_child_v1';
export const SECOND_CHILD_CREATED_ISO = '2026-04-01T09:00:00.000Z';

export function isSecondChildEditorEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === SECOND_CHILD_OWNER_EMAIL;
}

export function createSecondChildLayout(): CustomTheaterLayout {
  const canvasWidth = 1400;
  const canvasHeight = 830;
  const seatW = 50;
  const seatH = 24;
  const stepX = 52;
  const stepY = 27;
  const mainStartX = 155; // 21 columns * 52 - 2 = 1090 (right edge 1245)

  const seats: CustomSeat[] = [];
  const labels: CustomLabel[] = [];

  // 1. 배경 프레임 (가장 먼저 추가하여 모든 요소 뒤에 렌더링)
  // 2층 발코니 외곽 남색 프레임
  labels.push({
    id: 'sc-frame-2f',
    text: '',
    x: 16,
    y: 310,
    width: 1368,
    height: 490,
    fontSize: 12,
    fontWeight: 'normal',
    color: '#1e3a8a',
    bgColor: '#ffffff',
    borderColor: '#1e3a8a',
    borderRadius: 2,
  });

  // 1층 무대 베이지 배경 영역
  labels.push({
    id: 'sc-stage-bg',
    text: '',
    x: mainStartX,
    y: 62,
    width: 1090,
    height: 362,
    fontSize: 12,
    fontWeight: 'normal',
    color: '#475569',
    bgColor: '#f3efe8',
    borderColor: '#475569',
    borderRadius: 2,
  });

  // 상단 좌측 '1층' 헤더 셀
  labels.push({
    id: 'sc-header-1f',
    text: '1층',
    x: mainStartX,
    y: 24,
    width: 48,
    height: 38,
    fontSize: 13,
    fontWeight: 'black',
    color: '#ea580c',
    bgColor: '#ffffff',
    borderColor: '#475569',
    borderRadius: 0,
  });

  // 상단 타이틀 바 ('LG아트센터 서울, U+ 스테이지')
  labels.push({
    id: 'sc-header-title',
    text: 'LG아트센터 서울, U+ 스테이지',
    x: mainStartX + 48,
    y: 24,
    width: 1042,
    height: 38,
    fontSize: 16,
    fontWeight: 'black',
    color: '#0f172a',
    bgColor: '#d9d9d9',
    borderColor: '#475569',
    borderRadius: 0,
  });

  // STAGE 중앙 텍스트
  labels.push({
    id: 'sc-stage-text',
    text: 'STAGE',
    x: 660,
    y: 205,
    fontSize: 18,
    fontWeight: 'black',
    color: '#0f172a',
  });

  // 2. T구역 (좌측 16석 + 우측 14석 + 결번 흑색 박스 2개 = 활성 30석)
  const tbW = 48;
  const tbH = 22;
  const tLeftColX = [206, 255];
  const tRightColX = [358, 407];
  const tBlockTopYs = [74, 140, 206, 272];

  const tLeftBlocks: Array<[number, number, number, number]> = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
  ];
  tLeftBlocks.forEach((nums, bIdx) => {
    const topY = tBlockTopYs[bIdx];
    const coords = [
      { n: nums[0], x: tLeftColX[0], y: topY },
      { n: nums[1], x: tLeftColX[1], y: topY },
      { n: nums[2], x: tLeftColX[0], y: topY + 23 },
      { n: nums[3], x: tLeftColX[1], y: topY + 23 },
    ];
    coords.forEach(({ n, x, y }) => {
      seats.push({
        id: `sc-t-${n}`,
        floor: '1층',
        row: 'T구역',
        seatNumber: n,
        customLabel: String(n),
        x,
        y,
        width: tbW,
        height: tbH,
        rotation: 0,
      });
    });
  });

  // T구역 우측 블록 1: 17, [검정], 19, [검정]
  seats.push({
    id: 'sc-t-17',
    floor: '1층',
    row: 'T구역',
    seatNumber: 17,
    customLabel: '17',
    x: tRightColX[0],
    y: tBlockTopYs[0],
    width: tbW,
    height: tbH,
    rotation: 0,
  });
  labels.push({
    id: 'sc-t-blk-18',
    text: '',
    x: tRightColX[1],
    y: tBlockTopYs[0],
    width: tbW,
    height: tbH,
    fontSize: 10,
    fontWeight: 'normal',
    color: '#000000',
    bgColor: '#000000',
    borderColor: '#000000',
    borderRadius: 1,
  });
  seats.push({
    id: 'sc-t-19',
    floor: '1층',
    row: 'T구역',
    seatNumber: 19,
    customLabel: '19',
    x: tRightColX[0],
    y: tBlockTopYs[0] + 23,
    width: tbW,
    height: tbH,
    rotation: 0,
  });
  labels.push({
    id: 'sc-t-blk-20',
    text: '',
    x: tRightColX[1],
    y: tBlockTopYs[0] + 23,
    width: tbW,
    height: tbH,
    fontSize: 10,
    fontWeight: 'normal',
    color: '#000000',
    bgColor: '#000000',
    borderColor: '#000000',
    borderRadius: 1,
  });

  // T구역 우측 블록 2~4: 21~32
  const tRightBlocks: Array<[number, number, number, number]> = [
    [21, 22, 23, 24],
    [25, 26, 27, 28],
    [29, 30, 31, 32],
  ];
  tRightBlocks.forEach((nums, idx) => {
    const topY = tBlockTopYs[idx + 1];
    const coords = [
      { n: nums[0], x: tRightColX[0], y: topY },
      { n: nums[1], x: tRightColX[1], y: topY },
      { n: nums[2], x: tRightColX[0], y: topY + 23 },
      { n: nums[3], x: tRightColX[1], y: topY + 23 },
    ];
    coords.forEach(({ n, x, y }) => {
      seats.push({
        id: `sc-t-${n}`,
        floor: '1층',
        row: 'T구역',
        seatNumber: n,
        customLabel: String(n),
        x,
        y,
        width: tbW,
        height: tbH,
        rotation: 0,
      });
    });
  });

  labels.push({
    id: 'sc-label-t-zone',
    text: 'T구역',
    x: 312,
    y: 198,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
  });

  // 3. B구역 (18석)
  const bBaseX = 885;
  const bStepX = 49;
  const bRowsY = [122, 146, 170, 194, 218, 242];
  // 1~6 세로열 (c=0)
  for (let n = 1; n <= 6; n++) {
    seats.push({
      id: `sc-b-${n}`,
      floor: '1층',
      row: 'B구역',
      seatNumber: n,
      customLabel: String(n),
      x: bBaseX,
      y: bRowsY[n - 1],
      width: tbW,
      height: tbH,
      rotation: 0,
    });
  }
  // 7~11 세로열 (c=2)
  for (let n = 7; n <= 11; n++) {
    seats.push({
      id: `sc-b-${n}`,
      floor: '1층',
      row: 'B구역',
      seatNumber: n,
      customLabel: String(n),
      x: bBaseX + 2 * bStepX,
      y: bRowsY[n - 7],
      width: tbW,
      height: tbH,
      rotation: 0,
    });
  }
  // 12, 13, 14 가로열 (Row 5, c=3..5)
  [12, 13, 14].forEach((n, idx) => {
    seats.push({
      id: `sc-b-${n}`,
      floor: '1층',
      row: 'B구역',
      seatNumber: n,
      customLabel: String(n),
      x: bBaseX + (3 + idx) * bStepX,
      y: bRowsY[5],
      width: tbW,
      height: tbH,
      rotation: 0,
    });
  });
  // B구역 라벨
  labels.push({
    id: 'sc-label-b-zone',
    text: 'B구역',
    x: bBaseX + 60,
    y: 279,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
  });
  // 15, 16, 17, 18 하단 가로열 (c=1..4)
  [15, 16, 17, 18].forEach((n, idx) => {
    seats.push({
      id: `sc-b-${n}`,
      floor: '1층',
      row: 'B구역',
      seatNumber: n,
      customLabel: String(n),
      x: bBaseX + (1 + idx) * bStepX,
      y: 295,
      width: tbW,
      height: tbH,
      rotation: 0,
    });
  });

  // 4. 본당 S열 (10석: 01~10, 무대 하단 E열 06~15번 위 정렬)
  const sRowY = 392;
  labels.push({
    id: 'sc-row-l-S',
    text: 'S',
    x: mainStartX - 28,
    y: sRowY + 16,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
  });
  labels.push({
    id: 'sc-row-r-S',
    text: 'S',
    x: mainStartX + 21 * stepX + 14,
    y: sRowY + 16,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
  });
  for (let n = 1; n <= 10; n++) {
    const col = 4 + n; // 5..14 (E열 06~15번 수직 정렬)
    const numStr = String(n).padStart(2, '0');
    seats.push({
      id: `sc-s-${n}`,
      floor: '1층',
      row: 'S열',
      seatNumber: n,
      customLabel: `S열 ${numStr}번`,
      x: mainStartX + col * stepX,
      y: sRowY,
      width: seatW,
      height: seatH,
      rotation: 0,
    });
  }

  // 5. 본당 E열 ~ Q열 (21열 축 기준)
  interface MainRowSpec {
    letter: string;
    startSeat: number;
    endSeat: number;
    disabled16?: boolean;
    graySeats?: number[];
  }
  const mainRows: MainRowSpec[] = [
    { letter: 'E', startSeat: 2, endSeat: 20, graySeats: [2, 3] },
    { letter: 'F', startSeat: 1, endSeat: 21, disabled16: true },
    { letter: 'G', startSeat: 1, endSeat: 21 },
    { letter: 'H', startSeat: 1, endSeat: 21, disabled16: true },
    { letter: 'I', startSeat: 1, endSeat: 21 },
    { letter: 'J', startSeat: 1, endSeat: 21, disabled16: true },
    { letter: 'K', startSeat: 1, endSeat: 21 },
    { letter: 'L', startSeat: 1, endSeat: 21, disabled16: true },
    { letter: 'M', startSeat: 1, endSeat: 21 },
    { letter: 'N', startSeat: 1, endSeat: 21, disabled16: true },
    { letter: 'O', startSeat: 1, endSeat: 21 },
    { letter: 'P', startSeat: 3, endSeat: 20 },
    { letter: 'Q', startSeat: 3, endSeat: 19 },
  ];

  const eRowStartY = 428;
  mainRows.forEach((rowSpec, rIdx) => {
    const y = eRowStartY + rIdx * stepY;
    const rowName = `${rowSpec.letter}열`;

    labels.push({
      id: `sc-row-l-${rowSpec.letter}`,
      text: rowSpec.letter,
      x: mainStartX - 28,
      y: y + 16,
      fontSize: 11,
      fontWeight: 'bold',
      color: '#0f172a',
    });
    labels.push({
      id: `sc-row-r-${rowSpec.letter}`,
      text: rowSpec.letter,
      x: mainStartX + 21 * stepX + 14,
      y: y + 16,
      fontSize: 11,
      fontWeight: 'bold',
      color: '#0f172a',
    });

    for (let n = rowSpec.startSeat; n <= rowSpec.endSeat; n++) {
      const col = n - 1;
      const isDisabled = Boolean(rowSpec.disabled16 && n === 16);
      const isGray = Boolean(rowSpec.graySeats?.includes(n));
      const numStr = String(n).padStart(2, '0');
      seats.push({
        id: `sc-${rowSpec.letter.toLowerCase()}-${n}`,
        floor: '1층',
        row: rowName,
        seatNumber: n,
        customLabel: `${rowName} ${numStr}번`,
        x: mainStartX + col * stepX,
        y,
        width: seatW,
        height: seatH,
        rotation: 0,
        ...(isDisabled ? { isDisabled: true } : {}),
        ...(isGray ? { color: '#64748b' } : {}),
      });
    }
  });

  // 6. 2층 사이드 발코니 BL / BR (01~12번, 01~03번 회색)
  const blX = 32;
  const brX = 1316;
  const balconyYs = [
    365, // 01 (S열 한 칸 위)
    sRowY, // 02 (S열 높이)
    eRowStartY + 0 * stepY, // 03 (E열)
    eRowStartY + 1 * stepY, // 04 (F열)
    eRowStartY + 2 * stepY, // 05 (G열)
    eRowStartY + 3 * stepY, // 06 (H열)
    eRowStartY + 4 * stepY, // 07 (I열)
    eRowStartY + 5 * stepY, // 08 (J열)
    eRowStartY + 6 * stepY, // 09 (K열)
    eRowStartY + 7 * stepY, // 10 (L열)
    eRowStartY + 8 * stepY, // 11 (M열)
    eRowStartY + 9 * stepY, // 12 (N열)
  ];

  labels.push({
    id: 'sc-bl-title',
    text: 'BL',
    x: blX + 18,
    y: 332,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a',
  });
  labels.push({
    id: 'sc-bl-sub',
    text: '(Balcony)',
    x: blX + 6,
    y: 350,
    fontSize: 9,
    fontWeight: 'normal',
    color: '#475569',
  });
  labels.push({
    id: 'sc-br-title',
    text: 'BR',
    x: brX + 18,
    y: 332,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a',
  });
  labels.push({
    id: 'sc-br-sub',
    text: '(Balcony)',
    x: brX + 6,
    y: 350,
    fontSize: 9,
    fontWeight: 'normal',
    color: '#475569',
  });

  // 2층 파란색 라벨 (하단 좌측)
  labels.push({
    id: 'sc-label-2f',
    text: '2층',
    x: 46,
    y: 774,
    fontSize: 13,
    fontWeight: 'black',
    color: '#2563eb',
  });

  balconyYs.forEach((by, idx) => {
    const n = idx + 1;
    const numStr = String(n).padStart(2, '0');
    const isGray = n <= 3;

    seats.push({
      id: `sc-bl-${n}`,
      floor: '2층',
      row: 'BL',
      seatNumber: n,
      customLabel: `BL열 ${numStr}번`,
      x: blX,
      y: by,
      width: seatW + 2,
      height: seatH,
      rotation: 0,
      ...(isGray ? { color: '#64748b' } : {}),
    });

    seats.push({
      id: `sc-br-${n}`,
      floor: '2층',
      row: 'BR',
      seatNumber: n,
      customLabel: `BR열 ${numStr}번`,
      x: brX,
      y: by,
      width: seatW + 2,
      height: seatH,
      rotation: 0,
      ...(isGray ? { color: '#64748b' } : {}),
    });
  });

  return {
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: SECOND_CHILD_NAME,
    savedId: SECOND_CHILD_DOC_ID,
    shareCode: SECOND_CHILD_SHARE_CODE,
    isPublic: true,
    updatedAt: SECOND_CHILD_CREATED_ISO,
    canvasWidth,
    canvasHeight,
    gridSize: 20,
    snapToGrid: false,
    seats,
    labels,
    legend: [],
  };
}

export function createSecondChildSavedLayout(): SavedCustomLayout {
  const layout = createSecondChildLayout();
  return {
    id: SECOND_CHILD_DOC_ID,
    name: SECOND_CHILD_NAME,
    ownerEmail: SECOND_CHILD_OWNER_EMAIL,
    isPublic: true,
    shareCode: SECOND_CHILD_SHARE_CODE,
    savedAt: SECOND_CHILD_CREATED_ISO,
    updatedAt: SECOND_CHILD_CREATED_ISO,
    seatCount: layout.seats.filter((s) => !s.isDisabled).length,
    layout,
  };
}
