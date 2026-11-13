import express from 'express';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import path from 'path';

dotenv.config();

function getPortAndHost() {
  let port = Number(process.env.PORT) || 3000;
  let host = '0.0.0.0';

  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--port' && process.argv[i + 1]) {
      const parsed = parseInt(process.argv[i + 1], 10);
      if (!isNaN(parsed)) port = parsed;
    }
    if (process.argv[i] === '--host') {
      if (process.argv[i + 1] && !process.argv[i + 1].startsWith('-')) {
        host = process.argv[i + 1];
      } else {
        host = '0.0.0.0';
      }
    }
  }
  return { port, host };
}

const { port, host } = getPortAndHost();

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint for container and supervisor probes
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// 서버 측 GoogleGenAI 인스턴스 초기화 (User-Agent 필수 설정)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// 추출된 Gemini 텍스트에서 4대 정보(단체명, 일시, 공연명, 좌석) 및 도면 여부 파싱 헬퍼 함수
function parseExtractionOutput(rawOutput: string) {
  const cleaned = rawOutput
    .replace(/^```[a-zA-Z]*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();

  let isVisualMap = false;
  let groupName = '';
  let viewingDateTime = '';
  let performanceName = '';
  const seatLines: string[] = [];

  const lines = cleaned.split('\n');
  let inSeatSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (!inSeatSection) {
      const typeMatch = line.match(/^이미지\s*유형\s*:\s*(.*)$/i);
      if (typeMatch) {
        const val = typeMatch[1].trim();
        if (val.includes('도면') || val.includes('배치도') || val.includes('X') || val.includes('시각') || val.includes('유형 B')) {
          isVisualMap = true;
        }
        continue;
      }

      const groupMatch = line.match(/^단체명\s*:\s*(.*)$/i);
      if (groupMatch) {
        const val = groupMatch[1].trim();
        if (val && val !== '정보 없음') groupName = val;
        continue;
      }

      const dateMatch = line.match(/^공연\s*날짜\s*:\s*(.*)$/i);
      if (dateMatch) {
        const val = dateMatch[1].trim();
        if (val && val !== '정보 없음') viewingDateTime = val;
        continue;
      }

      const perfMatch = line.match(/^공연명\s*:\s*(.*)$/i);
      if (perfMatch) {
        const val = perfMatch[1].trim();
        if (val && val !== '정보 없음') performanceName = val;
        continue;
      }

      if (/^좌석\s*:?$/i.test(line)) {
        inSeatSection = true;
        continue;
      }

      // '좌석:' 라벨 없이 바로 좌석 정보가 시작되는 경우
      if (/[123]층|(?:VIP|R|S|A|B)석|\d+열/.test(line)) {
        inSeatSection = true;
        seatLines.push(line);
      }
    } else {
      seatLines.push(line);
    }
  }

  if (
    cleaned.includes('좌석 도면') ||
    cleaned.includes('도면 이미지') ||
    cleaned.includes('배치도') ||
    cleaned.includes("'X' 표시") ||
    cleaned.includes('X표시') ||
    cleaned.includes('유형 B')
  ) {
    isVisualMap = true;
  }

  return {
    cleaned,
    isVisualMap,
    groupName,
    viewingDateTime,
    performanceName,
    seatLines,
  };
}

// 엑셀(Excel) 캡처본, 티켓 예매 관리 표, 좌석 배치도 도면 등 모든 형식에서 배경/글자 색상 무관하게 데이터를 추출하는 만능 OCR 프롬프트
const UNIVERSAL_SEAT_OCR_PROMPT = `당신은 티켓 예매 관리 화면, 좌석 배치도 도면, 그리고 엑셀(Excel) 스프레드시트 캡처 이미지 등 모든 형태의 좌석 자료에서 텍스트, 좌석 등급(VIP석, R석, S석, A석, B석 등), 좌석 번호 데이터를 누락 없이 100% 정밀 추출하는 전문 OCR 데이터 파서입니다.

[핵심 판독 원칙: 배경 색상 및 글자 색상 무관]
1. 어떠한 배경 색상(예: 엑셀 셀의 파랑, 초록, 노랑, 주황, 회색, 보라, 검정 등 유색 채우기 배경, 다크모드 검정 배경, 웹 테이블의 파란색/초록색 선택 하이라이트 행 등)이더라도 전혀 구애받지 않고 명도 대비를 자동 감지하여 텍스트를 정확히 판독하세요.
2. 어떠한 글자 색상(흰색 글자, 검은색 글자, 빨간 글자, 파란 글자, 형광 노랑 글자 등)이더라도 명확히 인식하여 모든 문자를 추출하세요.

[지원하는 이미지 유형 및 추출 규칙]

1. 엑셀(Excel) 스프레드시트 캡처본:
   - 엑셀 표(테이블), 셀 격자(그리드), 단일/다중 열 데이터, 좌석 매트릭스(행: 열 번호, 열: 좌석 번호) 등 모든 엑셀 형태를 완벽히 판독합니다.
   - 엑셀 시트 제목/헤더/메모란에 기재된 단체명/예매자명, 관람일자(날짜/시간), 공연명 정보를 감지하여 매핑합니다.
   - 컬럼 구분(예매자, 공연명, 일시, 등급/석종/권종/구분, 층, 열, 번호 등)이 있는 경우 각 셀의 내용을 올바른 필드에 매핑합니다.
   - 특히 등급 열(예: '등급', '석종', '권종', '좌석구분', '구분', '티켓종류')에 기재된 'VIP', 'VIP석', 'R', 'R석', 'S', 'S석', 'A', 'A석', 'B', 'B석'을 정밀 인식하여 "VIP석", "R석", "S석", "A석", "B석" 형태로 매핑합니다.
   - 셀 내에 좌석 번호가 범위(예: '26~29번', '33-36')나 쉼표(예: '26, 27, 28')로 묶여 있는 경우, 반드시 개별 좌석(26번, 27번, 28번, 29번)으로 각각 1행씩 분리하여 모두 추출합니다.
   - 엑셀 행/열 머리글(A, B, C... / 1, 2, 3...)은 좌석 번호와 혼동하지 마세요.

2. 티켓 예매 관리 화면 (표 + 도면):
   - 상단 '예매내역 표': '등급', '석종', '권종', '좌석등급' 등의 열이나 좌석 정보 내에 명시된 등급(VIP석, R석, S석, A석, B석)을 100% 인식합니다.
   - 하단 '좌석 배치도': 도면 내 사각 박스에 노란색/검은색 'X' 마킹된 선택 좌석을 누락 없이 전수 판독하며, 도면 내 범례(Legend)나 구역/블록별 등급 색상(예: 빨간색/자주색=VIP석, 보라색/남색=R석, 노란색/주황색=S석, 파란색/하늘색=A석, 초록색/연두색=B석, 회색/검정=판매금지석)을 참조하여 해당 좌석의 등급을 정확히 지정합니다.
   - 상단 표와 하단 도면의 모든 좌석을 단일 통합 목록으로 누락 없이 취합합니다.

3. 일반 캡처본 (문자, 카카오톡, 메모장, 티켓 등):
   - 기재된 모든 층, 열, 번호 및 등급(VIP석, R석, S석, A석, B석) 텍스트를 정밀 추출합니다.

[★좌석 등급(seat_grade) 필수 판독 및 인식 규칙★]
- 표, 엑셀 또는 도면에 명시된 등급('VIP석', 'R석', 'S석', 'A석', 'B석', 'VIP', 'R', 'S', 'A', 'B', '판매금지석') 또는 컬러 범례가 있으면 해당 등급을 최우선으로 'VIP석', 'R석', 'S석', 'A석', 'B석', '판매금지석' 중 하나로 정확하게 매핑합니다.
- 등급이 표기되어 있지 않거나 도면에서 범례를 식별할 수 없는 경우에 한하여, 대극장 표준 배치(1층 1~16열: VIP석, 1층 17~23열: R석, 2층 1~4열: R석, 2층 5~8열: S석, 3층 1~3열: S석, 3층 4~6열: A석, 3층 7~8열: B석)를 기준으로 해당 좌석의 등급을 지정합니다.
- 모든 좌석 항목의 "seat_grade" 필드는 절대로 빈 문자열("")이나 누락되지 않아야 합니다.

[출력 데이터 필드 설명]
- "booker_name": 단체명 또는 예매자 성명/상호 (이미지에 없으면 빈 문자열 "")
- "phone_number": 예매자 연락처 (이미지에 없으면 빈 문자열 "")
- "event_name": 공연이름 (이미지에 없으면 빈 문자열 "")
- "event_date": 관람일자 원문 (예: "2026-12-13 [일] 14:00", 없으면 빈 문자열 "")
- "seat_grade": 좌석 등급 (필수: "VIP석", "R석", "S석", "A석", "B석", "판매금지석" 중 하나)
- "seat_info": 좌석 전체 텍스트 (예: "1층 18열 33번")
- "seat_floor": 층수 (예: "1층", "2층", "3층")
- "seat_row": 열 (예: "18열", "OP1열", "BL", "BR")
- "seat_number": 번수 (반드시 개별 좌석 단위, 예: "33번")

반드시 다른 설명 없이 모든 좌석이 담긴 유효한 JSON 배열만 출력하세요.`;

interface ExtractedItem {
  booker_name?: string;
  phone_number?: string;
  event_name?: string;
  event_date?: string;
  seat_grade?: string;
  seat_info: string;
  seat_floor?: string;
  seat_row?: string;
  seat_number?: string;
}

// 층 및 열 기준 기본 등급 추론 헬퍼 함수
function inferSeatGrade(floor: string, row: string, rawGrade?: string): string {
  const cleanF = floor.includes('2') ? '2층' : floor.includes('3') ? '3층' : '1층';
  const rowNum = parseInt(row.replace(/\D/g, ''), 10) || 0;
  const isOp = row.toUpperCase().startsWith('OP');

  // 추출된 원본 등급이 있을 경우 최우선 존중 및 매핑 (임의로 덮어쓰지 않음)
  if (rawGrade && typeof rawGrade === 'string' && rawGrade.trim() && rawGrade.trim() !== '정보 없음') {
    const g = rawGrade.trim().toUpperCase();
    if (g.includes('판매금지') || g.includes('금지') || g.includes('HOLD')) return '판매금지석';
    if (g.includes('VIP') || g.includes('브이아이피') || g === 'V') return 'VIP석';
    if (g.includes('R') || g.includes('알석') || g === 'R') return 'R석';
    if (g.includes('S') || g.includes('에스석') || g === 'S') return 'S석';
    if (g.includes('A') || g.includes('에이석') || g === 'A') return 'A석';
    if (g.includes('B') || g.includes('비석') || g === 'B') return 'B석';
  }

  // 등급이 전혀 명시되지 않은 경우에만 대극장 표준 배치 적용
  let venueDefaultGrade = 'VIP석';
  if (cleanF === '1층') {
    if (isOp || (rowNum >= 1 && rowNum <= 16)) {
      venueDefaultGrade = 'VIP석';
    } else {
      venueDefaultGrade = 'R석';
    }
  } else if (cleanF === '2층') {
    if (rowNum >= 1 && rowNum <= 4) {
      venueDefaultGrade = 'R석';
    } else {
      venueDefaultGrade = 'S석';
    }
  } else {
    // 3층
    if (rowNum >= 1 && rowNum <= 3) {
      venueDefaultGrade = 'S석';
    } else if (rowNum >= 4 && rowNum <= 6) {
      venueDefaultGrade = 'A석';
    } else {
      venueDefaultGrade = 'B석';
    }
  }

  return venueDefaultGrade;
}

// 엑셀 셀이나 텍스트 내에서 좌석 번호 목록 또는 범위(예: 33~36번, 26, 27, 28)를 개별 번호 배열로 전개
function expandSeatNumbers(rawNumStr: string, seatInfoStr: string): number[] {
  const target = `${rawNumStr || ''} ${seatInfoStr || ''}`.trim();

  // 1. 물결표(~) 또는 하이픈(-) 범위 매칭 (예: 26~29번, 33-36)
  const rangeMatch = target.match(/(\d+)\s*[~～\-]\s*(\d+)/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (!isNaN(start) && !isNaN(end) && Math.abs(end - start) < 70) {
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      const res: number[] = [];
      for (let n = min; n <= max; n++) res.push(n);
      return res;
    }
  }

  // 2. 쉼표(,) 구분 좌석 번호들 (예: 26, 27, 28)
  if (target.includes(',') || target.includes('，')) {
    const parts = target.split(/[,，]/);
    const res: number[] = [];
    for (const p of parts) {
      const m = p.match(/(\d+)/);
      if (m) {
        const val = parseInt(m[1], 10);
        if (!isNaN(val) && val > 0) res.push(val);
      }
    }
    if (res.length > 0) return Array.from(new Set(res)).sort((a, b) => a - b);
  }

  // 3. 단일 좌석 번호
  const singleMatch = (rawNumStr && rawNumStr.match(/(\d+)/)) || (seatInfoStr && seatInfoStr.match(/(\d+)번?/));
  if (singleMatch) {
    const num = parseInt(singleMatch[1], 10);
    if (!isNaN(num) && num > 0) return [num];
  }

  return [];
}

// 통합 추출 데이터 처리 헬퍼 함수 (엑셀 범위 전개 및 메타데이터 상속)
function processAllExtractedData(items: ExtractedItem[]) {
  let groupName = '';
  let phoneNumber = '';
  let performanceName = '';
  let viewingDateTime = '';

  for (const item of items) {
    if (!groupName && item.booker_name && item.booker_name.trim() && item.booker_name !== '정보 없음') {
      groupName = item.booker_name.trim();
    }
    if (!phoneNumber && item.phone_number && item.phone_number.trim()) {
      phoneNumber = item.phone_number.trim();
    }
    if (!performanceName && item.event_name && item.event_name.trim() && item.event_name !== '정보 없음') {
      performanceName = item.event_name.trim();
    }
    if (!viewingDateTime && item.event_date && item.event_date.trim() && item.event_date !== '정보 없음') {
      viewingDateTime = item.event_date.trim();
    }
  }

  const seatGroups = new Map<string, number[]>();
  const normalizedItems: ExtractedItem[] = [];
  const seenSeatKeys = new Set<string>();

  for (const item of items) {
    let floor = item.seat_floor?.trim() || '';
    let row = item.seat_row?.trim() || '';
    const numStr = item.seat_number?.trim() || '';
    const info = item.seat_info || '';

    if (!floor) {
      const fMatch = info.match(/([123])층/);
      if (fMatch) floor = `${fMatch[1]}층`;
    }
    if (!row) {
      const rMatch = info.match(/(OP\d+열?|BL|BR|\d+열)/i);
      if (rMatch) row = rMatch[1];
    }

    if (!floor) floor = '1층';
    if (!row) row = '1열';
    if (!row.endsWith('열') && !['BL', 'BR'].includes(row.toUpperCase())) {
      row = `${row}열`;
    }

    const numbers = expandSeatNumbers(numStr, info);
    const validNumbers = numbers.length > 0 ? numbers : [1];

    for (const seatNum of validNumbers) {
      const validSeatNum = `${seatNum}번`;
      const dedupeKey = `${floor}_${row}_${validSeatNum}`;

      if (seenSeatKeys.has(dedupeKey)) {
        continue;
      }
      seenSeatKeys.add(dedupeKey);

      const grade = inferSeatGrade(floor, row, item.seat_grade);

      normalizedItems.push({
        booker_name: item.booker_name || groupName || '정보 없음',
        phone_number: item.phone_number || phoneNumber || '',
        event_name: item.event_name || performanceName || '정보 없음',
        event_date: item.event_date || viewingDateTime || '정보 없음',
        seat_grade: grade,
        seat_info: `${floor} ${row} ${validSeatNum}`,
        seat_floor: floor,
        seat_row: row,
        seat_number: validSeatNum,
      });

      const groupKey = `${grade} ${floor} ${row}`;
      if (!seatGroups.has(groupKey)) {
        seatGroups.set(groupKey, []);
      }
      seatGroups.get(groupKey)!.push(seatNum);
    }
  }

  // 연속 좌석 물결표(~) 범위 변환
  const seatLines: string[] = [];
  for (const [groupKey, numbers] of seatGroups.entries()) {
    const sorted = Array.from(new Set(numbers)).sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      if (curr === prev + 1) {
        prev = curr;
      } else {
        ranges.push(start === prev ? `${start}번` : `${start}~${prev}번`);
        start = curr;
        prev = curr;
      }
    }
    if (sorted.length > 0) {
      ranges.push(start === prev ? `${start}번` : `${start}~${prev}번`);
    }

    seatLines.push(`${groupKey}: ${ranges.join(', ')}`);
  }

  const seatText = seatLines.join('\n');

  return {
    groupName,
    phoneNumber,
    performanceName,
    viewingDateTime,
    seatText,
    seatLines,
    normalizedItems,
  };
}

// Gemini 멀티모달 호출 함수 (초고속 lite 모델 우선, LOW reasoning 및 18초 호출 타임아웃 적용)
async function generateSeatDataWithGemini(imageParts: any[]) {
  // 우선순위:
  // 1. gemini-3.1-flash-lite: 초고속(1~3초), 큐 지연/부하 적음, 표/엑셀/도면 OCR 정확도 우수
  // 2. gemini-3.8-flash: thinkingLevel: ThinkingLevel.LOW 적용 (과도한 reasoning으로 인한 30초+ 지연 방지)
  // 3. gemini-flash-latest: 표준 fallback
  const modelsToTry: Array<{ name: string; thinkingLevel?: ThinkingLevel }> = [
    { name: 'gemini-3.1-flash-lite' },
    { name: 'gemini-3.8-flash', thinkingLevel: ThinkingLevel.LOW },
    { name: 'gemini-flash-latest' },
  ];
  let lastError: any = null;

  for (const { name: modelName, thinkingLevel } of modelsToTry) {
    try {
      console.log(`[Gemini OCR] Calling ${modelName}...`);

      // 개별 호출에 18초 타임아웃 적용하여 클라우드 프록시(60초) 타임아웃 완전 차단
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${modelName} 응답 시간(18초) 초과`)), 18000)
      );

      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            ...imageParts,
            { text: UNIVERSAL_SEAT_OCR_PROMPT },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: thinkingLevel ? { thinkingLevel } : undefined,
          responseSchema: {
            type: Type.ARRAY,
            description: '이미지(엑셀 캡처, 표, 도면 등)에서 추출된 모든 좌석 데이터 목록',
            items: {
              type: Type.OBJECT,
              properties: {
                booker_name: { type: Type.STRING, description: '예매자 성명/상호 (없으면 빈 문자열)' },
                phone_number: { type: Type.STRING, description: '휴대폰 번호 (없으면 빈 문자열)' },
                event_name: { type: Type.STRING, description: '공연이름 (없으면 빈 문자열)' },
                event_date: { type: Type.STRING, description: '관람일자 (없으면 빈 문자열)' },
                seat_grade: { type: Type.STRING, description: '좌석 등급 (필수: VIP석, R석, S석, A석, B석, 판매금지석 중 하나)' },
                seat_info: { type: Type.STRING, description: '좌석 전체 텍스트 (예: 1층 18열 33번)' },
                seat_floor: { type: Type.STRING, description: '층수 (예: 1층)' },
                seat_row: { type: Type.STRING, description: '열 (예: 18열)' },
                seat_number: { type: Type.STRING, description: '좌석 번호 (예: 33번)' },
              },
              required: ['seat_info', 'seat_floor', 'seat_row', 'seat_number', 'seat_grade'],
            },
          },
        },
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || '');
      console.warn(`[Gemini OCR] Error with ${modelName}:`, errMsg);

      // 일시적 오류인 경우 짧은 지연(500ms) 후 다음 모델 시도
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Fallback: 스키마 없이 표준 JSON 텍스트 프롬프트 모드로 최종 시도 (15초 타임아웃)
  try {
    console.log(`[Gemini OCR Fallback] Calling gemini-3.1-flash-lite in standard JSON mode...`);
    const fallbackTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI 응답 시간(15초) 초과')), 15000)
    );
    const fallbackPromise = ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: {
        parts: [
          ...imageParts,
          {
            text: `${UNIVERSAL_SEAT_OCR_PROMPT}\n\n[출력 지침] 반드시 유효한 JSON 배열(예: [{"booker_name":"","seat_grade":"VIP석","seat_info":"1층 10열 31번","seat_floor":"1층","seat_row":"10열","seat_number":"31번"}]) 형식으로만 출력하세요.`,
          },
        ],
      },
    });
    return await Promise.race([fallbackPromise, fallbackTimeout]);
  } catch (fallbackErr: any) {
    console.warn(`[Gemini OCR Fallback] Error:`, fallbackErr?.message);
  }

  const rawMsg = String(lastError?.message || '');
  if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE') || rawMsg.includes('high demand')) {
    throw new Error('현재 AI 서버에 일시적인 트래픽 급증이 발생했습니다. 2~3초 후 [다시 시도] 버튼을 누르시면 정상 처리됩니다.');
  }
  if (rawMsg.includes('429') || rawMsg.includes('Resource has been exhausted')) {
    throw new Error('일시적으로 요청 한도에 도달했습니다. 잠시 후 [다시 시도] 버튼을 눌러주세요.');
  }

  throw lastError || new Error('이미지 텍스트 인식을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.');
}

// 예매 내역 캡처 이미지 분석 API (Gemini Multimodal - 엑셀 캡처본, 표, 도면 전체 데이터 통합 추출)
app.post('/api/parse-seat-image', async (req, res) => {
  try {
    const { imageBase64, images, mimeType = 'image/png' } = req.body;

    let imageList: Array<{ data: string; mimeType: string }> = [];

    if (Array.isArray(images) && images.length > 0) {
      imageList = images
        .map((img: any) => {
          const raw = String(img.imageBase64 || img.dataUrl || img.data || '');
          const cleanData = raw.replace(/^data:[^;]+;base64,/, '').trim();
          let mime = String(img.mimeType || 'image/png').split(';')[0].trim().toLowerCase();
          if (!mime.startsWith('image/')) mime = 'image/png';
          return {
            data: cleanData,
            mimeType: mime,
          };
        })
        .filter((img) => Boolean(img.data));
    } else if (imageBase64) {
      const raw = String(imageBase64);
      const cleanData = raw.replace(/^data:[^;]+;base64,/, '').trim();
      let mime = String(mimeType || 'image/png').split(';')[0].trim().toLowerCase();
      if (!mime.startsWith('image/')) mime = 'image/png';
      imageList = [{ data: cleanData, mimeType: mime }];
    }

    if (imageList.length === 0) {
      return res.status(400).json({ error: '이미지 데이터가 전달되지 않았습니다.' });
    }

    const imageParts = imageList.map((img) => ({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data,
      },
    }));

    const response = await generateSeatDataWithGemini(imageParts);

    const rawText = response.text || '[]';
    let rawItems: any[] = [];

    try {
      const cleaned = rawText
        .replace(/^```[a-zA-Z]*\n?/gm, '')
        .replace(/```$/gm, '')
        .trim();
      const parsed = JSON.parse(cleaned);

      if (Array.isArray(parsed)) {
        rawItems = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const resList = Array.isArray(parsed.reservations) ? parsed.reservations : [];
        const mapList = Array.isArray(parsed.selected_seats_from_map)
          ? parsed.selected_seats_from_map.map((m: any) => ({
              booker_name: resList[0]?.booker_name || '',
              phone_number: resList[0]?.phone_number || '',
              event_name: resList[0]?.event_name || '',
              event_date: resList[0]?.event_date || '',
              seat_info: `${m.floor || '1층'} ${m.row || '1열'} ${m.seat_number || '1번'}`,
              seat_floor: m.floor,
              seat_row: m.row,
              seat_number: m.seat_number,
              seat_grade: m.grade || m.seat_grade,
            }))
          : [];
        rawItems = [...resList, ...mapList];
        if (rawItems.length === 0 && Array.isArray(parsed.records)) {
          rawItems = parsed.records;
        }
      }
    } catch (e: any) {
      console.warn('JSON 파싱 오류, 정규식 추출 시도:', e.message);
      const arrMatch = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrMatch) {
        try {
          rawItems = JSON.parse(arrMatch[0]);
        } catch {
          // ignore
        }
      }
    }

    const processed = processAllExtractedData(rawItems);

    const formattedRaw = `단체명: ${processed.groupName || '정보 없음'}${
      processed.phoneNumber ? ` (${processed.phoneNumber})` : ''
    }\n공연 날짜: ${processed.viewingDateTime || '정보 없음'}\n공연명: ${
      processed.performanceName || '정보 없음'
    }\n좌석:\n${processed.seatText || '정보 없음'}`;

    return res.json({
      success: true,
      all_records: processed.normalizedItems,
      records: processed.normalizedItems,
      groupName: processed.groupName,
      phoneNumber: processed.phoneNumber,
      viewingDateTime: processed.viewingDateTime,
      performanceName: processed.performanceName,
      seatText: processed.seatText,
      rawOutput: formattedRaw,
      rawJson: JSON.stringify(processed.normalizedItems, null, 2),
      totalCount: processed.normalizedItems.length,
      isVisualMap: false,
    });
  } catch (error: any) {
    console.error('Error in /api/parse-seat-image:', error);
    return res.status(500).json({
      error: error.message || '이미지 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`);
    console.log(`  ➜  Local:   http://localhost:${port}/`);
    console.log(`  ➜  Network: http://${host}:${port}/`);
  });

  server.on('error', (err: any) => {
    console.error('Server listen error:', err);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
