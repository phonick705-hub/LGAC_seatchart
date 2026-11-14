export interface CustomSeat {
  id: string;
  floor: string; // '1층', '2층', '3층' or custom string
  row: string; // e.g. '1열', 'A열'
  seatNumber: number; // e.g. 1, 2, 3
  x: number;
  y: number;
  width: number; // default 24
  height: number; // default 24
  rotation?: number; // 0 - 360
  grade?: string; // e.g. 'VIP석', 'R석', 'S석', 'A석', 'B석', '판매금지석'
  isDisabled?: boolean; // 결번 여부 (빈 통로/비활성 공간)
  customLabel?: string; // Optional custom text instead of seatNumber
  groupId?: string; // 좌석 그룹 ID (Ctrl+G로 묶기)
  color?: string; // 커스텀 좌석 배경색 (#RRGGBB)
}

export interface CustomLegendItem {
  id: string;
  color: string; // #RRGGBB
  label: string; // 예: VIP석, R석
}

export interface CustomLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize: number;
  fontWeight?: 'normal' | 'semibold' | 'bold' | 'black';
  color?: string;
  bgColor?: string;
  borderColor?: string;
  borderRadius?: number;
  rotation?: number;
  isStageBanner?: boolean;
}

export interface CustomTheaterLayout {
  version: number;
  schemaVersion?: number;
  name: string;
  savedId?: string;
  shareCode?: string;
  isPublic?: boolean;
  updatedAt: string;
  canvasWidth: number;
  canvasHeight: number;
  seats: CustomSeat[];
  labels: CustomLabel[];
  legend?: CustomLegendItem[];
  gridSize?: number;
  snapToGrid?: boolean;
}

export interface SavedCustomLayout {
  id: string;
  name: string;
  ownerId?: string;
  ownerEmail?: string;
  isPublic?: boolean;
  shareCode?: string;
  savedAt: string;
  updatedAt?: string;
  seatCount: number;
  layout: CustomTheaterLayout;
}

export type SaveStatus = 'saved' | 'modified' | 'saving' | 'error';

export type CustomEditorTool = 'select' | 'pan' | 'add_seat' | 'add_label' | 'ticket_select';

export interface RowGeneratorConfig {
  floor: string;
  rowName: string;
  seatCount: number;
  startNumber: number;
  numberDirection: 'asc' | 'desc'; // 좌->우 오름차순 or 내림차순
  spacing: number;
  shape: 'straight' | 'curve';
  curveRadius: number; // for curved row
  curveAngle: number; // total sweep angle in degrees
  startX: number;
  startY: number;
  grade: string;
}
