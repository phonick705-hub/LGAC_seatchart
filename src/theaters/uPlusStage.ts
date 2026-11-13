// ==============================================================
// U+ STAGE (End Stage) 좌석배치도 데이터
// LG아트센터 서울 U+ STAGE 가변형 극장 End Stage 365석 구조
// ==============================================================

export interface UPlusRow {
  rowName: string;
  seats: number[];
  leftIndent: number;
  rightIndent: number;
  hasMissing16: boolean;
  isAfterWalkway?: boolean;
}

// B, D, F, H, J, L, N열: 16번 좌석이 없으며, 15번과 17번이 연석(20석)
const EVEN_ROW_SEATS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21,
];

// A, C, G, I, K, M, O열: 1~21번 전체(21석)
const FULL_ROW_SEATS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
];

export const UPLUS_STAGE_ROWS: UPlusRow[] = [
  {
    rowName: 'A열',
    seats: [...FULL_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: false,
  },
  {
    rowName: 'B열',
    seats: [...EVEN_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: true,
  },
  {
    rowName: 'C열',
    seats: [...FULL_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: false,
  },
  {
    rowName: 'D열',
    seats: [...EVEN_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: true,
  },
  {
    rowName: 'E열',
    // 02~20번 (01번, 21번 없음, 16번 있음 - 총 19석)
    seats: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    leftIndent: 1,
    rightIndent: 1,
    hasMissing16: false,
  },
  {
    rowName: 'F열',
    seats: [...EVEN_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: true,
  },
  {
    rowName: 'G열',
    seats: [...FULL_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: false,
  },
  {
    rowName: 'H열',
    seats: [...EVEN_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: true,
  },
  {
    rowName: 'I열',
    seats: [...FULL_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: false,
  },
  {
    rowName: 'J열',
    seats: [...EVEN_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: true,
  },
  {
    rowName: 'K열',
    seats: [...FULL_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: false,
  },
  {
    rowName: 'L열',
    seats: [...EVEN_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: true,
  },
  {
    rowName: 'M열',
    seats: [...FULL_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: false,
  },
  {
    rowName: 'N열',
    seats: [...EVEN_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: true,
  },

  // 메인 통로(Walkway) 분리 후 하단 블록
  {
    rowName: 'O열',
    seats: [...FULL_ROW_SEATS],
    leftIndent: 0,
    rightIndent: 0,
    hasMissing16: false,
    isAfterWalkway: true,
  },
  {
    rowName: 'P열',
    // 03~20번 (01, 02번 없음, 21번 없음 - 총 18석)
    seats: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    leftIndent: 2,
    rightIndent: 1,
    hasMissing16: false,
    isAfterWalkway: true,
  },
  {
    rowName: 'Q열',
    // 03~19번 (01, 02번 없음, 20, 21번 없음 - 총 17석)
    seats: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    leftIndent: 2,
    rightIndent: 2,
    hasMissing16: false,
    isAfterWalkway: true,
  },
];

// 좌/우 발코니석 (각 12석, C~N열 높이에 수직 배치)
export const UPLUS_BALCONY_COUNT = 12;
export const UPLUS_BALCONY_SEATS = Array.from({ length: 12 }, (_, i) => i + 1);

// U+ STAGE의 모든 유효 좌석 키 세트 (도면 매칭 및 검증용)
export const UPLUS_VALID_SEAT_SET = new Set<string>();

// 1. 본당 A~Q열
UPLUS_STAGE_ROWS.forEach((r) => {
  r.seats.forEach((num) => {
    UPLUS_VALID_SEAT_SET.add(`1층_${r.rowName}_${num}`);
  });
});

// 2. 발코니 BL & BR (1~12번)
UPLUS_BALCONY_SEATS.forEach((num) => {
  UPLUS_VALID_SEAT_SET.add(`1층_BL_${num}`);
  UPLUS_VALID_SEAT_SET.add(`1층_BR_${num}`);
});
