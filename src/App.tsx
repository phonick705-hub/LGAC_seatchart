import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Copy,
  Check,
  Ticket,
  AlertCircle,
  AlertTriangle,
  Info,
  Palette,
  Printer,
  FileDown,
  Download,
  Edit3,
  HelpCircle,
  Building2,
  X,
  MousePointerClick,
  FileText,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Calendar,
  CircleDollarSign,
  UploadCloud,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Layers,
  Pencil,
  Plus,
  LogIn,
  LogOut,
  Mail,
} from 'lucide-react';
import {
  onAuthStateChanged,
  getRedirectResult,
  signOut,
  User,
} from 'firebase/auth';
import {
  auth,
  authPersistenceReady,
  signInWithGoogleAutoFallback,
  readAndClearPendingAuthRedirect,
  PendingAuthRedirectPayload,
  isAllowedCompanyUser,
  CompanyAccountRequiredError,
  COMPANY_AUTH_ERROR_MESSAGE,
  readPendingShareCode,
  clearPendingShareCode,
} from './firebase';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { TheaterId, THEATER_OPTIONS } from './theaters/types';
import { UPlusStageMap } from './theaters/UPlusStageMap';
import { CustomTheaterCanvas } from './theaters/CustomTheaterCanvas';
import { UPLUS_VALID_SEAT_SET } from './theaters/uPlusStage';

interface UploadedImageItem {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  fileSize?: number;
}

interface ParsedSeat {
  floor: string; // '1층', '2층', '3층'
  grade: 'VIP석' | 'R석' | 'S석' | 'A석' | 'B석' | string;
  row: string;
  seatNumber: number;
}

// 제공된 예매 자료 데이터: 3층 A석 6열 26~29번, 7열 21~28번, 8열 20~28번 (총 21석)
const INITIAL_EXAMPLE = `3층 A석 6열: 26~29번
3층 A석 7열: 21~28번
3층 A석 8열: 20~28번`;

type TicketGradeType = 'VIP석' | 'R석' | 'S석' | 'A석' | 'B석';
type GradeType = TicketGradeType | '판매금지석';
type AppTab = 'visual' | 'text' | 'export';

const TICKET_GRADES: TicketGradeType[] = ['VIP석', 'R석', 'S석', 'A석', 'B석'];
const SELECTABLE_GRADES: GradeType[] = ['VIP석', 'R석', 'S석', 'A석', 'B석', '판매금지석'];

interface GradeStyle {
  label: string;
  colorName: string;
  bg: string;
  hoverBg: string;
  textColor: string;
  ringColor: string;
  badgeBg: string;
  badgeText: string;
  border: string;
  hex: string;
}

// 사용자 지정 등급별 색상: VIP석(빨강), R석(보라), S석(노랑), A석(파랑), B석(초록), 판매금지석(짙은 회색)
const GRADE_STYLES: Record<GradeType, GradeStyle> = {
  'VIP석': {
    label: 'VIP석',
    colorName: '빨간색',
    bg: 'bg-red-600',
    hoverBg: 'hover:bg-red-700',
    textColor: 'text-white',
    ringColor: 'ring-red-400',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
    border: 'border-red-200',
    hex: '#DC2626',
  },
  'R석': {
    label: 'R석',
    colorName: '보라색',
    bg: 'bg-purple-600',
    hoverBg: 'hover:bg-purple-700',
    textColor: 'text-white',
    ringColor: 'ring-purple-400',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    border: 'border-purple-200',
    hex: '#9333EA',
  },
  'S석': {
    label: 'S석',
    colorName: '노란색',
    bg: 'bg-amber-400',
    hoverBg: 'hover:bg-amber-500',
    textColor: 'text-slate-900',
    ringColor: 'ring-amber-300',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    border: 'border-amber-200',
    hex: '#F59E0B',
  },
  'A석': {
    label: 'A석',
    colorName: '파란색',
    bg: 'bg-blue-600',
    hoverBg: 'hover:bg-blue-700',
    textColor: 'text-white',
    ringColor: 'ring-blue-400',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    border: 'border-blue-200',
    hex: '#2563EB',
  },
  'B석': {
    label: 'B석',
    colorName: '초록색',
    bg: 'bg-emerald-600',
    hoverBg: 'hover:bg-emerald-700',
    textColor: 'text-white',
    ringColor: 'ring-emerald-400',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    border: 'border-emerald-200',
    hex: '#059669',
  },
  '판매금지석': {
    label: '판매금지석',
    colorName: '짙은 회색',
    bg: 'bg-zinc-700',
    hoverBg: 'hover:bg-zinc-800',
    textColor: 'text-white',
    ringColor: 'ring-zinc-400',
    badgeBg: 'bg-zinc-100',
    badgeText: 'text-zinc-800',
    border: 'border-zinc-300',
    hex: '#3f3f46',
  },
};

function parseGrade(gradeStr?: string, customNames?: Record<GradeType, string>): GradeType | null {
  if (!gradeStr || !gradeStr.trim() || gradeStr.trim() === '정보 없음') return null;
  const str = gradeStr.trim().toUpperCase();
  if (customNames) {
    for (const [gradeKey, customName] of Object.entries(customNames)) {
      if (customName && customName.trim() && str.includes(customName.trim().toUpperCase())) {
        return gradeKey as GradeType;
      }
    }
  }
  if (str.includes('판매금지') || str.includes('금지') || str.includes('HOLD')) return '판매금지석';
  if (str.includes('VIP') || str.includes('브이아이피') || str === 'V' || str.includes('OP')) return 'VIP석';
  if (str.includes('R') || str.includes('알석') || str === 'R') return 'R석';
  if (str.includes('S') || str.includes('에스석') || str === 'S') return 'S석';
  if (str.includes('A') || str.includes('에이석') || str === 'A') return 'A석';
  if (str.includes('B') || str.includes('비석') || str === 'B') return 'B석';
  return null;
}

function normalizeGrade(gradeStr: string, customNames?: Record<GradeType, string>): GradeType {
  const parsed = parseGrade(gradeStr, customNames);
  if (parsed) return parsed;
  return 'VIP석';
}

function getGradeStyle(grade: string, customNames?: Record<GradeType, string>): GradeStyle {
  const norm = normalizeGrade(grade, customNames);
  return GRADE_STYLES[norm] || GRADE_STYLES['VIP석'];
}

function cleanRowName(rawRow: string): string {
  const trimmed = rawRow.trim();
  if (trimmed === 'BL' || trimmed === 'BR') return trimmed;
  const numMatch = trimmed.match(/^0*(\d+)열?$/);
  if (numMatch) {
    return `${parseInt(numMatch[1], 10)}열`;
  }
  if (trimmed.endsWith('열')) return trimmed;
  return `${trimmed}열`;
}

// 층 및 열 기준 기본 등급 추론 (1층 1~16열 VIP석, 17~23열 R석, 2층 1~4열 R석, 5~8열 S석, 3층 1~3열 S석, 4~6열 A석, 7~8열 B석)
function getDefaultGradeForSeat(floor: string, rawRow: string): GradeType {
  const cleanF = floor.includes('2') ? '2층' : floor.includes('3') ? '3층' : '1층';
  const cleanRow = cleanRowName(rawRow);
  const rowNum = parseInt(cleanRow.replace(/\D/g, ''), 10) || 0;
  if (cleanF === '1층') {
    if (cleanRow.toUpperCase().startsWith('OP')) return 'VIP석';
    if (rowNum >= 17) return 'R석';
    return 'VIP석';
  } else if (cleanF === '2층') {
    if (rowNum >= 5) return 'S석';
    return 'R석';
  } else {
    // 3층
    if (rowNum >= 7) return 'B석';
    if (rowNum >= 4) return 'A석';
    return 'S석';
  }
}

// 추출된 등급과 좌석 위치를 종합하여 최종 등급 결정 (인식된 등급 최우선 존중 및 정확한 색상 부여)
function inferGradeForSeat(
  floor: string,
  rawRow: string,
  rawGrade?: string,
  customNames?: Record<GradeType, string>
): GradeType {
  const cleanF = floor.includes('2') ? '2층' : floor.includes('3') ? '3층' : '1층';
  const cleanRow = cleanRowName(rawRow);
  const rowNum = parseInt(cleanRow.replace(/\D/g, ''), 10) || 0;
  const isOp = cleanRow.toUpperCase().startsWith('OP');

  // 추출/입력된 등급이 있으면 최우선으로 반영 (절대 기본값으로 덮어쓰지 않음)
  const parsed = parseGrade(rawGrade, customNames);
  if (parsed) {
    return parsed;
  }

  // 등급이 전혀 없는 경우에만 공연장 표준 배치 적용
  if (cleanF === '1층') {
    if (isOp || (rowNum >= 1 && rowNum <= 16)) return 'VIP석';
    return 'R석';
  } else if (cleanF === '2층') {
    if (rowNum >= 1 && rowNum <= 4) return 'R석';
    return 'S석';
  } else {
    // 3층
    if (rowNum >= 1 && rowNum <= 3) return 'S석';
    if (rowNum >= 4 && rowNum <= 6) return 'A석';
    return 'B석';
  }
}

function parseSeatLineOrGroup(line: string, customNames?: Record<GradeType, string>): { seats?: ParsedSeat[]; error?: string } {
  const trimmed = line.trim();
  if (!trimmed) {
    return { error: '빈 줄이 포함되어 있습니다.' };
  }

  let floor = '1층';
  const floorMatch = trimmed.match(/([123])층/);
  if (floorMatch) {
    floor = `${floorMatch[1]}층`;
  }

  let matchedGrade: GradeType | null = null;
  if (customNames) {
    for (const [gradeKey, customName] of Object.entries(customNames)) {
      if (customName && customName.trim() && trimmed.toUpperCase().includes(customName.trim().toUpperCase())) {
        matchedGrade = gradeKey as GradeType;
        break;
      }
    }
  }
  if (!matchedGrade) {
    const gradeMatch = trimmed.match(/(VIP|R|S|A|B)석|판매금지석?/i);
    if (gradeMatch) {
      matchedGrade = parseGrade(gradeMatch[0], customNames);
    } else {
      const tokenMatch = trimmed.match(/\b(VIP|R|S|A|B)\b/i) || trimmed.match(/(VIP|브이아이피|알석|에스석|에이석|비석)/i);
      if (tokenMatch) {
        matchedGrade = parseGrade(tokenMatch[0], customNames);
      }
    }
  }

  if (trimmed.includes(':')) {
    const colonIdx = trimmed.indexOf(':');
    const prefix = trimmed.substring(0, colonIdx).trim();
    const numbersPart = trimmed.substring(colonIdx + 1).trim();

    let row = '';
    const opPrefixMatch = prefix.match(/(OP\d+)열?/i);
    if (opPrefixMatch) {
      row = cleanRowName(opPrefixMatch[1]);
    } else {
      const balcMatch = prefix.match(/(BL|BR)/i);
      if (balcMatch) {
        row = balcMatch[1].toUpperCase();
      } else {
        const rowMatch = prefix.match(/(?:^|\D)0*(\d+)열/);
        if (rowMatch) {
          row = `${parseInt(rowMatch[1], 10)}열`;
        } else {
          const anyRowMatch = prefix.match(/([0-9A-Za-z가-힣]+열)/);
          if (anyRowMatch) {
            row = cleanRowName(anyRowMatch[1]);
          } else {
            return { error: `좌석 형식이 올바르지 않습니다: "${trimmed}"` };
          }
        }
      }
    }

    const finalGrade = inferGradeForSeat(floor, row, matchedGrade || undefined, customNames);

    const seatNumbers: number[] = [];
    const chunks = numbersPart.split(/[,，]/);
    for (const chunk of chunks) {
      const c = chunk.trim();
      if (!c) continue;
      const rangeMatch = c.match(/(\d+)\s*~\s*(\d+)\s*번?/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        for (let n = Math.min(start, end); n <= Math.max(start, end); n++) {
          seatNumbers.push(n);
        }
      } else {
        const singleMatch = c.match(/(\d+)\s*번?/);
        if (singleMatch) {
          seatNumbers.push(parseInt(singleMatch[1], 10));
        }
      }
    }

    if (seatNumbers.length === 0) {
      return { error: `좌석 번호가 올바르지 않습니다: "${trimmed}"` };
    }

    return {
      seats: seatNumbers.map((seatNumber) => ({
        floor,
        grade: finalGrade,
        row,
        seatNumber,
      })),
    };
  }

  const balcMatch = trimmed.match(/(BL|BR)\s*0*(\d+)번?/i);
  if (balcMatch) {
    const balcType = balcMatch[1].toUpperCase();
    const seatNum = parseInt(balcMatch[2], 10);
    const finalGrade = inferGradeForSeat(floor, balcType, matchedGrade || undefined, customNames);
    return {
      seats: [
        {
          floor,
          grade: finalGrade,
          row: balcType,
          seatNumber: seatNum,
        },
      ],
    };
  }

  const rowRangeMatch = trimmed.match(/0*(\d+)열\s*(\d+)\s*~\s*(\d+)번?/);
  if (rowRangeMatch) {
    const row = `${parseInt(rowRangeMatch[1], 10)}열`;
    const start = parseInt(rowRangeMatch[2], 10);
    const end = parseInt(rowRangeMatch[3], 10);
    const finalGrade = inferGradeForSeat(floor, row, matchedGrade || undefined, customNames);
    const seats: ParsedSeat[] = [];
    for (let n = Math.min(start, end); n <= Math.max(start, end); n++) {
      seats.push({ floor, grade: finalGrade, row, seatNumber: n });
    }
    return { seats };
  }

  const rowSeatMatch = trimmed.match(/0*(\d+)열\s*0*(\d+)번?/);
  if (rowSeatMatch) {
    const row = `${parseInt(rowSeatMatch[1], 10)}열`;
    const seatNumber = parseInt(rowSeatMatch[2], 10);
    const finalGrade = inferGradeForSeat(floor, row, matchedGrade || undefined, customNames);
    return {
      seats: [{ floor, grade: finalGrade, row, seatNumber }],
    };
  }

  const opMatch = trimmed.match(/(OP\d+열?)\s*0*(\d+)번?/i);
  if (opMatch) {
    const row = cleanRowName(opMatch[1]);
    const seatNumber = parseInt(opMatch[2], 10);
    const finalGrade = inferGradeForSeat(floor, row, matchedGrade || undefined, customNames);
    return {
      seats: [{ floor, grade: finalGrade, row, seatNumber }],
    };
  }

  // 엑셀 탭/공백 구분 행 또는 임의 컬럼 형태 (예: "한국수자원공사 1층 18열 33번 R석" 또는 "1층\t18열\t33번")
  const flexRowMatch = trimmed.match(/(OP\d+열?|BL|BR|\d+열)/i);
  if (flexRowMatch) {
    const row = cleanRowName(flexRowMatch[1]);
    const finalGrade = inferGradeForSeat(floor, row, matchedGrade || undefined, customNames);

    // 물결표 범위 확인
    const flexRange = trimmed.match(/(\d+)\s*[~～\-]\s*(\d+)\s*번?/);
    if (flexRange) {
      const s = parseInt(flexRange[1], 10);
      const e = parseInt(flexRange[2], 10);
      if (!isNaN(s) && !isNaN(e) && Math.abs(e - s) < 70) {
        const seats: ParsedSeat[] = [];
        for (let n = Math.min(s, e); n <= Math.max(s, e); n++) {
          seats.push({ floor, grade: finalGrade, row, seatNumber: n });
        }
        return { seats };
      }
    }

    // 단일 번호 확인 (열 번호 이후의 숫자 우선)
    const afterRow = trimmed.substring(trimmed.indexOf(flexRowMatch[0]) + flexRowMatch[0].length);
    const numMatch = afterRow.match(/(\d+)\s*번?/) || trimmed.match(/(\d+)\s*번/);
    if (numMatch) {
      const seatNumber = parseInt(numMatch[1], 10);
      if (!isNaN(seatNumber) && seatNumber > 0) {
        return {
          seats: [{ floor, grade: finalGrade, row, seatNumber }],
        };
      }
    }
  }

  return {
    error: `좌석 형식이 올바르지 않거나 빠진 값이 있습니다: "${trimmed}" (예: 1층 08열 23번 VIP석 또는 VIP석 8열 23번)`,
  };
}

function formatSeatRanges(numbers: number[]): string {
  if (numbers.length === 0) return '';
  const sorted = Array.from(new Set(numbers)).sort((a, b) => a - b);

  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
    } else {
      if (start === prev) {
        ranges.push(`${start}번`);
      } else {
        ranges.push(`${start}~${prev}번`);
      }
      start = current;
      prev = current;
    }
  }

  if (start === prev) {
    ranges.push(`${start}번`);
  } else {
    ranges.push(`${start}~${prev}번`);
  }

  return ranges.join(', ');
}

// -------------------------------------------------------------
// 행별 좌석 데이터 구조
// -------------------------------------------------------------
interface PreciseRowData {
  rowName: string;
  defaultGrade: GradeType;
  leftIndent: number;
  leftSeats: number[];
  centerIndent: number;
  centerSeats: number[];
  rightIndent: number;
  rightSeats: number[];
}

// 2층 데이터 (좌 13 / 중 19 / 우 13 대칭: 1~45번)
const F2_PRECISE_ROWS: PreciseRowData[] = [
  {
    rowName: '1열',
    defaultGrade: 'R석',
    leftIndent: 0,
    leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    centerIndent: 2,
    centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
    rightIndent: 0,
    rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
  },
  {
    rowName: '2열',
    defaultGrade: 'R석',
    leftIndent: 1,
    leftSeats: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    centerIndent: 1,
    centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
    rightIndent: 0,
    rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44],
  },
  {
    rowName: '3열',
    defaultGrade: 'R석',
    leftIndent: 2,
    leftSeats: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    centerIndent: 1,
    centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    rightIndent: 0,
    rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],
  },
  {
    rowName: '4열',
    defaultGrade: 'R석',
    leftIndent: 3,
    leftSeats: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    centerIndent: 0,
    centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
    rightIndent: 0,
    rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
  },
  {
    rowName: '5열',
    defaultGrade: 'S석',
    leftIndent: 3,
    leftSeats: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    centerIndent: 0,
    centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
    rightIndent: 0,
    rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
  },
  {
    rowName: '6열',
    defaultGrade: 'S석',
    leftIndent: 4,
    leftSeats: [5, 6, 7, 8, 9, 10, 11, 12, 13],
    centerIndent: 0,
    centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
    rightIndent: 0,
    rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41],
  },
  {
    rowName: '7열',
    defaultGrade: 'S석',
    leftIndent: 4,
    leftSeats: [5, 6, 7, 8, 9, 10, 11, 12, 13],
    centerIndent: 0,
    centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
    rightIndent: 0,
    rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41],
  },
  {
    rowName: '8열',
    defaultGrade: 'S석',
    leftIndent: 4,
    leftSeats: [5, 6, 7, 8, 9, 10, 11, 12, 13],
    centerIndent: 0,
    centerSeats: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
    rightIndent: 0,
    rightSeats: [33, 34, 35, 36, 37, 38, 39, 40, 41],
  },
];

// 3층 데이터 (좌 12 / 중 19 / 우 12 대칭)
const F3_PRECISE_ROWS: PreciseRowData[] = [
  {
    rowName: '1열',
    defaultGrade: 'S석',
    leftIndent: 0,
    leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    centerIndent: 2,
    centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
    rightIndent: 0,
    rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],
  },
  {
    rowName: '2열',
    defaultGrade: 'S석',
    leftIndent: 1,
    leftSeats: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    centerIndent: 1,
    centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
    rightIndent: 0,
    rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
  },
  {
    rowName: '3열',
    defaultGrade: 'S석',
    leftIndent: 1,
    leftSeats: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    centerIndent: 1,
    centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
    rightIndent: 0,
    rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
  },
  {
    rowName: '4열',
    defaultGrade: 'A석',
    leftIndent: 2,
    leftSeats: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    centerIndent: 0,
    centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    rightIndent: 0,
    rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41],
  },
  {
    rowName: '5열',
    defaultGrade: 'A석',
    leftIndent: 2,
    leftSeats: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    centerIndent: 0,
    centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
    rightIndent: 0,
    rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41],
  },
  {
    rowName: '6열',
    defaultGrade: 'A석',
    leftIndent: 3,
    leftSeats: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    centerIndent: 0,
    centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    rightIndent: 0,
    rightSeats: [32, 33, 34, 35, 36, 37, 38, 39, 40],
  },
  {
    rowName: '7열',
    defaultGrade: 'B석',
    leftIndent: 5,
    leftSeats: [6, 7, 8, 9, 10, 11, 12],
    centerIndent: 0,
    centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
    rightIndent: 0,
    rightSeats: [32, 33, 34, 35, 36, 37, 38],
  },
  {
    rowName: '8열',
    defaultGrade: 'B석',
    leftIndent: 12,
    leftSeats: [],
    centerIndent: 1,
    centerSeats: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
    rightIndent: 12,
    rightSeats: [],
  },
];

// 1층 도면 데이터
const F1_GROUP_OP_TOP: PreciseRowData[] = [
  { rowName: 'OP1열', defaultGrade: 'VIP석', leftIndent: 9, leftSeats: [], centerIndent: 1, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25], rightIndent: 9, rightSeats: [] },
  { rowName: 'OP2열', defaultGrade: 'VIP석', leftIndent: 6, leftSeats: [7, 8, 9], centerIndent: 1, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], rightIndent: 0, rightSeats: [29, 30, 31] },
  { rowName: 'OP3열', defaultGrade: 'VIP석', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 1, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
];

const F1_GROUP_OP_BOTTOM: PreciseRowData[] = [
  { rowName: 'OP4열', defaultGrade: 'VIP석', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 1, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
  { rowName: 'OP5열', defaultGrade: 'VIP석', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
];

const F1_GROUP_MAIN_UPPER: PreciseRowData[] = [
  { rowName: '1열', defaultGrade: 'VIP석', leftIndent: 9, leftSeats: [], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 9, rightSeats: [] },
  { rowName: '2열', defaultGrade: 'VIP석', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
  { rowName: '3열', defaultGrade: 'VIP석', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
  { rowName: '4열', defaultGrade: 'VIP석', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33] },
  { rowName: '5열', defaultGrade: 'VIP석', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33] },
  { rowName: '6열', defaultGrade: 'VIP석', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33] },
  { rowName: '7열', defaultGrade: 'VIP석', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34] },
  { rowName: '8열', defaultGrade: 'VIP석', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34] },
  { rowName: '9열', defaultGrade: 'VIP석', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34] },
  { rowName: '10열', defaultGrade: 'VIP석', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34] },
  { rowName: '11열', defaultGrade: 'VIP석', leftIndent: 3, leftSeats: [4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34] },
  { rowName: '12열', defaultGrade: 'VIP석', leftIndent: 4, leftSeats: [5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33] },
  { rowName: '13열', defaultGrade: 'VIP석', leftIndent: 5, leftSeats: [6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32] },
  { rowName: '14열', defaultGrade: 'VIP석', leftIndent: 7, leftSeats: [8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 7, rightSeats: [29, 30] },
  { rowName: '15열', defaultGrade: 'VIP석', leftIndent: 9, leftSeats: [], centerIndent: 1, centerSeats: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 9, rightSeats: [] },
  { rowName: '16열', defaultGrade: 'VIP석', leftIndent: 9, leftSeats: [], centerIndent: 5, centerSeats: [15, 16, 17, 18, 19, 20, 21, 22], rightIndent: 9, rightSeats: [] },
];

const F1_GROUP_MAIN_LOWER: PreciseRowData[] = [
  { rowName: '17열', defaultGrade: 'R석', leftIndent: 0, leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34, 35, 36, 37] },
  { rowName: '18열', defaultGrade: 'R석', leftIndent: 0, leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34, 35, 36, 37] },
  { rowName: '19열', defaultGrade: 'R석', leftIndent: 0, leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34, 35, 36, 37] },
  { rowName: '20열', defaultGrade: 'R석', leftIndent: 0, leftSeats: [1, 2, 3, 4, 5, 6, 7, 8, 9], centerIndent: 0, centerSeats: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], rightIndent: 0, rightSeats: [29, 30, 31, 32, 33, 34, 35, 36, 37] },
];

interface ExtractedSeat {
  grade: string;
  floor: number;
  row: string;
  seat: number;
}

// LG SIGNATURE Hall의 모든 유효 좌석 키 세트 (도면 매칭 검증용)
const VALID_VENUE_SEAT_SET = new Set<string>();

// 1층 BL & BR
for (let n = 1; n <= 6; n++) {
  VALID_VENUE_SEAT_SET.add(`1층_BL_${n}`);
  VALID_VENUE_SEAT_SET.add(`1층_BR_${n}`);
}
// 2층 BL & BR
for (let n = 1; n <= 4; n++) {
  VALID_VENUE_SEAT_SET.add(`2층_BL_${n}`);
  VALID_VENUE_SEAT_SET.add(`2층_BR_${n}`);
}
// 1층 OP & 1~20열
for (const r of [...F1_GROUP_OP_TOP, ...F1_GROUP_OP_BOTTOM, ...F1_GROUP_MAIN_UPPER, ...F1_GROUP_MAIN_LOWER]) {
  const rowName = cleanRowName(r.rowName);
  for (const n of [...r.leftSeats, ...r.centerSeats, ...r.rightSeats]) {
    VALID_VENUE_SEAT_SET.add(`1층_${rowName}_${n}`);
  }
}
// 1층 21~23열
[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37].forEach((n) =>
  VALID_VENUE_SEAT_SET.add(`1층_21열_${n}`)
);
[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37].forEach((n) =>
  VALID_VENUE_SEAT_SET.add(`1층_22열_${n}`)
);
[2, 3, 4, 5, 6, 7, 8, 9, 29, 30, 31, 32, 33, 34, 35, 36].forEach((n) =>
  VALID_VENUE_SEAT_SET.add(`1층_23열_${n}`)
);

// 2층 1~8열
for (const r of F2_PRECISE_ROWS) {
  const rowName = cleanRowName(r.rowName);
  for (const n of [...r.leftSeats, ...r.centerSeats, ...r.rightSeats]) {
    VALID_VENUE_SEAT_SET.add(`2층_${rowName}_${n}`);
  }
}

// 3층 1~8열
for (const r of F3_PRECISE_ROWS) {
  const rowName = cleanRowName(r.rowName);
  for (const n of [...r.leftSeats, ...r.centerSeats, ...r.rightSeats]) {
    VALID_VENUE_SEAT_SET.add(`3층_${rowName}_${n}`);
  }
}

// U+ STAGE 유효 좌석 키 세트 추가 (A~Q열, BL/BR 1~12번)
UPLUS_VALID_SEAT_SET.forEach((key) => {
  VALID_VENUE_SEAT_SET.add(key);
});

// Gemini에서 추출된 JSON 배열을 표준 텍스트 양식으로 변환 (예: "VIP석 1층 OP1열: 10~15번\nR석 1층 2열: 1~5번, 7번")
function convertExtractedSeatsToText(seats: ExtractedSeat[]): string {
  const list = [...seats].sort((a, b) => {
    if (a.floor !== b.floor) return a.floor - b.floor;
    const gradeA = normalizeGrade(a.grade);
    const gradeB = normalizeGrade(b.grade);
    if (gradeA !== gradeB) return gradeA.localeCompare(gradeB);
    const isOpA = a.row.toUpperCase().startsWith('OP');
    const isOpB = b.row.toUpperCase().startsWith('OP');
    if (isOpA && !isOpB) return -1;
    if (!isOpA && isOpB) return 1;
    const numA = parseInt(a.row.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.row.replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return a.seat - b.seat;
  });

  const groups = new Map<string, { grade: string; floor: string; row: string; seats: number[] }>();

  for (const item of list) {
    const floor = `${item.floor}층`;
    const grade = normalizeGrade(item.grade);
    const row = cleanRowName(item.row);
    const key = `${grade} ${floor} ${row}`;
    if (!groups.has(key)) {
      groups.set(key, { grade, floor, row, seats: [] });
    }
    groups.get(key)!.seats.push(item.seat);
  }

  const lines: string[] = [];
  for (const [key, val] of groups.entries()) {
    const formattedRange = formatSeatRanges(val.seats);
    lines.push(`${key}: ${formattedRange}`);
  }

  return lines.join('\n');
}

const APP_THEATER_SESSION_KEY = 'app_selected_theater_v1';

export default function App() {
  const [selectedTheater, setSelectedTheater] = useState<TheaterId>(() => {
    try {
      const saved = sessionStorage.getItem(APP_THEATER_SESSION_KEY);
      if (saved === 'signature' || saved === 'uplus' || saved === 'custom') {
        return saved;
      }
    } catch {
      // ignore sessionStorage failure
    }
    return 'signature';
  });
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isHeaderSigningIn, setIsHeaderSigningIn] = useState<boolean>(false);
  const [pendingRedirectAction, setPendingRedirectAction] =
    useState<PendingAuthRedirectPayload | null>(null);
  const [redirectAuthError, setRedirectAuthError] = useState<string | null>(null);
  const [pendingShareCode, setPendingShareCode] = useState<string | null>(() =>
    readPendingShareCode()
  );
  const [showShareCodeLoginPrompt, setShowShareCodeLoginPrompt] = useState<boolean>(() =>
    Boolean(readPendingShareCode())
  );

  const [activeTab, setActiveTab] = useState<AppTab>('visual');
  const [inputText, setInputText] = useState<string>('');
  const [resultText, setResultText] = useState<string>('');
  const [activeSeats, setActiveSeats] = useState<ParsedSeat[]>([]);

  // 메타데이터: 단체명, 연락처, 공연명, 관람일자
  const [groupName, setGroupName] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [performanceName, setPerformanceName] = useState<string>('');
  const [viewingDateTime, setViewingDateTime] = useState<string>('');

  // 4대 예약 정보 및 정형화 JSON 전체 추출 데이터 상태
  const [extractedReservation, setExtractedReservation] = useState<{
    groupName: string;
    phoneNumber?: string;
    viewingDateTime: string;
    performanceName: string;
    seatText: string;
    rawOutput: string;
    rawJson?: string;
    records?: Array<{
      booker_name: string;
      phone_number?: string;
      event_name: string;
      event_date: string;
      seat_grade?: string;
      seat_info: string;
      seat_floor?: string;
      seat_row?: string;
      seat_number?: string;
    }>;
    reservations?: Array<{
      booker_name: string;
      phone_number?: string;
      event_name: string;
      event_date: string;
      seat_grade?: string;
      seat_info: string;
      seat_floor?: string;
      seat_row?: string;
      seat_number?: string;
    }>;
    selected_seats_from_map?: Array<{
      floor: string;
      row: string;
      seat_number: string;
    }>;
    isMapMatch?: boolean;
  } | null>(null);
  const [extractedCopied, setExtractedCopied] = useState<boolean>(false);
  const [extractedJsonCopied, setExtractedJsonCopied] = useState<boolean>(false);
  const [extractedViewMode, setExtractedViewMode] = useState<'table' | 'json' | 'text'>('table');

  const [activeClickGrade, setActiveClickGrade] = useState<GradeType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [activeFloorTab, setActiveFloorTab] = useState<'all' | '1f' | '2f' | '3f'>('all');
  const [lastActionToast, setLastActionToast] = useState<string>('');
  const [showPdfGuideModal, setShowPdfGuideModal] = useState<boolean>(false);
  const [isCapturingImage, setIsCapturingImage] = useState<boolean>(false);
  const [printPaperSize, setPrintPaperSize] = useState<'A3' | 'A4'>('A3');

  // 커스텀 등급명 관리 상태 (VIP석, R석, S석, A석, B석, 판매금지석)
  const [gradeCustomNames, setGradeCustomNames] = useState<Record<GradeType, string>>({
    'VIP석': 'VIP석',
    'R석': 'R석',
    'S석': 'S석',
    'A석': 'A석',
    'B석': 'B석',
    '판매금지석': '판매금지석',
  });
  const [editingGrade, setEditingGrade] = useState<GradeType | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  // 이미지 캡처 업로드 및 Gemini 분석 관련 상태 (다중 이미지 배열 지원)
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<boolean>(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImageItem[]>([]);
  const [unmatchedSeatsWarning, setUnmatchedSeatsWarning] = useState<string | null>(null);
  const [isVisualMapNotice, setIsVisualMapNotice] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportTargetRef = useRef<HTMLDivElement>(null);

  // Persist current theater selection across refreshes & signInWithRedirect
  useEffect(() => {
    try {
      sessionStorage.setItem(APP_THEATER_SESSION_KEY, selectedTheater);
    } catch {
      // ignore
    }
  }, [selectedTheater]);

  // Wait for first onAuthStateChanged + getRedirectResult before rendering editor/login UI
  useEffect(() => {
    let isMounted = true;
    let authSettled = false;
    let redirectSettled = false;

    const tryMarkReady = () => {
      if (isMounted && authSettled && redirectSettled) {
        setAuthReady(true);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!isMounted) return;
      if (nextUser) {
        if (!isAllowedCompanyUser(nextUser)) {
          try {
            await signOut(auth);
          } catch {
            // ignore signOut failure
          }
          if (!isMounted) return;
          setAuthUser(null);
          setAuthError(COMPANY_AUTH_ERROR_MESSAGE);
          setLastActionToast(COMPANY_AUTH_ERROR_MESSAGE);
          authSettled = true;
          tryMarkReady();
          return;
        }
        setAuthError(null);
        setAuthUser(nextUser);
      } else {
        setAuthUser(null);
      }
      authSettled = true;
      tryMarkReady();
    });

    (async () => {
      try {
        await authPersistenceReady;
        const redirectCred = await getRedirectResult(auth);
        const pending = readAndClearPendingAuthRedirect();

        if (!isMounted) return;

        if (redirectCred?.user) {
          if (!isAllowedCompanyUser(redirectCred.user)) {
            try {
              await signOut(auth);
            } catch {
              // ignore signOut failure
            }
            if (!isMounted) return;
            setAuthUser(null);
            setAuthError(COMPANY_AUTH_ERROR_MESSAGE);
            setLastActionToast(COMPANY_AUTH_ERROR_MESSAGE);
          } else {
            setAuthError(null);
            setAuthUser(redirectCred.user);
            setShowShareCodeLoginPrompt(false);
            if (
              pending?.theater === 'custom' ||
              pending?.action === 'enterCustom' ||
              pending?.action === 'openMyLayouts' ||
              pending?.action === 'openShareCodeModal' ||
              readPendingShareCode()
            ) {
              setSelectedTheater('custom');
            }
            if (pending) {
              setPendingRedirectAction(pending);
            }
            setLastActionToast(
              `${redirectCred.user.email || redirectCred.user.displayName || 'Google'} 계정으로 로그인되었습니다.`
            );
          }
        }
      } catch (err) {
        readAndClearPendingAuthRedirect();
        if (!isMounted) return;
        if (err instanceof CompanyAccountRequiredError) {
          setAuthError(COMPANY_AUTH_ERROR_MESSAGE);
          setLastActionToast(COMPANY_AUTH_ERROR_MESSAGE);
        } else {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code?: string }).code)
              : '';
          if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
            setAuthError('로그인 처리 중 오류가 발생했습니다. 다시 로그인해 주세요.');
            setRedirectAuthError('리다이렉트 로그인 처리 중 오류가 발생했습니다. 다시 로그인해 주세요.');
          }
        }
      } finally {
        redirectSettled = true;
        tryMarkReady();
      }
    })();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Keep signed-out users on the start screen rather than inside custom editor
  useEffect(() => {
    if (authReady && !authUser && selectedTheater === 'custom') {
      setSelectedTheater('signature');
    }
  }, [authReady, authUser, selectedTheater]);

  // Automatically switch to custom editor once company user signs in with a pending ?code= link
  useEffect(() => {
    if (authReady && authUser && pendingShareCode) {
      setShowShareCodeLoginPrompt(false);
      setSelectedTheater('custom');
    }
  }, [authReady, authUser, pendingShareCode]);

  const handleConsumePendingShareCode = () => {
    clearPendingShareCode();
    setPendingShareCode(null);
    setShowShareCodeLoginPrompt(false);
  };

  const requestCompanyLogin = async (options?: {
    action?: PendingAuthRedirectPayload['action'];
    theater?: TheaterId;
    onSuccess?: (signedUser: User) => void;
    onCancel?: () => void;
  }) => {
    if (isHeaderSigningIn) return;
    setIsHeaderSigningIn(true);
    setAuthError(null);
    setRedirectAuthError(null);
    try {
      const res = await signInWithGoogleAutoFallback({
        action: options?.action || 'loginOnly',
        theater: options?.theater || (pendingShareCode ? 'custom' : selectedTheater),
      });
      if (res.mode === 'popup') {
        if (!isAllowedCompanyUser(res.credential.user)) {
          await signOut(auth);
          setAuthUser(null);
          setAuthError(COMPANY_AUTH_ERROR_MESSAGE);
          showToast(COMPANY_AUTH_ERROR_MESSAGE);
          return;
        }
        setAuthError(null);
        setAuthUser(res.credential.user);
        setShowShareCodeLoginPrompt(false);
        showToast(
          `${res.credential.user.email || res.credential.user.displayName || 'Google'} 계정으로 로그인되었습니다.`
        );
        options?.onSuccess?.(res.credential.user);
      }
    } catch (err) {
      if (err instanceof CompanyAccountRequiredError) {
        setAuthUser(null);
        setAuthError(COMPANY_AUTH_ERROR_MESSAGE);
        showToast(COMPANY_AUTH_ERROR_MESSAGE);
      } else {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code?: string }).code)
            : '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          showToast('로그인이 취소되었습니다.');
          options?.onCancel?.();
        } else {
          showToast('로그인 중 오류가 발생했습니다. 다시 시도해 주세요.');
        }
      }
    } finally {
      setIsHeaderSigningIn(false);
    }
  };

  const handleHeaderSignIn = () =>
    void requestCompanyLogin({
      action: 'loginOnly',
      theater: pendingShareCode ? 'custom' : selectedTheater,
    });

  const handleSelectTheater = (nextTheater: TheaterId) => {
    if (nextTheater !== 'custom') {
      setSelectedTheater(nextTheater);
      return;
    }
    if (authUser && isAllowedCompanyUser(authUser)) {
      setSelectedTheater('custom');
      return;
    }
    void requestCompanyLogin({
      action: 'enterCustom',
      theater: 'custom',
      onSuccess: () => {
        setSelectedTheater('custom');
      },
    });
  };

  const handleHeaderSignOut = async () => {
    try {
      await signOut(auth);
      setAuthUser(null);
      setAuthError(null);
      if (selectedTheater === 'custom') {
        setSelectedTheater('signature');
      }
      showToast('로그아웃되었습니다.');
    } catch {
      showToast('로그아웃 중 오류가 발생했습니다.');
    }
  };

  // 마우스 드래그 다중 좌석 선택 관련 Ref
  const isMouseDownRef = useRef<boolean>(false);
  const dragModeRef = useRef<'add' | 'remove'>('add');
  const dragCountRef = useRef<number>(0);
  const activeSeatsRef = useRef<ParsedSeat[]>(activeSeats);
  activeSeatsRef.current = activeSeats;
  const activeClickGradeRef = useRef<GradeType | null>(activeClickGrade);
  activeClickGradeRef.current = activeClickGrade;
  const uploadedImagesRef = useRef<UploadedImageItem[]>(uploadedImages);
  uploadedImagesRef.current = uploadedImages;

  const handleStartEditGrade = (gradeKey: GradeType) => {
    setEditingGrade(gradeKey);
    setEditingText(gradeCustomNames[gradeKey] || GRADE_STYLES[gradeKey].label);
  };

  const handleSaveEditGrade = (gradeKey: GradeType, value: string) => {
    const trimmed = value.trim();
    const fallback = GRADE_STYLES[gradeKey].label;
    const newName = trimmed || fallback;
    const updatedNames: Record<GradeType, string> = {
      ...gradeCustomNames,
      [gradeKey]: newName,
    };
    setGradeCustomNames(updatedNames);
    setEditingGrade(null);
    showToast(`'${fallback}' 등급명이 '${newName}'(으)로 변경되었습니다.`);
    if (activeSeatsRef.current.length > 0) {
      setResultText(formatSeatsWithCustomNames(activeSeatsRef.current, updatedNames));
    }
  };

  const formatSeatsWithCustomNames = (seats: ParsedSeat[], customNames: Record<GradeType, string>) => {
    const groups = new Map<string, { floor: string; grade: string; row: string; seats: number[] }>();
    for (const item of seats) {
      const norm = normalizeGrade(item.grade, customNames);
      const customGrade = customNames[norm] || item.grade;
      const key = item.floor === '1층' ? `${customGrade} ${item.row}` : `${item.floor} ${customGrade} ${item.row}`;
      if (!groups.has(key)) {
        groups.set(key, { floor: item.floor, grade: customGrade, row: item.row, seats: [] });
      }
      groups.get(key)!.seats.push(item.seatNumber);
    }

    const formattedLines: string[] = [];
    for (const [key, group] of groups.entries()) {
      const formattedSeats = formatSeatRanges(group.seats);
      formattedLines.push(`${key}: ${formattedSeats}`);
    }
    return formattedLines.join('\n');
  };

  // '좌석배치도'는 항상 유지되고, 단체명만 작성할 수 있도록 자동 결합
  const exportTitle = useMemo(() => {
    const trimmed = groupName.trim();
    if (!trimmed) return '(단체명) 좌석배치도';
    if (trimmed.endsWith('좌석배치도')) {
      return trimmed;
    }
    return `${trimmed} 좌석배치도`;
  }, [groupName]);

  const seatGradeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of activeSeats) {
      const cleanRow = cleanRowName(s.row);
      map.set(`${s.floor}_${cleanRow}_${s.seatNumber}`, s.grade);
    }
    return map;
  }, [activeSeats]);

  const gradeCounts = useMemo(() => {
    const counts: Record<TicketGradeType, number> = {
      'VIP석': 0,
      'R석': 0,
      'S석': 0,
      'A석': 0,
      'B석': 0,
    };
    for (const s of activeSeats) {
      const g = normalizeGrade(s.grade);
      if (g in counts) {
        counts[g as TicketGradeType] = (counts[g as TicketGradeType] || 0) + 1;
      }
    }
    return counts;
  }, [activeSeats]);

  // 등급별 1매당 가격 상태 (VIP, R, S, A, B)
  const [gradePrices, setGradePrices] = useState<Record<TicketGradeType, number | ''>>({
    'VIP석': '',
    'R석': '',
    'S석': '',
    'A석': '',
    'B석': '',
  });

  // 좌석배치도에 금액 표기 여부 (기본값: false - 평소에는 미표기, 필요한 경우 체크박스로 켬)
  const [showPrices, setShowPrices] = useState<boolean>(false);

  // 각 등급별 총 금액 계산: (선택된 좌석 수 × 해당 등급 입력 금액)
  const gradeTotals = useMemo(() => {
    const totals: Record<TicketGradeType, number> = {
      'VIP석': 0,
      'R석': 0,
      'S석': 0,
      'A석': 0,
      'B석': 0,
    };
    for (const g of TICKET_GRADES) {
      const price = typeof gradePrices[g] === 'number' ? (gradePrices[g] as number) : 0;
      totals[g] = (gradeCounts[g] || 0) * price;
    }
    return totals;
  }, [gradeCounts, gradePrices]);

  // 모든 등급의 금액을 합산한 총 합계 금액
  const grandTotalPrice = useMemo(() => {
    return Object.values(gradeTotals).reduce((sum, curr) => sum + curr, 0);
  }, [gradeTotals]);

  // 실제 판매(예매) 대상 좌석과 판매금지석 분리
  const bookedSeats = useMemo(() => {
    return activeSeats.filter((s) => normalizeGrade(s.grade) !== '판매금지석');
  }, [activeSeats]);

  const prohibitedSeats = useMemo(() => {
    return activeSeats.filter((s) => normalizeGrade(s.grade) === '판매금지석');
  }, [activeSeats]);

  // 텍스트 내에서 단체명, 공연일시, 공연명, 좌석 분리 추출 헬퍼 함수
  const extractMetaAndSeatLines = (text: string) => {
    const lines = text.split('\n');
    let extractedGroup: string | undefined;
    let extractedDate: string | undefined;
    let extractedPerf: string | undefined;
    const seatLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const groupMatch = line.match(/^단체명\s*:\s*(.*)$/i);
      if (groupMatch) {
        const val = groupMatch[1].trim();
        if (val && val !== '정보 없음') extractedGroup = val;
        continue;
      }

      const dateMatch = line.match(/^(?:공연\s*날짜|관람\s*일시|공연\s*일시)\s*:\s*(.*)$/i);
      if (dateMatch) {
        const val = dateMatch[1].trim();
        if (val && val !== '정보 없음') extractedDate = val;
        continue;
      }

      const perfMatch = line.match(/^공연명\s*:\s*(.*)$/i);
      if (perfMatch) {
        const val = perfMatch[1].trim();
        if (val && val !== '정보 없음') extractedPerf = val;
        continue;
      }

      if (/^좌석\s*:?$/i.test(line)) {
        continue;
      }

      seatLines.push(line);
    }

    return { extractedGroup, extractedDate, extractedPerf, seatLines };
  };

  const applyNewSeatState = (newSeats: ParsedSeat[], updateInputText: boolean = true) => {
    const uniqueMap = new Map<string, ParsedSeat>();
    for (const s of newSeats) {
      const cleanRow = cleanRowName(s.row);
      const key = `${s.floor}_${cleanRow}_${s.seatNumber}`;
      uniqueMap.set(key, { ...s, row: cleanRow });
    }
    const deduplicated = Array.from(uniqueMap.values());

    deduplicated.sort((a, b) => {
      if (a.floor !== b.floor) return a.floor.localeCompare(b.floor);
      if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
      const isBalcA = a.row === 'BL' || a.row === 'BR';
      const isBalcB = b.row === 'BL' || b.row === 'BR';
      if (isBalcA && !isBalcB) return 1;
      if (!isBalcA && isBalcB) return -1;
      const rowA = parseInt(a.row.replace(/\D/g, ''), 10) || 0;
      const rowB = parseInt(b.row.replace(/\D/g, ''), 10) || 0;
      if (rowA !== rowB) return rowA - rowB;
      return a.seatNumber - b.seatNumber;
    });

    const groups = new Map<string, { floor: string; grade: string; row: string; seats: number[] }>();
    for (const item of deduplicated) {
      const norm = normalizeGrade(item.grade, gradeCustomNames);
      const customGrade = gradeCustomNames[norm] || item.grade;
      const key = item.floor === '1층' ? `${customGrade} ${item.row}` : `${item.floor} ${customGrade} ${item.row}`;
      if (!groups.has(key)) {
        groups.set(key, { floor: item.floor, grade: customGrade, row: item.row, seats: [] });
      }
      groups.get(key)!.seats.push(item.seatNumber);
    }

    const formattedLines: string[] = [];
    const inputLines: string[] = [];

    for (const [key, group] of groups.entries()) {
      const formattedSeats = formatSeatRanges(group.seats);
      formattedLines.push(`${key}: ${formattedSeats}`);
      for (const seatNum of group.seats.sort((a, b) => a - b)) {
        inputLines.push(`${key} ${seatNum}번`);
      }
    }

    setActiveSeats(deduplicated);
    setResultText(formattedLines.join('\n'));
    if (updateInputText) {
      setInputText(inputLines.join('\n'));
    }
    setErrorMessage('');
    setCopied(false);
  };

  const handleOrganizeSeats = (customText?: string | React.MouseEvent) => {
    const text = typeof customText === 'string' ? customText : inputText;
    if (!text || !text.trim()) {
      setErrorMessage('좌석 내역을 입력해 주세요.');
      setResultText('');
      setActiveSeats([]);
      return;
    }

    const { extractedGroup, extractedDate, extractedPerf, seatLines } = extractMetaAndSeatLines(text);
    if (extractedGroup) setGroupName(extractedGroup);
    if (extractedDate) setViewingDateTime(extractedDate);
    if (extractedPerf) setPerformanceName(extractedPerf);

    const parsedSeats: ParsedSeat[] = [];

    for (let i = 0; i < seatLines.length; i++) {
      const line = seatLines[i].trim();
      if (!line) continue;

      const { seats, error } = parseSeatLineOrGroup(line, gradeCustomNames);
      if (error || !seats || seats.length === 0) {
        setErrorMessage(error || '올바른 좌석 내역 형식이 아닙니다 (예: 1층 08열 23번 VIP석 또는 3층 A석 6열: 26~29번).');
        setResultText('');
        setActiveSeats([]);
        return;
      }
      parsedSeats.push(...seats);
    }

    if (parsedSeats.length === 0) {
      setErrorMessage('유효한 좌석 내역이 없습니다.');
      setResultText('');
      setActiveSeats([]);
      return;
    }

    applyNewSeatState(parsedSeats);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isMouseDownRef.current) {
        isMouseDownRef.current = false;
        if (dragCountRef.current > 1) {
          const mode = dragModeRef.current;
          const count = dragCountRef.current;
          showToast(
            mode === 'add'
              ? `${count}개 좌석이 드래그로 일괄 지정되었습니다.`
              : `${count}개 좌석이 드래그로 취소되었습니다.`
          );
        }
        dragCountRef.current = 0;
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // 클립보드 이미지 붙여넣기(Ctrl+V) 전역 리스너 (어느 탭에서나 이미지 붙여넣기 시 텍스트 추출 탭으로 전환 및 누적 추가)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        setActiveTab('text');
        handleProcessImageFiles(pastedFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  // 1. 단축키 (Ctrl+S / Cmd+S) 시 브라우저 깨진 HTML 저장 대신 고화질 단일 HTML 다운로드 자동 실행
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleExportHtml();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exportTitle, activeFloorTab, activeSeats, gradeCustomNames]);

  // 2. 브라우저 우클릭 "페이지를 다른 이름으로 저장"을 사용할 때도 스타일이 보존되도록 document.head에 컴파일된 스타일 유지
  useEffect(() => {
    const syncStylesToHead = () => {
      let existing = document.getElementById('inlined-standalone-css');
      if (!existing) {
        existing = document.createElement('style');
        existing.id = 'inlined-standalone-css';
        document.head.appendChild(existing);
      }
      let allCss = '';
      try {
        for (const sheet of Array.from(document.styleSheets)) {
          if (sheet.ownerNode === existing) continue;
          try {
            if (sheet.cssRules) {
              for (const rule of Array.from(sheet.cssRules)) {
                allCss += rule.cssText + '\n';
              }
            }
          } catch {
            // cross-origin stylesheets ignore
          }
        }
      } catch {
        // ignore
      }
      if (allCss) {
        existing.textContent = allCss;
      }
    };

    const timer = setTimeout(syncStylesToHead, 300);
    return () => clearTimeout(timer);
  }, [activeSeats, gradeCustomNames]);

  // 이미지 캡처본(엑셀 표, 4K 고해상도, 투명 배경 PNG 등) 초고속 최적화 (글자 가독성 100% 보존하면서 초경량화)
  const optimizeImageFile = (file: File): Promise<{ dataUrl: string; mimeType: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawDataUrl = (e.target?.result as string) || '';
        if (!rawDataUrl) {
          resolve({ dataUrl: '', mimeType: file.type || 'image/png' });
          return;
        }

        const img = new Image();
        img.onload = () => {
          const maxDim = 1800;
          let { width, height } = img;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // 투명 배경 PNG가 검은색으로 변환되는 것을 방지하기 위해 흰색 배경 선행 채움
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            const optimized = canvas.toDataURL('image/jpeg', 0.88);
            resolve({ dataUrl: optimized, mimeType: 'image/jpeg' });
          } else {
            resolve({ dataUrl: rawDataUrl, mimeType: file.type || 'image/png' });
          }
        };
        img.onerror = () => resolve({ dataUrl: rawDataUrl, mimeType: file.type || 'image/png' });
        img.src = rawDataUrl;
      };
      reader.onerror = () => resolve({ dataUrl: '', mimeType: file.type || 'image/png' });
      reader.readAsDataURL(file);
    });
  };

  // 다중 이미지 파일 읽기 및 기존 이미지 리스트에 누적 추가 (덮어쓰지 않고 배열 형태로 모두 추가)
  const handleProcessImageFiles = async (newFiles: File[]) => {
    const validFiles = Array.from(newFiles).filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      setErrorMessage('이미지 파일(PNG, JPG, WebP 등)만 업로드할 수 있습니다.');
      return;
    }

    const currentCount = uploadedImagesRef.current.length;
    const newItems: UploadedImageItem[] = await Promise.all(
      validFiles.map(async (file, idx) => {
        const { dataUrl, mimeType } = await optimizeImageFile(file);
        return {
          id: `${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name && file.name !== 'image.png' ? file.name : `캡처 이미지 ${currentCount + idx + 1}`,
          dataUrl: dataUrl,
          mimeType: mimeType,
          fileSize: file.size,
        };
      })
    );

    const validNewItems = newItems.filter((item) => Boolean(item.dataUrl));
    const updatedImages = [...uploadedImagesRef.current, ...validNewItems];
    uploadedImagesRef.current = updatedImages;
    setUploadedImages(updatedImages);
    setErrorMessage('');
    runGeminiAnalysisOnImages(updatedImages);
  };

  // 첨부된 다중 이미지 일괄 분석 및 4대 정보(단체명, 일시, 공연명, 좌석) 추출
  const runGeminiAnalysisOnImages = async (imagesList: UploadedImageItem[]) => {
    if (imagesList.length === 0) return;

    setIsAnalyzingImage(true);
    setErrorMessage('');
    setUnmatchedSeatsWarning(null);

    try {
      const response = await fetch('/api/parse-seat-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: imagesList.map((img) => ({
            imageBase64: img.dataUrl,
            mimeType: img.mimeType,
          })),
        }),
      });

      // 안전한 JSON 파싱 (프록시나 서버 타임아웃으로 HTML 페이지가 반환될 때 SyntaxError 방지)
      const contentType = response.headers.get('content-type') || '';
      let data: any = null;
      let rawText = '';

      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      }

      if (!data) {
        try {
          rawText = await response.text();
        } catch {
          rawText = '';
        }
      }

      if (!response.ok || !data || data.error) {
        if (!data) {
          if (
            response.status === 504 ||
            rawText.includes('504') ||
            rawText.includes('timeout') ||
            rawText.includes('The page could not') ||
            rawText.includes('The page cannot')
          ) {
            throw new Error('서버 응답 시간이 초과되었습니다. 잠시 후 아래 [다시 시도] 버튼을 눌러주세요.');
          }
          if (response.status === 413 || rawText.includes('413') || rawText.includes('Too Large')) {
            throw new Error('업로드된 이미지 용량이 너무 큽니다. 이미지를 1장씩 등록해 주세요.');
          }
          if (response.status === 502 || response.status === 503) {
            throw new Error('AI 서버에 일시적인 트래픽이 집중되었습니다. 2~3초 후 아래 [다시 시도] 버튼을 눌러주세요.');
          }
          throw new Error(`이미지 분석 처리 중 일시적인 연결 지연이 발생했습니다 (${response.status || '서버 통신 오류'}). 아래 [다시 시도]를 눌러주세요.`);
        }
        throw new Error(data.error || '이미지 판독 중 오류가 발생했습니다.');
      }

      const {
        groupName: parsedGroup,
        phoneNumber: parsedPhone,
        viewingDateTime: parsedDate,
        performanceName: parsedPerf,
        seatText: parsedSeatText,
        isVisualMap: parsedIsVisualMap,
        reservations: parsedReservations,
        selected_seats_from_map: parsedMapSeats,
        isMapMatch: parsedIsMapMatch,
        rawJson,
        rawOutput,
      } = data;

      // 1. 단체명 & 연락처 자동 채우기
      if (parsedGroup && parsedGroup !== '정보 없음') {
        setGroupName(parsedGroup);
      }
      if (parsedPhone) {
        setPhoneNumber(parsedPhone);
      }
      // 2. 공연 날짜 자동 채우기
      if (parsedDate && parsedDate !== '정보 없음') {
        setViewingDateTime(parsedDate);
      }
      // 3. 공연명 자동 채우기
      if (parsedPerf && parsedPerf !== '정보 없음') {
        setPerformanceName(parsedPerf);
      }
      // 4. 좌석 자동 채우기 (범위 형식 텍스트)
      if (parsedSeatText && parsedSeatText.trim()) {
        setInputText(parsedSeatText.trim());
      }

      const allRecords = Array.isArray(data.all_records)
        ? data.all_records
        : Array.isArray(data.records)
        ? data.records
        : Array.isArray(parsedReservations)
        ? parsedReservations
        : [];

      // 모든 추출 레코드의 등급 및 좌석 번호를 정밀 보정하여 도면과 등급 색상 동기화 (범위 및 다중 좌석 전개)
      const normalizedAllRecords = allRecords.flatMap((rec: any) => {
        const floor = rec.seat_floor || '1층';
        const row = cleanRowName(rec.seat_row || '1열');
        const numStr = String(rec.seat_number || '1');
        const info = String(rec.seat_info || '');

        // 1. 물결표(~) 또는 하이픈(-) 범위 전개 (예: 26~29번)
        const rangeMatch = `${numStr} ${info}`.match(/(\d+)\s*[~～\-]\s*(\d+)/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10);
          const end = parseInt(rangeMatch[2], 10);
          if (!isNaN(start) && !isNaN(end) && Math.abs(end - start) < 70) {
            const min = Math.min(start, end);
            const max = Math.max(start, end);
            const list = [];
            for (let n = min; n <= max; n++) {
              const validSeatNum = `${n}번`;
              const grade = inferGradeForSeat(floor, row, rec.seat_grade, gradeCustomNames);
              list.push({
                ...rec,
                seat_floor: floor,
                seat_row: row,
                seat_number: validSeatNum,
                seat_grade: grade,
                seat_info: `${floor} ${row} ${validSeatNum}`,
              });
            }
            return list;
          }
        }

        // 2. 쉼표(,) 구분 다중 좌석 전개
        if (numStr.includes(',') || info.includes(',')) {
          const parts = `${numStr} ${info}`.split(/[,，]/);
          const list = [];
          for (const p of parts) {
            const m = p.match(/(\d+)/);
            if (m) {
              const val = parseInt(m[1], 10);
              if (!isNaN(val) && val > 0) {
                const validSeatNum = `${val}번`;
                const grade = inferGradeForSeat(floor, row, rec.seat_grade, gradeCustomNames);
                list.push({
                  ...rec,
                  seat_floor: floor,
                  seat_row: row,
                  seat_number: validSeatNum,
                  seat_grade: grade,
                  seat_info: `${floor} ${row} ${validSeatNum}`,
                });
              }
            }
          }
          if (list.length > 0) return list;
        }

        // 3. 단일 좌석
        const cleanDigits = numStr.replace(/\D/g, '');
        const seatNum = parseInt(cleanDigits, 10);
        const validSeatNum = !isNaN(seatNum) && seatNum > 0 ? `${seatNum}번` : numStr || '1번';
        const grade = inferGradeForSeat(floor, row, rec.seat_grade, gradeCustomNames);
        return [{
          ...rec,
          seat_floor: floor,
          seat_row: row,
          seat_number: validSeatNum,
          seat_grade: grade,
          seat_info: rec.seat_info || `${floor} ${row} ${validSeatNum}`,
        }];
      });

      const resData = {
        groupName: parsedGroup || '정보 없음',
        phoneNumber: parsedPhone || '',
        viewingDateTime: parsedDate || '정보 없음',
        performanceName: parsedPerf || '정보 없음',
        seatText: parsedSeatText || '',
        records: normalizedAllRecords,
        reservations: normalizedAllRecords,
        selected_seats_from_map: Array.isArray(parsedMapSeats) ? parsedMapSeats : [],
        isMapMatch: Boolean(parsedIsMapMatch),
        rawJson:
          JSON.stringify(normalizedAllRecords, null, 2),
        rawOutput:
          rawOutput ||
          `단체명: ${parsedGroup || '정보 없음'}${parsedPhone ? ` (${parsedPhone})` : ''}\n공연 날짜: ${parsedDate || '정보 없음'}\n공연명: ${parsedPerf || '정보 없음'}\n좌석:\n${parsedSeatText || ''}`,
      };
      setExtractedReservation(resData);

      // 추출된 좌석들을 파싱하여 도면에도 즉시 등급별 색상으로 반영
      const allParsed: ParsedSeat[] = [];

      if (normalizedAllRecords.length > 0) {
        for (const rec of normalizedAllRecords) {
          const floor = rec.seat_floor;
          const row = rec.seat_row;
          const seatNum = parseInt(String(rec.seat_number).replace(/\D/g, ''), 10);
          if (!isNaN(seatNum) && seatNum > 0) {
            allParsed.push({
              floor,
              grade: rec.seat_grade,
              row,
              seatNumber: seatNum,
            });
          }
        }
      } else if (parsedSeatText && parsedSeatText.trim()) {
        const lines = parsedSeatText.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const { seats } = parseSeatLineOrGroup(trimmed, gradeCustomNames);
          if (seats) allParsed.push(...seats);
        }
      }

        if (allParsed.length > 0) {
          const matched: ParsedSeat[] = [];
          const unmatched: ParsedSeat[] = [];
          for (const s of allParsed) {
            const cleanRow = cleanRowName(s.row);
            const key = `${s.floor}_${cleanRow}_${s.seatNumber}`;
            if (VALID_VENUE_SEAT_SET.has(key)) {
              matched.push({ ...s, row: cleanRow });
            } else {
              unmatched.push({ ...s, row: cleanRow });
            }
          }

          if (unmatched.length > 0) {
            const sample = unmatched.slice(0, 10).map((s) => `${s.floor} ${s.row} ${s.seatNumber}번`).join(', ');
            const suffix = unmatched.length > 10 ? ` 외 ${unmatched.length - 10}석` : '';
            setUnmatchedSeatsWarning(`도면 미매칭 좌석: ${sample}${suffix}`);
          } else {
            setUnmatchedSeatsWarning(null);
          }

          if (matched.length > 0) {
            applyNewSeatState(matched, false);
          }
        }

      if (parsedIsVisualMap) {
        setIsVisualMapNotice(true);
        showToast("안내: 좌석 도면 이미지를 분석했습니다. 누락된 'X' 표시 좌석이 없는지 추출된 내역과 이미지를 한 번 더 대조해 주세요.");
      } else {
        setIsVisualMapNotice(false);
        showToast(
          imagesList.length > 1
            ? `총 ${imagesList.length}장의 캡처 이미지에서 4대 정보(단체명, 일시, 공연명, 좌석)를 통합 추출하여 도면에 반영했습니다!`
            : '단체명, 공연 날짜, 공연명, 좌석 4대 정보가 입력 필드와 도면에 자동 입력되었습니다!'
        );
      }
    } catch (err: any) {
      let rawMsg = String(err?.message || '이미지 분석에 실패했습니다.');
      try {
        const parsed = JSON.parse(rawMsg);
        if (parsed.error?.message) {
          rawMsg = parsed.error.message;
        }
      } catch {}

      if (
        rawMsg.includes('503') ||
        rawMsg.includes('UNAVAILABLE') ||
        rawMsg.includes('high demand') ||
        rawMsg.includes('트래픽') ||
        rawMsg.includes('서버')
      ) {
        setErrorMessage(
          '현재 AI 모델에 일시적인 트래픽 급증(503)이 발생했습니다. 오른쪽 [다시 시도] 버튼을 누르시면 대체 모델을 통해 즉시 재분석됩니다.'
        );
      } else if (rawMsg.includes('429') || rawMsg.includes('Resource has been exhausted')) {
        setErrorMessage('요청 한도에 일시 도달했습니다. 잠시 후 [다시 시도] 버튼을 눌러주세요.');
      } else {
        setErrorMessage(rawMsg);
      }
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // 개별 이미지 삭제 함수
  const handleRemoveImage = (idToRemove: string) => {
    const updated = uploadedImages.filter((img) => img.id !== idToRemove);
    setUploadedImages(updated);
    if (updated.length > 0) {
      runGeminiAnalysisOnImages(updated);
      showToast('선택한 이미지가 삭제되었으며, 남은 이미지로 재분석합니다.');
    } else {
      setExtractedReservation(null);
      setIsVisualMapNotice(false);
      setUnmatchedSeatsWarning(null);
      showToast('모든 이미지가 삭제되었습니다.');
    }
  };

  // 모든 이미지 전체 삭제 함수
  const handleClearAllImages = () => {
    setUploadedImages([]);
    setExtractedReservation(null);
    setIsVisualMapNotice(false);
    setUnmatchedSeatsWarning(null);
    showToast('첨부된 모든 이미지가 삭제되었습니다.');
  };

  // [정리 및 도면에 일괄 반영] 실행 함수
  const handleApplySeatsToMap = async () => {
    setErrorMessage('');

    // 1. 이미지가 첨부되어 있고 현재 분석 중인 경우 안내
    if (isAnalyzingImage) {
      showToast('이미지에서 예약 4대 정보를 분석하고 있습니다. 잠시만 기다려 주세요.');
      return;
    }

    // 2. 만약 입력 텍스트(inputText)가 비어있는 경우
    if (!inputText || !inputText.trim()) {
      // 이미지가 1장이라도 업로드되어 있는 경우 (uploadedImages.length > 0):
      // 에러 메시지를 절대 띄우지 않고, 첨부된 이미지들에 대해 즉시 텍스트 판독 및 도면 반영 실행!
      if (uploadedImagesRef.current.length > 0 || uploadedImages.length > 0) {
        await runGeminiAnalysisOnImages(
          uploadedImagesRef.current.length > 0 ? uploadedImagesRef.current : uploadedImages
        );
        return;
      }

      // 이미지가 아예 첨부되어 있지 않을 때만 유효성 에러 표시
      setErrorMessage('좌석 내역 텍스트를 입력하거나 이미지를 업로드해 주세요.');
      return;
    }

    const { extractedGroup, extractedDate, extractedPerf, seatLines } = extractMetaAndSeatLines(inputText);
    if (extractedGroup) setGroupName(extractedGroup);
    if (extractedDate) setViewingDateTime(extractedDate);
    if (extractedPerf) setPerformanceName(extractedPerf);

    const allParsed: ParsedSeat[] = [];

    for (let i = 0; i < seatLines.length; i++) {
      const line = seatLines[i].trim();
      if (!line) continue;

      const { seats, error } = parseSeatLineOrGroup(line, gradeCustomNames);
      if (error || !seats || seats.length === 0) {
        setErrorMessage(error || `좌석 형식이 올바르지 않습니다: "${line}"`);
        return;
      }
      allParsed.push(...seats);
    }

    if (allParsed.length === 0) {
      setErrorMessage('유효한 좌석 내역이 없습니다.');
      return;
    }

    // 도면 매칭 검사
    const matched: ParsedSeat[] = [];
    const unmatched: ParsedSeat[] = [];

    for (const s of allParsed) {
      const cleanRow = cleanRowName(s.row);
      const key = `${s.floor}_${cleanRow}_${s.seatNumber}`;
      if (VALID_VENUE_SEAT_SET.has(key)) {
        matched.push({ ...s, row: cleanRow });
      } else {
        unmatched.push({ ...s, row: cleanRow });
      }
    }

    if (unmatched.length > 0) {
      const sample = unmatched.slice(0, 10).map((s) => `${s.floor} ${s.row} ${s.seatNumber}번`).join(', ');
      const suffix = unmatched.length > 10 ? ` 외 ${unmatched.length - 10}석` : '';
      setUnmatchedSeatsWarning(`매칭 실패 좌석: ${sample}${suffix} (확인 필요 - LG아트센터 도면에 없는 좌석 번호입니다)`);
    } else {
      setUnmatchedSeatsWarning(null);
    }

    if (matched.length === 0) {
      setErrorMessage('도면과 일치하는 유효 좌석이 없습니다. 층, 열, 좌석 번호를 확인해 주세요.');
      return;
    }

    applyNewSeatState(matched, false);
    setErrorMessage('');
    showToast(`총 ${matched.length}석이 도면에 일괄 반영되었습니다.`);

    // 작업 완료 후 자동으로 [좌석 직접 지정] 탭으로 전환되어 색칠된 도면 확인
    setActiveTab('visual');
  };

  // '초기화' 실행 함수 (텍스트 탭 한정)
  const handleResetTextTab = () => {
    setInputText('');
    setResultText('');
    setUploadedImages([]);
    setExtractedReservation(null);
    setIsVisualMapNotice(false);
    setErrorMessage('');
    setUnmatchedSeatsWarning(null);
    showToast('텍스트, 업로드 이미지 및 추출 정보가 초기화되었습니다.');
  };

  // 상단 헤더 '초기화' 실행 함수: 다음 배치도 생성을 위해 단체명, 공연명, 관람일시, 좌석배치도 등 모든 내용 일괄 초기화
  const handleResetAll = () => {
    setGroupName('');
    setPhoneNumber('');
    setPerformanceName('');
    setViewingDateTime('');
    setActiveSeats([]);
    setInputText('');
    setResultText('');
    setUploadedImages([]);
    uploadedImagesRef.current = [];
    setExtractedReservation(null);
    setIsVisualMapNotice(false);
    setErrorMessage('');
    setUnmatchedSeatsWarning(null);
    showToast('단체명, 공연 정보 및 좌석배치도가 모두 깨끗하게 초기화되었습니다.');
  };

  const handleSeatMouseDown = (floor: string, rowName: string, seatNum: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    isMouseDownRef.current = true;
    dragCountRef.current = 1;

    const cleanRow = cleanRowName(rowName);
    const seatKey = `${floor}_${cleanRow}_${seatNum}`;
    const existingGrade = seatGradeMap.get(seatKey);

    if (existingGrade) {
      dragModeRef.current = 'remove';
      const filtered = activeSeatsRef.current.filter(
        (s) => !(s.floor === floor && cleanRowName(s.row) === cleanRow && s.seatNumber === seatNum)
      );
      applyNewSeatState(filtered, selectedTheater !== 'custom');
      showToast(`${floor} ${cleanRow} ${seatNum}번 좌석이 취소되었습니다.`);
    } else {
      if (!activeClickGradeRef.current) {
        showToast('지정할 좌석 등급을 먼저 상단에서 선택해 주세요.');
        isMouseDownRef.current = false;
        return;
      }
      dragModeRef.current = 'add';
      const currentGrade = activeClickGradeRef.current;
      const newSeat: ParsedSeat = {
        floor,
        grade: currentGrade,
        row: cleanRow,
        seatNumber: seatNum,
      };
      applyNewSeatState([...activeSeatsRef.current, newSeat], selectedTheater !== 'custom');
      const customName = gradeCustomNames[currentGrade] || currentGrade;
      showToast(
        `${floor} ${cleanRow} ${seatNum}번이 ${customName}(${GRADE_STYLES[currentGrade].colorName})으로 추가되었습니다.`
      );
    }
  };

  const handleSeatMouseEnter = (floor: string, rowName: string, seatNum: number) => {
    if (!isMouseDownRef.current) return;

    const cleanRow = cleanRowName(rowName);
    const seatKey = `${floor}_${cleanRow}_${seatNum}`;
    const existingGrade = seatGradeMap.get(seatKey);

    if (dragModeRef.current === 'remove') {
      if (existingGrade) {
        dragCountRef.current += 1;
        const filtered = activeSeatsRef.current.filter(
          (s) => !(s.floor === floor && cleanRowName(s.row) === cleanRow && s.seatNumber === seatNum)
        );
        applyNewSeatState(filtered, selectedTheater !== 'custom');
      }
    } else {
      if (!activeClickGradeRef.current) return;
      const currentGrade = activeClickGradeRef.current;
      if (!existingGrade || existingGrade !== currentGrade) {
        dragCountRef.current += 1;
        const otherSeats = activeSeatsRef.current.filter(
          (s) => !(s.floor === floor && cleanRowName(s.row) === cleanRow && s.seatNumber === seatNum)
        );
        const newSeat: ParsedSeat = {
          floor,
          grade: currentGrade,
          row: cleanRow,
          seatNumber: seatNum,
        };
        applyNewSeatState([...otherSeats, newSeat], selectedTheater !== 'custom');
      }
    }
  };

  const showToast = (msg: string) => {
    setLastActionToast(msg);
    setTimeout(() => {
      setLastActionToast((prev) => (prev === msg ? '' : prev));
    }, 2500);
  };

  const handleCopy = async () => {
    if (!resultText) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(resultText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = resultText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // 1페이지 PDF 내보내기 (jsPDF + html2canvas를 활용한 정확한 1페이지 A3/A4 PDF 생성 및 즉시 다운로드)
  const handleExportSinglePagePdf = async () => {
    if (!exportTargetRef.current) return;
    setIsCapturingImage(true);
    showToast(`1페이지 ${printPaperSize} PDF 문서를 생성하는 중입니다...`);

    const originalFloor = activeFloorTab;
    if (activeFloorTab !== 'all') {
      setActiveFloorTab('all');
    }

    try {
      // DOM 렌더링 안정화 대기
      await new Promise((resolve) => setTimeout(resolve, 150));

      const element = exportTargetRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const isA3 = printPaperSize === 'A3';
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: isA3 ? 'a3' : 'a4',
        compress: true,
      });

      const pageWidth = isA3 ? 297 : 210;
      const pageHeight = isA3 ? 420 : 297;
      const margin = isA3 ? 8 : 6;
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - margin * 2;

      let finalW = maxW;
      let finalH = (canvas.height * finalW) / canvas.width;

      if (finalH > maxH) {
        finalH = maxH;
        finalW = (canvas.width * finalH) / canvas.height;
      }

      const x = (pageWidth - finalW) / 2;
      const y = (pageHeight - finalH) / 2;

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      pdf.addImage(imgData, 'JPEG', x, y, finalW, finalH, undefined, 'FAST');

      const fileName = `${exportTitle}_${printPaperSize}.pdf`;
      pdf.save(fileName);
      showToast(`'${fileName}' (${printPaperSize} 크기) 저장이 완료되었습니다!`);
    } catch (err: any) {
      console.error('PDF export error:', err);
      showToast('PDF 생성 중 오류가 발생했습니다. 브라우저 인쇄를 이용해 주세요.');
    } finally {
      setIsCapturingImage(false);
      if (originalFloor !== 'all') {
        setActiveFloorTab(originalFloor);
      }
    }
  };

  // 브라우저 기본 인쇄 창 (Ctrl+P) 실행 함수 (A3 추천 또는 A4 세로 1페이지 인쇄)
  const handlePrintPdf = () => {
    const originalFloor = activeFloorTab;
    if (activeFloorTab !== 'all') {
      setActiveFloorTab('all');
    }
    const originalTitle = document.title;
    document.title = exportTitle;

    // A3 또는 A4 인쇄 스타일 동적 주입 (A3 선택 시 zoom 0.77로 확대되어 단체명 및 도면이 큼직하게 1페이지 출력됨)
    let printStyleEl = document.getElementById('dynamic-page-print-style') as HTMLStyleElement | null;
    if (!printStyleEl) {
      printStyleEl = document.createElement('style');
      printStyleEl.id = 'dynamic-page-print-style';
      document.head.appendChild(printStyleEl);
    }

    if (printPaperSize === 'A3') {
      printStyleEl.textContent = `
        @media print {
          @page { size: A3 portrait !important; margin: 6mm 8mm !important; }
          .seat-map-print-container { zoom: 0.77 !important; transform: none !important; }
          .seat-map-print-title { font-size: 26pt !important; line-height: 1.2 !important; }
        }
      `;
    } else {
      printStyleEl.textContent = `
        @media print {
          @page { size: A4 portrait !important; margin: 4mm 6mm !important; }
          .seat-map-print-container { zoom: 0.54 !important; transform: none !important; }
          .seat-map-print-title { font-size: 19pt !important; line-height: 1.2 !important; }
        }
      `;
    }

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
        if (originalFloor !== 'all') {
          setActiveFloorTab(originalFloor);
        }
      }, 1500);
    }, 100);
  };

  // 현재 화면 그대로 보존된 독립형 오프라인 HTML 파일 (.html) 내보내기
  const handleExportHtml = async () => {
    if (!exportTargetRef.current) return;
    showToast('화면 그대로 보존된 독립형 HTML 문서를 생성하는 중입니다...');

    const originalFloor = activeFloorTab;
    if (activeFloorTab !== 'all') {
      setActiveFloorTab('all');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    try {
      const targetElement = exportTargetRef.current;
      if (!targetElement) return;

      // 1. 브라우저에 로드된 모든 스타일시트 CSS 규칙 추출 (Tailwind 및 사용자 정의 스타일)
      let extractedCss = '';
      try {
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            if (sheet.cssRules) {
              for (const rule of Array.from(sheet.cssRules)) {
                extractedCss += rule.cssText + '\n';
              }
            }
          } catch {
            // 외부 도메인 시트 예외 무시
          }
        }
      } catch (err) {
        console.error('Error extracting CSS rules:', err);
      }

      // 2. 도면 컨테이너(#seat-map-print-container) 복제
      const clone = targetElement.cloneNode(true) as HTMLElement;

      // 3. 복제본 내부의 모든 좌석 버튼에 인라인 스타일을 강제 복사 주입
      // (오프라인, 네트워크 미연결, 로컬 file:// 열람 시에도 100% 완벽한 크기 및 등급 색상 보장)
      const origButtons = targetElement.querySelectorAll('button');
      const cloneButtons = clone.querySelectorAll('button');

      cloneButtons.forEach((btn, idx) => {
        const origBtn = origButtons[idx];
        if (!origBtn) return;

        // 층 필터 탭 내부 버튼은 필터 기능용 식별 속성 부여
        if (btn.closest('.no-print')) {
          const txt = btn.textContent?.trim() || '';
          if (txt === '전체 층') btn.setAttribute('data-offline-floor-btn', 'all');
          else if (txt === '1층') btn.setAttribute('data-offline-floor-btn', '1f');
          else if (txt === '2층') btn.setAttribute('data-offline-floor-btn', '2f');
          else if (txt === '3층') btn.setAttribute('data-offline-floor-btn', '3f');
          return;
        }

        const computed = window.getComputedStyle(origBtn);
        btn.style.boxSizing = 'border-box';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.fontSize = computed.fontSize || '9.5px';
        btn.style.fontFamily = computed.fontFamily || 'monospace';
        btn.style.backgroundColor = computed.backgroundColor;
        btn.style.color = computed.color;
        btn.style.borderColor = computed.borderColor || '#334155';
        btn.style.borderWidth = '1px';
        btn.style.borderStyle = 'solid';
        btn.style.fontWeight = computed.fontWeight || 'bold';
        btn.style.width = computed.width || '22px';
        btn.style.height = computed.height || '24px';
        btn.style.minWidth = computed.width || '22px';
        btn.style.minHeight = computed.height || '24px';
        btn.style.borderRadius = computed.borderRadius || '2px';
        btn.style.margin = '0px';
        btn.style.padding = '0px';
        btn.style.cursor = 'default';
      });

      // 복제본의 각 층 컨테이너에 식별 클래스 부여 (오프라인 층별 전환 탭 지원)
      const floorCards = clone.querySelectorAll('.rounded-xl.border-2.border-slate-300');
      floorCards.forEach((card) => {
        const text = card.textContent || '';
        if (text.includes('1층 객석') || text.includes('음향 콘솔')) {
          card.classList.add('offline-floor-1f');
        } else if (text.includes('2층 객석')) {
          card.classList.add('offline-floor-2f');
        } else if (text.includes('3층 객석')) {
          card.classList.add('offline-floor-3f');
        }
      });

      // 4. 완전한 자립형 독립 HTML5 문서 생성
      const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${exportTitle}</title>
  <style>
    /* 추출된 전체 애플리케이션 및 Tailwind 유틸리티 CSS */
    ${extractedCss}

    /* 오프라인 단일 파일 보장 스타일 */
    *, ::before, ::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .w-5\\.5 { width: 1.375rem !important; }
    .h-6 { height: 1.5rem !important; }
    .w-6 { width: 1.5rem !important; }
    .w-11 { width: 2.75rem !important; }
    .w-3\\.5 { width: 0.875rem !important; }
    .w-\\[1190px\\] { width: 1190px !important; }
    .w-\\[454px\\] { width: 454px !important; }
    .gap-\\[2px\\] { gap: 2px !important; }
    .py-\\[1\\.5px\\] { padding-top: 1.5px !important; padding-bottom: 1.5px !important; }
    .pt-\\[190px\\] { padding-top: 190px !important; }
    .pt-\\[218px\\] { padding-top: 218px !important; }

    /* 좌석 등급별 색상 정의 백업 */
    .bg-red-600 { background-color: #dc2626 !important; color: #ffffff !important; }
    .bg-purple-600 { background-color: #9333ea !important; color: #ffffff !important; }
    .bg-amber-400 { background-color: #fbbf24 !important; color: #0f172a !important; }
    .bg-blue-600 { background-color: #2563eb !important; color: #ffffff !important; }
    .bg-emerald-600 { background-color: #059669 !important; color: #ffffff !important; }
    .bg-zinc-700 { background-color: #3f3f46 !important; color: #ffffff !important; }

    /* 인쇄(@media print) 스타일: ${printPaperSize} 1페이지 맞춤 및 단체명 확대 */
    @media print {
      .no-print { display: none !important; }
      body { background: #ffffff !important; padding: 0 !important; }
      @page {
        size: ${printPaperSize === 'A3' ? 'A3' : 'A4'} portrait;
        margin: ${printPaperSize === 'A3' ? '6mm 8mm' : '4mm 6mm'};
      }
      .seat-map-print-container {
        zoom: ${printPaperSize === 'A3' ? '0.77' : '0.54'};
        transform: none !important;
        padding: 2px 4px !important;
        border: none !important;
        box-shadow: none !important;
        width: 100% !important;
        max-width: 100% !important;
      }
      .seat-map-print-title {
        font-size: ${printPaperSize === 'A3' ? '26pt' : '19pt'} !important;
        font-weight: 900 !important;
        line-height: 1.2 !important;
        color: #0f172a !important;
      }
    }
  </style>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 min-h-screen py-6 px-3 sm:px-6 text-slate-900">
  <div style="max-width: 1380px; margin: 0 auto;" class="space-y-4">
    <!-- 오프라인 뷰어 전용 상단 바 (인쇄 시 자동 숨김) -->
    <header class="no-print bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2.5">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
        <div>
          <h1 class="text-sm sm:text-base font-black text-slate-900">${exportTitle}</h1>
          <p class="text-[11px] text-slate-500">화면 그대로 보존된 오프라인 단일 HTML 문서 (저장일시: ${new Date().toLocaleString('ko-KR')})</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="window.print()" style="cursor: pointer;" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition-colors">
          <span>🖨️ 인쇄 / PDF 저장</span>
        </button>
      </div>
    </header>

    <!-- 좌석배치도 본체 (클론된 DOM) -->
    ${clone.outerHTML}
  </div>

  <script>
    // 오프라인 파일 층별 보기 전환 스크립트
    function setOfflineFloor(floor) {
      var f1 = document.querySelectorAll('.offline-floor-1f');
      var f2 = document.querySelectorAll('.offline-floor-2f');
      var f3 = document.querySelectorAll('.offline-floor-3f');

      if (floor === 'all') {
        f1.forEach(function(el) { el.style.display = ''; });
        f2.forEach(function(el) { el.style.display = ''; });
        f3.forEach(function(el) { el.style.display = ''; });
      } else if (floor === '1f') {
        f1.forEach(function(el) { el.style.display = ''; });
        f2.forEach(function(el) { el.style.display = 'none'; });
        f3.forEach(function(el) { el.style.display = 'none'; });
      } else if (floor === '2f') {
        f1.forEach(function(el) { el.style.display = 'none'; });
        f2.forEach(function(el) { el.style.display = ''; });
        f3.forEach(function(el) { el.style.display = 'none'; });
      } else if (floor === '3f') {
        f1.forEach(function(el) { el.style.display = 'none'; });
        f2.forEach(function(el) { el.style.display = 'none'; });
        f3.forEach(function(el) { el.style.display = ''; });
      }

      var btns = document.querySelectorAll('[data-offline-floor-btn]');
      btns.forEach(function(b) {
        if (b.getAttribute('data-offline-floor-btn') === floor) {
          b.className = 'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer bg-white text-slate-900 shadow-xs';
        } else {
          b.className = 'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer text-slate-600 hover:text-slate-900';
        }
      });
    }

    document.addEventListener('DOMContentLoaded', function() {
      var btns = document.querySelectorAll('[data-offline-floor-btn]');
      btns.forEach(function(b) {
        var targetFloor = b.getAttribute('data-offline-floor-btn');
        b.onclick = function() { setOfflineFloor(targetFloor); };
      });
    });
  </script>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${exportTitle}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`'${exportTitle}.html' 저장이 완료되었습니다! 더블 클릭 시 지금 화면 그대로 열립니다.`);
    } catch (err: any) {
      console.error('HTML export error:', err);
      showToast('HTML 저장 중 오류가 발생했습니다.');
    } finally {
      if (originalFloor !== 'all') {
        setActiveFloorTab(originalFloor);
      }
    }
  };

  const handleDownloadImage = async () => {
    if (!exportTargetRef.current) return;
    setIsCapturingImage(true);
    showToast('좌석배치도 고화질 이미지를 생성하는 중입니다...');

    try {
      const canvas = await html2canvas(exportTargetRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${exportTitle}.png`;
      link.href = dataUrl;
      link.click();
      showToast(`${exportTitle}.png 저장이 완료되었습니다.`);
    } catch {
      showToast('이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setIsCapturingImage(false);
    }
  };

  const renderSeatButton = (
    floor: string,
    rowName: string,
    seatNum: number,
    options?: {
      isTwoDigit?: boolean;
      isHighlightRed?: boolean;
      customWidthClass?: string;
    }
  ) => {
    const currentGrade = seatGradeMap.get(`${floor}_${cleanRowName(rowName)}_${seatNum}`);
    const isSelected = Boolean(currentGrade);
    const style = isSelected ? getGradeStyle(currentGrade!) : null;
    const currentCustomName = currentGrade ? (gradeCustomNames[normalizeGrade(currentGrade)] || currentGrade) : '';
    const activeCustomName = activeClickGrade ? (gradeCustomNames[activeClickGrade] || activeClickGrade) : '';
    const displayText = options?.isTwoDigit ? String(seatNum).padStart(2, '0') : seatNum;
    const widthClass = options?.customWidthClass || 'w-5.5';

    return (
      <button
        type="button"
        key={`${floor}-${rowName}-${seatNum}`}
        onMouseDown={(e) => handleSeatMouseDown(floor, rowName, seatNum, e)}
        onMouseEnter={() => handleSeatMouseEnter(floor, rowName, seatNum)}
        title={`${floor} ${rowName} ${displayText}번 ${
          isSelected
            ? `(${currentCustomName}) - 클릭 또는 드래그하여 취소`
            : activeClickGrade
            ? `- 클릭 또는 드래그하여 ${activeCustomName} 지정`
            : '- 지정할 등급을 상단에서 먼저 선택하세요'
        }`}
        className={`${widthClass} h-6 shrink-0 rounded-[2px] text-[9.5px] font-mono tabular-nums transition-colors flex items-center justify-center cursor-pointer select-none border border-slate-700 ${
          isSelected && style
            ? `${style.bg} ${style.hoverBg} ${style.textColor} font-bold shadow-xs`
            : options?.isHighlightRed
            ? 'bg-white hover:bg-slate-100 text-red-600 font-bold'
            : 'bg-white hover:bg-slate-100 text-slate-900 font-semibold'
        }`}
      >
        {displayText}
      </button>
    );
  };

  const renderPreciseRow = (
    floor: string,
    row: PreciseRowData,
    maxLeftSlots: number,
    maxCenterSlots: number,
    maxRightSlots: number
  ) => {
    // 열(Row) 하이라이트: 해당 열에 판매금지석이 아닌 '색상이 있는 좌석(선택한 좌석)'이 단 1개라도 포함되어 있는 경우에만 표시
    // 판매금지석(회색) 상태인 좌석만 있는 경우는 강조할 필요가 없으므로 배경 하이라이트를 표시하지 않음
    const hasColoredSeat = activeSeats.some(
      (s) =>
        s.floor === floor &&
        cleanRowName(s.row) === cleanRowName(row.rowName) &&
        normalizeGrade(s.grade) !== '판매금지석'
    );

    // Left section: 통로와 외곽을 정렬하기 위해, 좌석 수가 적은 층(예: 3층)의 여백을 바깥쪽(좌측 시작점)에 배치
    const outerLeftIndent = maxLeftSlots - (row.leftIndent + row.leftSeats.length);
    const totalLeftIndent = row.leftIndent + (outerLeftIndent > 0 ? outerLeftIndent : 0);
    const leftSlots: (number | null)[] = Array(totalLeftIndent).fill(null);
    row.leftSeats.forEach((num) => leftSlots.push(num));
    while (leftSlots.length < maxLeftSlots) {
      leftSlots.push(null);
    }

    const centerSlots: (number | null)[] = Array(row.centerIndent).fill(null);
    row.centerSeats.forEach((num) => centerSlots.push(num));
    while (centerSlots.length < maxCenterSlots) {
      centerSlots.push(null);
    }

    const rightSlots: (number | null)[] = [];
    row.rightSeats.forEach((num) => rightSlots.push(num));
    while (rightSlots.length < maxRightSlots) {
      rightSlots.push(null);
    }

    return (
      <div
        key={`${floor}-${row.rowName}`}
        className={`flex items-center justify-center text-[11px] py-[1.5px] px-1 rounded transition-colors ${
          hasColoredSeat ? 'bg-slate-100/70 shadow-2xs' : 'hover:bg-slate-50'
        }`}
      >
        <div className="w-11 shrink-0 font-bold text-slate-700 text-right pr-2 select-none text-[10px]">
          {row.rowName}
        </div>

        <div className="flex items-center justify-center">
          <div className="flex gap-[2px] justify-end">
            {leftSlots.map((seatNum, idx) => {
              if (seatNum === null) {
                return <div key={`empty-left-${idx}`} className="w-5.5 h-6 shrink-0" />;
              }
              return renderSeatButton(floor, row.rowName, seatNum);
            })}
          </div>

          <div className="w-3.5 flex justify-center items-center h-6 shrink-0" aria-hidden="true">
            <div className="w-0 border-r border-dashed border-slate-300 h-full" />
          </div>

          <div className="relative flex gap-[2px] justify-center">
            {centerSlots.map((seatNum, idx) => {
              if (seatNum === null) {
                return <div key={`empty-center-${idx}`} className="w-5.5 h-6 shrink-0" />;
              }
              return renderSeatButton(floor, row.rowName, seatNum);
            })}
          </div>

          <div className="w-3.5 flex justify-center items-center h-6 shrink-0" aria-hidden="true">
            <div className="w-0 border-r border-dashed border-slate-300 h-full" />
          </div>

          <div className="flex gap-[2px] justify-start">
            {rightSlots.map((seatNum, idx) => {
              if (seatNum === null) {
                return <div key={`empty-right-${idx}`} className="w-5.5 h-6 shrink-0" />;
              }
              return renderSeatButton(floor, row.rowName, seatNum);
            })}
          </div>
        </div>

        <div className="w-11 shrink-0 font-bold text-slate-700 text-left pl-2 select-none text-[10px]">
          {row.rowName}
        </div>
      </div>
    );
  };

  const renderBalconyPillar = (floor: string, type: 'BL' | 'BR', count: number) => {
    const seats = Array.from({ length: count }, (_, i) => i + 1);

    return (
      <div className="flex flex-col items-center bg-white border-2 border-slate-800 p-0.5 rounded-[2px] shadow-xs select-none">
        <div
          style={{ backgroundColor: '#C6E0B4' }}
          className="text-[10px] font-black text-slate-800 px-2 py-0.5 rounded-xs mb-0.5 w-full text-center tracking-widest uppercase border-0"
        >
          {type}
        </div>
        <div className="flex flex-col gap-0.5">
          {seats.map((n) => {
            const currentGrade = seatGradeMap.get(`${floor}_${type}_${n}`);
            const isSelected = Boolean(currentGrade);
            const style = isSelected ? getGradeStyle(currentGrade!) : null;
            const isMovable = floor === '1층' && n === 6;
            const currentCustomName = currentGrade ? (gradeCustomNames[normalizeGrade(currentGrade)] || currentGrade) : '';
            const activeCustomName = activeClickGrade ? (gradeCustomNames[activeClickGrade] || activeClickGrade) : '';

            return (
              <button
                type="button"
                key={`${floor}-${type}-${n}`}
                onMouseDown={(e) => handleSeatMouseDown(floor, type, n, e)}
                onMouseEnter={() => handleSeatMouseEnter(floor, type, n)}
                title={`${floor} 발코니 ${type} ${n}번${isMovable ? ' (이동형/휠체어)' : ''} ${
                  isSelected
                    ? `(${currentCustomName}) - 클릭 또는 드래그하여 취소`
                    : activeClickGrade
                    ? `- 클릭 또는 드래그하여 ${activeCustomName} 지정`
                    : '- 지정할 등급을 상단에서 먼저 선택하세요'
                }`}
                className={`w-6 h-6 rounded-[2px] text-[10px] font-mono tabular-nums flex items-center justify-center cursor-pointer transition-colors border border-slate-800 ${
                  isSelected && style
                    ? `${style.bg} ${style.textColor} font-bold`
                    : 'bg-white text-slate-900 hover:bg-slate-100 font-semibold'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-8 py-7 flex flex-col items-center gap-3 text-center max-w-sm w-full">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <div className="text-sm font-black text-slate-900">인증 상태 확인 중...</div>
          <p className="text-xs text-slate-500 leading-relaxed">
            로그인 세션을 확인하고 있습니다. 잠시만 기다려 주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 py-6 px-2 sm:px-4 lg:px-6 select-none">
      <main className="max-w-[1380px] mx-auto space-y-6">

        {/* ============================================================== */}
        {/* 상단 제어 바: [예매 좌석 번호 정리기] 메인 블록 */}
        {/* 인쇄 스타일(@media print)에 의해 인쇄 시 자동으로 완전 숨김 처리됩니다 (no-print) */}
        {/* ============================================================== */}
        <header className="no-print bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Ticket className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex flex-wrap items-center gap-2">
                  <span>{activeTab === 'export' ? exportTitle : '예매 좌석 번호 정리기'}</span>
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-slate-600 hover:text-red-600 bg-slate-100 hover:bg-red-50 border border-slate-300 hover:border-red-300 rounded-md transition-colors cursor-pointer shadow-2xs"
                    title="다음 배치도 생성을 위해 단체명, 공연명, 관람일시, 좌석배치도 내용을 모두 지웁니다"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500 hover:text-red-600" />
                    <span>초기화</span>
                  </button>
                  {activeTab === 'visual' && (
                    <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                      직접 지정 모드
                    </span>
                  )}
                  {activeTab === 'export' && (
                    <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                      내보내기 클린 뷰
                    </span>
                  )}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 leading-snug">
                  {activeTab === 'visual' && '아래 등급 버튼을 선택한 후 도면에서 마우스 클릭/드래그로 좌석을 지정하세요.'}
                  {activeTab === 'text' && '예매 내역 캡처 이미지(다중 업로드 지원) 첨부 또는 텍스트를 통해 예약 4대 정보를 자동 추출합니다.'}
                  {activeTab === 'export' && '텍스트 창과 편집 도구가 모두 제거된 정돈된 좌석배치도를 고화질 1페이지 PDF로 저장하거나 인쇄합니다.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* 헤더 로그인 계정(이메일) & 로그아웃 */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                {authUser ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span
                      className="text-xs font-bold text-slate-700 max-w-[180px] truncate"
                      title={authUser.email || authUser.displayName || ''}
                    >
                      {authUser.email || authUser.displayName || '로그인됨'}
                    </span>
                    <button
                      type="button"
                      onClick={handleHeaderSignOut}
                      className="inline-flex items-center gap-1 ml-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-white text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>로그아웃</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleHeaderSignIn}
                    disabled={isHeaderSigningIn}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isHeaderSigningIn ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    ) : (
                      <LogIn className="w-3.5 h-3.5 text-blue-600" />
                    )}
                    <span>로그인</span>
                  </button>
                )}
              </div>

              {/* 메인 메뉴 3단 전환 탭 */}
              <nav className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 gap-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('visual')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                    activeTab === 'visual'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MousePointerClick className="w-4 h-4" />
                  <span>좌석 직접 지정</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('text')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                    activeTab === 'text'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>예매내역 텍스트 추출</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('export')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                    activeTab === 'export'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileDown className="w-4 h-4" />
                  <span>내보내기 &amp; PDF</span>
                </button>
              </nav>
            </div>
          </div>

          {/* 제목 수정, 공연명, 관람일자 입력 칸 */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="group-input" className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>단체명/예매자명:</span>
                  {phoneNumber && (
                    <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                      {phoneNumber}
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-normal text-slate-400">('좌석배치도' 자동 부착)</span>
              </label>
              <div className="relative flex items-center">
                <input
                  id="group-input"
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="예: 서울청소년오케스트라, 현대자동차 등"
                  className="w-full pl-3 pr-20 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white font-semibold"
                />
                <span className="absolute right-2.5 text-xs font-bold text-slate-500 pointer-events-none select-none bg-slate-200/70 px-1.5 py-0.5 rounded text-[11px]">
                  좌석배치도
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="perf-input" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5 text-red-600" />
                <span>공연명:</span>
              </label>
              <input
                id="perf-input"
                type="text"
                value={performanceName}
                onChange={(e) => setPerformanceName(e.target.value)}
                placeholder="예: 뮤지컬 지킬 앤 하이드, 정기연주회"
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white font-medium"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="date-input" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>관람 일자 및 시간:</span>
              </label>
              <input
                id="date-input"
                type="text"
                value={viewingDateTime}
                onChange={(e) => setViewingDateTime(e.target.value)}
                placeholder="예: 2026. 10. 25(일) 19:30"
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white font-medium"
              />
            </div>
          </div>

          {/* 등급별 1매당 티켓 가격 입력 칸 (VIP, R, S, A, B) */}
          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CircleDollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  <span>등급별 1매당 티켓 금액 입력 (원):</span>
                </label>
                {/* 요청하신 금액 표기 여부 체크박스 */}
                <label
                  htmlFor="toggle-show-prices-header"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold cursor-pointer transition-colors shadow-2xs select-none ${
                    showPrices
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    id="toggle-show-prices-header"
                    type="checkbox"
                    checked={showPrices}
                    onChange={(e) => setShowPrices(e.target.checked)}
                    className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>좌석배치도에 금액 표기</span>
                </label>
              </div>

              <span className="text-[11px] text-slate-500 font-medium">
                {showPrices
                  ? '✓ 금액 표기 활성화 (좌석배치도 좌석 수량 옆에 등급별 금액 및 총액이 노출됩니다)'
                  : '(기본 미표기 - 금액 표기가 필요한 경우 위 체크박스를 선택하세요)'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {TICKET_GRADES.map((gradeKey) => {
                const style = GRADE_STYLES[gradeKey];
                const priceValue = gradePrices[gradeKey];

                return (
                  <div
                    key={`price-${gradeKey}`}
                    className="flex flex-col gap-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: style.hex }}
                        />
                        <span>{gradeCustomNames[gradeKey] || gradeKey}</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {style.colorName}
                      </span>
                    </div>

                    <div className="relative flex items-center mt-0.5">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={priceValue === '' ? '' : priceValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGradePrices((prev) => ({
                            ...prev,
                            [gradeKey]: val === '' ? '' : Math.max(0, parseInt(val, 10) || 0),
                          }));
                        }}
                        placeholder="0"
                        className="w-full pl-2.5 pr-6 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono font-bold text-right text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                      <span className="absolute right-2 text-xs font-bold text-slate-500 pointer-events-none select-none">
                        원
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ============================================================== */}
          {/* [지정할 좌석 등급 선택] 컨트롤 영역 */}
          {/* 'PDF 내보내기' 버튼 클릭 시 즉시 브라우저 인쇄(window.print()) 실행 */}
          {/* ============================================================== */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-blue-700" />
              <span className="text-xs font-bold text-slate-900">
                지정할 좌석 등급 선택:
              </span>
              <span className="text-[11px] font-medium">
                {activeClickGrade ? (
                  <span className="text-blue-700 font-bold">
                    (선택됨: {gradeCustomNames[activeClickGrade] || activeClickGrade} - 도면 좌석 클릭 또는 드래그)
                  </span>
                ) : (
                  <span className="text-amber-700 font-bold">
                    (등급을 누른 후 아래 도면 좌석을 클릭하거나 드래그하여 지정)
                  </span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {SELECTABLE_GRADES.map((gradeKey) => {
                const style = GRADE_STYLES[gradeKey];
                const isArmed = activeClickGrade === gradeKey;
                const displayName = gradeCustomNames[gradeKey] || style.label;
                const isEditing = editingGrade === gradeKey;

                return (
                  <div
                    key={gradeKey}
                    onClick={() => {
                      if (!isEditing) {
                        setActiveClickGrade((prev) => (prev === gradeKey ? null : gradeKey));
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                      isArmed
                        ? `${style.bg} ${style.textColor} ring-2 ring-offset-2 ${style.ringColor} shadow-sm scale-105`
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                      style={{ backgroundColor: style.hex }}
                    />
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveEditGrade(gradeKey, editingText);
                          } else if (e.key === 'Escape') {
                            setEditingGrade(null);
                          }
                        }}
                        onBlur={() => {
                          handleSaveEditGrade(gradeKey, editingText);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-20 px-1 py-0.5 text-xs font-bold bg-white text-slate-900 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="등급명 입력"
                      />
                    ) : (
                      <span>
                        {displayName} ({style.colorName})
                      </span>
                    )}

                    {/* 등급 (색) 오른쪽에 편집 아이콘(연필) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditing) {
                          handleSaveEditGrade(gradeKey, editingText);
                        } else {
                          handleStartEditGrade(gradeKey);
                        }
                      }}
                      className={`p-0.5 rounded transition-colors cursor-pointer ${
                        isArmed
                          ? 'text-white/80 hover:text-white hover:bg-black/20'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                      }`}
                      title={isEditing ? '등급명 저장하기' : `${displayName} 등급명 수정하기`}
                      aria-label={`${displayName} 등급명 수정`}
                    >
                      {isEditing ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                      ) : (
                        <Pencil className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setActiveSeats([]);
                  setResultText('');
                  setInputText('');
                  showToast('모든 좌석 선택이 비워졌습니다.');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-300 hover:border-red-300 rounded-lg transition-colors cursor-pointer ml-1"
                title="선택된 모든 좌석 비우기"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>전체 비우기</span>
              </button>

              {/* 인쇄 용지 규격 선택 (A3 추천 / A4) */}
              <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 ml-1">
                <span className="px-2 text-[11px] font-bold text-slate-500 select-none">용지:</span>
                <button
                  type="button"
                  onClick={() => {
                    setPrintPaperSize('A3');
                    showToast('인쇄 용지가 A3(추천 - 단체명 26pt 확대 & 1페이지 맞춤)로 설정되었습니다.');
                  }}
                  className={`px-2 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    printPaperSize === 'A3'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="A3 크기 (297×420mm): 단체명이 26pt 크기로 시원하게 확대되고 1페이지에 큼직하게 출력됩니다 (추천)"
                >
                  A3 (추천)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintPaperSize('A4');
                    showToast('인쇄 용지가 A4로 설정되었습니다.');
                  }}
                  className={`px-2 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    printPaperSize === 'A4'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="A4 크기 (210×297mm): 표준 A4 1페이지로 출력됩니다"
                >
                  A4
                </button>
              </div>

              {/* 화면 그대로 HTML 저장 버튼: 단일 오프라인 HTML 파일로 즉시 다운로드 */}
              <button
                type="button"
                onClick={handleExportHtml}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 hover:text-blue-800 bg-white hover:bg-blue-50 border border-blue-300 hover:border-blue-400 rounded-lg shadow-2xs transition-colors cursor-pointer ml-1"
                title="지금 보는 화면과 등급 색상 그대로 오프라인에서 열 수 있는 독립형 HTML(.html) 파일로 저장합니다 (Ctrl+S 지원)"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span>화면 그대로 HTML 저장</span>
              </button>

              {/* 요청하신 'PDF 내보내기' 버튼: 클릭 시 즉시 브라우저 인쇄(window.print()) 실행 */}
              <button
                type="button"
                onClick={handlePrintPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow-xs transition-colors cursor-pointer ml-1"
                title={`브라우저 인쇄 창(Ctrl+P)을 실행하여 깔끔한 ${printPaperSize} 1페이지로 인쇄/PDF 저장합니다`}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF 내보내기 ({printPaperSize})</span>
              </button>
            </div>
          </div>
        </header>

        {/* 토스트 알림 */}
        {lastActionToast && (
          <div className="no-print fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 animate-bounce">
            <Info className="w-4 h-4 text-amber-400" />
            <span>{lastActionToast}</span>
          </div>
        )}

        {/* [내보내기 & PDF] 전용 툴바 (export 탭 활성화 시 안내 바, 인쇄 시 자동 숨김) */}
        {activeTab === 'export' && (
          <div className="no-print space-y-3">
            <div className="p-4 bg-emerald-50/90 rounded-xl border border-emerald-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-emerald-700" />
                <div>
                  <span className="text-sm font-bold text-emerald-950">
                    내보내기 준비 완료: '{exportTitle}' (총 {bookedSeats.length}석{prohibitedSeats.length > 0 ? `, 판매금지 ${prohibitedSeats.length}석` : ''})
                  </span>
                  <p className="text-xs text-emerald-700">
                    헤더(타이틀, 범례, 총 좌석 수), 무대, 1·2·3층 객석이 분할 없이 <strong>지금 보는 화면 그대로</strong> 보존되어 파일로 내보내집니다.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('visual')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>좌석 다시 수정하기</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportHtml}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border-2 border-blue-600 rounded-lg shadow-xs transition-colors cursor-pointer"
                  title="브라우저에서 '다른 이름으로 저장' 시 모양 깨짐 없이, 현재 보는 도면과 색상이 100% 보존되는 단일 HTML 파일로 저장합니다"
                >
                  <Download className="w-4 h-4 text-blue-600" />
                  <span>화면 그대로 HTML 저장 (.html)</span>
                </button>

                {/* 인쇄 용지 규격 선택 (A3 추천 / A4) */}
                <div className="inline-flex items-center bg-white p-0.5 rounded-lg border border-slate-300 shadow-2xs">
                  <span className="px-2 text-[11px] font-bold text-slate-500 select-none">용지:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintPaperSize('A3');
                      showToast('인쇄 용지가 A3(추천 - 단체명 26pt 확대 & 1페이지 맞춤)로 설정되었습니다.');
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      printPaperSize === 'A3'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="A3 크기 (297×420mm): 단체명이 26pt로 시원하게 확대되고 1페이지에 큼직하게 출력됩니다 (추천)"
                  >
                    A3 (추천)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintPaperSize('A4');
                      showToast('인쇄 용지가 A4로 설정되었습니다.');
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      printPaperSize === 'A4'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="A4 크기 (210×297mm): 표준 A4 1페이지로 출력됩니다"
                  >
                    A4
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handlePrintPdf}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow-xs transition-colors cursor-pointer"
                  title={`브라우저 인쇄 창(Ctrl+P)을 실행하여 깔끔한 ${printPaperSize} 1페이지로 인쇄/PDF 저장합니다`}
                >
                  <Printer className="w-4 h-4" />
                  <span>PDF 내보내기 ({printPaperSize})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPdfGuideModal(true)}
                  className="inline-flex items-center justify-center p-2 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                  title="내보내기 방법 안내"
                >
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                </button>
              </div>
            </div>

            {/* HTML 내보내기 안내 배너 */}
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-blue-950 shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <Download className="w-4 h-4 text-blue-600 shrink-0" />
                <div className="space-y-0.5">
                  <span className="font-bold text-blue-900">
                    💡 HTML 파일 저장 안내 (모양 깨짐 및 글자만 남는 현상 방지)
                  </span>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    브라우저 메뉴의 '다른 이름으로 저장'을 사용하면 서버 스타일 연결이 끊겨 글자만 남을 수 있습니다. 상단의 <strong>[화면 그대로 HTML 저장 (.html)]</strong> 버튼(또는 단축키 <strong>Ctrl+S</strong>)을 누르시면 모든 좌석 도면, 등급별 색상, 폰트, 무대가 100% 보존된 오프라인 단일 HTML 파일이 즉시 다운로드됩니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleExportHtml}
                className="shrink-0 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs transition-colors ml-auto sm:ml-0"
              >
                지금 HTML 파일 저장
              </button>
            </div>
          </div>
        )}

        {/* 내보내기 방법 안내 모달 */}
        {showPdfGuideModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-blue-600" />
                  <h3 className="text-base font-bold text-slate-900">내보내기 &amp; 저장 안내</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPdfGuideModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
                <p className="font-semibold text-slate-900">
                  작성하신 좌석배치도를 모양 깨짐 없이 안전하게 저장하고 공유하는 방법입니다:
                </p>

                <ol className="list-decimal pl-5 space-y-2">
                  <li>
                    <strong>[화면 그대로 HTML 저장 (.html)]:</strong> 브라우저 기본 '다른 이름으로 저장'을 누르면 외부 스타일시트가 누락되어 글자만 남을 수 있습니다. 대신 <strong>[화면 그대로 HTML 저장]</strong> 버튼이나 단축키 <strong>Ctrl+S</strong>를 누르시면 모든 좌석 색상, 크기, 정렬 스타일이 파일 내부에 100% 임베드된 단일 HTML 파일이 저장됩니다. 인터넷이 없는 오프라인 환경에서도 더블 클릭 시 지금 화면 그대로 완벽하게 열립니다.
                  </li>
                  <li>
                    <strong>[PDF 내보내기]:</strong> 클릭 시 브라우저 인쇄 창(Ctrl+P)이 실행되며, 인쇄 대상을 'PDF로 저장'으로 선택하면 <strong>정확히 1페이지로 구성된 '{exportTitle}.pdf'</strong>가 생성됩니다.
                  </li>
                  <li>
                    <strong>2층 및 3층 객석 가로 폭 동기화:</strong> 2층 및 3층 객석 영역의 가로 폭이 100% 동일한 규격으로 정렬되어 있어 시각적으로 균일하게 출력됩니다.
                  </li>
                </ol>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                  💡 <strong>단일 페이지 구성:</strong><br />
                  웹 상단의 조작 컨트롤 영역은 자동으로 제외되며, 하단의 좌석배치도 전체가 한 페이지 안에 분할 없이 들어갑니다.
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPdfGuideModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPdfGuideModal(false);
                    handleExportHtml();
                  }}
                  className="px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>HTML 파일 저장</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPdfGuideModal(false);
                    handlePrintPdf();
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PDF 인쇄 창 실행</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 메뉴 2: 텍스트 내역 정리 & 이미지 분석 화면 (인쇄 시 자동 숨김) */}
        {/* ============================================================== */}
        {activeTab === 'text' && (
          <div className="no-print space-y-4">
            <section aria-labelledby="image-upload-label" className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
              
              {/* (1) 상단: [📷 캡처 이미지 업로드 / Ctrl+V 붙여넣기] 영역 (다중 업로드 지원) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label id="image-upload-label" className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span>(1) 📷 엑셀 캡처본 / 예매 내역 이미지 첨부 (배경색·글자색 무관 AI 자동 판독)</span>
                    {uploadedImages.length > 0 && (
                      <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        총 {uploadedImages.length}장 첨부됨
                      </span>
                    )}
                  </label>
                  <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                    엑셀 표 캡처, 다크모드, 유색 하이라이트 셀, 도면 X마킹 및 Ctrl+V 붙여넣기 지원
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleProcessImageFiles(Array.from(e.target.files));
                      e.target.value = '';
                    }
                  }}
                />

                {/* 업로드된 이미지 리스트 (1장 이상일 때 표시) */}
                {uploadedImages.length > 0 && (
                  <div className="space-y-2.5 bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-slate-900">
                          첨부된 예매 캡처 이미지 ({uploadedImages.length}장)
                        </span>
                        <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {isAnalyzingImage ? '통합 분석 중...' : '✓ 4대 예약 정보 통합 판독 완료'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => runGeminiAnalysisOnImages(uploadedImagesRef.current)}
                          disabled={isAnalyzingImage}
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-white hover:bg-emerald-50 px-2.5 py-1 rounded border border-emerald-300 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                          title="첨부된 모든 이미지에서 예약 정보와 좌석을 다시 추출합니다"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{isAnalyzingImage ? '판독 중...' : '텍스트 재추출'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 bg-white hover:bg-blue-50 px-2.5 py-1 rounded border border-blue-300 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>이미지 추가</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAllImages}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 px-2.5 py-1 rounded border border-slate-200 hover:border-rose-300 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>전체 삭제</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {uploadedImages.map((img, idx) => (
                        <div
                          key={img.id}
                          className="flex items-center justify-between gap-2.5 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs hover:border-blue-300 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative shrink-0">
                              <img
                                src={img.dataUrl}
                                alt={img.name}
                                className="w-12 h-12 object-cover rounded border border-slate-200 shadow-2xs"
                              />
                              <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-slate-800 text-white text-[9px] font-bold flex items-center justify-center">
                                {idx + 1}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 truncate" title={img.name}>
                                {img.name}
                              </div>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {img.fileSize ? `${Math.round(img.fileSize / 1024)} KB` : '캡처 이미지'}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(img.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer shrink-0"
                            title="이 이미지 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 분석 로딩 상태 */}
                {isAnalyzingImage && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center gap-3 text-blue-900 shadow-2xs animate-pulse">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                    <div className="text-xs sm:text-sm font-bold">
                      예약 4대 정보(단체명, 공연 날짜, 공연명, 좌석)를 판독하는 중... (총 {uploadedImages.length}장 통합 분석)
                    </div>
                  </div>
                )}

                {/* 이미지 추가 / 드롭존 영역 */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleProcessImageFiles(Array.from(e.dataTransfer.files));
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl ${
                    uploadedImages.length > 0 ? 'p-3.5' : 'p-6'
                  } text-center cursor-pointer transition-all ${
                    isDraggingFile
                      ? 'border-blue-500 bg-blue-50/80 scale-[1.01]'
                      : 'border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center space-y-1 py-1">
                    {uploadedImages.length === 0 ? (
                      <>
                        <div className="w-11 h-11 rounded-full bg-blue-100/70 text-blue-600 flex items-center justify-center mb-1">
                          <UploadCloud className="w-6 h-6" />
                        </div>
                        <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5 justify-center">
                          <span>📷 엑셀 캡처본 / 예매 이미지 업로드 (다중 선택 가능)</span>
                          <span className="text-slate-400 font-normal">/</span>
                          <span className="text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 text-xs font-semibold">
                            Ctrl + V 붙여넣기
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          배경 색상·글자 색상 상관없이, <strong>엑셀 표 캡처본</strong>과 도면 마킹을 자동 인식합니다. <strong>Ctrl+V</strong>로 바로 붙여넣으세요.
                        </p>
                      </>
                    ) : (
                      <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-700">
                        <Plus className="w-4 h-4 text-blue-600" />
                        <span>추가 캡처 이미지 업로드 (엑셀 캡처, 도면 등 클릭 또는 <strong>Ctrl+V</strong> 붙여넣기)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 4가지 예약 정보 자동 추출 결과 카드 (표와 도면의 모든 데이터 통합 추출 결과) */}
              {extractedReservation && (
                <div className="bg-gradient-to-br from-blue-50/80 via-slate-50 to-indigo-50/60 border border-blue-200 rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                      <h4 className="text-sm font-bold text-slate-900">
                        AI 예매 및 도면 전체 데이터 통합 추출 결과
                      </h4>
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        총 {extractedReservation.records?.length || extractedReservation.reservations?.length || 0}건 통합 추출됨
                      </span>
                    </div>

                    {/* 뷰 모드 전환 버튼 (전체 데이터 표 / 통합 JSON 배열 / 정리된 텍스트) */}
                    <div className="flex items-center bg-white border border-blue-200 rounded-lg p-0.5 shadow-2xs text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setExtractedViewMode('table')}
                        className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                          extractedViewMode === 'table'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        1. 전체 데이터 표 ({extractedReservation.records?.length || extractedReservation.reservations?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setExtractedViewMode('json')}
                        className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                          extractedViewMode === 'json'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        2. 통합 JSON 배열
                      </button>
                      <button
                        type="button"
                        onClick={() => setExtractedViewMode('text')}
                        className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                          extractedViewMode === 'text'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        3. 정리된 텍스트
                      </button>
                    </div>
                  </div>

                  {/* 4대 핵심 정보 요약 카드 */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-2xs">
                      <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 mb-1">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>1. 단체명 / 예매자명</span>
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {extractedReservation.groupName || '정보 없음'}
                      </div>
                      {extractedReservation.phoneNumber && (
                        <div className="text-[10px] text-blue-600 font-medium mt-0.5">
                          📞 {extractedReservation.phoneNumber}
                        </div>
                      )}
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-2xs">
                      <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 mb-1">
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        <span>2. 공연 날짜</span>
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {extractedReservation.viewingDateTime || '정보 없음'}
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-2xs">
                      <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 mb-1">
                        <Ticket className="w-3.5 h-3.5 text-red-600" />
                        <span>3. 공연명</span>
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {extractedReservation.performanceName || '정보 없음'}
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-2xs">
                      <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 mb-1">
                        <Layers className="w-3.5 h-3.5 text-emerald-600" />
                        <span>4. 추출 좌석 수</span>
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900">
                        {bookedSeats.length}석 도면 반영됨
                      </div>
                    </div>
                  </div>

                  {/* 1) 전체 데이터 표(테이블) 뷰 */}
                  {extractedViewMode === 'table' && (
                    <div className="bg-white p-3 sm:p-4 rounded-lg border border-blue-100 shadow-2xs space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>📋 전체 추출 데이터 목록 (상단 표 및 도면 모든 좌석)</span>
                          <span className="text-[11px] text-slate-500 font-normal">
                            (누락 없이 모든 행 데이터 취합)
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              if (extractedReservation.rawJson) {
                                await navigator.clipboard.writeText(extractedReservation.rawJson);
                                setExtractedJsonCopied(true);
                                setTimeout(() => setExtractedJsonCopied(false), 2000);
                                showToast('전체 추출 JSON 배열이 클립보드에 복사되었습니다.');
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded border border-blue-200 transition-colors cursor-pointer"
                          >
                            {extractedJsonCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>JSON 복사</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (extractedReservation.seatText) {
                                await navigator.clipboard.writeText(extractedReservation.seatText);
                                setExtractedCopied(true);
                                setTimeout(() => setExtractedCopied(false), 2000);
                                showToast('정리된 좌석 텍스트가 클립보드에 복사되었습니다.');
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded border border-slate-300 transition-colors cursor-pointer"
                          >
                            {extractedCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>좌석 텍스트 복사</span>
                          </button>
                        </div>
                      </div>

                      {((extractedReservation.records && extractedReservation.records.length > 0) ||
                        (extractedReservation.reservations && extractedReservation.reservations.length > 0)) ? (
                        <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-lg">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                              <tr>
                                <th className="p-2 w-10 text-center">#</th>
                                <th className="p-2">예매자명</th>
                                <th className="p-2">휴대폰 번호</th>
                                <th className="p-2">공연이름</th>
                                <th className="p-2">관람일자</th>
                                <th className="p-2 text-center">등급</th>
                                <th className="p-2">좌석번호</th>
                                <th className="p-2">층/열/번</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-800">
                              {(extractedReservation.records || extractedReservation.reservations || []).map((rec, i) => {
                                const rawG = rec.seat_grade || getDefaultGradeForSeat(rec.seat_floor || '1층', rec.seat_row || '1열');
                                const norm = normalizeGrade(rawG, gradeCustomNames);
                                const style = GRADE_STYLES[norm] || GRADE_STYLES['VIP석'];
                                const displayName = gradeCustomNames[norm] || norm;

                                return (
                                  <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                                    <td className="p-2 text-center text-slate-400 font-mono text-[11px]">{i + 1}</td>
                                    <td className="p-2 font-semibold text-slate-900">{rec.booker_name || '-'}</td>
                                    <td className="p-2 text-slate-600 font-mono text-[11px]">{rec.phone_number || '-'}</td>
                                    <td className="p-2 text-slate-800">{rec.event_name || '-'}</td>
                                    <td className="p-2 text-slate-600 whitespace-nowrap">{rec.event_date || '-'}</td>
                                    <td className="p-2 text-center whitespace-nowrap">
                                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${style.badgeBg} ${style.badgeText} border ${style.border}`}>
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.hex }} />
                                        <span>{displayName}</span>
                                      </span>
                                    </td>
                                    <td className="p-2 font-mono font-bold text-blue-700 whitespace-nowrap">
                                      {rec.seat_info || `${rec.seat_floor || ''} ${rec.seat_row || ''} ${rec.seat_number || ''}`}
                                    </td>
                                    <td className="p-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                      {rec.seat_floor || '-'} / {rec.seat_row || '-'} / {rec.seat_number || '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 p-4 text-center bg-slate-50 rounded">
                          추출된 예매 좌석 데이터가 없습니다. 이미지를 다시 분석해 주세요.
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2) 통합 JSON 배열 뷰 (모든 데이터 단일 JSON 배열) */}
                  {extractedViewMode === 'json' && (
                    <div className="bg-slate-900 text-slate-100 p-3 sm:p-4 rounded-lg shadow-2xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                          <span>📦 통합 JSON 배열 Output (전체 데이터)</span>
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (extractedReservation.rawJson) {
                              await navigator.clipboard.writeText(extractedReservation.rawJson);
                              setExtractedJsonCopied(true);
                              setTimeout(() => setExtractedJsonCopied(false), 2000);
                              showToast('전체 추출 JSON 배열이 클립보드에 복사되었습니다.');
                            }
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded border border-slate-700 transition-colors cursor-pointer"
                        >
                          {extractedJsonCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>JSON 복사하기</span>
                        </button>
                      </div>
                      <pre className="font-mono text-xs text-emerald-300 max-h-64 overflow-y-auto whitespace-pre p-2 bg-slate-950/60 rounded border border-slate-800">
                        {extractedReservation.rawJson || '[]'}
                      </pre>
                    </div>
                  )}

                  {/* 3) 정리된 텍스트 뷰 (연속 좌석 물결표 범위) */}
                  {extractedViewMode === 'text' && (
                    <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-2xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-blue-600" />
                          <span>좌석 정보 (열 및 번호 범위 형식)</span>
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (extractedReservation.rawOutput) {
                              await navigator.clipboard.writeText(extractedReservation.rawOutput);
                              setExtractedCopied(true);
                              setTimeout(() => setExtractedCopied(false), 2000);
                              showToast('지정된 규격 포맷 텍스트가 클립보드에 복사되었습니다.');
                            }
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded border border-blue-200 transition-colors cursor-pointer"
                        >
                          {extractedCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>복사 완료!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>규격 텍스트 복사</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200 font-mono text-xs text-slate-800 whitespace-pre-wrap max-h-36 overflow-y-auto">
                        {extractedReservation.seatText || '(좌석 정보 없음)'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 도면 분석 시 사용자 안내/대조 권장 배너 */}
              {isVisualMapNotice && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start justify-between gap-3 text-amber-950 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-xs sm:text-sm font-bold text-amber-900">
                        안내: 좌석 도면 이미지를 분석했습니다.
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        누락된 'X' 표시 좌석이 없는지 추출된 내역과 이미지를 한 번 더 대조해 주세요. (필요 시 아래 텍스트 입력창에서 직접 번호를 수정하거나 도면에서 추가 클릭할 수 있습니다.)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsVisualMapNotice(false)}
                    className="text-amber-700 hover:text-amber-900 p-1 rounded-md hover:bg-amber-100 transition-colors cursor-pointer shrink-0"
                    title="안내 닫기"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* (2) 중간: 기존 '좌석 텍스트 직접 입력/수정' 텍스트에어리어 (Textarea) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label id="input-label" htmlFor="seat-input" className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-700" />
                    <span>(2) 좌석 텍스트 직접 입력 및 수정</span>
                  </label>
                  <span className="text-xs text-slate-500">
                    이미지 인식 결과 자동 동기화 및 4대 포맷 텍스트 직접 붙여넣기 지원
                  </span>
                </div>
                <textarea
                  id="seat-input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={6}
                  placeholder="예: 단체명: 서울청소년오케스트라&#10;공연 날짜: 2026. 10. 25(일) 19:30&#10;공연명: 지킬 앤 하이드&#10;좌석:&#10;3층 A석 6열: 26~29번&#10;3층 A석 7열: 21~28번&#10;3층 A석 8열: 20~28번"
                  className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white font-mono tabular-nums resize-y"
                />
              </div>

              {/* (3) 하단: [정리 및 도면에 일괄 반영] 버튼, '초기화' 버튼 */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2 justify-between items-center">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetTextTab}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>초기화</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const sample = `단체명: 서울청소년오케스트라
공연 날짜: 2026. 10. 25(일) 19:30
공연명: 뮤지컬 지킬 앤 하이드
좌석:
3층 A석 6열: 26~29번
3층 A석 7열: 21~28번
3층 A석 8열: 20~28번`;
                      setInputText(sample);
                      setGroupName('서울청소년오케스트라');
                      setViewingDateTime('2026. 10. 25(일) 19:30');
                      setPerformanceName('뮤지컬 지킬 앤 하이드');
                      setExtractedReservation({
                        groupName: '서울청소년오케스트라',
                        viewingDateTime: '2026. 10. 25(일) 19:30',
                        performanceName: '뮤지컬 지킬 앤 하이드',
                        seatText: '3층 A석 6열: 26~29번\n3층 A석 7열: 21~28번\n3층 A석 8열: 20~28번',
                        rawOutput: sample,
                      });
                      showToast('4가지 정보(단체명, 공연일시, 공연명, 좌석) 예시가 자동 입력되었습니다.');
                    }}
                    className="px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                  >
                    4대 정보 예시 데이터 불러오기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const sampleAllRecords = [
                        {
                          booker_name: "한국수자원공사",
                          phone_number: "010-8832-3093",
                          event_name: "뮤지컬 <시카고>",
                          event_date: "2026-12-13 [일] 14:00",
                          seat_grade: "R석",
                          seat_info: "1층 18열 33번",
                          seat_floor: "1층",
                          seat_row: "18열",
                          seat_number: "33번"
                        },
                        {
                          booker_name: "한국수자원공사",
                          phone_number: "010-8832-3093",
                          event_name: "뮤지컬 <시카고>",
                          event_date: "2026-12-13 [일] 14:00",
                          seat_grade: "R석",
                          seat_info: "1층 18열 34번",
                          seat_floor: "1층",
                          seat_row: "18열",
                          seat_number: "34번"
                        },
                        {
                          booker_name: "한국수자원공사",
                          phone_number: "010-8832-3093",
                          event_name: "뮤지컬 <시카고>",
                          event_date: "2026-12-13 [일] 14:00",
                          seat_grade: "R석",
                          seat_info: "1층 18열 35번",
                          seat_floor: "1층",
                          seat_row: "18열",
                          seat_number: "35번"
                        },
                        {
                          booker_name: "한국수자원공사",
                          phone_number: "010-8832-3093",
                          event_name: "뮤지컬 <시카고>",
                          event_date: "2026-12-13 [일] 14:00",
                          seat_grade: "R석",
                          seat_info: "1층 18열 36번",
                          seat_floor: "1층",
                          seat_row: "18열",
                          seat_number: "36번"
                        },
                        {
                          booker_name: "한국수자원공사",
                          phone_number: "010-8832-3093",
                          event_name: "뮤지컬 <시카고>",
                          event_date: "2026-12-13 [일] 14:00",
                          seat_grade: "R석",
                          seat_info: "1층 19열 31번",
                          seat_floor: "1층",
                          seat_row: "19열",
                          seat_number: "31번"
                        },
                        {
                          booker_name: "한국수자원공사",
                          phone_number: "010-8832-3093",
                          event_name: "뮤지컬 <시카고>",
                          event_date: "2026-12-13 [일] 14:00",
                          seat_grade: "R석",
                          seat_info: "1층 19열 32번",
                          seat_floor: "1층",
                          seat_row: "19열",
                          seat_number: "32번"
                        },
                        {
                          booker_name: "한국수자원공사",
                          phone_number: "010-8832-3093",
                          event_name: "뮤지컬 <시카고>",
                          event_date: "2026-12-13 [일] 14:00",
                          seat_grade: "R석",
                          seat_info: "1층 19열 33번",
                          seat_floor: "1층",
                          seat_row: "19열",
                          seat_number: "33번"
                        },
                        {
                          booker_name: "한국수자원공사",
                          phone_number: "010-8832-3093",
                          event_name: "뮤지컬 <시카고>",
                          event_date: "2026-12-13 [일] 14:00",
                          seat_grade: "R석",
                          seat_info: "1층 19열 34번",
                          seat_floor: "1층",
                          seat_row: "19열",
                          seat_number: "34번"
                        }
                      ];
                      const seatStr = "R석 1층 18열: 33~36번\nR석 1층 19열: 31~34번";
                      setInputText(seatStr);
                      setGroupName("한국수자원공사");
                      setPhoneNumber("010-8832-3093");
                      setViewingDateTime("2026-12-13 [일] 14:00");
                      setPerformanceName("뮤지컬 <시카고>");
                      setExtractedReservation({
                        groupName: "한국수자원공사",
                        phoneNumber: "010-8832-3093",
                        viewingDateTime: "2026-12-13 [일] 14:00",
                        performanceName: "뮤지컬 <시카고>",
                        seatText: seatStr,
                        records: sampleAllRecords,
                        reservations: sampleAllRecords,
                        rawJson: JSON.stringify(sampleAllRecords, null, 2),
                        rawOutput: `단체명: 한국수자원공사 (010-8832-3093)\n공연 날짜: 2026-12-13 [일] 14:00\n공연명: 뮤지컬 <시카고>\n좌석:\n${seatStr}`
                      });
                      applyNewSeatState([
                        { floor: "1층", grade: "R석", row: "18열", seatNumber: 33 },
                        { floor: "1층", grade: "R석", row: "18열", seatNumber: 34 },
                        { floor: "1층", grade: "R석", row: "18열", seatNumber: 35 },
                        { floor: "1층", grade: "R석", row: "18열", seatNumber: 36 },
                        { floor: "1층", grade: "R석", row: "19열", seatNumber: 31 },
                        { floor: "1층", grade: "R석", row: "19열", seatNumber: 32 },
                        { floor: "1층", grade: "R석", row: "19열", seatNumber: 33 },
                        { floor: "1층", grade: "R석", row: "19열", seatNumber: 34 },
                      ], false);
                      showToast("시카고(한국수자원공사 R석 보라색) 데이터가 입력 및 도면에 반영되었습니다.");
                    }}
                    className="px-3 py-2 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                  >
                    시카고(R석 보라색) 예시
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const sampleAllRecords = [
                        {
                          booker_name: "호텔롯데샤넬",
                          phone_number: "010-2003-1861",
                          event_name: "뮤지컬 <시카고>",
                          event_date: "2026-12-16 [수] 19:30",
                          seat_grade: "VIP석",
                          seat_info: "1층 10열 31번",
                          seat_floor: "1층",
                          seat_row: "10열",
                          seat_number: "31번"
                        },
                        {
                          booker_name: "호텔롯데샤넬",
                          phone_number: "010-2003-1861",
                          event_name: "뮤지컬 <시카고>",
                          event_date: "2026-12-16 [수] 19:30",
                          seat_grade: "VIP석",
                          seat_info: "1층 10열 32번",
                          seat_floor: "1층",
                          seat_row: "10열",
                          seat_number: "32번"
                        }
                      ];
                      const seatStr = "VIP석 1층 10열: 31~32번";
                      setInputText(seatStr);
                      setGroupName("호텔롯데샤넬");
                      setPhoneNumber("010-2003-1861");
                      setViewingDateTime("2026-12-16 [수] 19:30");
                      setPerformanceName("뮤지컬 <시카고>");
                      setExtractedReservation({
                        groupName: "호텔롯데샤넬",
                        phoneNumber: "010-2003-1861",
                        viewingDateTime: "2026-12-16 [수] 19:30",
                        performanceName: "뮤지컬 <시카고>",
                        seatText: seatStr,
                        records: sampleAllRecords,
                        reservations: sampleAllRecords,
                        rawJson: JSON.stringify(sampleAllRecords, null, 2),
                        rawOutput: `단체명: 호텔롯데샤넬 (010-2003-1861)\n공연 날짜: 2026-12-16 [수] 19:30\n공연명: 뮤지컬 <시카고>\n좌석:\n${seatStr}`
                      });
                      applyNewSeatState([
                        { floor: "1층", grade: "VIP석", row: "10열", seatNumber: 31 },
                        { floor: "1층", grade: "VIP석", row: "10열", seatNumber: 32 },
                      ], false);
                      showToast("VIP석(빨간색) 예시가 입력 및 도면에 반영되었습니다.");
                    }}
                    className="px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                  >
                    VIP석(빨간색) 예시
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputText(INITIAL_EXAMPLE);
                      showToast('기본 좌석 예시 데이터가 입력되었습니다.');
                    }}
                    className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    좌석만 불러오기
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplySeatsToMap}
                    disabled={isAnalyzingImage}
                    className="py-2.5 px-6 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-slate-400 text-white font-bold text-sm rounded-lg shadow-sm transition-colors cursor-pointer inline-flex items-center gap-2"
                  >
                    {isAnalyzingImage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>이미지 텍스트 분석 중...</span>
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4" />
                        <span>정리 및 도면에 일괄 반영</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>

            {/* 오류 알림 */}
            {errorMessage && (
              <div
                role="alert"
                className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-rose-800 shadow-xs"
              >
                <div className="flex items-start gap-3 flex-1 min-w-[240px]">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-sm font-medium leading-relaxed">{errorMessage}</div>
                </div>
                {uploadedImages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => runGeminiAnalysisOnImages(uploadedImages)}
                    disabled={isAnalyzingImage}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>다시 시도</span>
                  </button>
                )}
              </div>
            )}

            {/* 매칭 실패 좌석 경고 알림 */}
            {unmatchedSeatsWarning && (
              <div
                role="alert"
                className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3 text-amber-900 shadow-xs"
              >
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="font-bold text-amber-950">
                    {unmatchedSeatsWarning}
                  </div>
                  <p className="text-amber-800 text-xs">
                    유효한 나머지 좌석들은 도면에 정상 반영되었습니다. 위 좌석은 LG아트센터 도면 구조(1·2·3층 유효 번호)와 맞지 않으므로 확인해 주세요.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* 인쇄 영역 대상 블록: 하단 전체 컨테이너 블록 (seat-map-print-container) */}
        {/* '(단체명) 좌석배치도' 제목부터 등급별 현황, 무대, 좌석 도면까지 포함 */}
        {/* 인쇄 시(@media print) 이 블록만 전체 화면에 꽉 차게 출력됩니다 */}
        {/* ============================================================== */}
        <div
          ref={exportTargetRef}
          id="seat-map-print-container"
          className="seat-map-print-container bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-xs space-y-5"
        >
          {/* 배치도 상단 헤더 바 (수정된 제목 + 공연명 + 관람일자 + 공연장) */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="space-y-1.5">
              <h2 id="map-label" className="seat-map-print-title text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {exportTitle}
              </h2>
              <div className="flex flex-col gap-1.5 text-xs sm:text-sm text-slate-600">
                {(performanceName.trim() || viewingDateTime.trim()) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {performanceName.trim() && (
                      <span className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md text-slate-900 font-semibold border border-slate-200">
                        <Ticket className="w-3.5 h-3.5 text-red-600" />
                        <span>공연명: <strong>{performanceName.trim()}</strong></span>
                      </span>
                    )}
                    {viewingDateTime.trim() && (
                      <span className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md text-slate-900 font-semibold border border-slate-200">
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        <span>관람일시: <strong>{viewingDateTime.trim()}</strong></span>
                      </span>
                    )}
                  </div>
                )}
                <div className="text-slate-500 font-medium">
                  {selectedTheater === 'signature'
                    ? 'LG아트센터 서울, LG SIGNATURE Hall'
                    : selectedTheater === 'uplus'
                    ? 'LG아트센터 서울, U+ STAGE (End Stage)'
                    : '자유 커스텀 극장 좌석배치도'}
                </div>
              </div>
            </div>

            {/* 극장 선택 메뉴 & 총 좌석 카드 & 층 필터 탭 */}
            <div className="flex flex-wrap items-center gap-3">
              {/* 극장 선택 메뉴 (웹 조작용: no-print) */}
              <div className="no-print inline-flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-2xs">
                <Building2 className="w-4 h-4 text-slate-500 ml-1 shrink-0" />
                <span className="text-xs font-bold text-slate-700 hidden sm:inline">극장 선택:</span>
                <select
                  value={selectedTheater}
                  onChange={(e) => handleSelectTheater(e.target.value as TheaterId)}
                  className="bg-white text-slate-900 font-bold text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs focus:ring-2 focus:ring-red-500 cursor-pointer"
                  aria-label="극장 선택"
                >
                  <option value="signature">LG SIGNATURE Hall</option>
                  <option value="uplus">U+ STAGE (End Stage)</option>
                  <option value="custom">새 배치 만들기 (커스텀)</option>
                </select>
              </div>

              {/* 총 몇 석인지 강조 표시하는 요약 카드 */}
              <div className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-xs">
                <Ticket className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">선택 완료 좌석</div>
                  <div className="text-lg font-black leading-tight text-white flex items-baseline gap-2">
                    <span>총 {bookedSeats.length}석</span>
                    {showPrices && grandTotalPrice > 0 && (
                      <span className="text-xs font-bold text-amber-400 font-mono">
                        ({grandTotalPrice.toLocaleString()}원)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 층 필터 탭 (인쇄 시 숨김: no-print) */}
              {selectedTheater === 'signature' ? (
                <div className="no-print inline-flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActiveFloorTab('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeFloorTab === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    전체 층
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFloorTab('1f')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeFloorTab === '1f'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1층
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFloorTab('2f')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeFloorTab === '2f'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    2층
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFloorTab('3f')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      activeFloorTab === '3f'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    3층
                  </button>
                </div>
              ) : selectedTheater === 'uplus' ? (
                <div className="no-print inline-flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>1층 단일 객석 (End Stage)</span>
                </div>
              ) : (
                <div className="no-print inline-flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-bold text-blue-700">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span>자유 캔버스 편집 모드</span>
                </div>
              )}
            </div>
          </div>

          {/* 5개 등급별 색상 범례 및 통계 칩 바 (좌석 수가 0석인 등급은 자동 숨김, 1석 이상인 등급만 노출) */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700 mr-1">등급별 좌석 현황:</span>
              {TICKET_GRADES.filter((gradeKey) => (gradeCounts[gradeKey] || 0) > 0).map((gradeKey) => {
                const style = GRADE_STYLES[gradeKey];
                const count = gradeCounts[gradeKey] || 0;
                const price = typeof gradePrices[gradeKey] === 'number' ? (gradePrices[gradeKey] as number) : 0;
                const totalForGrade = count * price;
                const displayName = gradeCustomNames[gradeKey] || style.label;

                return (
                  <span
                    key={gradeKey}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold border ${style.badgeBg} ${style.badgeText} ${style.border}`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: style.hex }}
                    />
                    <span>
                      {displayName}: {count}석
                      {showPrices && ` (${totalForGrade.toLocaleString()}원)`}
                    </span>
                  </span>
                );
              })}
              {TICKET_GRADES.every((gradeKey) => (gradeCounts[gradeKey] || 0) === 0) && (
                <span className="text-slate-400 font-medium">선택된 좌석 없음</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-slate-600 font-bold text-xs">
              <span>합계:</span>
              <span className="text-slate-950 text-sm font-black underline decoration-red-500 decoration-2">
                총 {bookedSeats.length}석
              </span>
              {showPrices && (
                <span className="bg-emerald-600 text-white px-2.5 py-1 rounded font-black text-xs shadow-2xs ml-1">
                  총 {grandTotalPrice.toLocaleString()}원
                </span>
              )}
            </div>
          </div>

          {/* LG SIGNATURE Hall 전용 상단 무대 */}
          {selectedTheater === 'signature' && (
            <div className="flex flex-col items-center justify-center text-center pt-2">
              <div className="w-full max-w-xl py-2 bg-slate-800 text-slate-100 text-center font-black tracking-widest text-xs uppercase rounded-md shadow-xs border border-slate-700">
                STAGE
              </div>
              <div className="text-center text-[10px] text-slate-400 mt-1 font-semibold">무대 방향</div>
            </div>
          )}

          {/* 좌석배치도 메인 뷰포트 */}
          <div className="overflow-x-auto pb-4 flex justify-center w-full print:overflow-visible print:pb-0">
            <div
              className={`w-fit ${
                selectedTheater === 'signature'
                  ? 'min-w-[1260px]'
                  : selectedTheater === 'uplus'
                  ? 'min-w-[960px] max-w-[1080px]'
                  : 'w-full max-w-[1240px]'
              } print:min-w-0 print:w-full space-y-8 print:space-y-4 flex flex-col items-center justify-center px-2 print:px-0`}
            >
              {selectedTheater === 'signature' ? (
                <>

              {/* ======================= 1층 객석 ======================= */}
              {(activeFloorTab === 'all' || activeFloorTab === '1f') && (
                <div className="w-full bg-white px-6 py-5 rounded-xl border-2 border-slate-300 shadow-xs flex flex-col items-center relative">
                  <div className="w-full flex items-center justify-between mb-3 px-2 border-b border-slate-200 pb-2">
                    <span className="text-[11px] font-bold bg-amber-400 text-slate-900 px-2.5 py-0.5 rounded shadow-2xs">
                      1층
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      1층 객석 (OP1~OP5열, 1~23열, BL/BR 발코니석)
                    </span>
                    <span className="text-[11px] font-bold bg-amber-400 text-slate-900 px-2.5 py-0.5 rounded shadow-2xs">
                      1층
                    </span>
                  </div>

                  <div className="flex items-start justify-center gap-4 mx-auto relative">
                    <div className="pt-[190px] shrink-0">
                      {renderBalconyPillar('1층', 'BL', 6)}
                    </div>

                    <div className="flex flex-col items-center justify-center relative">
                      {/* 1. OP1 ~ OP3열 */}
                      <div className="flex flex-col gap-[2px]">
                        {F1_GROUP_OP_TOP.map((row) =>
                          renderPreciseRow('1층', row, 9, 19, 9)
                        )}
                      </div>

                      {/* [간격 1]: OP3열과 OP4열 사이 자연스러운 여백 간격 */}
                      <div className="h-3" aria-hidden="true" />

                      {/* 2. OP4 ~ OP5열 */}
                      <div className="flex flex-col gap-[2px]">
                        {F1_GROUP_OP_BOTTOM.map((row) =>
                          renderPreciseRow('1층', row, 9, 19, 9)
                        )}
                      </div>

                      {/* [간격 2]: OP5열과 1열 사이 자연스러운 여백 간격 */}
                      <div className="h-4" aria-hidden="true" />

                      {/* 3. 1열 ~ 16열 (1열 1~9번 삭제, 2열 1~5번 삭제 반영) */}
                      <div className="flex flex-col gap-[2px]">
                        {F1_GROUP_MAIN_UPPER.map((row) =>
                          renderPreciseRow('1층', row, 9, 19, 9)
                        )}
                      </div>

                      {/* [간격 3]: 16열과 17열 사이 자연스러운 메인 통로 여백 간격 */}
                      <div className="h-6" aria-hidden="true" />

                      {/* 4. 17열 ~ 20열 */}
                      <div className="flex flex-col gap-[2px]">
                        {F1_GROUP_MAIN_LOWER.map((row) =>
                          renderPreciseRow('1층', row, 9, 19, 9)
                        )}
                      </div>

                      {/* 5. 21~23열 + Sound Console Box */}
                      {(() => {
                        const hasColoredSeat21 = activeSeats.some(
                          (s) => s.floor === '1층' && cleanRowName(s.row) === '21열' && normalizeGrade(s.grade) !== '판매금지석'
                        );
                        const hasColoredSeat22 = activeSeats.some(
                          (s) => s.floor === '1층' && cleanRowName(s.row) === '22열' && normalizeGrade(s.grade) !== '판매금지석'
                        );
                        const hasColoredSeat23 = activeSeats.some(
                          (s) => s.floor === '1층' && cleanRowName(s.row) === '23열' && normalizeGrade(s.grade) !== '판매금지석'
                        );

                        return (
                          <div className="mt-[2px] flex flex-col gap-[2px] relative">
                            {/* 21열 */}
                            <div
                              key="1층-21열"
                              className={`flex items-center justify-center text-[11px] py-[1.5px] px-1 rounded transition-colors ${
                                hasColoredSeat21 ? 'bg-slate-100/70 shadow-2xs' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="w-11 shrink-0 font-bold text-slate-700 text-right pr-2 select-none text-[10px]">
                                21열
                              </div>
                              <div className="flex items-center justify-center">
                                <div className="flex gap-[2px] justify-end">
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => renderSeatButton('1층', '21열', n))}
                                </div>
                                <div className="w-3.5 flex justify-center items-center h-6 shrink-0">
                                  <div className="w-0 border-r border-dashed border-slate-300 h-full" />
                                </div>
                                <div className="relative flex gap-[2px] justify-center w-[454px]">
                                  {[10, 11, 12, 13].map((n) => renderSeatButton('1층', '21열', n))}
                                  <div
                                    className="w-[262px] h-[80px] absolute left-[96px] top-0 bg-slate-50 border-2 border-slate-800 rounded-md flex flex-col items-center justify-center text-center shadow-xs select-none pointer-events-none z-20"
                                    aria-label="Sound Console Box (음향 콘솔)"
                                  >
                                    <span className="font-black text-[11.5px] tracking-wider uppercase text-slate-900">
                                      SOUND CONSOLE
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-600 mt-0.5">
                                      음향 콘솔
                                    </span>
                                  </div>
                                  {Array(11)
                                    .fill(null)
                                    .map((_, i) => (
                                      <div key={`con21-spacer-${i}`} className="w-5.5 h-6 shrink-0" />
                                    ))}
                                  {[25, 26, 27, 28].map((n) => renderSeatButton('1층', '21열', n))}
                                </div>
                                <div className="w-3.5 flex justify-center items-center h-6 shrink-0">
                                  <div className="w-0 border-r border-dashed border-slate-300 h-full" />
                                </div>
                                <div className="flex gap-[2px] justify-start">
                                  {[29, 30, 31, 32, 33, 34, 35, 36, 37].map((n) =>
                                    renderSeatButton('1층', '21열', n)
                                  )}
                                </div>
                              </div>
                              <div className="w-11 shrink-0 font-bold text-slate-700 text-left pl-2 select-none text-[10px]">
                                21열
                              </div>
                            </div>

                            {/* 22열 */}
                            <div
                              key="1층-22열"
                              className={`flex items-center justify-center text-[11px] py-[1.5px] px-1 rounded transition-colors ${
                                hasColoredSeat22 ? 'bg-slate-100/70 shadow-2xs' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="w-11 shrink-0 font-bold text-slate-700 text-right pr-2 select-none text-[10px]">
                                22열
                              </div>
                              <div className="flex items-center justify-center">
                                <div className="flex gap-[2px] justify-end">
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => renderSeatButton('1층', '22열', n))}
                                </div>
                                <div className="w-3.5 flex justify-center items-center h-6 shrink-0">
                                  <div className="w-0 border-r border-dashed border-slate-300 h-full" />
                                </div>
                                <div className="relative flex gap-[2px] justify-center w-[454px]">
                                  {[10, 11, 12].map((n) => renderSeatButton('1층', '22열', n))}
                                  {Array(13)
                                    .fill(null)
                                    .map((_, i) => (
                                      <div key={`con22-spacer-${i}`} className="w-5.5 h-6 shrink-0" />
                                    ))}
                                  {[26, 27, 28].map((n) => renderSeatButton('1층', '22열', n))}
                                </div>
                                <div className="w-3.5 flex justify-center items-center h-6 shrink-0">
                                  <div className="w-0 border-r border-dashed border-slate-300 h-full" />
                                </div>
                                <div className="flex gap-[2px] justify-start">
                                  {[29, 30, 31, 32, 33, 34, 35, 36, 37].map((n) =>
                                    renderSeatButton('1층', '22열', n)
                                  )}
                                </div>
                              </div>
                              <div className="w-11 shrink-0 font-bold text-slate-700 text-left pl-2 select-none text-[10px]">
                                22열
                              </div>
                            </div>

                            {/* 23열 */}
                            <div
                              key="1층-23열"
                              className={`flex items-center justify-center text-[11px] py-[1.5px] px-1 rounded transition-colors ${
                                hasColoredSeat23 ? 'bg-slate-100/70 shadow-2xs' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="w-11 shrink-0 font-bold text-slate-700 text-right pr-2 select-none text-[10px]">
                                23열
                              </div>
                              <div className="flex items-center justify-center">
                                <div className="flex gap-[2px] justify-end">
                                  <div className="w-5.5 h-6 shrink-0" />
                                  {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => renderSeatButton('1층', '23열', n))}
                                </div>
                                <div className="w-3.5 flex justify-center items-center h-6 shrink-0">
                                  <div className="w-0 border-r border-dashed border-slate-300 h-full" />
                                </div>
                                <div className="flex gap-[2px] justify-center w-[454px]">
                                  {Array(19)
                                    .fill(null)
                                    .map((_, i) => (
                                      <div key={`con23-spacer-${i}`} className="w-5.5 h-6 shrink-0" />
                                    ))}
                                </div>
                                <div className="w-3.5 flex justify-center items-center h-6 shrink-0">
                                  <div className="w-0 border-r border-dashed border-slate-300 h-full" />
                                </div>
                                <div className="flex gap-[2px] justify-start">
                                  {[29, 30, 31, 32, 33, 34, 35, 36].map((n) =>
                                    renderSeatButton('1층', '23열', n)
                                  )}
                                  <div className="w-5.5 h-6 shrink-0" />
                                </div>
                              </div>
                              <div className="w-11 shrink-0 font-bold text-slate-700 text-left pl-2 select-none text-[10px]">
                                23열
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* 발코니 BR (도면 이미지와 같이 5열~10열 옆에 정밀 배치) */}
                    <div className="pt-[190px] shrink-0">
                      {renderBalconyPillar('1층', 'BR', 6)}
                    </div>
                  </div>
                </div>
              )}

              {/* ======================= 2층 ======================= */}
              {(activeFloorTab === 'all' || activeFloorTab === '2f') && (
                <div className="w-full bg-white px-6 py-5 rounded-xl border-2 border-slate-300 shadow-xs flex flex-col items-center relative">
                  <div className="w-full flex items-center justify-between mb-3 px-2 border-b border-slate-200 pb-2">
                    <span className="text-[11px] font-bold bg-amber-400 text-slate-900 px-2.5 py-0.5 rounded shadow-2xs">
                      2층
                    </span>
                    <span className="text-xs font-semibold text-slate-600">2층 객석 (1~8열, BL/BR 발코니석)</span>
                    <span className="text-[11px] font-bold bg-amber-400 text-slate-900 px-2.5 py-0.5 rounded shadow-2xs">
                      2층
                    </span>
                  </div>

                  <div className="w-[1190px] flex flex-col items-center">
                    <div className="w-full flex items-start justify-between mb-5 pt-1">
                      {renderBalconyPillar('2층', 'BL', 4)}
                      {renderBalconyPillar('2층', 'BR', 4)}
                    </div>

                    <div className="w-full flex flex-col gap-[2px] items-center justify-center">
                      {F2_PRECISE_ROWS.map((row) =>
                        renderPreciseRow('2층', row, 13, 19, 13)
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ======================= 3층 (2층 객석과 가로 폭 Width 100% 동기화) ======================= */}
              {(activeFloorTab === 'all' || activeFloorTab === '3f') && (
                <div className="w-full bg-white px-6 py-5 rounded-xl border-2 border-slate-300 shadow-xs flex flex-col items-center relative">
                  <div className="w-full flex items-center justify-between mb-3 px-2 border-b border-slate-200 pb-2">
                    <span className="text-[11px] font-bold bg-amber-400 text-slate-900 px-2.5 py-0.5 rounded shadow-2xs">
                      3층
                    </span>
                    <span className="text-xs font-semibold text-slate-600">3층 객석 (1~8열)</span>
                    <span className="text-[11px] font-bold bg-amber-400 text-slate-900 px-2.5 py-0.5 rounded shadow-2xs">
                      3층
                    </span>
                  </div>

                  {/* 2층 객석과 완전히 동일한 가로 폭(w-[1190px]) 및 슬롯 규격(13/19/13) 적용 */}
                  <div className="w-[1190px] flex flex-col items-center">
                    <div className="w-full flex flex-col gap-[2px] items-center justify-center">
                      {F3_PRECISE_ROWS.map((row) =>
                        renderPreciseRow('3층', row, 13, 19, 13)
                      )}
                    </div>
                  </div>
                </div>
              )}
                </>
              ) : selectedTheater === 'uplus' ? (
                <UPlusStageMap
                  renderSeatButton={renderSeatButton}
                  activeSeats={activeSeats}
                  cleanRowName={cleanRowName}
                  normalizeGrade={normalizeGrade}
                />
              ) : (
                <CustomTheaterCanvas
                  seatGradeMap={seatGradeMap}
                  gradeCustomNames={gradeCustomNames}
                  getGradeStyle={getGradeStyle}
                  cleanRowName={cleanRowName}
                  normalizeGrade={normalizeGrade}
                  activeClickGrade={activeClickGrade}
                  onSeatToggle={(floor, row, seatNum, e) => handleSeatMouseDown(floor, row, seatNum, e)}
                  showToast={showToast}
                  authUser={authUser}
                  authReady={authReady}
                  pendingRedirectAction={pendingRedirectAction}
                  onConsumePendingRedirectAction={() => setPendingRedirectAction(null)}
                  redirectAuthError={redirectAuthError}
                  onClearRedirectAuthError={() => setRedirectAuthError(null)}
                  onAuthUserUpdated={(nextUser) => setAuthUser(nextUser)}
                  onAuthError={(msg) => setAuthError(msg)}
                  onRequestSignOut={handleHeaderSignOut}
                  pendingShareCode={pendingShareCode}
                  onConsumePendingShareCode={handleConsumePendingShareCode}
                />
              )}
            </div>
          </div>
        </div>

        {/* 사람 확인 필요 안내문 (no-print) */}
        <footer className="no-print p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm font-medium leading-relaxed">
            <strong>사람 확인 필요:</strong> 단체 배정 서류 및 고객 발송 전 반드시 원본 예매 내역 및 배정 좌석 수(총 {bookedSeats.length}석{prohibitedSeats.length > 0 ? `, 판매금지 ${prohibitedSeats.length}석` : ''})와 일치하는지 한 번 더 확인해 주세요.
          </p>
        </footer>
      </main>

      {/* 회사 도메인(@lgart.com) 로그인 오류 플로팅 배너 */}
      {authError && (
        <div
          role="alert"
          className="no-print fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-red-50 border border-red-300 text-red-800 rounded-xl shadow-lg px-4 py-3 flex items-center justify-between gap-3 text-xs font-bold"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{authError}</span>
          </div>
          <button
            type="button"
            onClick={() => setAuthError(null)}
            className="p-1 text-red-500 hover:text-red-700 rounded-md cursor-pointer shrink-0"
            aria-label="오류 안내 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ?code=XXXXXX 링크로 접속했으나 미로그인 상태일 때 표시하는 로그인 요청 모달 */}
      {!authUser && pendingShareCode && showShareCodeLoginPrompt && (
        <div className="no-print fixed inset-0 bg-black/45 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <LogIn className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">
                  공유 배치도 열기
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowShareCodeLoginPrompt(false);
                  showToast('로그인이 취소되었습니다.');
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
              <p className="font-medium">
                공유 코드{' '}
                <span className="font-mono font-black px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                  {pendingShareCode}
                </span>{' '}
                배치도를 불러오려면 회사 계정(@lgart.com)으로 로그인해 주세요.
              </p>
              {authError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-bold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowShareCodeLoginPrompt(false);
                  showToast('로그인이 취소되었습니다.');
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() =>
                  void requestCompanyLogin({
                    action: 'enterCustom',
                    theater: 'custom',
                    onSuccess: () => {
                      setShowShareCodeLoginPrompt(false);
                      setSelectedTheater('custom');
                    },
                    onCancel: () => {
                      setShowShareCodeLoginPrompt(false);
                    },
                  })
                }
                disabled={isHeaderSigningIn}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isHeaderSigningIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>Google 로그인</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
