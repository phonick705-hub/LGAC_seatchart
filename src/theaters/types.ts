export type TheaterId = 'signature' | 'uplus' | 'custom';

export interface TheaterOption {
  id: TheaterId;
  name: string;
  badge: string;
  fullName: string;
  venueLabel: string;
}

export const THEATER_OPTIONS: TheaterOption[] = [
  {
    id: 'signature',
    name: 'LG SIGNATURE Hall',
    badge: '대극장 (1·2·3층)',
    fullName: 'LG아트센터 서울, LG SIGNATURE Hall',
    venueLabel: 'LG SIGNATURE Hall',
  },
  {
    id: 'uplus',
    name: 'U+ STAGE (End Stage)',
    badge: '가변형 극장 (End Stage)',
    fullName: 'LG아트센터 서울, U+ STAGE (End Stage)',
    venueLabel: 'U+ STAGE (End Stage)',
  },
  {
    id: 'custom',
    name: '새 배치 만들기 (커스텀)',
    badge: '자유 캔버스 편집기',
    fullName: '자유 커스텀 극장 좌석 배치도',
    venueLabel: '자유 커스텀 극장',
  },
];

