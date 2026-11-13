import React from 'react';
import {
  UPLUS_STAGE_ROWS,
  UPLUS_BALCONY_SEATS,
  UPlusRow,
} from './uPlusStage';

interface ParsedSeat {
  floor: string;
  grade: string;
  row: string;
  seatNumber: number;
}

interface UPlusStageMapProps {
  renderSeatButton: (
    floor: string,
    rowName: string,
    seatNum: number,
    options?: {
      isTwoDigit?: boolean;
      isHighlightRed?: boolean;
      customWidthClass?: string;
    }
  ) => React.ReactNode;
  activeSeats: ParsedSeat[];
  cleanRowName: (raw: string) => string;
  normalizeGrade: (grade: string) => string;
}

// 건축 도면 원본 형식의 게이트 출입문 그래픽 (선명한 블랙 실선, 좌우 문짝 2줄 두께, 주황색 바닥선에 살짝 걸쳐 아래로 90도 열림)
const GateDoorSymbol: React.FC = () => {
  return (
    <svg
      width="78"
      height="44"
      viewBox="0 0 78 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-black shrink-0 select-none"
      aria-hidden="true"
    >
      {/* 상단 문틀 인방선 (주황색 바닥선 위치 y=5 와 일치하는 수평 실선) */}
      <line x1="1.5" y1="5" x2="76.5" y2="5" stroke="#000000" strokeWidth="1.8" />

      {/* 좌측 문틀 기둥 (상단 모서리 검은색 사각 기둥: 주황색 선 위로 4px, 아래로 3.5px 걸쳐있음) */}
      <rect x="0" y="1" width="4.5" height="7.5" fill="#000000" rx="0.5" />

      {/* 우측 문틀 기둥 (상단 모서리 검은색 사각 기둥: 주황색 선 위로 4px, 아래로 3.5px 걸쳐있음) */}
      <rect x="73.5" y="1" width="4.5" height="7.5" fill="#000000" rx="0.5" />

      {/* 좌측 문짝: 진하고 선명한 2줄(줄이 2개) 두께 실선 */}
      <line x1="1.5" y1="5" x2="1.5" y2="39" stroke="#000000" strokeWidth="2.2" strokeLinecap="square" />
      <line x1="4.5" y1="5" x2="4.5" y2="39" stroke="#000000" strokeWidth="2.2" strokeLinecap="square" />
      {/* 좌측 문짝 하단 마감선 */}
      <line x1="1.5" y1="39" x2="4.5" y2="39" stroke="#000000" strokeWidth="2.2" />

      {/* 우측 문짝: 진하고 선명한 2줄(줄이 2개) 두께 실선 */}
      <line x1="73.5" y1="5" x2="73.5" y2="39" stroke="#000000" strokeWidth="2.2" strokeLinecap="square" />
      <line x1="76.5" y1="5" x2="76.5" y2="39" stroke="#000000" strokeWidth="2.2" strokeLinecap="square" />
      {/* 우측 문짝 하단 마감선 */}
      <line x1="73.5" y1="39" x2="76.5" y2="39" stroke="#000000" strokeWidth="2.2" />

      {/* 좌측 문짝 회전 궤적: 선명하고 진한 실선 호 (좌측 문짝 하단 (4.5, 39)에서 중앙 상단 (39, 5)으로 올라가는 호) */}
      <path
        d="M 4.5 39 A 34.5 34.5 0 0 0 39 5"
        fill="none"
        stroke="#000000"
        strokeWidth="2.2"
      />

      {/* 우측 문짝 회전 궤적: 선명하고 진한 실선 호 (우측 문짝 하단 (73.5, 39)에서 중앙 상단 (39, 5)으로 올라가는 호) */}
      <path
        d="M 73.5 39 A 34.5 34.5 0 0 1 39 5"
        fill="none"
        stroke="#000000"
        strokeWidth="2.2"
      />
    </svg>
  );
};

export const UPlusStageMap: React.FC<UPlusStageMapProps> = ({
  renderSeatButton,
  activeSeats,
  cleanRowName,
  normalizeGrade,
}) => {
  // 특정 열에 판매금지석 외 색상(지정된 등급) 좌석이 있는지 확인하여 열 배경 강조
  const isRowHighlighted = (rowName: string) => {
    return activeSeats.some(
      (s) =>
        s.floor === '1층' &&
        cleanRowName(s.row) === cleanRowName(rowName) &&
        normalizeGrade(s.grade) !== '판매금지석'
    );
  };

  // U+ STAGE 단일 행 렌더링 함수
  // 1번부터 왼쪽 정렬되며, 선택 하이라이트 배경 바가 양쪽 외곽 파란선까지 침범하지 않고
  // 열 라벨 글자(A열~Q열)까지만 깔끔하게 감싸도록 내부 래퍼 구조로 렌더링합니다.
  const renderUPlusRow = (row: UPlusRow) => {
    const highlighted = isRowHighlighted(row.rowName);

    // 슬롯 1칸 너비: 좌석 26px + 간격 3px (기존 2px의 1.5배) = 29px
    const slotStep = 29;

    return (
      <div
        key={`uplus-${row.rowName}`}
        className="flex items-center justify-center py-[1px] h-[29px] w-[736px]"
      >
        {/* 선택/하이라이트 배경 바: 외곽 파란 테두리까지 닿지 않되, 양쪽으로 1.5mm(+6px) 더 뻗어 열 글자를 여유롭게 감쌈 */}
        <div
          className={`flex items-center justify-between h-[27px] px-[10px] rounded-[3px] transition-colors ${
            highlighted ? 'bg-slate-100 shadow-2xs' : 'hover:bg-slate-50/70'
          }`}
        >
          {/* 좌측 열 이름 라벨 (A열 ~ Q열: 폭 44px, whitespace-nowrap 적용으로 M열 등 모든 글자가 가로로 온전하게 정렬) */}
          <div className="w-[44px] shrink-0 font-bold text-slate-900 text-right pr-[18px] select-none text-[11px] whitespace-nowrap">
            {row.rowName}
          </div>

          {/* 좌석 컨테이너 (고정 폭 608px, 왼쪽 정렬):
              A~Q열 모두 동일한 가로 영역을 차지하므로 우측 열 라벨도 일자로 곧게 정렬됩니다. */}
          <div className="flex items-center justify-start w-[608px] shrink-0">
            {/* 좌측 인덴트 (E열: 1칸 29px, P·Q열: 2칸 58px) */}
            {row.leftIndent > 0 && (
              <div
                style={{ width: `${row.leftIndent * slotStep}px` }}
                className="shrink-0"
                aria-hidden="true"
              />
            )}

            {/* 좌석 버튼 목록: 좌석 좌우 간격을 기존 2px의 1.5배인 3px(gap-[3px])로 조정 */}
            <div className="flex items-center gap-[3px]">
              {row.seats.map((seatNum) => {
                // B, D, F, H, J, L, N열의 15, 17번 좌석은 붉은색 글씨 강조
                const isMissing16Row = row.hasMissing16;
                const isHighlightRed = isMissing16Row && (seatNum === 15 || seatNum === 17);

                return renderSeatButton('1층', row.rowName, seatNum, {
                  isTwoDigit: true,
                  isHighlightRed,
                  customWidthClass: 'w-[26px] h-[26px] text-[10px]',
                });
              })}
            </div>
          </div>

          {/* 우측 열 이름 라벨 (A열 ~ Q열: 폭 44px, whitespace-nowrap 적용으로 M열 등 모든 글자가 가로로 온전하게 정렬) */}
          <div className="w-[44px] shrink-0 font-bold text-slate-900 text-left pl-[18px] select-none text-[11px] whitespace-nowrap">
            {row.rowName}
          </div>
        </div>
      </div>
    );
  };

  // 상단 본당 행 (A~N열)과 하단 행 (O~Q열) 분리
  const upperRows = UPLUS_STAGE_ROWS.filter((r) => !r.isAfterWalkway);
  const lowerRows = UPLUS_STAGE_ROWS.filter((r) => r.isAfterWalkway);

  return (
    <div className="w-full flex flex-col items-center">
      {/* 1. 최상단 타이틀 (주황색 박스 외부, 도면 상단에 위치) */}
      <div className="text-center mb-3">
        <h3 className="text-2xl sm:text-3xl font-black text-[#0B1E48] tracking-tight">
          U+ STAGE
        </h3>
        <p className="text-xs sm:text-sm font-semibold text-[#0B1E48] mt-0.5">
          End Stage
        </p>
      </div>

      {/* 2. 외곽 주황색 직사각형 프레임 및 하단 출입문/안내문구 영역 */}
      <div className="w-full max-w-[960px] flex flex-col items-center">
        
        {/* 주황색 직사각형 프레임 (도면 원본과 동일하게 얇은 2줄 더블 보더로 전체 객석을 감쌈) */}
        <div className="w-full border-4 border-double border-[#F97316] bg-white pt-5 pb-8 sm:pt-7 sm:pb-9 flex flex-col items-center space-y-6 shadow-xs">
          
          {/* 무대 박스 (STAGE 단독 표기) */}
          <div className="w-[440px] max-w-full py-2 bg-[#EBF1F6] border border-[#CBD5E1] rounded-[3px] text-center shadow-2xs">
            <div className="text-sm font-black tracking-widest text-[#0B1E48] uppercase">
              STAGE
            </div>
          </div>

          {/* 전체 객석 구역:
              BL(좌측), BR(우측), O·P·Q열(하단)이 하나의 끊김 없는 파란색 배경(#EBF3FA)으로 완벽하게 일체화되어 연결됩니다.
              좌/우 외곽선(border-l, border-r) 및 하단선(border-b)은 전체 구역을 하나로 감싸며,
              중앙 A~N열은 흰색 박스로 분리되어 A열 상단은 열려 있고, N열과 O열 사이의 파란색 선(border-b)은
              N열로부터 10px, O열로부터 10px로 완벽하게 동일한 간격(대칭)을 유지합니다. */}
          <div className="w-[888px] bg-[#EBF3FA] border-l border-r border-b border-[#7FA8D5] flex flex-col items-center">
            
            {/* 상단 섹션: 좌측 BL 구역(76px) + 중앙 A~N열 흰색 박스(736px) + 우측 BR 구역(76px) = 총 888px */}
            <div className="flex items-stretch w-full">
              
              {/* 좌측 발코니 (BL) - 76px 폭 (+1mm 추가 확장), 배경은 부모(#EBF3FA) 그대로, 상단에만 파란 테두리(border-t) 적용 */}
              <div className="w-[76px] shrink-0 flex flex-col items-center pt-2 border-t border-[#7FA8D5]">
                <div className="h-[20px] flex items-center justify-center text-xs font-black text-[#DC2626] tracking-wider select-none">
                  BL
                </div>
                {/* C열 높이(Row A+B = 62px)에 맞춰 1번 좌석이 시작되도록 34px 여백 적용 (20px + 8px pt + 34px = 62px) */}
                <div className="h-[34px] w-full shrink-0" aria-hidden="true" />
                {/* BL 01 ~ 12번 좌석 (각 좌석 26px + 간격 5px = 31px 피치로 C열~N열의 31px 피치와 1:1 완벽 정렬) */}
                <div className="flex flex-col gap-[5px] items-center">
                  {UPLUS_BALCONY_SEATS.map((n) => {
                    return renderSeatButton('1층', 'BL', n, {
                      isTwoDigit: true,
                      customWidthClass: 'w-[26px] h-[26px] text-[10px]',
                    });
                  })}
                </div>
                {/* 하단 여백: flex-1으로 중앙 흰색 박스의 N열 하단까지 파란 배경이 자연스럽게 이어짐 */}
                <div className="flex-1 w-full" />
              </div>

              {/* 중앙 A~N열 구역 (흰색 박스):
                  폭 736px, 좌우 테두리(border-l, border-r)로 BL/BR과 구분되며,
                  상단(A열 앞)은 완전히 개방(테두리 없음),
                  하단은 N열과 10px 떨어진 파란색 분할선(border-b)으로 마감됩니다. */}
              <div className="w-[736px] bg-white flex flex-col gap-[2px] items-center shrink-0 border-l border-r border-b border-[#7FA8D5] pb-[10px]">
                {upperRows.map((row) => renderUPlusRow(row))}
              </div>

              {/* 우측 발코니 (BR) - 76px 폭 (+1mm 추가 확장), 배경은 부모(#EBF3FA) 그대로, 상단에만 파란 테두리(border-t) 적용 */}
              <div className="w-[76px] shrink-0 flex flex-col items-center pt-2 border-t border-[#7FA8D5]">
                <div className="h-[20px] flex items-center justify-center text-xs font-black text-[#DC2626] tracking-wider select-none">
                  BR
                </div>
                {/* C열 높이에 맞춰 1번 좌석이 시작되도록 34px 여백 적용 */}
                <div className="h-[34px] w-full shrink-0" aria-hidden="true" />
                {/* BR 01 ~ 12번 좌석 (C열~N열과 1:1 수평 정렬) */}
                <div className="flex flex-col gap-[5px] items-center">
                  {UPLUS_BALCONY_SEATS.map((n) => {
                    return renderSeatButton('1층', 'BR', n, {
                      isTwoDigit: true,
                      customWidthClass: 'w-[26px] h-[26px] text-[10px]',
                    });
                  })}
                </div>
                {/* 하단 여백: flex-1으로 아래 O~Q열 파란 배경과 경계선 없이 직접 연결 */}
                <div className="flex-1 w-full" />
              </div>

            </div>

            {/* 하단 섹션: O~Q열 구역
                부모 컨테이너(#EBF3FA)의 파란색 배경 위에 바로 렌더링되므로, 좌측 BL 및 우측 BR에서
                하단으로 파란색 배경이 아무런 단절선이나 흰색 틈 없이 100% 매끄럽게 연결됩니다!
                중앙 분할선(border-b)으로부터 정확히 10px 거리를 두고 O열이 시작되어
                'N열 - 10px - 분할선 - 10px - O열'의 완벽한 상하 대칭 등간격이 구현됩니다. */}
            <div className="w-full flex flex-col gap-[2px] items-center pt-[10px] pb-3.5">
              {lowerRows.map((row) => renderUPlusRow(row))}
            </div>

          </div>

        </div>

        {/* 하단 출입문 게이트(도면 양개도어) 및 주황색 선 아래 안내 문구 영역 */}
        {/* 주황색 2줄 보더에 정확히 걸쳐있도록(-mt-[6px], relative z-10) 배치되며,
            왼쪽 문의 끝선은 1번 좌석의 왼쪽 끝선(left-[140px])에, 오른쪽 문의 끝선은 21번 좌석의 오른쪽 끝선(right-[140px])에 일치시킵니다. */}
        <div className="w-full flex justify-center -mt-[6px] relative z-10">
          <div className="w-[888px] relative flex items-start justify-center">
            {/* 좌측 게이트 출입문 (1번 좌석 왼쪽 끝선에 맞춰 정렬: left-[140px]) */}
            <div
              className="absolute left-[140px] top-0 shrink-0 select-none"
              title="1게이트 출입문 (1번 좌석 끝선 정렬)"
            >
              <GateDoorSymbol />
            </div>

            {/* 중앙 도면 주석 안내 문구: 주황색 선과의 간격 확보(pt-[22px]), 좌우 출입문 사이에 여유 있게 중앙 배치 */}
            <div className="w-[440px] text-center space-y-1.5 text-xs sm:text-[12.5px] text-slate-900 leading-snug pt-[22px]">
              <div className="font-bold whitespace-nowrap">
                1층 B, D, F, H, J, L, N열은 16번 좌석이 없으며, 15번과 17번이 연석입니다.
              </div>
              <div className="font-bold whitespace-nowrap">
                <span className="text-[#DC2626]">BL, BR, O, P, Q열</span>은{' '}
                <span className="text-blue-600">게이트 입장 후 계단으로 이동</span>{' '}
                가능합니다.
              </div>
            </div>

            {/* 우측 게이트 출입문 (21번 좌석 오른쪽 끝선에 맞춰 정렬: right-[140px]) */}
            <div
              className="absolute right-[140px] top-0 shrink-0 select-none"
              title="2게이트 출입문 (21번 좌석 끝선 정렬)"
            >
              <GateDoorSymbol />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
