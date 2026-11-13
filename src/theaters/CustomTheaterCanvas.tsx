import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MousePointer,
  Move,
  Plus,
  Trash2,
  Copy,
  RotateCcw,
  RotateCw,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Type,
  Square,
  Download,
  Upload,
  Sparkles,
  Sliders,
  Check,
  X,
  Layers,
  Palette,
  Columns,
  Eye,
  Settings,
  HelpCircle,
  FileCode,
  LayoutGrid,
  Save,
  AlertTriangle,
  Link2,
  Unlink,
  FilePlus2,
  LogIn,
  LogOut,
  Loader2,
  RefreshCw,
  Mail,
  History,
  ChevronDown,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  OperationType,
  handleFirestoreError,
  signInWithGoogleAutoFallback,
  isAuthSessionError,
  PendingAuthRedirectPayload,
  isAllowedCompanyUser,
  CompanyAccountRequiredError,
  COMPANY_AUTH_ERROR_MESSAGE,
  normalizeShareCode,
} from '../firebase';
import {
  CustomTheaterLayout,
  CustomSeat,
  CustomLabel,
  CustomLegendItem,
  CustomEditorTool,
  RowGeneratorConfig,
  SavedCustomLayout,
  SaveStatus,
} from './customTheaterTypes';
import {
  createBlankLayout,
  createLGSignatureHallCopy,
  createUPlusStageCopy,
  cloneLayoutWithNewIds,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SEAT_COLOR,
  DEFAULT_STAGE_BG_COLOR,
  DEFAULT_STAGE_TEXT_COLOR,
  DEFAULT_STAGE_BORDER_COLOR,
  DEFAULT_LABEL_TEXT_COLOR,
  isValidHexColor,
  getReadableTextColor,
  sanitizeAndMigrateLayout,
  generateValidFirestoreDocId,
  generateShareCode,
  stripUndefinedDeep,
} from './customTemplates';

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

interface CustomTheaterCanvasProps {
  seatGradeMap: Map<string, string>;
  gradeCustomNames?: Record<string, string>;
  getGradeStyle: (grade: string) => GradeStyle;
  cleanRowName: (raw: string) => string;
  normalizeGrade: (grade: string) => string;
  activeClickGrade: string | null;
  onSeatToggle?: (floor: string, row: string, seatNum: number, e: React.MouseEvent) => void;
  showToast?: (message: string) => void;
  authUser?: User | null;
  authReady?: boolean;
  pendingRedirectAction?: PendingAuthRedirectPayload | null;
  onConsumePendingRedirectAction?: () => void;
  redirectAuthError?: string | null;
  onClearRedirectAuthError?: () => void;
  onAuthUserUpdated?: (user: User | null) => void;
  onAuthError?: (message: string | null) => void;
  onRequestSignOut?: () => void;
  pendingShareCode?: string | null;
  onConsumePendingShareCode?: () => void;
}

const LOCAL_STORAGE_KEY = 'custom_theater_layout_v1';
const CUSTOM_AUTOSAVE_DRAFT_KEY = 'custom_theater_autosave_draft_v1';
const RECENT_COLORS_STORAGE_KEY = 'custom_theater_recent_colors_v1';
const AVAILABLE_GRADES = ['VIP석', 'R석', 'S석', 'A석', 'B석', '판매금지석'];
const SNAP_SIZE_OPTIONS = [20, 10, 5, 1] as const;
type SnapSizeOption = (typeof SNAP_SIZE_OPTIONS)[number];
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type StageColorTarget = 'bgColor' | 'color' | 'borderColor';
const MIN_STAGE_SIZE = 40;

interface CustomAutosaveDraft {
  savedAt: string;
  docId: string | null;
  shareCode?: string;
  layout: CustomTheaterLayout;
  reason?: 'edit' | 'session_expired' | 'redirect';
}

const readAutosaveDraft = (): CustomAutosaveDraft | null => {
  try {
    const raw = localStorage.getItem(CUSTOM_AUTOSAVE_DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CustomAutosaveDraft>;
      if (parsed && parsed.layout && Array.isArray(parsed.layout.seats)) {
        const { layout: migrated } = sanitizeAndMigrateLayout(parsed.layout);
        const docId =
          typeof parsed.docId === 'string' && /^[a-zA-Z0-9_\-]+$/.test(parsed.docId)
            ? parsed.docId
            : null;
        return {
          savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
          docId,
          shareCode: typeof parsed.shareCode === 'string' ? parsed.shareCode : migrated.shareCode,
          layout: migrated,
          reason: parsed.reason,
        };
      }
    }
  } catch (e) {
    console.warn('Failed to read autosave draft:', e);
  }
  return null;
};

const writeAutosaveDraft = (
  draftLayout: CustomTheaterLayout,
  docId: string | null,
  reason: CustomAutosaveDraft['reason'] = 'edit'
): void => {
  try {
    const payload: CustomAutosaveDraft = {
      savedAt: new Date().toISOString(),
      docId,
      shareCode: draftLayout.shareCode,
      layout: draftLayout,
      reason,
    };
    localStorage.setItem(CUSTOM_AUTOSAVE_DRAFT_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to write autosave draft:', e);
  }
};

const clearAutosaveDraft = (): void => {
  try {
    localStorage.removeItem(CUSTOM_AUTOSAVE_DRAFT_KEY);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear autosave draft:', e);
  }
};

const getLayoutContentSignature = (l: CustomTheaterLayout): string =>
  JSON.stringify({
    name: l.name,
    canvasWidth: l.canvasWidth,
    canvasHeight: l.canvasHeight,
    gridSize: l.gridSize ?? 20,
    snapToGrid: l.snapToGrid !== false,
    seats: l.seats,
    labels: l.labels,
    legend: l.legend || [],
  });

const buildCopyName = (rawName?: string): string => {
  const base = (rawName || '').trim() || '새 커스텀 좌석배치도';
  return base.endsWith('복사본') ? base : `${base} 복사본`;
};

const getUniqueLayoutName = (baseName: string, existingNames: string[]): string => {
  const trimmed = baseName.trim() || '새 커스텀 좌석배치도';
  const nameSet = new Set(existingNames.map((n) => n.trim()));
  if (!nameSet.has(trimmed)) return trimmed;
  let suffix = 2;
  while (nameSet.has(`${trimmed} (${suffix})`)) {
    suffix += 1;
  }
  return `${trimmed} (${suffix})`;
};

const parseFirestoreTimestampIso = (val: unknown): string => {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val) {
    return val;
  }
  return new Date().toISOString();
};

const COLOR_PRESET_PALETTE: Array<{ hex: string; name: string }> = [
  { hex: '#7c3aed', name: '보라' },
  { hex: '#2563eb', name: '파랑' },
  { hex: '#0891b2', name: '청록' },
  { hex: '#16a34a', name: '초록' },
  { hex: '#eab308', name: '노랑' },
  { hex: '#ea580c', name: '주황' },
  { hex: '#dc2626', name: '빨강' },
  { hex: '#ec4899', name: '분홍' },
  { hex: '#475569', name: '진회색' },
  { hex: '#ffffff', name: '흰색' },
];

export const CustomTheaterCanvas: React.FC<CustomTheaterCanvasProps> = ({
  seatGradeMap,
  gradeCustomNames,
  getGradeStyle,
  cleanRowName,
  normalizeGrade,
  activeClickGrade,
  onSeatToggle,
  showToast = (msg: string) => console.log(msg),
  authUser: authUserProp,
  authReady: authReadyProp,
  pendingRedirectAction,
  onConsumePendingRedirectAction,
  redirectAuthError,
  onClearRedirectAuthError,
  onAuthUserUpdated,
  onAuthError,
  onRequestSignOut,
  pendingShareCode,
  onConsumePendingShareCode,
}) => {
  // 1. Layout State & Document Identity (always starts clean; prompts if autosave draft exists)
  const [initialBootstrap] = useState<{
    layout: CustomTheaterLayout;
    savedSig: string;
    initialDraft: CustomAutosaveDraft | null;
  }>(() => {
    const blank = createBlankLayout();
    const existingDraft = readAutosaveDraft();
    return {
      layout: blank,
      savedSig: getLayoutContentSignature(blank),
      initialDraft: existingDraft,
    };
  });

  const [layout, setLayout] = useState<CustomTheaterLayout>(initialBootstrap.layout);
  const [currentLayoutId, setCurrentLayoutId] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string>(
    initialBootstrap.savedSig
  );
  const [pendingDraftRecovery, setPendingDraftRecovery] =
    useState<CustomAutosaveDraft | null>(() => {
      if (
        pendingShareCode ||
        (pendingRedirectAction && pendingRedirectAction.action !== 'loginOnly')
      ) {
        return null;
      }
      return initialBootstrap.initialDraft;
    });

  // Firebase Auth & Cloud Firestore Saved Layouts ("내 배치도")
  const [internalUser, setInternalUser] = useState<User | null>(() => auth.currentUser);
  const [internalAuthReady, setInternalAuthReady] = useState<boolean>(
    authReadyProp !== undefined ? authReadyProp : false
  );
  const user = authUserProp !== undefined ? authUserProp : internalUser;
  const authReady = authReadyProp !== undefined ? authReadyProp : internalAuthReady;

  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [isReauthPrompt, setIsReauthPrompt] = useState<boolean>(false);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [savedLayouts, setSavedLayouts] = useState<SavedCustomLayout[]>([]);
  const [isLoadingSavedLayouts, setIsLoadingSavedLayouts] = useState<boolean>(false);
  const [savedLayoutsError, setSavedLayoutsError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Recent colors list
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_COLORS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((c) => isValidHexColor(c)).map((c) => c.toLowerCase()).slice(0, 8);
        }
      }
    } catch (e) {
      console.warn('Failed to load recent colors', e);
    }
    return [];
  });

  // 2. Undo / Redo History Stack
  const [history, setHistory] = useState<CustomTheaterLayout[]>([]);
  const [future, setFuture] = useState<CustomTheaterLayout[]>([]);

  // 3. Editor Viewport & Tools
  const [currentTool, setCurrentTool] = useState<CustomEditorTool>('select');
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(() => layout.snapToGrid !== false);
  const [snapSize, setSnapSize] = useState<SnapSizeOption>(() => {
    const g = layout.gridSize;
    return SNAP_SIZE_OPTIONS.includes(g as SnapSizeOption) ? (g as SnapSizeOption) : 20;
  });

  // 4. Selection State
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());

  // Clipboard for copy-paste
  const [clipboard, setClipboard] = useState<{
    seats: CustomSeat[];
    labels: CustomLabel[];
  } | null>(null);

  // 5. Interactive Drag, Resize & Marquee State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number; y: number } | null>(null);

  const [isDraggingElements, setIsDraggingElements] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [elementInitialPositions, setElementInitialPositions] = useState<{
    seats: Map<string, { x: number; y: number }>;
    labels: Map<string, { x: number; y: number }>;
  } | null>(null);

  const [resizingStage, setResizingStage] = useState<{
    labelId: string;
    handle: ResizeHandle;
    initialX: number;
    initialY: number;
    initialWidth: number;
    initialHeight: number;
    rotation: number;
    startCanvasX: number;
    startCanvasY: number;
  } | null>(null);

  const [stageWidthInput, setStageWidthInput] = useState<string>('');
  const [stageHeightInput, setStageHeightInput] = useState<string>('');

  // Color inspector & Legend UI state
  const [stageColorTarget, setStageColorTarget] = useState<StageColorTarget>('bgColor');
  const [hexColorInput, setHexColorInput] = useState<string>('#7c3aed');
  const [hexColorError, setHexColorError] = useState<boolean>(false);
  const [legendLabelDraft, setLegendLabelDraft] = useState<string>('');

  // 6. Row Generator Dialog Modal
  const [showRowGenerator, setShowRowGenerator] = useState<boolean>(false);
  const [rowGenConfig, setRowGenConfig] = useState<RowGeneratorConfig>({
    floor: '1층',
    rowName: '5열',
    seatCount: 20,
    startNumber: 1,
    numberDirection: 'asc',
    spacing: 30,
    shape: 'straight',
    curveRadius: 400,
    curveAngle: 60,
    startX: 310,
    startY: 380,
    grade: 'VIP석',
  });

  // 7. Template Select Dropdown & Modals
  const [showTemplateMenu, setShowTemplateMenu] = useState<boolean>(false);
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [saveModalMode, setSaveModalMode] = useState<'first_save' | 'save_as'>('first_save');
  const [saveNameInput, setSaveNameInput] = useState<string>('');
  const [showShareCodeModal, setShowShareCodeModal] = useState<boolean>(false);
  const [shareCodeInput, setShareCodeInput] = useState<string>('');
  const [shareCodeError, setShareCodeError] = useState<string | null>(null);
  const [isLoadingShareCode, setIsLoadingShareCode] = useState<boolean>(false);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // File upload input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const isSpacePressedRef = useRef<boolean>(false);

  const dragAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const preDragLayoutRef = useRef<CustomTheaterLayout | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const preResizeLayoutRef = useRef<CustomTheaterLayout | null>(null);
  const hasResizedRef = useRef<boolean>(false);
  const marqueeBaseSelectionRef = useRef<{ seats: Set<string>; labels: Set<string> }>({
    seats: new Set(),
    labels: new Set(),
  });
  const isEditingStageDimRef = useRef<boolean>(false);
  const preStageInputLayoutRef = useRef<CustomTheaterLayout | null>(null);
  const colorPickerSessionPushedRef = useRef<boolean>(false);
  const preLegendEditLayoutRef = useRef<CustomTheaterLayout | null>(null);
  const preTitleEditLayoutRef = useRef<CustomTheaterLayout | null>(null);
  const pendingAuthActionRef = useRef<{
    type: 'save' | 'saveAs' | 'retrySave' | 'openMyLayouts' | 'openShareCodeModal' | 'loginOnly';
    saveParams?: {
      targetId: string | null;
      targetName: string;
      isNewDoc: boolean;
      existingShareCode?: string;
    };
  } | null>(null);
  const lastFailedSaveRef = useRef<((overrideUser?: User) => Promise<void>) | null>(null);
  const errorSignatureRef = useRef<string | null>(null);
  const handleSaveTriggerRef = useRef<() => void>(() => {});
  const currentLayoutIdRef = useRef<string | null>(currentLayoutId);
  currentLayoutIdRef.current = currentLayoutId;
  const justCreatedDocIdRef = useRef<string | null>(null);
  const latestLayoutRef = useRef<CustomTheaterLayout>(layout);
  latestLayoutRef.current = layout;

  const currentSignature = useMemo(() => getLayoutContentSignature(layout), [layout]);
  const isDirty = currentSignature !== savedSignature;
  const isDirtyRef = useRef<boolean>(isDirty);
  isDirtyRef.current = isDirty;

  const effectiveSaveStatus: SaveStatus = useMemo(() => {
    if (saveStatus === 'saving') return 'saving';
    if (saveStatus === 'error') return 'error';
    if (isDirty) return 'modified';
    return 'saved';
  }, [saveStatus, isDirty]);

  // Clear previous save error indicator once user edits the canvas further
  useEffect(() => {
    if (
      saveStatus === 'error' &&
      errorSignatureRef.current !== null &&
      currentSignature !== errorSignatureRef.current
    ) {
      setSaveStatus('saved');
      setSaveErrorMessage(null);
      errorSignatureRef.current = null;
    }
  }, [currentSignature, saveStatus]);

  // Auto-save unsaved edits to localStorage (debounced on change + every 30s + beforeunload)
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      writeAutosaveDraft(layout, currentLayoutId, 'edit');
    }, 800);
    return () => clearTimeout(timer);
  }, [layout, currentLayoutId, isDirty]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirtyRef.current) {
        writeAutosaveDraft(latestLayoutRef.current, currentLayoutIdRef.current, 'edit');
      }
    }, 30000);

    const handleBeforeUnload = () => {
      if (isDirtyRef.current) {
        writeAutosaveDraft(latestLayoutRef.current, currentLayoutIdRef.current, 'edit');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      if (isDirtyRef.current) {
        writeAutosaveDraft(latestLayoutRef.current, currentLayoutIdRef.current, 'edit');
      }
    };
  }, []);

  // Surface redirect auth error if returned from signInWithRedirect with an error
  useEffect(() => {
    if (redirectAuthError) {
      setIsReauthPrompt(false);
      setAuthErrorMessage(redirectAuthError);
      setShowAuthModal(true);
      onClearRedirectAuthError?.();
    }
  }, [redirectAuthError, onClearRedirectAuthError]);

  // Subscribe to Firebase Authentication state only if not provided by App root
  useEffect(() => {
    if (authUserProp !== undefined && authReadyProp !== undefined) return;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser && !isAllowedCompanyUser(nextUser)) {
        try {
          await signOut(auth);
        } catch {
          // ignore
        }
        setInternalUser(null);
        setAuthErrorMessage(COMPANY_AUTH_ERROR_MESSAGE);
        setInternalAuthReady(true);
        return;
      }
      setInternalUser(nextUser);
      setInternalAuthReady(true);
    });
    return () => unsubscribe();
  }, [authUserProp, authReadyProp]);

  const prevUserUidRef = useRef<string | null>(user?.uid ?? null);
  useEffect(() => {
    const prevUid = prevUserUidRef.current;
    const nextUid = user?.uid ?? null;
    prevUserUidRef.current = nextUid;
    if (prevUid && !nextUid && currentLayoutIdRef.current) {
      justCreatedDocIdRef.current = null;
      setCurrentLayoutId(null);
      setLayout((prev) => ({
        ...prev,
        savedId: undefined,
        shareCode: undefined,
      }));
      const l = latestLayoutRef.current;
      const hasWork =
        l.seats.length > 0 ||
        l.labels.some((lbl) => !lbl.isStageBanner) ||
        (l.legend?.length || 0) > 0;
      setSavedSignature(hasWork ? '' : getLayoutContentSignature(l));
    }
  }, [user]);

  const sortSavedLayoutsDesc = useCallback((list: SavedCustomLayout[]): SavedCustomLayout[] => {
    return [...list].sort(
      (a, b) =>
        new Date(b.updatedAt || b.savedAt).getTime() -
        new Date(a.updatedAt || a.savedAt).getTime()
    );
  }, []);

  const upsertSavedLayoutItem = useCallback(
    (savedItem: SavedCustomLayout) => {
      setSavedLayouts((prev) => {
        const filtered = prev.filter((item) => item.id !== savedItem.id);
        return sortSavedLayoutsDesc([savedItem, ...filtered]);
      });
    },
    [sortSavedLayoutsDesc]
  );

  const parseLayoutDocSnapshot = useCallback(
    (docId: string, data: Record<string, unknown>): SavedCustomLayout | null => {
      try {
        const createdIso = parseFirestoreTimestampIso(data.createdAt);
        const updatedIso = parseFirestoreTimestampIso(data.updatedAt || data.createdAt);
        const { layout: sanitized } = sanitizeAndMigrateLayout({
          version: typeof data.version === 'number' ? data.version : CURRENT_SCHEMA_VERSION,
          schemaVersion:
            typeof data.schemaVersion === 'number'
              ? data.schemaVersion
              : CURRENT_SCHEMA_VERSION,
          name: typeof data.name === 'string' ? data.name : '새 커스텀 좌석배치도',
          savedId: docId,
          shareCode: typeof data.shareCode === 'string' ? data.shareCode : undefined,
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
        sanitized.shareCode =
          typeof data.shareCode === 'string' ? data.shareCode : sanitized.shareCode;

        return {
          id: docId,
          name: sanitized.name,
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
    },
    []
  );

  const refreshSavedLayouts = useCallback(
    async (targetUser?: User | null) => {
      const activeUser = targetUser ?? user ?? auth.currentUser;
      if (!activeUser || !isAllowedCompanyUser(activeUser)) return;
      setIsLoadingSavedLayouts(true);
      setSavedLayoutsError(null);
      try {
        const layoutsQuery = query(
          collection(db, 'theaterLayouts'),
          where('ownerId', '==', activeUser.uid)
        );
        const snapshot = await getDocs(layoutsQuery);
        const items = snapshot.docs
          .map((docSnap) =>
            parseLayoutDocSnapshot(docSnap.id, docSnap.data() as Record<string, unknown>)
          )
          .filter((item): item is SavedCustomLayout => item !== null);
        setSavedLayouts((prev) => {
          const pendingId = justCreatedDocIdRef.current;
          if (pendingId && !items.some((item) => item.id === pendingId)) {
            const optimistic = prev.find((item) => item.id === pendingId);
            if (optimistic) {
              return sortSavedLayoutsDesc([optimistic, ...items]);
            }
          }
          if (pendingId && items.some((item) => item.id === pendingId)) {
            justCreatedDocIdRef.current = null;
          }
          return sortSavedLayoutsDesc(items);
        });
        setSavedLayoutsError(null);
      } catch (err) {
        setSavedLayoutsError('내 배치도 목록을 불러오지 못했습니다.');
        try {
          handleFirestoreError(err, OperationType.LIST, 'theaterLayouts');
        } catch {
          // Logged via handleFirestoreError; keep UI functional
        }
      } finally {
        setIsLoadingSavedLayouts(false);
      }
    },
    [parseLayoutDocSnapshot, sortSavedLayoutsDesc, user]
  );

  // Subscribe to Firestore "내 배치도" collection for the signed-in user
  useEffect(() => {
    if (!authReady) return;
    if (!user || !isAllowedCompanyUser(user)) {
      setSavedLayouts([]);
      setSavedLayoutsError(null);
      setIsLoadingSavedLayouts(false);
      return;
    }

    let isEffectActive = true;
    setIsLoadingSavedLayouts(true);
    setSavedLayoutsError(null);
    const layoutsQuery = query(
      collection(db, 'theaterLayouts'),
      where('ownerId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      layoutsQuery,
      (snapshot) => {
        if (!isEffectActive) return;
        const items = snapshot.docs
          .map((docSnap) =>
            parseLayoutDocSnapshot(docSnap.id, docSnap.data() as Record<string, unknown>)
          )
          .filter((item): item is SavedCustomLayout => item !== null);

        const pendingCreatedId = justCreatedDocIdRef.current;
        const hasPendingCreated = pendingCreatedId
          ? items.some((item) => item.id === pendingCreatedId)
          : false;
        if (pendingCreatedId && hasPendingCreated) {
          justCreatedDocIdRef.current = null;
        }

        setSavedLayouts((prev) => {
          if (
            snapshot.metadata.fromCache &&
            pendingCreatedId &&
            !hasPendingCreated
          ) {
            const optimistic = prev.find((item) => item.id === pendingCreatedId);
            if (optimistic) {
              return sortSavedLayoutsDesc([optimistic, ...items]);
            }
          }
          return sortSavedLayoutsDesc(items);
        });
        setSavedLayoutsError(null);
        setIsLoadingSavedLayouts(false);

        const activeId = currentLayoutIdRef.current;
        if (
          activeId &&
          !snapshot.metadata.fromCache &&
          justCreatedDocIdRef.current !== activeId &&
          !items.some((item) => item.id === activeId)
        ) {
          setCurrentLayoutId(null);
          setSavedSignature('');
          setLayout((prev) => ({
            ...prev,
            savedId: undefined,
            shareCode: undefined,
          }));
        }
      },
      (err) => {
        if (!isEffectActive) return;
        setIsLoadingSavedLayouts(false);
        setSavedLayoutsError('내 배치도 목록을 불러오지 못했습니다.');
        try {
          handleFirestoreError(err, OperationType.LIST, 'theaterLayouts');
        } catch {
          // Logged via handleFirestoreError; keep UI functional
        }
        // Attempt a one-time getDocs fallback in case watch stream errored transiently
        void (async () => {
          try {
            const fallbackSnap = await getDocs(layoutsQuery);
            if (!isEffectActive) return;
            const fallbackItems = fallbackSnap.docs
              .map((docSnap) =>
                parseLayoutDocSnapshot(docSnap.id, docSnap.data() as Record<string, unknown>)
              )
              .filter((item): item is SavedCustomLayout => item !== null);
            setSavedLayouts((prev) => {
              const pendingId = justCreatedDocIdRef.current;
              if (pendingId && !fallbackItems.some((item) => item.id === pendingId)) {
                const optimistic = prev.find((item) => item.id === pendingId);
                if (optimistic) {
                  return sortSavedLayoutsDesc([optimistic, ...fallbackItems]);
                }
              }
              return sortSavedLayoutsDesc(fallbackItems);
            });
            setSavedLayoutsError(null);
          } catch {
            // Keep error banner so user can manually retry
          }
        })();
      }
    );

    return () => {
      isEffectActive = false;
      unsubscribe();
    };
  }, [authReady, user, parseLayoutDocSnapshot, sortSavedLayoutsDesc]);

  const loadLayoutByShareCode = useCallback(
    async (
      rawCode: string,
      activeUser: User,
      options?: { isCancelled?: () => boolean }
    ): Promise<{ ok: boolean; error?: string }> => {
      const normalized = normalizeShareCode(rawCode);
      if (!normalized) {
        return { ok: false, error: '올바른 공유 코드 형식이 아닙니다.' };
      }
      if (!isAllowedCompanyUser(activeUser)) {
        return { ok: false, error: COMPANY_AUTH_ERROR_MESSAGE };
      }

      try {
        const shareQuery = query(
          collection(db, 'theaterLayouts'),
          where('shareCode', '==', normalized),
          limit(1)
        );
        const snap = await getDocs(shareQuery);
        if (options?.isCancelled?.()) return { ok: false };

        if (snap.empty) {
          return {
            ok: false,
            error: `공유 코드 '${normalized}'에 해당하는 배치도를 찾을 수 없습니다.`,
          };
        }

        const docSnap = snap.docs[0];
        const data = docSnap.data();
        const updatedIso = parseFirestoreTimestampIso(data.updatedAt || data.createdAt);
        const { layout: sanitized } = sanitizeAndMigrateLayout({
          version: typeof data.version === 'number' ? data.version : CURRENT_SCHEMA_VERSION,
          schemaVersion:
            typeof data.schemaVersion === 'number'
              ? data.schemaVersion
              : CURRENT_SCHEMA_VERSION,
          name: typeof data.name === 'string' ? data.name : '공유 좌석배치도',
          savedId: docSnap.id,
          shareCode: typeof data.shareCode === 'string' ? data.shareCode : normalized,
          updatedAt: updatedIso,
          canvasWidth: typeof data.canvasWidth === 'number' ? data.canvasWidth : 1200,
          canvasHeight: typeof data.canvasHeight === 'number' ? data.canvasHeight : 800,
          gridSize: typeof data.gridSize === 'number' ? data.gridSize : 20,
          snapToGrid: data.snapToGrid !== false,
          seats: Array.isArray(data.seats) ? data.seats : [],
          labels: Array.isArray(data.labels) ? data.labels : [],
          legend: Array.isArray(data.legend) ? data.legend : [],
        });

        const isOwner = data.ownerId === activeUser.uid;
        const nextSnapSize = SNAP_SIZE_OPTIONS.includes(sanitized.gridSize as SnapSizeOption)
          ? (sanitized.gridSize as SnapSizeOption)
          : 20;

        setPendingDraftRecovery(null);
        setSnapSize(nextSnapSize);
        setSnapToGrid(sanitized.snapToGrid !== false);
        setSelectedSeatIds(new Set());
        setSelectedLabelIds(new Set());
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
        setSaveStatus('saved');
        setSaveErrorMessage(null);
        errorSignatureRef.current = null;

        if (isOwner) {
          sanitized.savedId = docSnap.id;
          sanitized.shareCode =
            typeof data.shareCode === 'string' ? data.shareCode : normalized;
          setCurrentLayoutId(docSnap.id);
          setSavedSignature(getLayoutContentSignature(sanitized));
          setLayout(sanitized);
          setHistory([]);
          setFuture([]);
          showToast(`공유 배치도 '${sanitized.name}'을(를) 불러왔습니다.`);
        } else {
          const sharedCopy = cloneLayoutWithNewIds(sanitized, {
            newName: sanitized.name,
            preserveSavedId: false,
          });
          setCurrentLayoutId(null);
          setSavedSignature('');
          setLayout(sharedCopy);
          setHistory([]);
          setFuture([]);
          showToast(
            `공유 배치도 '${sharedCopy.name}'을(를) 불러왔습니다. 수정 후 [저장]하면 내 배치도로 저장됩니다.`
          );
        }

        return { ok: true };
      } catch (err) {
        if (!options?.isCancelled?.()) {
          try {
            handleFirestoreError(err, OperationType.LIST, 'theaterLayouts');
          } catch {
            // Logged via handleFirestoreError
          }
        }
        return {
          ok: false,
          error: '공유 코드로 배치도를 불러오는 중 오류가 발생했습니다.',
        };
      }
    },
    []
  );

  // Auto-open shared layout when ?code=XXXXXX was requested before/after login
  const loadingShareCodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authReady || !user || !isAllowedCompanyUser(user) || !pendingShareCode) return;
    if (loadingShareCodeRef.current === pendingShareCode) return;
    loadingShareCodeRef.current = pendingShareCode;

    let cancelled = false;
    (async () => {
      try {
        const result = await loadLayoutByShareCode(pendingShareCode, user, {
          isCancelled: () => cancelled,
        });
        if (cancelled) return;
        onConsumePendingShareCode?.();
        if (!result.ok && result.error) {
          showToast(result.error);
        }
      } finally {
        if (!cancelled && loadingShareCodeRef.current === pendingShareCode) {
          loadingShareCodeRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (loadingShareCodeRef.current === pendingShareCode) {
        loadingShareCodeRef.current = null;
      }
    };
  }, [authReady, user, pendingShareCode, loadLayoutByShareCode]);

  // Persist recent colors list to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(recentColors));
    } catch (e) {
      console.warn('Failed to persist recent colors', e);
    }
  }, [recentColors]);

  // Close template menu when clicking outside
  useEffect(() => {
    if (!showTemplateMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target as Node)) {
        setShowTemplateMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTemplateMenu]);

  // Push snapshot to undo history
  const pushHistory = useCallback(
    (newLayout: CustomTheaterLayout) => {
      setHistory((prev) => [...prev.slice(-30), layout]);
      setFuture([]);
      setLayout(newLayout);
    },
    [layout]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setFuture((prev) => [layout, ...prev]);
    setLayout(previous);
    setSelectedSeatIds(new Set());
    setSelectedLabelIds(new Set());
    showToast('실행 취소 되었습니다.');
  }, [history, layout, showToast]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setHistory((prev) => [...prev, layout]);
    setLayout(next);
    setSelectedSeatIds(new Set());
    setSelectedLabelIds(new Set());
    showToast('다시 실행 되었습니다.');
  }, [future, layout, showToast]);

  // Selected count helpers
  const totalSelectedCount = selectedSeatIds.size + selectedLabelIds.size;
  const singleSelectedSeat =
    selectedSeatIds.size === 1 && selectedLabelIds.size === 0
      ? layout.seats.find((s) => selectedSeatIds.has(s.id))
      : null;
  const singleSelectedLabel =
    selectedLabelIds.size === 1 && selectedSeatIds.size === 0
      ? layout.labels.find((l) => selectedLabelIds.has(l.id))
      : null;

  // Keep STAGE dimension inputs synced with selection when not actively typing
  useEffect(() => {
    if (singleSelectedLabel?.isStageBanner && !isEditingStageDimRef.current) {
      setStageWidthInput(String(Math.round(singleSelectedLabel.width || 360)));
      setStageHeightInput(String(Math.round(singleSelectedLabel.height || 36)));
    }
  }, [
    singleSelectedLabel?.id,
    singleSelectedLabel?.width,
    singleSelectedLabel?.height,
    singleSelectedLabel?.isStageBanner,
  ]);

  // Active color derived from current selection
  const activeElementColor = useMemo(() => {
    if (selectedSeatIds.size > 0) {
      const firstSelected = layout.seats.find((s) => selectedSeatIds.has(s.id));
      if (firstSelected) {
        if (isValidHexColor(firstSelected.color)) {
          return firstSelected.color.toLowerCase();
        }
        if (firstSelected.grade) {
          const gs = getGradeStyle(firstSelected.grade);
          if (isValidHexColor(gs?.hex)) return gs.hex.toLowerCase();
        }
      }
      return DEFAULT_SEAT_COLOR;
    }
    if (singleSelectedLabel?.isStageBanner) {
      if (stageColorTarget === 'bgColor') {
        return isValidHexColor(singleSelectedLabel.bgColor)
          ? singleSelectedLabel.bgColor.toLowerCase()
          : DEFAULT_STAGE_BG_COLOR;
      }
      if (stageColorTarget === 'color') {
        return isValidHexColor(singleSelectedLabel.color)
          ? singleSelectedLabel.color.toLowerCase()
          : DEFAULT_STAGE_TEXT_COLOR;
      }
      return isValidHexColor(singleSelectedLabel.borderColor)
        ? singleSelectedLabel.borderColor.toLowerCase()
        : DEFAULT_STAGE_BORDER_COLOR;
    }
    if (singleSelectedLabel) {
      return isValidHexColor(singleSelectedLabel.color)
        ? singleSelectedLabel.color.toLowerCase()
        : DEFAULT_LABEL_TEXT_COLOR;
    }
    return '#7c3aed';
  }, [
    selectedSeatIds,
    layout.seats,
    singleSelectedLabel,
    stageColorTarget,
    getGradeStyle,
  ]);

  useEffect(() => {
    setHexColorInput(activeElementColor.toUpperCase());
    setHexColorError(false);
  }, [activeElementColor]);

  const addRecentColor = useCallback((hex: string) => {
    if (!isValidHexColor(hex)) return;
    const normalized = hex.trim().toLowerCase();
    setRecentColors((prev) => [normalized, ...prev.filter((c) => c !== normalized)].slice(0, 8));
  }, []);

  // Apply color to selected seats, STAGE target, or labels (1 Undo step)
  const applyColorToSelection = useCallback(
    (rawHex: string, options?: { recordUndo?: boolean; addRecent?: boolean }) => {
      if (!isValidHexColor(rawHex)) return;
      const hex = rawHex.trim().toLowerCase();
      const recordUndo = options?.recordUndo !== false;
      const addRecent = options?.addRecent !== false;

      let nextLayout: CustomTheaterLayout | null = null;

      if (selectedSeatIds.size > 0) {
        nextLayout = {
          ...layout,
          seats: layout.seats.map((s) =>
            selectedSeatIds.has(s.id) ? { ...s, color: hex } : s
          ),
          updatedAt: new Date().toISOString(),
        };
      } else if (singleSelectedLabel?.isStageBanner) {
        nextLayout = {
          ...layout,
          labels: layout.labels.map((l) => {
            if (l.id !== singleSelectedLabel.id) return l;
            if (stageColorTarget === 'bgColor') {
              return {
                ...l,
                bgColor: hex,
                color: getReadableTextColor(hex),
              };
            }
            if (stageColorTarget === 'color') {
              return { ...l, color: hex };
            }
            return { ...l, borderColor: hex };
          }),
          updatedAt: new Date().toISOString(),
        };
      } else if (selectedLabelIds.size > 0) {
        nextLayout = {
          ...layout,
          labels: layout.labels.map((l) =>
            selectedLabelIds.has(l.id) ? { ...l, color: hex } : l
          ),
          updatedAt: new Date().toISOString(),
        };
      }

      if (!nextLayout) return;

      if (recordUndo) {
        pushHistory(nextLayout);
      } else {
        if (!colorPickerSessionPushedRef.current) {
          setHistory((prev) => [...prev.slice(-30), layout]);
          setFuture([]);
          colorPickerSessionPushedRef.current = true;
        }
        setLayout(nextLayout);
      }

      if (addRecent) {
        addRecentColor(hex);
      }
    },
    [
      layout,
      selectedSeatIds,
      selectedLabelIds,
      singleSelectedLabel,
      stageColorTarget,
      pushHistory,
      addRecentColor,
    ]
  );

  const handleResetColorToDefault = () => {
    if (selectedSeatIds.size > 0) {
      pushHistory({
        ...layout,
        seats: layout.seats.map((s) =>
          selectedSeatIds.has(s.id) ? { ...s, color: undefined } : s
        ),
        updatedAt: new Date().toISOString(),
      });
      showToast('선택된 좌석의 색상이 기본색으로 복원되었습니다.');
      return;
    }

    if (singleSelectedLabel?.isStageBanner) {
      pushHistory({
        ...layout,
        labels: layout.labels.map((l) =>
          l.id === singleSelectedLabel.id
            ? {
                ...l,
                bgColor: DEFAULT_STAGE_BG_COLOR,
                color: DEFAULT_STAGE_TEXT_COLOR,
                borderColor: DEFAULT_STAGE_BORDER_COLOR,
              }
            : l
        ),
        updatedAt: new Date().toISOString(),
      });
      showToast('STAGE 색상이 기본색으로 복원되었습니다.');
      return;
    }

    if (selectedLabelIds.size > 0) {
      pushHistory({
        ...layout,
        labels: layout.labels.map((l) =>
          selectedLabelIds.has(l.id) ? { ...l, color: DEFAULT_LABEL_TEXT_COLOR } : l
        ),
        updatedAt: new Date().toISOString(),
      });
      showToast('선택된 라벨 색상이 기본색으로 복원되었습니다.');
    }
  };

  const requestApplyColorToAllSeats = () => {
    const activeSeatsCount = layout.seats.filter((s) => !s.isDisabled).length;
    if (activeSeatsCount === 0) {
      showToast('적용할 좌석이 없습니다.');
      return;
    }

    const candidateHex = hexColorInput.trim().startsWith('#')
      ? hexColorInput.trim()
      : `#${hexColorInput.trim()}`;
    const targetHex = isValidHexColor(candidateHex)
      ? candidateHex.toLowerCase()
      : activeElementColor;

    setPendingConfirmAction({
      title: '전체 좌석에 색상 일괄 적용',
      message: `선택한 색상(${targetHex.toUpperCase()})을 캔버스의 전체 좌석(${activeSeatsCount}석)에 일괄 적용하시겠습니까?`,
      confirmLabel: '전체 적용',
      onConfirm: () => {
        pushHistory({
          ...layout,
          seats: layout.seats.map((s) =>
            s.isDisabled ? s : { ...s, color: targetHex }
          ),
          updatedAt: new Date().toISOString(),
        });
        addRecentColor(targetHex);
        showToast(`전체 좌석 ${activeSeatsCount}석에 ${targetHex.toUpperCase()} 색상이 적용되었습니다.`);
      },
    });
  };

  const handleHexInputCommit = (rawValue: string) => {
    const trimmed = rawValue.trim();
    const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (isValidHexColor(candidate)) {
      setHexColorError(false);
      setHexColorInput(candidate.toUpperCase());
      applyColorToSelection(candidate, { recordUndo: true, addRecent: true });
    } else {
      setHexColorError(true);
      showToast('올바른 #RRGGBB 형식(예: #7C3AED)을 입력해 주세요.');
    }
  };

  // Legend CRUD handlers (1 Undo step each)
  const handleAddLegendItem = (colorOverride?: string, labelOverride?: string) => {
    const candidateColor = colorOverride || activeElementColor;
    const finalColor = isValidHexColor(candidateColor)
      ? candidateColor.toLowerCase()
      : '#7c3aed';
    const rawLabel = (labelOverride ?? legendLabelDraft).trim();
    const existingCount = (layout.legend || []).length;
    const finalLabel = rawLabel || `구분 ${existingCount + 1}`;

    const newItem: CustomLegendItem = {
      id: `legend-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      color: finalColor,
      label: finalLabel,
    };

    pushHistory({
      ...layout,
      legend: [...(layout.legend || []), newItem],
      updatedAt: new Date().toISOString(),
    });
    if (!labelOverride) {
      setLegendLabelDraft('');
    }
    addRecentColor(finalColor);
    showToast(`범례에 '${finalLabel}' 항목이 추가되었습니다.`);
  };

  const handleUpdateLegendItemColor = (
    itemId: string,
    hex: string,
    recordUndo: boolean
  ) => {
    if (!isValidHexColor(hex)) return;
    const normalized = hex.trim().toLowerCase();
    const nextLayout: CustomTheaterLayout = {
      ...layout,
      legend: (layout.legend || []).map((item) =>
        item.id === itemId ? { ...item, color: normalized } : item
      ),
      updatedAt: new Date().toISOString(),
    };
    if (recordUndo) {
      pushHistory(nextLayout);
      addRecentColor(normalized);
    } else {
      if (!colorPickerSessionPushedRef.current) {
        setHistory((prev) => [...prev.slice(-30), layout]);
        setFuture([]);
        colorPickerSessionPushedRef.current = true;
      }
      setLayout(nextLayout);
    }
  };

  const handleLegendLabelFocus = () => {
    preLegendEditLayoutRef.current = layout;
  };

  const handleLegendLabelChange = (itemId: string, nextLabel: string) => {
    setLayout((prev) => ({
      ...prev,
      legend: (prev.legend || []).map((item) =>
        item.id === itemId ? { ...item, label: nextLabel } : item
      ),
    }));
  };

  const handleLegendLabelBlur = (itemId: string) => {
    const prevSnapshot = preLegendEditLayoutRef.current;
    preLegendEditLayoutRef.current = null;
    if (!prevSnapshot) return;
    const prevItem = (prevSnapshot.legend || []).find((i) => i.id === itemId);
    const curItem = (layout.legend || []).find((i) => i.id === itemId);
    if (prevItem && curItem && prevItem.label !== curItem.label) {
      setHistory((prev) => [...prev.slice(-30), prevSnapshot]);
      setFuture([]);
      setLayout((prev) => ({ ...prev, updatedAt: new Date().toISOString() }));
    }
  };

  const handleDeleteLegendItem = (itemId: string) => {
    pushHistory({
      ...layout,
      legend: (layout.legend || []).filter((item) => item.id !== itemId),
      updatedAt: new Date().toISOString(),
    });
    showToast('범례 항목이 삭제되었습니다.');
  };

  // Convert client mouse event coordinates to SVG canvas space coordinates
  const getCanvasCoords = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const transformed = pt.matrixTransform(ctm.inverse());
        return { x: transformed.x, y: transformed.y };
      }
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width ? layout.canvasWidth / rect.width : 1;
      const scaleY = rect.height ? layout.canvasHeight / rect.height : 1;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [layout.canvasWidth, layout.canvasHeight]
  );

  // Grid snap helper
  const snapVal = useCallback(
    (val: number) => {
      if (!snapToGrid || snapSize <= 1) return Math.round(val);
      return Math.round(val / snapSize) * snapSize;
    },
    [snapToGrid, snapSize]
  );

  const handleToggleSnapToGrid = () => {
    const next = !snapToGrid;
    setSnapToGrid(next);
    setLayout((prev) => ({ ...prev, snapToGrid: next }));
  };

  const handleChangeSnapSize = (nextSize: SnapSizeOption) => {
    setSnapSize(nextSize);
    setLayout((prev) => ({ ...prev, gridSize: nextSize }));
  };

  // Group / Ungroup / Select All
  const handleSelectAllSeats = useCallback(() => {
    if (layout.seats.length === 0) {
      showToast('선택할 좌석이 없습니다.');
      return;
    }
    setSelectedSeatIds(new Set(layout.seats.map((s) => s.id)));
    setSelectedLabelIds(new Set());
  }, [layout.seats, showToast]);

  const handleGroupSelectedSeats = useCallback(() => {
    if (selectedSeatIds.size < 2) {
      showToast('2개 이상의 좌석을 선택해야 그룹으로 묶을 수 있습니다.');
      return;
    }
    const newGroupId = `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newSeats = layout.seats.map((s) =>
      selectedSeatIds.has(s.id) ? { ...s, groupId: newGroupId } : s
    );
    pushHistory({
      ...layout,
      seats: newSeats,
      updatedAt: new Date().toISOString(),
    });
    showToast(`${selectedSeatIds.size}석이 그룹으로 묶였습니다.`);
  }, [layout, selectedSeatIds, pushHistory, showToast]);

  const handleUngroupSelectedSeats = useCallback(() => {
    const hasAnyGroup = layout.seats.some(
      (s) => selectedSeatIds.has(s.id) && Boolean(s.groupId)
    );
    if (!hasAnyGroup) {
      showToast('선택된 좌석 중 해제할 그룹이 없습니다.');
      return;
    }

    // Clear groupId on selected seats, and clean up any orphan 1-seat groups left behind
    const interimSeats = layout.seats.map((s) =>
      selectedSeatIds.has(s.id) ? { ...s, groupId: undefined } : s
    );
    const groupCounts = new Map<string, number>();
    interimSeats.forEach((s) => {
      if (s.groupId) {
        groupCounts.set(s.groupId, (groupCounts.get(s.groupId) || 0) + 1);
      }
    });
    const finalSeats = interimSeats.map((s) =>
      s.groupId && (groupCounts.get(s.groupId) || 0) < 2
        ? { ...s, groupId: undefined }
        : s
    );

    pushHistory({
      ...layout,
      seats: finalSeats,
      updatedAt: new Date().toISOString(),
    });
    showToast('선택된 좌석의 그룹이 해제되었습니다.');
  }, [layout, selectedSeatIds, pushHistory, showToast]);

  // -------------------------------------------------------------
  // Keyboard Shortcuts (Delete, Undo, Redo, Copy, Paste, Select All, Group, Arrows)
  // -------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Arrow keys: fine movement (1px default, 10px with Shift)
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        if (selectedSeatIds.size > 0 || selectedLabelIds.size > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

          if (!e.repeat) {
            setHistory((prev) => [...prev.slice(-30), layout]);
            setFuture([]);
          }

          setLayout((prev) => ({
            ...prev,
            seats: prev.seats.map((s) =>
              selectedSeatIds.has(s.id) ? { ...s, x: s.x + dx, y: s.y + dy } : s
            ),
            labels: prev.labels.map((l) =>
              selectedLabelIds.has(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l
            ),
            updatedAt: new Date().toISOString(),
          }));
        }
        return;
      }

      // Delete / Backspace: Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedSeatIds.size > 0 || selectedLabelIds.size > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }

      // Ctrl+A / Cmd+A: Select all seats
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleSelectAllSeats();
        return;
      }

      // Ctrl+G / Cmd+G: Group | Ctrl+Shift+G / Cmd+Shift+G: Ungroup
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          handleUngroupSelectedSeats();
        } else {
          handleGroupSelectedSeats();
        }
        return;
      }

      // Ctrl+Z / Cmd+Z: Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Y / Cmd+Y or Ctrl+Shift+Z: Redo
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Ctrl+C / Cmd+C: Copy
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopySelected();
        return;
      }

      // Ctrl+V / Cmd+V: Paste
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Space key for panning
      if (e.code === 'Space') {
        isSpacePressedRef.current = true;
      }

      // Escape: Clear selection or exit tool
      if (e.key === 'Escape') {
        setSelectedSeatIds(new Set());
        setSelectedLabelIds(new Set());
        setCurrentTool('select');
        setShowRowGenerator(false);
        setIsDraggingElements(false);
        setResizingStage(null);
        setIsMarqueeSelecting(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    selectedSeatIds,
    selectedLabelIds,
    handleUndo,
    handleRedo,
    handleSelectAllSeats,
    handleGroupSelectedSeats,
    handleUngroupSelectedSeats,
    layout,
    clipboard,
  ]);

  // -------------------------------------------------------------
  // Selection & Clipboard Actions
  // -------------------------------------------------------------
  const handleDeleteSelected = () => {
    if (selectedSeatIds.size === 0 && selectedLabelIds.size === 0) return;
    const newSeats = layout.seats.filter((s) => !selectedSeatIds.has(s.id));
    const newLabels = layout.labels.filter((l) => !selectedLabelIds.has(l.id));

    pushHistory({
      ...layout,
      seats: newSeats,
      labels: newLabels,
      updatedAt: new Date().toISOString(),
    });

    const deletedCount = selectedSeatIds.size + selectedLabelIds.size;
    setSelectedSeatIds(new Set());
    setSelectedLabelIds(new Set());
    showToast(`${deletedCount}개 항목이 삭제되었습니다.`);
  };

  const handleCopySelected = () => {
    if (selectedSeatIds.size === 0 && selectedLabelIds.size === 0) {
      showToast('복사할 좌석 또는 라벨을 먼저 선택해 주세요.');
      return;
    }
    const copiedSeats = layout.seats.filter((s) => selectedSeatIds.has(s.id));
    const copiedLabels = layout.labels.filter((l) => selectedLabelIds.has(l.id));
    setClipboard({ seats: copiedSeats, labels: copiedLabels });
    showToast(`${copiedSeats.length + copiedLabels.length}개 항목이 복사되었습니다.`);
  };

  const handlePaste = () => {
    if (!clipboard || (clipboard.seats.length === 0 && clipboard.labels.length === 0)) {
      showToast('클립보드에 복사된 항목이 없습니다.');
      return;
    }

    const offset = 25;
    const newSelectedSeats = new Set<string>();
    const newSelectedLabels = new Set<string>();

    const pastedGroupMap = new Map<string, string>();
    const pastedSeats: CustomSeat[] = clipboard.seats.map((s, idx) => {
      const newId = `seat-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
      newSelectedSeats.add(newId);
      let newGroupId = s.groupId;
      if (s.groupId) {
        if (!pastedGroupMap.has(s.groupId)) {
          pastedGroupMap.set(
            s.groupId,
            `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
          );
        }
        newGroupId = pastedGroupMap.get(s.groupId);
      }
      return {
        ...s,
        id: newId,
        groupId: newGroupId,
        x: s.x + offset,
        y: s.y + offset,
      };
    });

    const pastedLabels: CustomLabel[] = clipboard.labels.map((l) => {
      const newId = `label-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      newSelectedLabels.add(newId);
      return {
        ...l,
        id: newId,
        x: l.x + offset,
        y: l.y + offset,
      };
    });

    pushHistory({
      ...layout,
      seats: [...layout.seats, ...pastedSeats],
      labels: [...layout.labels, ...pastedLabels],
      updatedAt: new Date().toISOString(),
    });

    setSelectedSeatIds(newSelectedSeats);
    setSelectedLabelIds(newSelectedLabels);
    showToast(`${pastedSeats.length + pastedLabels.length}개 항목이 붙여넣기 되었습니다.`);
  };

  // Add a single seat
  const handleAddSeatAt = (canvasX: number, canvasY: number) => {
    // Determine default row and seat number based on existing seats
    let nextRow = '1열';
    let nextNum = 1;
    let nextFloor = '1층';
    let nextGrade = 'VIP석';

    if (layout.seats.length > 0) {
      const lastSeat = layout.seats[layout.seats.length - 1];
      nextFloor = lastSeat.floor || '1층';
      nextRow = lastSeat.row || '1열';
      nextNum = lastSeat.seatNumber + 1;
      nextGrade = lastSeat.grade || 'VIP석';
    }

    const newSeat: CustomSeat = {
      id: `seat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      floor: nextFloor,
      row: nextRow,
      seatNumber: nextNum,
      x: snapVal(canvasX - 12),
      y: snapVal(canvasY - 12),
      width: 24,
      height: 24,
      rotation: 0,
      grade: nextGrade,
    };

    pushHistory({
      ...layout,
      seats: [...layout.seats, newSeat],
      updatedAt: new Date().toISOString(),
    });

    setSelectedSeatIds(new Set([newSeat.id]));
    setSelectedLabelIds(new Set());
    showToast(`${newSeat.floor} ${newSeat.row} ${newSeat.seatNumber}번 좌석이 추가되었습니다.`);
  };

  // Add STAGE banner
  const handleAddStageBanner = () => {
    const newStage: CustomLabel = {
      id: `stage-${Date.now()}`,
      text: 'STAGE',
      x: snapVal((layout.canvasWidth - 360) / 2),
      y: 40,
      width: 360,
      height: 36,
      fontSize: 14,
      fontWeight: 'black',
      color: '#f8fafc',
      bgColor: '#1e293b',
      borderColor: '#334155',
      borderRadius: 6,
      isStageBanner: true,
    };

    pushHistory({
      ...layout,
      labels: [...layout.labels, newStage],
      updatedAt: new Date().toISOString(),
    });

    setSelectedLabelIds(new Set([newStage.id]));
    setSelectedSeatIds(new Set());
    showToast('STAGE 무대가 추가되었습니다.');
  };

  // Add normal text label
  const handleAddLabelAt = (canvasX: number, canvasY: number) => {
    const newLabel: CustomLabel = {
      id: `label-${Date.now()}`,
      text: '새 구역 텍스트',
      x: snapVal(canvasX),
      y: snapVal(canvasY),
      fontSize: 13,
      fontWeight: 'bold',
      color: '#334155',
    };

    pushHistory({
      ...layout,
      labels: [...layout.labels, newLabel],
      updatedAt: new Date().toISOString(),
    });

    setSelectedLabelIds(new Set([newLabel.id]));
    setSelectedSeatIds(new Set());
    showToast('텍스트 라벨이 추가되었습니다.');
  };

  // -------------------------------------------------------------
  // Row Generator Logic (한 줄 일괄 생성: 직선 / 곡선)
  // -------------------------------------------------------------
  const handleGenerateRow = () => {
    const {
      floor,
      rowName,
      seatCount,
      startNumber,
      numberDirection,
      spacing,
      shape,
      curveRadius,
      curveAngle,
      startX,
      startY,
      grade,
    } = rowGenConfig;

    if (seatCount <= 0) return;

    const newSeats: CustomSeat[] = [];
    const newSelectedIds = new Set<string>();

    if (shape === 'straight') {
      for (let i = 0; i < seatCount; i++) {
        const seatNum =
          numberDirection === 'asc' ? startNumber + i : startNumber + (seatCount - 1 - i);
        const x = snapVal(startX + i * spacing);
        const y = snapVal(startY);
        const seatId = `seat-${floor}-${rowName}-${seatNum}-${Date.now()}-${i}`;
        newSelectedIds.add(seatId);

        newSeats.push({
          id: seatId,
          floor,
          row: cleanRowName(rowName),
          seatNumber: seatNum,
          x,
          y,
          width: 24,
          height: 24,
          rotation: 0,
          grade,
        });
      }
    } else {
      // Curved row
      const centerX = layout.canvasWidth / 2;
      const stageCenterY = -50;
      const radius = curveRadius;
      const sweepAngleDeg = curveAngle;
      const startAngleDeg = 90 - sweepAngleDeg / 2;
      const angleStep = seatCount > 1 ? sweepAngleDeg / (seatCount - 1) : 0;

      for (let i = 0; i < seatCount; i++) {
        const seatNum =
          numberDirection === 'asc' ? startNumber + i : startNumber + (seatCount - 1 - i);
        const angleDeg = startAngleDeg + i * angleStep;
        const angleRad = (angleDeg * Math.PI) / 180;
        const x = Math.round(centerX + radius * Math.cos(angleRad) - 12);
        const y = Math.round(stageCenterY + radius * Math.sin(angleRad) - 12);
        const seatRotation = Math.round(angleDeg - 90);
        const seatId = `seat-${floor}-${rowName}-${seatNum}-${Date.now()}-${i}`;
        newSelectedIds.add(seatId);

        newSeats.push({
          id: seatId,
          floor,
          row: cleanRowName(rowName),
          seatNumber: seatNum,
          x,
          y,
          width: 24,
          height: 24,
          rotation: seatRotation,
          grade,
        });
      }
    }

    pushHistory({
      ...layout,
      seats: [...layout.seats, ...newSeats],
      updatedAt: new Date().toISOString(),
    });

    setSelectedSeatIds(newSelectedIds);
    setSelectedLabelIds(new Set());
    setShowRowGenerator(false);
    showToast(`${floor} ${rowName} (${seatCount}석) 생성이 완료되었습니다.`);
  };

  // -------------------------------------------------------------
  // Batch updates for selected seats
  // -------------------------------------------------------------
  const updateSelectedSeats = (patch: Partial<CustomSeat>) => {
    if (selectedSeatIds.size === 0) return;
    const newSeats = layout.seats.map((s) => {
      if (selectedSeatIds.has(s.id)) {
        return { ...s, ...patch };
      }
      return s;
    });

    pushHistory({
      ...layout,
      seats: newSeats,
      updatedAt: new Date().toISOString(),
    });
  };

  // Renumber selected seats sequentially (left-to-right)
  const handleRenumberSelectedSeats = (startNum: number) => {
    if (selectedSeatIds.size === 0) return;
    // Sort selected seats by X position
    const selectedList = layout.seats.filter((s) => selectedSeatIds.has(s.id));
    selectedList.sort((a, b) => a.x - b.x);

    const renumberMap = new Map<string, number>();
    selectedList.forEach((seat, idx) => {
      renumberMap.set(seat.id, startNum + idx);
    });

    const newSeats = layout.seats.map((s) => {
      if (renumberMap.has(s.id)) {
        return { ...s, seatNumber: renumberMap.get(s.id)! };
      }
      return s;
    });

    pushHistory({
      ...layout,
      seats: newSeats,
      updatedAt: new Date().toISOString(),
    });
    showToast(`선택된 ${selectedList.length}석의 좌석 번호가 ${startNum}번부터 재정렬되었습니다.`);
  };

  // Toggle 결번 처리 (mark as empty aisle/blank space)
  const handleToggleDisabled = () => {
    if (selectedSeatIds.size === 0) return;
    const allDisabled = Array.from(selectedSeatIds).every(
      (id) => layout.seats.find((s) => s.id === id)?.isDisabled
    );
    const newSeats = layout.seats.map((s) => {
      if (selectedSeatIds.has(s.id)) {
        return { ...s, isDisabled: !allDisabled };
      }
      return s;
    });
    pushHistory({
      ...layout,
      seats: newSeats,
      updatedAt: new Date().toISOString(),
    });
    showToast(
      !allDisabled
        ? `선택된 좌석이 결번(공백석)으로 처리되었습니다.`
        : `선택된 좌석의 결번 처리가 해제되었습니다.`
    );
  };

  // Rotate selected elements by delta degrees
  const handleRotateSelected = (deltaDeg: number) => {
    if (selectedSeatIds.size === 0 && selectedLabelIds.size === 0) return;
    const newSeats = layout.seats.map((s) => {
      if (selectedSeatIds.has(s.id)) {
        const curRot = s.rotation || 0;
        const newRot = (curRot + deltaDeg + 360) % 360;
        return { ...s, rotation: newRot };
      }
      return s;
    });
    const newLabels = layout.labels.map((l) => {
      if (selectedLabelIds.has(l.id)) {
        const curRot = l.rotation || 0;
        const newRot = (curRot + deltaDeg + 360) % 360;
        return { ...l, rotation: newRot };
      }
      return l;
    });

    pushHistory({
      ...layout,
      seats: newSeats,
      labels: newLabels,
      updatedAt: new Date().toISOString(),
    });
  };

  // Update selected label
  const updateSelectedLabel = (patch: Partial<CustomLabel>) => {
    if (selectedLabelIds.size === 0) return;
    const newLabels = layout.labels.map((l) => {
      if (selectedLabelIds.has(l.id)) {
        return { ...l, ...patch };
      }
      return l;
    });

    pushHistory({
      ...layout,
      labels: newLabels,
      updatedAt: new Date().toISOString(),
    });
  };

  // STAGE dimension input handlers (single Undo step on blur/commit)
  const handleStageDimFocus = () => {
    isEditingStageDimRef.current = true;
    preStageInputLayoutRef.current = layout;
  };

  const handleStageDimChange = (dim: 'width' | 'height', rawValue: string) => {
    if (dim === 'width') setStageWidthInput(rawValue);
    else setStageHeightInput(rawValue);

    const parsed = parseInt(rawValue, 10);
    if (!Number.isNaN(parsed) && parsed >= MIN_STAGE_SIZE && singleSelectedLabel) {
      setLayout((prev) => ({
        ...prev,
        labels: prev.labels.map((l) =>
          l.id === singleSelectedLabel.id ? { ...l, [dim]: parsed } : l
        ),
        updatedAt: new Date().toISOString(),
      }));
    }
  };

  const handleStageDimBlur = (dim: 'width' | 'height') => {
    isEditingStageDimRef.current = false;
    if (!singleSelectedLabel) {
      preStageInputLayoutRef.current = null;
      return;
    }

    const rawStr = dim === 'width' ? stageWidthInput : stageHeightInput;
    const parsed = parseInt(rawStr, 10);
    const fallback = dim === 'width' ? singleSelectedLabel.width || 360 : singleSelectedLabel.height || 36;
    const clamped = Number.isNaN(parsed) ? fallback : Math.max(MIN_STAGE_SIZE, parsed);

    if (dim === 'width') setStageWidthInput(String(clamped));
    else setStageHeightInput(String(clamped));

    const prevSnapshot = preStageInputLayoutRef.current;
    preStageInputLayoutRef.current = null;

    const prevLabel = prevSnapshot?.labels.find((l) => l.id === singleSelectedLabel.id);
    const prevVal = prevLabel ? prevLabel[dim] : undefined;

    if (singleSelectedLabel[dim] !== clamped) {
      if (prevSnapshot) {
        setHistory((prev) => [...prev.slice(-30), prevSnapshot]);
        setFuture([]);
      }
      setLayout((prev) => ({
        ...prev,
        labels: prev.labels.map((l) =>
          l.id === singleSelectedLabel.id ? { ...l, [dim]: clamped } : l
        ),
        updatedAt: new Date().toISOString(),
      }));
    } else if (prevSnapshot && prevVal !== clamped) {
      setHistory((prev) => [...prev.slice(-30), prevSnapshot]);
      setFuture([]);
    }
  };

  // -------------------------------------------------------------
  // Firestore 저장 / 다른 이름으로 저장 / 인증 가드 / 오류 재시도
  // -------------------------------------------------------------
  const formatSaveErrorMessage = (err: unknown): string => {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: string }).code).toLowerCase()
        : '';
    const msg = err instanceof Error ? err.message : String(err);
    const lowerMsg = msg.toLowerCase();
    if (code.includes('resource-exhausted') || lowerMsg.includes('quota exceeded')) {
      return 'Firestore 무료 사용량 한도(Quota)에 도달했습니다. 다음 날 초기화된 후 다시 시도해 주세요.';
    }
    if (code.includes('permission-denied') || lowerMsg.includes('permission')) {
      return '저장 권한 오류가 발생했습니다. 회사 계정(@lgart.com) 로그인 상태를 확인한 후 다시 시도해 주세요.';
    }
    if (
      code.includes('unavailable') ||
      code.includes('network') ||
      lowerMsg.includes('offline') ||
      lowerMsg.includes('network')
    ) {
      return '네트워크 오류가 발생했습니다. 연결 상태를 확인한 후 다시 시도해 주세요.';
    }
    return '배치도를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  };

  const persistLayoutToFirestore = async (options: {
    targetId: string | null;
    targetName: string;
    isNewDoc: boolean;
    existingShareCode?: string;
    targetUser?: User;
    overrideLayout?: CustomTheaterLayout;
  }) => {
    const sourceLayout = options.overrideLayout || layout;
    const activeUser = options.targetUser || user || auth.currentUser;
    if (!activeUser) {
      pendingAuthActionRef.current = {
        type: 'retrySave',
        saveParams: {
          targetId: options.targetId,
          targetName: options.targetName,
          isNewDoc: options.isNewDoc,
          existingShareCode: options.existingShareCode,
        },
      };
      writeAutosaveDraft(sourceLayout, options.targetId ?? currentLayoutId, 'session_expired');
      setIsReauthPrompt(false);
      setAuthErrorMessage(null);
      setShowAuthModal(true);
      return;
    }

    const finalName = options.targetName.trim().slice(0, 100);
    if (!finalName) {
      showToast('배치도 이름을 입력해 주세요.');
      return;
    }

    const docId =
      options.isNewDoc || !options.targetId
        ? generateValidFirestoreDocId('layout')
        : options.targetId;
    const finalShareCode = options.isNewDoc
      ? generateShareCode()
      : options.existingShareCode || sourceLayout.shareCode || generateShareCode();

    const safeCanvasWidth = Math.min(Math.max(Math.round(sourceLayout.canvasWidth || 1200), 200), 5000);
    const safeCanvasHeight = Math.min(Math.max(Math.round(sourceLayout.canvasHeight || 800), 200), 5000);
    const safeGridSize = Math.min(Math.max(Math.round(sourceLayout.gridSize || snapSize || 20), 1), 100);
    const cleanSeats = stripUndefinedDeep(
      sourceLayout.seats.slice(0, 5000).map((seat) => ({
        ...seat,
        x: Number.isFinite(seat.x) ? seat.x : 0,
        y: Number.isFinite(seat.y) ? seat.y : 0,
        width: Number.isFinite(seat.width) && seat.width > 0 ? seat.width : 24,
        height: Number.isFinite(seat.height) && seat.height > 0 ? seat.height : 24,
        seatNumber: Number.isFinite(seat.seatNumber) ? seat.seatNumber : 1,
      }))
    );
    const cleanLabels = stripUndefinedDeep(
      sourceLayout.labels.slice(0, 200).map((lbl) => ({
        ...lbl,
        x: Number.isFinite(lbl.x) ? lbl.x : 0,
        y: Number.isFinite(lbl.y) ? lbl.y : 0,
        fontSize: Number.isFinite(lbl.fontSize) && lbl.fontSize > 0 ? lbl.fontSize : 14,
        ...(lbl.width !== undefined
          ? { width: Number.isFinite(lbl.width) && lbl.width > 0 ? lbl.width : 400 }
          : {}),
        ...(lbl.height !== undefined
          ? { height: Number.isFinite(lbl.height) && lbl.height > 0 ? lbl.height : 38 }
          : {}),
      }))
    );
    const cleanLegend = stripUndefinedDeep((sourceLayout.legend || []).slice(0, 100));
    const seatCount = Math.min(
      cleanSeats.filter((s) => !s.isDisabled).length,
      5000
    );

    const retryAction = (nextUser?: User) =>
      persistLayoutToFirestore({
        ...options,
        targetUser: nextUser || activeUser,
        overrideLayout: sourceLayout,
      });
    lastFailedSaveRef.current = retryAction;

    setSaveStatus('saving');
    setSaveErrorMessage(null);
    errorSignatureRef.current = null;

    const docPath = `theaterLayouts/${docId}`;
    const opType = options.isNewDoc ? OperationType.CREATE : OperationType.UPDATE;

    try {
      if (options.isNewDoc) {
        await setDoc(doc(db, 'theaterLayouts', docId), {
          ownerId: activeUser.uid,
          name: finalName,
          shareCode: finalShareCode,
          version: CURRENT_SCHEMA_VERSION,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          canvasWidth: safeCanvasWidth,
          canvasHeight: safeCanvasHeight,
          gridSize: safeGridSize,
          snapToGrid: sourceLayout.snapToGrid !== false,
          seatCount,
          seats: cleanSeats,
          labels: cleanLabels,
          legend: cleanLegend,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'theaterLayouts', docId), {
          name: finalName,
          version: CURRENT_SCHEMA_VERSION,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          canvasWidth: safeCanvasWidth,
          canvasHeight: safeCanvasHeight,
          gridSize: safeGridSize,
          snapToGrid: sourceLayout.snapToGrid !== false,
          seatCount,
          seats: cleanSeats,
          labels: cleanLabels,
          legend: cleanLegend,
          updatedAt: serverTimestamp(),
        });
      }

      const nowIso = new Date().toISOString();
      const updatedLayout: CustomTheaterLayout = {
        ...sourceLayout,
        version: CURRENT_SCHEMA_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        canvasWidth: safeCanvasWidth,
        canvasHeight: safeCanvasHeight,
        gridSize: safeGridSize,
        snapToGrid: sourceLayout.snapToGrid !== false,
        seats: cleanSeats,
        labels: cleanLabels,
        legend: cleanLegend,
        name: finalName,
        savedId: docId,
        shareCode: finalShareCode,
        updatedAt: nowIso,
      };

      const existingSaved = savedLayouts.find((item) => item.id === docId);
      const optimisticSavedItem: SavedCustomLayout = {
        id: docId,
        name: finalName,
        shareCode: finalShareCode,
        savedAt: options.isNewDoc ? nowIso : existingSaved?.savedAt || nowIso,
        updatedAt: nowIso,
        seatCount,
        layout: updatedLayout,
      };

      if (options.isNewDoc) {
        justCreatedDocIdRef.current = docId;
      }
      upsertSavedLayoutItem(optimisticSavedItem);
      setSavedLayoutsError(null);
      setCurrentLayoutId(docId);
      setLayout(updatedLayout);
      setSavedSignature(getLayoutContentSignature(updatedLayout));
      setSaveStatus('saved');
      setSaveErrorMessage(null);
      lastFailedSaveRef.current = null;
      errorSignatureRef.current = null;
      setShowSaveModal(false);
      // Clear local temporary backup once server save succeeds
      clearAutosaveDraft();

      if (options.isNewDoc) {
        showToast(
          `'${finalName}' 배치도가 저장되었습니다. (공유 코드: ${finalShareCode})`
        );
      } else {
        showToast(`'${finalName}' 배치도가 덮어쓰기 저장되었습니다.`);
      }
    } catch (err) {
      writeAutosaveDraft(sourceLayout, options.targetId ?? currentLayoutId, 'session_expired');
      errorSignatureRef.current = getLayoutContentSignature(sourceLayout);
      setSaveStatus('error');

      const sessionExpired = await isAuthSessionError(err);
      if (sessionExpired) {
        pendingAuthActionRef.current = {
          type: 'retrySave',
          saveParams: {
            targetId: options.targetId,
            targetName: finalName,
            isNewDoc: options.isNewDoc,
            existingShareCode: options.existingShareCode,
          },
        };
        setSaveErrorMessage(
          '로그인 세션이 만료되었거나 인증 토큰 오류가 발생했습니다. 다시 로그인하면 저장이 이어집니다.'
        );
        setIsReauthPrompt(true);
        setAuthErrorMessage(
          '로그인 세션이 만료되었거나 인증 토큰 오류가 발생했습니다. 편집 내용은 그대로 유지되며, 다시 로그인하면 저장이 자동으로 이어집니다.'
        );
        setShowAuthModal(true);
        showToast('세션이 만료되었습니다. 다시 로그인하면 저장이 자동으로 이어집니다.');
      } else {
        setSaveErrorMessage(formatSaveErrorMessage(err));
        showToast('저장에 실패했습니다. 오류 배너의 [다시 시도]를 눌러 재시도해 주세요.');
      }

      try {
        handleFirestoreError(err, opType, docPath);
      } catch {
        // Error info logged cleanly without crashing editor or losing canvas edits
      }
    }
  };

  const handleSaveClick = (overrideUser?: User, overrideLayout?: CustomTheaterLayout) => {
    if (saveStatus === 'saving') return;
    const targetLayout = overrideLayout || layout;
    if (!overrideLayout && currentLayoutId && !isDirty && saveStatus !== 'error') return;

    const activeUser = overrideUser || user || auth.currentUser;
    if (!activeUser || !isAllowedCompanyUser(activeUser)) {
      if (isDirty) {
        writeAutosaveDraft(targetLayout, currentLayoutId, 'redirect');
      }
      setShowTemplateMenu(false);
      void requestLoginAndContinue('save');
      return;
    }

    const activeId = overrideLayout ? overrideLayout.savedId || null : currentLayoutId;
    const matched = activeId
      ? savedLayouts.find((item) => item.id === activeId)
      : undefined;
    const confirmedLayoutId =
      activeId &&
      (Boolean(matched) || justCreatedDocIdRef.current === activeId)
        ? activeId
        : null;

    if (confirmedLayoutId) {
      const targetName = targetLayout.name.trim() || matched?.name || '새 커스텀 좌석배치도';
      void persistLayoutToFirestore({
        targetId: confirmedLayoutId,
        targetName,
        isNewDoc: false,
        existingShareCode: matched?.shareCode || targetLayout.shareCode,
        targetUser: activeUser,
        overrideLayout: targetLayout,
      });
    } else {
      if (currentLayoutId && !confirmedLayoutId) {
        setCurrentLayoutId(null);
        setLayout((prev) => ({ ...prev, savedId: undefined, shareCode: undefined }));
      }
      setSaveErrorMessage(null);
      setSaveStatus((prev) => (prev === 'error' ? 'saved' : prev));
      setSaveModalMode('first_save');
      setSaveNameInput(targetLayout.name?.trim() || '새 커스텀 좌석배치도');
      setShowSaveModal(true);
      setShowTemplateMenu(false);
    }
  };

  const handleSaveAsClick = (overrideUser?: User, overrideLayout?: CustomTheaterLayout) => {
    if (saveStatus === 'saving') return;
    const targetLayout = overrideLayout || layout;

    const activeUser = overrideUser || user || auth.currentUser;
    if (!activeUser || !isAllowedCompanyUser(activeUser)) {
      if (isDirty) {
        writeAutosaveDraft(targetLayout, currentLayoutId, 'redirect');
      }
      setShowTemplateMenu(false);
      void requestLoginAndContinue('saveAs');
      return;
    }

    setSaveErrorMessage(null);
    setSaveStatus((prev) => (prev === 'error' ? 'saved' : prev));
    setSaveModalMode('save_as');
    setSaveNameInput(buildCopyName(targetLayout.name));
    setShowSaveModal(true);
    setShowTemplateMenu(false);
  };

  const handleRetrySave = () => {
    if (saveStatus === 'saving') return;
    if (lastFailedSaveRef.current) {
      void lastFailedSaveRef.current();
    } else {
      handleSaveClick();
    }
  };

  const executeAuthPopup = async (
    actionType: 'save' | 'saveAs' | 'retrySave' | 'openMyLayouts' | 'openShareCodeModal' | 'loginOnly',
    saveParams?: {
      targetId: string | null;
      targetName: string;
      isNewDoc: boolean;
      existingShareCode?: string;
    }
  ) => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthErrorMessage(null);
    onAuthError?.(null);

    if (isDirty) {
      writeAutosaveDraft(layout, currentLayoutId, 'redirect');
    }

    const redirectPayload: Omit<PendingAuthRedirectPayload, 'createdAt'> =
      actionType === 'retrySave' && saveParams
        ? {
            action: 'retrySave',
            theater: 'custom',
            targetDocId: saveParams.targetId,
            targetName: saveParams.targetName,
            isNewDoc: saveParams.isNewDoc,
            existingShareCode: saveParams.existingShareCode,
          }
        : {
            action: actionType,
            theater: 'custom',
            targetDocId: currentLayoutId,
            targetName: layout.name,
          };

    try {
      const result = await signInWithGoogleAutoFallback(redirectPayload);
      if (result.mode === 'redirect') {
        return;
      }

      const signedUser = result.credential.user;
      if (!isAllowedCompanyUser(signedUser)) {
        await signOut(auth);
        setInternalUser(null);
        onAuthUserUpdated?.(null);
        setAuthErrorMessage(COMPANY_AUTH_ERROR_MESSAGE);
        onAuthError?.(COMPANY_AUTH_ERROR_MESSAGE);
        showToast(COMPANY_AUTH_ERROR_MESSAGE);
        return;
      }
      setInternalUser(signedUser);
      onAuthUserUpdated?.(signedUser);
      onAuthError?.(null);
      setShowAuthModal(false);
      setIsReauthPrompt(false);
      showToast(`${signedUser.email || signedUser.displayName || '사용자'} 계정으로 로그인되었습니다.`);

      pendingAuthActionRef.current = null;
      if (actionType === 'retrySave' && saveParams) {
        void persistLayoutToFirestore({
          ...saveParams,
          targetUser: signedUser,
        });
      } else if (actionType === 'save') {
        handleSaveClick(signedUser);
      } else if (actionType === 'saveAs') {
        handleSaveAsClick(signedUser);
      } else if (actionType === 'openMyLayouts') {
        setShowTemplateMenu(true);
      } else if (actionType === 'openShareCodeModal') {
        setShareCodeInput('');
        setShareCodeError(null);
        setShowShareCodeModal(true);
      }
    } catch (err) {
      if (err instanceof CompanyAccountRequiredError) {
        setInternalUser(null);
        onAuthUserUpdated?.(null);
        setAuthErrorMessage(COMPANY_AUTH_ERROR_MESSAGE);
        onAuthError?.(COMPANY_AUTH_ERROR_MESSAGE);
        showToast(COMPANY_AUTH_ERROR_MESSAGE);
      } else {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code?: string }).code)
            : '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          pendingAuthActionRef.current = null;
          showToast('로그인이 취소되었습니다.');
          if (showAuthModal) {
            setAuthErrorMessage('로그인이 취소되었습니다. 저장을 계속하려면 다시 로그인해 주세요.');
          }
        } else {
          setAuthErrorMessage('로그인 중 오류가 발생했습니다. 팝업 차단 또는 네트워크 상태를 확인한 후 다시 시도해 주세요.');
          showToast('로그인 중 오류가 발생했습니다. 다시 시도해 주세요.');
        }
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  function requestLoginAndContinue(
    actionType: 'save' | 'saveAs' | 'openMyLayouts' | 'openShareCodeModal' | 'loginOnly'
  ) {
    pendingAuthActionRef.current = { type: actionType };
    return executeAuthPopup(actionType);
  }

  const handleGoogleSignIn = async () => {
    const pending = pendingAuthActionRef.current;
    await executeAuthPopup(pending?.type || 'loginOnly', pending?.saveParams);
  };

  // Continue pending action after returning from signInWithRedirect
  useEffect(() => {
    if (!authReady || !user || !pendingRedirectAction) return;
    onConsumePendingRedirectAction?.();

    if (
      pendingRedirectAction.action === 'loginOnly' ||
      pendingRedirectAction.action === 'enterCustom'
    ) {
      return;
    }

    const draft = readAutosaveDraft();
    const restoredLayout = draft?.layout || latestLayoutRef.current;
    if (draft?.layout) {
      const nextSnapSize = SNAP_SIZE_OPTIONS.includes(draft.layout.gridSize as SnapSizeOption)
        ? (draft.layout.gridSize as SnapSizeOption)
        : 20;
      setSnapSize(nextSnapSize);
      setSnapToGrid(draft.layout.snapToGrid !== false);
      setLayout(draft.layout);
      setCurrentLayoutId(draft.docId);
      setSavedSignature('');
      setPendingDraftRecovery(null);
    }

    if (
      pendingRedirectAction.action === 'retrySave' &&
      pendingRedirectAction.targetName
    ) {
      void persistLayoutToFirestore({
        targetId: pendingRedirectAction.targetDocId ?? draft?.docId ?? null,
        targetName: pendingRedirectAction.targetName,
        isNewDoc: pendingRedirectAction.isNewDoc ?? !(pendingRedirectAction.targetDocId || draft?.docId),
        existingShareCode: pendingRedirectAction.existingShareCode || draft?.shareCode,
        targetUser: user,
        overrideLayout: restoredLayout,
      });
    } else if (pendingRedirectAction.action === 'save') {
      handleSaveClick(user, restoredLayout);
    } else if (pendingRedirectAction.action === 'saveAs') {
      handleSaveAsClick(user, restoredLayout);
    } else if (pendingRedirectAction.action === 'openMyLayouts') {
      setShowTemplateMenu(true);
    } else if (pendingRedirectAction.action === 'openShareCodeModal') {
      setShareCodeInput('');
      setShareCodeError(null);
      setShowShareCodeModal(true);
    }
  }, [authReady, user, pendingRedirectAction]);

  const handleSignOut = async () => {
    try {
      if (onRequestSignOut) {
        onRequestSignOut();
      } else {
        await signOut(auth);
        setInternalUser(null);
        showToast('로그아웃되었습니다.');
      }
      justCreatedDocIdRef.current = null;
      setCurrentLayoutId(null);
      setSavedSignature('');
      setLayout((prev) => ({
        ...prev,
        savedId: undefined,
        shareCode: undefined,
      }));
      setShowTemplateMenu(false);
    } catch {
      showToast('로그아웃 중 오류가 발생했습니다.');
    }
  };

  // Recover / Discard Autosave Draft Handlers
  const handleRecoverAutosaveDraft = () => {
    if (!pendingDraftRecovery) return;
    const draft = pendingDraftRecovery;
    const nextSnapSize = SNAP_SIZE_OPTIONS.includes(draft.layout.gridSize as SnapSizeOption)
      ? (draft.layout.gridSize as SnapSizeOption)
      : 20;
    setSnapSize(nextSnapSize);
    setSnapToGrid(draft.layout.snapToGrid !== false);
    setLayout(draft.layout);
    setCurrentLayoutId(draft.docId);
    setSavedSignature('');
    setSaveStatus('saved');
    setSaveErrorMessage(null);
    setPendingDraftRecovery(null);
    showToast(`임시저장된 '${draft.layout.name}' 작업을 복구했습니다.`);
  };

  const handleDiscardAutosaveDraft = () => {
    clearAutosaveDraft();
    setPendingDraftRecovery(null);
    showToast('임시저장본을 삭제하고 새 캔버스로 시작합니다.');
  };

  // Keep latest save trigger accessible to global Ctrl+S / Cmd+S shortcut
  handleSaveTriggerRef.current = () => handleSaveClick();

  useEffect(() => {
    const handleGlobalSaveShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        handleSaveTriggerRef.current();
      }
    };
    window.addEventListener('keydown', handleGlobalSaveShortcut);
    return () => window.removeEventListener('keydown', handleGlobalSaveShortcut);
  }, []);

  // -------------------------------------------------------------
  // JSON Export & Import
  // -------------------------------------------------------------
  const handleExportJson = () => {
    const dataStr = JSON.stringify(layout, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (layout.name || '커스텀_좌석배치도').replace(/[/\\?%*:|"<>]/g, '_');
    link.download = `${safeName}.json`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`'${safeName}.json' 파일로 내보내기가 완료되었습니다.`);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (!parsed || !Array.isArray(parsed.seats)) {
          showToast('올바른 좌석배치도 JSON 파일 형식이 아닙니다.');
          return;
        }

        const importedName = parsed.name || file.name.replace(/\.json$/i, '');
        const { layout: sanitizedLayout, hadInvalidColors } = sanitizeAndMigrateLayout({
          version: parsed.version || 1,
          schemaVersion: parsed.schemaVersion,
          name: importedName,
          updatedAt: new Date().toISOString(),
          canvasWidth: parsed.canvasWidth || 1200,
          canvasHeight: parsed.canvasHeight || 800,
          gridSize: parsed.gridSize || 20,
          snapToGrid: parsed.snapToGrid !== false,
          seats: parsed.seats || [],
          labels: parsed.labels || [],
          legend: parsed.legend || [],
        });

        const validLayout = cloneLayoutWithNewIds(sanitizedLayout, {
          newName: importedName,
          preserveSavedId: false,
        });

        const applyImported = () => {
          const nextSnapSize = SNAP_SIZE_OPTIONS.includes(validLayout.gridSize as SnapSizeOption)
            ? (validLayout.gridSize as SnapSizeOption)
            : 20;
          setSnapSize(nextSnapSize);
          setSnapToGrid(validLayout.snapToGrid !== false);
          setCurrentLayoutId(null);
          setSavedSignature('');
          setSaveStatus('saved');
          setSaveErrorMessage(null);
          pushHistory(validLayout);
          setSelectedSeatIds(new Set());
          setSelectedLabelIds(new Set());
          setZoom(1.0);
          setPan({ x: 0, y: 0 });
          setShowTemplateMenu(false);
          showToast(
            hadInvalidColors
              ? `'${validLayout.name}' 불러오기 완료 (일부 잘못된 색상 값은 기본색으로 대체됨)`
              : `'${validLayout.name}' 좌석배치도를 성공적으로 가져왔습니다.`
          );
        };

        if (isDirty) {
          setPendingConfirmAction({
            title: 'JSON 배치도 가져오기',
            message: `저장하지 않은 변경사항이 있습니다. '${validLayout.name}' 파일을 불러오면 현재 변경사항이 사라집니다. 계속하시겠습니까?`,
            confirmLabel: '가져오기',
            onConfirm: applyImported,
          });
        } else {
          applyImported();
        }
      } catch (err) {
        console.error('JSON import error:', err);
        showToast('JSON 파일을 읽는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // -------------------------------------------------------------
  // 템플릿 / 기존 극장 복사 / 저장된 배치도 불러오기 (확인 팝업 포함)
  // -------------------------------------------------------------
  const applyNewLayoutToCanvas = (
    newLayout: CustomTheaterLayout,
    toastMsg: string,
    options: { docId: string | null; markAsClean: boolean }
  ) => {
    const nextSnapSize = SNAP_SIZE_OPTIONS.includes(newLayout.gridSize as SnapSizeOption)
      ? (newLayout.gridSize as SnapSizeOption)
      : 20;
    setSnapSize(nextSnapSize);
    setSnapToGrid(newLayout.snapToGrid !== false);
    setCurrentLayoutId(options.docId);
    setSavedSignature(options.markAsClean ? getLayoutContentSignature(newLayout) : '');
    setSaveStatus('saved');
    setSaveErrorMessage(null);
    errorSignatureRef.current = null;
    pushHistory(newLayout);
    setSelectedSeatIds(new Set());
    setSelectedLabelIds(new Set());
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setShowTemplateMenu(false);
    showToast(toastMsg);
  };

  const requestLoadTemplate = (type: 'signature' | 'uplus' | 'blank') => {
    setShowTemplateMenu(false);

    const buildAndApply = () => {
      if (type === 'signature') {
        const copy = createLGSignatureHallCopy();
        applyNewLayoutToCanvas(copy, `'${copy.name}'이(가) 캔버스에 깊은 복사되었습니다.`, {
          docId: null,
          markAsClean: false,
        });
      } else if (type === 'uplus') {
        const copy = createUPlusStageCopy();
        applyNewLayoutToCanvas(copy, `'${copy.name}'이(가) 캔버스에 깊은 복사되었습니다.`, {
          docId: null,
          markAsClean: false,
        });
      } else {
        const blank = createBlankLayout('새 커스텀 좌석배치도');
        clearAutosaveDraft();
        applyNewLayoutToCanvas(blank, '빈 캔버스로 초기화되었습니다.', {
          docId: null,
          markAsClean: true,
        });
      }
    };

    if (isDirty) {
      const targetTitle =
        type === 'signature'
          ? 'LG SIGNATURE Hall 복사본 불러오기'
          : type === 'uplus'
          ? 'U+ STAGE (End Stage) 복사본 불러오기'
          : '빈 캔버스로 초기화';
      const targetDesc =
        type === 'blank'
          ? '저장하지 않은 변경사항이 있습니다. 빈 캔버스로 초기화하면 현재 변경사항이 모두 사라집니다. 계속하시겠습니까?'
          : '저장하지 않은 변경사항이 있습니다. 선택한 배치도 복사본을 불러오면 현재 변경사항이 사라집니다. 계속하시겠습니까?';

      setPendingConfirmAction({
        title: targetTitle,
        message: targetDesc,
        confirmLabel: type === 'blank' ? '초기화하기' : '불러오기',
        isDestructive: type === 'blank',
        onConfirm: buildAndApply,
      });
    } else {
      buildAndApply();
    }
  };

  const requestLoadSavedLayout = (item: SavedCustomLayout) => {
    setShowTemplateMenu(false);

    const loadItem = () => {
      const { hadInvalidColors } = sanitizeAndMigrateLayout(item.layout);
      const restored = cloneLayoutWithNewIds(item.layout, {
        newName: item.name,
        preserveSavedId: true,
      });
      restored.savedId = item.id;
      restored.shareCode = item.shareCode;
      clearAutosaveDraft();
      applyNewLayoutToCanvas(
        restored,
        hadInvalidColors
          ? `'${item.name}' 불러오기 완료 (일부 잘못된 색상 값은 기본색으로 대체됨)`
          : `'${item.name}' 배치도를 불러왔습니다.`,
        {
          docId: item.id,
          markAsClean: true,
        }
      );
    };

    if (isDirty) {
      setPendingConfirmAction({
        title: '내 배치도 불러오기',
        message: `저장하지 않은 변경사항이 있습니다. '${item.name}' 배치도를 불러오면 현재 변경사항이 사라집니다. 계속하시겠습니까?`,
        confirmLabel: '불러오기',
        onConfirm: loadItem,
      });
    } else {
      loadItem();
    }
  };

  const requestDeleteSavedLayout = (item: SavedCustomLayout) => {
    setShowTemplateMenu(false);
    setPendingConfirmAction({
      title: '저장된 배치도 삭제',
      message: `내 배치도 목록에서 '${item.name}' 배치도를 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`,
      confirmLabel: '삭제하기',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'theaterLayouts', item.id));
          if (justCreatedDocIdRef.current === item.id) {
            justCreatedDocIdRef.current = null;
          }
          setSavedLayouts((prev) => prev.filter((saved) => saved.id !== item.id));
          if (currentLayoutId === item.id) {
            setCurrentLayoutId(null);
            setSavedSignature('');
            setLayout((prev) => ({
              ...prev,
              savedId: undefined,
              shareCode: undefined,
            }));
          }
          showToast(`'${item.name}' 배치도가 삭제되었습니다.`);
        } catch (err) {
          showToast('배치도 삭제 중 오류가 발생했습니다. 권한 및 연결 상태를 확인해 주세요.');
          try {
            handleFirestoreError(err, OperationType.DELETE, `theaterLayouts/${item.id}`);
          } catch {
            // Logged cleanly
          }
        }
      },
    });
  };

  // -------------------------------------------------------------
  // Mouse Event Handlers on SVG Canvas (Pan, Marquee, Drag Move)
  // -------------------------------------------------------------
  const handleSvgMouseDown = (e: React.MouseEvent) => {
    // Middle click or Spacebar -> initiate Pan
    if (e.button === 1 || isSpacePressedRef.current || currentTool === 'pan') {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (e.button !== 0) return; // Only primary mouse button

    const coords = getCanvasCoords(e);

    // If click-to-add tool is active
    if (currentTool === 'add_seat') {
      handleAddSeatAt(coords.x, coords.y);
      return;
    }
    if (currentTool === 'add_label') {
      handleAddLabelAt(coords.x, coords.y);
      setCurrentTool('select');
      return;
    }

    // In 'select' mode on empty canvas -> Marquee selection
    if (currentTool === 'select') {
      const isShift = e.shiftKey || e.ctrlKey || e.metaKey;
      const baseSeats = isShift ? new Set(selectedSeatIds) : new Set<string>();
      const baseLabels = isShift ? new Set(selectedLabelIds) : new Set<string>();
      if (!isShift) {
        setSelectedSeatIds(new Set());
        setSelectedLabelIds(new Set());
      }
      marqueeBaseSelectionRef.current = { seats: baseSeats, labels: baseLabels };
      setIsMarqueeSelecting(true);
      setMarqueeStart(coords);
      setMarqueeCurrent(coords);
    }
  };

  const handleElementMouseDown = (
    e: React.MouseEvent,
    type: 'seat' | 'label',
    id: string
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    // If Ticket Select tool is active
    if (currentTool === 'ticket_select') {
      if (type === 'seat' && onSeatToggle) {
        const s = layout.seats.find((item) => item.id === id);
        if (s && !s.isDisabled) {
          onSeatToggle(s.floor, s.row, s.seatNumber, e);
        }
      }
      return;
    }

    // If tool is pan, do nothing here
    if (currentTool === 'pan') return;

    const isMultiKey = e.shiftKey || e.ctrlKey || e.metaKey;
    let nextSeats = new Set(selectedSeatIds);
    let nextLabels = new Set(selectedLabelIds);

    if (type === 'seat') {
      const clickedSeat = layout.seats.find((s) => s.id === id);
      const groupMemberIds = clickedSeat?.groupId
        ? layout.seats.filter((s) => s.groupId === clickedSeat.groupId).map((s) => s.id)
        : [id];

      if (isMultiKey) {
        const isRemoving = nextSeats.has(id);
        groupMemberIds.forEach((mId) => {
          if (isRemoving) nextSeats.delete(mId);
          else nextSeats.add(mId);
        });
      } else {
        if (!nextSeats.has(id)) {
          nextSeats = new Set(groupMemberIds);
          nextLabels = new Set();
        } else {
          groupMemberIds.forEach((mId) => nextSeats.add(mId));
        }
      }
    } else {
      if (isMultiKey) {
        if (nextLabels.has(id)) nextLabels.delete(id);
        else nextLabels.add(id);
      } else {
        if (!nextLabels.has(id)) {
          nextLabels = new Set([id]);
          nextSeats = new Set();
        }
      }
    }

    setSelectedSeatIds(nextSeats);
    setSelectedLabelIds(nextLabels);

    const isClickedSelected = type === 'seat' ? nextSeats.has(id) : nextLabels.has(id);
    if (!isClickedSelected) return;

    const clickedEl =
      type === 'seat'
        ? layout.seats.find((s) => s.id === id)
        : layout.labels.find((l) => l.id === id);
    if (!clickedEl) return;

    // Initiate drag move for all currently selected elements (snap anchored on clickedEl)
    const coords = getCanvasCoords(e);
    setIsDraggingElements(true);
    setDragStartPos(coords);
    dragAnchorRef.current = { x: clickedEl.x, y: clickedEl.y };
    preDragLayoutRef.current = layout;
    hasDraggedRef.current = false;

    const seatMap = new Map<string, { x: number; y: number }>();
    const labelMap = new Map<string, { x: number; y: number }>();

    layout.seats.forEach((s) => {
      if (nextSeats.has(s.id)) {
        seatMap.set(s.id, { x: s.x, y: s.y });
      }
    });

    layout.labels.forEach((l) => {
      if (nextLabels.has(l.id)) {
        labelMap.set(l.id, { x: l.x, y: l.y });
      }
    });

    setElementInitialPositions({ seats: seatMap, labels: labelMap });
  };

  const handleStageResizeMouseDown = (
    e: React.MouseEvent,
    lbl: CustomLabel,
    handle: ResizeHandle
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const coords = getCanvasCoords(e);
    preResizeLayoutRef.current = layout;
    hasResizedRef.current = false;
    setResizingStage({
      labelId: lbl.id,
      handle,
      initialX: lbl.x,
      initialY: lbl.y,
      initialWidth: lbl.width || 360,
      initialHeight: lbl.height || 36,
      rotation: lbl.rotation || 0,
      startCanvasX: coords.x,
      startCanvasY: coords.y,
    });
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    // 1. Panning canvas
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    // 2. Resizing STAGE banner
    if (resizingStage) {
      const coords = getCanvasCoords(e);
      const rawDx = coords.x - resizingStage.startCanvasX;
      const rawDy = coords.y - resizingStage.startCanvasY;
      if (Math.abs(rawDx) > 0.5 || Math.abs(rawDy) > 0.5) {
        hasResizedRef.current = true;
      }

      const {
        labelId,
        handle,
        initialX,
        initialY,
        initialWidth,
        initialHeight,
        rotation,
      } = resizingStage;

      const radNeg = (-rotation * Math.PI) / 180;
      const cosNeg = Math.cos(radNeg);
      const sinNeg = Math.sin(radNeg);
      const localDx = rotation ? rawDx * cosNeg - rawDy * sinNeg : rawDx;
      const localDy = rotation ? rawDx * sinNeg + rawDy * cosNeg : rawDy;

      const hasW = handle.includes('w');
      const hasE = handle.includes('e');
      const hasN = handle.includes('n');
      const hasS = handle.includes('s');

      let left = 0;
      let top = 0;
      let right = initialWidth;
      let bottom = initialHeight;

      if (hasW) {
        if (snapToGrid && snapSize > 1) {
          const snappedLeft = snapVal(initialX + localDx) - initialX;
          left = Math.min(initialWidth - MIN_STAGE_SIZE, snappedLeft);
        } else {
          left = Math.min(initialWidth - MIN_STAGE_SIZE, localDx);
        }
      }
      if (hasE) {
        if (snapToGrid && snapSize > 1) {
          right = Math.max(MIN_STAGE_SIZE, snapVal(initialWidth + localDx));
        } else {
          right = Math.max(MIN_STAGE_SIZE, initialWidth + localDx);
        }
      }
      if (hasN) {
        if (snapToGrid && snapSize > 1) {
          const snappedTop = snapVal(initialY + localDy) - initialY;
          top = Math.min(initialHeight - MIN_STAGE_SIZE, snappedTop);
        } else {
          top = Math.min(initialHeight - MIN_STAGE_SIZE, localDy);
        }
      }
      if (hasS) {
        if (snapToGrid && snapSize > 1) {
          bottom = Math.max(MIN_STAGE_SIZE, snapVal(initialHeight + localDy));
        } else {
          bottom = Math.max(MIN_STAGE_SIZE, initialHeight + localDy);
        }
      }

      if (e.shiftKey && initialWidth > 0 && initialHeight > 0) {
        const aspect = initialWidth / initialHeight;
        let candW = right - left;
        let candH = bottom - top;

        if ((hasE || hasW) && !(hasN || hasS)) {
          candH = Math.max(MIN_STAGE_SIZE, Math.round(candW / aspect));
          candW = Math.max(MIN_STAGE_SIZE, Math.round(candH * aspect));
          if (hasW) left = right - candW;
          else right = left + candW;
          top = (initialHeight - candH) / 2;
          bottom = top + candH;
        } else if ((hasN || hasS) && !(hasE || hasW)) {
          candW = Math.max(MIN_STAGE_SIZE, Math.round(candH * aspect));
          candH = Math.max(MIN_STAGE_SIZE, Math.round(candW / aspect));
          if (hasN) top = bottom - candH;
          else bottom = top + candH;
          left = (initialWidth - candW) / 2;
          right = left + candW;
        } else {
          const scaleW = Math.abs(candW / initialWidth - 1);
          const scaleH = Math.abs(candH / initialHeight - 1);
          if (scaleW >= scaleH) {
            candH = Math.max(MIN_STAGE_SIZE, Math.round(candW / aspect));
            candW = Math.max(MIN_STAGE_SIZE, Math.round(candH * aspect));
          } else {
            candW = Math.max(MIN_STAGE_SIZE, Math.round(candH * aspect));
            candH = Math.max(MIN_STAGE_SIZE, Math.round(candW / aspect));
          }
          if (hasW) left = right - candW;
          else right = left + candW;
          if (hasN) top = bottom - candH;
          else bottom = top + candH;
        }
      }

      const newWidth = Math.max(MIN_STAGE_SIZE, Math.round(right - left));
      const newHeight = Math.max(MIN_STAGE_SIZE, Math.round(bottom - top));

      const oldCx = initialX + initialWidth / 2;
      const oldCy = initialY + initialHeight / 2;
      const dcx = (left + right) / 2 - initialWidth / 2;
      const dcy = (top + bottom) / 2 - initialHeight / 2;
      const radPos = (rotation * Math.PI) / 180;
      const worldDcx = rotation ? dcx * Math.cos(radPos) - dcy * Math.sin(radPos) : dcx;
      const worldDcy = rotation ? dcx * Math.sin(radPos) + dcy * Math.cos(radPos) : dcy;

      const newX = Math.round(oldCx + worldDcx - newWidth / 2);
      const newY = Math.round(oldCy + worldDcy - newHeight / 2);

      setLayout((prev) => ({
        ...prev,
        labels: prev.labels.map((l) =>
          l.id === labelId ? { ...l, x: newX, y: newY, width: newWidth, height: newHeight } : l
        ),
      }));
      return;
    }

    // 3. Marquee box selection
    if (isMarqueeSelecting && marqueeStart) {
      const coords = getCanvasCoords(e);
      setMarqueeCurrent(coords);

      const minX = Math.min(marqueeStart.x, coords.x);
      const maxX = Math.max(marqueeStart.x, coords.x);
      const minY = Math.min(marqueeStart.y, coords.y);
      const maxY = Math.max(marqueeStart.y, coords.y);

      const newSeats = new Set<string>(marqueeBaseSelectionRef.current.seats);
      layout.seats.forEach((seat) => {
        const sW = seat.width || 24;
        const sH = seat.height || 24;
        if (
          seat.x + sW >= minX &&
          seat.x <= maxX &&
          seat.y + sH >= minY &&
          seat.y <= maxY
        ) {
          newSeats.add(seat.id);
        }
      });

      const newLabels = new Set<string>(marqueeBaseSelectionRef.current.labels);
      layout.labels.forEach((lbl) => {
        const lW = lbl.width || 100;
        const lH = lbl.height || 30;
        if (
          lbl.x + lW >= minX &&
          lbl.x <= maxX &&
          lbl.y + lH >= minY &&
          lbl.y <= maxY
        ) {
          newLabels.add(lbl.id);
        }
      });

      setSelectedSeatIds(newSeats);
      setSelectedLabelIds(newLabels);
      return;
    }

    // 4. Dragging selected elements (snap anchored on dragged element only)
    if (isDraggingElements && dragStartPos && elementInitialPositions) {
      const coords = getCanvasCoords(e);
      const rawDx = coords.x - dragStartPos.x;
      const rawDy = coords.y - dragStartPos.y;
      if (Math.abs(rawDx) > 0.5 || Math.abs(rawDy) > 0.5) {
        hasDraggedRef.current = true;
      }

      const anchor = dragAnchorRef.current;
      const effectiveDx = anchor
        ? snapVal(anchor.x + rawDx) - anchor.x
        : snapVal(rawDx);
      const effectiveDy = anchor
        ? snapVal(anchor.y + rawDy) - anchor.y
        : snapVal(rawDy);

      const newSeats = layout.seats.map((s) => {
        const initial = elementInitialPositions.seats.get(s.id);
        if (initial) {
          return {
            ...s,
            x: initial.x + effectiveDx,
            y: initial.y + effectiveDy,
          };
        }
        return s;
      });

      const newLabels = layout.labels.map((l) => {
        const initial = elementInitialPositions.labels.get(l.id);
        if (initial) {
          return {
            ...l,
            x: initial.x + effectiveDx,
            y: initial.y + effectiveDy,
          };
        }
        return l;
      });

      setLayout((prev) => ({
        ...prev,
        seats: newSeats,
        labels: newLabels,
      }));
    }
  };

  const handleSvgMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (isMarqueeSelecting) {
      setIsMarqueeSelecting(false);
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }
    if (resizingStage) {
      setResizingStage(null);
      const preSnap = preResizeLayoutRef.current;
      preResizeLayoutRef.current = null;
      if (hasResizedRef.current && preSnap) {
        setHistory((prev) => [...prev.slice(-30), preSnap]);
        setFuture([]);
        setLayout((prev) => ({ ...prev, updatedAt: new Date().toISOString() }));
      }
      hasResizedRef.current = false;
    }
    if (isDraggingElements) {
      setIsDraggingElements(false);
      setDragStartPos(null);
      setElementInitialPositions(null);
      dragAnchorRef.current = null;
      const preSnap = preDragLayoutRef.current;
      preDragLayoutRef.current = null;
      if (hasDraggedRef.current && preSnap) {
        setHistory((prev) => [...prev.slice(-30), preSnap]);
        setFuture([]);
        setLayout((prev) => ({ ...prev, updatedAt: new Date().toISOString() }));
      }
      hasDraggedRef.current = false;
    }
  }, [isPanning, isMarqueeSelecting, resizingStage, isDraggingElements]);

  // Ensure mouseup outside SVG canvas cleanly ends active drag/resize/marquee/pan
  useEffect(() => {
    if (!isPanning && !isMarqueeSelecting && !isDraggingElements && !resizingStage) {
      return;
    }
    window.addEventListener('mouseup', handleSvgMouseUp);
    return () => window.removeEventListener('mouseup', handleSvgMouseUp);
  }, [isPanning, isMarqueeSelecting, isDraggingElements, resizingStage, handleSvgMouseUp]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || currentTool === 'pan') {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((prev) => Math.min(Math.max(0.3, prev * zoomFactor), 2.5));
    }
  };

  // Reset Zoom & Pan
  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="w-full flex flex-col items-center bg-slate-50 border border-slate-300 rounded-2xl shadow-sm overflow-visible select-none">
      {/* ========================================================= */}
      {/* Top Header & Toolbar (인쇄 시 숨김: no-print) */}
      {/* ========================================================= */}
      <div className="no-print w-full bg-white border-b border-slate-200 rounded-t-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs z-20">
        {/* Left: Layout Name, Save Status & Seat Count */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                effectiveSaveStatus === 'saving'
                  ? 'bg-amber-400 animate-ping'
                  : effectiveSaveStatus === 'error'
                  ? 'bg-red-500'
                  : effectiveSaveStatus === 'modified'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
            />
            <input
              type="text"
              value={layout.name}
              onFocus={() => {
                preTitleEditLayoutRef.current = layout;
              }}
              onChange={(e) =>
                setLayout((prev) => ({ ...prev, name: e.target.value }))
              }
              onBlur={() => {
                const prevSnapshot = preTitleEditLayoutRef.current;
                preTitleEditLayoutRef.current = null;
                if (prevSnapshot && prevSnapshot.name !== layout.name) {
                  setHistory((prev) => [...prev.slice(-30), prevSnapshot]);
                  setFuture([]);
                  setLayout((prev) => ({ ...prev, updatedAt: new Date().toISOString() }));
                }
              }}
              className="text-base font-black text-slate-800 bg-transparent hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-500 rounded px-2 py-0.5 border border-transparent hover:border-slate-300 transition-colors cursor-text"
              placeholder="배치도 이름 입력"
              title="배치도 이름을 직접 수정할 수 있습니다"
            />
          </div>

          {/* Save Status Indicator */}
          <div className="flex items-center gap-1.5">
            {effectiveSaveStatus === 'saving' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>저장 중</span>
              </span>
            )}
            {effectiveSaveStatus === 'saved' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Check className="w-3 h-3" />
                <span>저장됨</span>
              </span>
            )}
            {effectiveSaveStatus === 'modified' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <span>수정됨</span>
              </span>
            )}
            {effectiveSaveStatus === 'error' && (
              <div className="inline-flex items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200"
                  title={saveErrorMessage || '저장 실패'}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>저장 실패</span>
                </span>
                <button
                  type="button"
                  onClick={handleRetrySave}
                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>다시 시도</span>
                </button>
              </div>
            )}
          </div>

          <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
            총 {layout.seats.filter((s) => !s.isDisabled).length}석
            {layout.seats.some((s) => s.isDisabled) &&
              ` (결번 ${layout.seats.filter((s) => s.isDisabled).length}석)`}
          </span>

          {currentLayoutId && layout.shareCode && (
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(layout.shareCode!)}`;
                navigator.clipboard?.writeText(url).then(
                  () => showToast(`공유 링크가 복사되었습니다. (코드: ${layout.shareCode})`),
                  () => showToast(`공유 코드: ${layout.shareCode}`)
                );
              }}
              className="text-[11px] font-mono font-bold px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full border border-slate-200 transition-colors cursor-pointer"
              title="클릭하여 공유 링크(?code=...) 복사"
            >
              {layout.shareCode}
            </button>
          )}
        </div>

        {/* Center: Tools selector */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
          <button
            type="button"
            onClick={() => setCurrentTool('select')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentTool === 'select'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="선택 도구: 단일 클릭 또는 영역 드래그로 다중 선택"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>선택/이동</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTool('ticket_select')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentTool === 'ticket_select'
                ? 'bg-amber-400 text-slate-950 shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="좌석 예매 모드: 클릭하여 예매 등급 지정 및 취소"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>좌석 클릭/예매</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTool('add_seat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentTool === 'add_seat'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="좌석 추가 모드: 캔버스를 클릭하여 좌석을 하나씩 추가"
          >
            <Square className="w-3.5 h-3.5" />
            <span>좌석 추가</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRowGenerator(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-xs transition-colors cursor-pointer"
            title="열 만들기: 직사각형 또는 부채형 곡선으로 한 줄 일괄 생성"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>열 만들기 (일괄)</span>
          </button>

          <button
            type="button"
            onClick={handleAddStageBanner}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
            title="무대(STAGE) 배너 추가"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>STAGE</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTool('add_label')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentTool === 'add_label'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="텍스트 라벨 추가: 구역명, 콘솔, 출입구 등 텍스트 삽입"
          >
            <Type className="w-3.5 h-3.5" />
            <span>라벨</span>
          </button>
        </div>

        {/* Right: Actions, History, Grid, File Export/Import */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={handleUndo}
              disabled={history.length === 0}
              className="p-1.5 text-slate-700 hover:text-slate-950 disabled:opacity-30 disabled:cursor-not-allowed rounded cursor-pointer"
              title="실행 취소 (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={future.length === 0}
              className="p-1.5 text-slate-700 hover:text-slate-950 disabled:opacity-30 disabled:cursor-not-allowed rounded cursor-pointer"
              title="다시 실행 (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Grid & Snap + Snap Size Unit */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleToggleSnapToGrid}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                snapToGrid
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
              }`}
              title="격자 스냅 (자석 효과 켜기/끄기)"
            >
              <Grid className="w-3.5 h-3.5" />
              <span>스냅 {snapToGrid ? 'ON' : 'OFF'}</span>
            </button>

            <select
              value={snapSize}
              onChange={(e) =>
                handleChangeSnapSize(Number(e.target.value) as SnapSizeOption)
              }
              aria-label="스냅 단위"
              title="스냅 격자 단위 선택 (px)"
              className="px-2 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
            >
              {SNAP_SIZE_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}px
                </option>
              ))}
            </select>
          </div>

          {/* Save & Save As Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleSaveClick()}
              disabled={
                effectiveSaveStatus === 'saving' ||
                (Boolean(currentLayoutId) && !isDirty && effectiveSaveStatus !== 'error')
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-2xs transition-colors cursor-pointer"
              title={
                currentLayoutId
                  ? '현재 문서에 덮어쓰기 저장 (Ctrl+S / ⌘+S)'
                  : '새 배치도 이름 입력 후 저장 (Ctrl+S / ⌘+S)'
              }
            >
              {effectiveSaveStatus === 'saving' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>저장</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveAsClick()}
              disabled={effectiveSaveStatus === 'saving'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-colors cursor-pointer"
              title="현재 배치도를 새 문서 및 새 공유 코드로 저장"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>다른 이름으로 저장</span>
            </button>
          </div>

          {/* Auth Status Button (이메일 + 로그아웃) */}
          {user ? (
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
              <span
                className="text-xs font-semibold text-slate-700 max-w-[150px] truncate"
                title={user.email || user.displayName || '로그인됨'}
              >
                {user.email || user.displayName || '로그인됨'}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                title="로그아웃"
              >
                <LogOut className="w-3 h-3" />
                <span>로그아웃</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void requestLoginAndContinue('loginOnly')}
              disabled={isSigningIn}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="회사 Google 계정(@lgart.com)으로 로그인하여 내 배치도 동기화"
            >
              {isSigningIn ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              ) : (
                <LogIn className="w-3.5 h-3.5 text-blue-600" />
              )}
              <span>로그인</span>
            </button>
          )}

          {/* Template Menu */}
          <div className="relative" ref={templateMenuRef}>
            <button
              type="button"
              onClick={() => {
                const nextOpen = !showTemplateMenu;
                setShowTemplateMenu(nextOpen);
                if (
                  nextOpen &&
                  user &&
                  isAllowedCompanyUser(user) &&
                  (savedLayoutsError || (!isLoadingSavedLayouts && savedLayouts.length === 0))
                ) {
                  void refreshSavedLayouts(user);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-2xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>템플릿</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showTemplateMenu && (
              <div className="absolute right-0 mt-2 w-76 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-40 max-h-[75vh] overflow-y-auto">
                {/* 1. 기존 좌석배치도에서 복사 */}
                <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  기존 좌석배치도에서 복사
                </div>
                <button
                  type="button"
                  onClick={() => requestLoadTemplate('signature')}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center justify-between cursor-pointer"
                >
                  <span>LG SIGNATURE Hall</span>
                  <span className="text-[10px] text-slate-400">1·2·3층 복사</span>
                </button>
                <button
                  type="button"
                  onClick={() => requestLoadTemplate('uplus')}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center justify-between cursor-pointer"
                >
                  <span>U+ STAGE (End Stage)</span>
                  <span className="text-[10px] text-slate-400">1층 가변형 복사</span>
                </button>

                <div className="border-t border-slate-100 my-1.5" />

                {/* 2. 내 배치도 & 공유 코드 */}
                <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>내 배치도</span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {user ? `${savedLayouts.length}개` : '로그인 필요'}
                  </span>
                </div>
                {!user ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowTemplateMenu(false);
                      void requestLoginAndContinue('openMyLayouts');
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 flex items-center justify-between cursor-pointer"
                  >
                    <span>내 배치도 목록 열기</span>
                    <span className="text-[10px] text-blue-500">로그인 필요</span>
                  </button>
                ) : isLoadingSavedLayouts && savedLayouts.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>배치도 불러오는 중...</span>
                  </div>
                ) : savedLayoutsError && savedLayouts.length === 0 ? (
                  <div className="px-3 py-2 space-y-1.5">
                    <div className="text-[11px] text-red-600 font-semibold">
                      {savedLayoutsError}
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshSavedLayouts(user)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>다시 불러오기</span>
                    </button>
                  </div>
                ) : savedLayouts.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-slate-400 font-medium">
                    저장된 배치도가 없습니다
                  </div>
                ) : (
                  savedLayouts.map((item) => {
                    const isCurrent = currentLayoutId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between px-3 py-1.5 transition-colors ${
                          isCurrent ? 'bg-blue-50/70' : 'hover:bg-slate-100'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => requestLoadSavedLayout(item)}
                          className="flex-1 min-w-0 text-left flex items-center justify-between gap-2 cursor-pointer pr-2"
                          title={`'${item.name}' 불러오기`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {isCurrent ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}
                            <span
                              className={`text-xs truncate ${
                                isCurrent
                                  ? 'font-bold text-blue-600'
                                  : 'font-semibold text-slate-700'
                              }`}
                            >
                              {item.name}
                            </span>
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {item.seatCount}석
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDeleteSavedLayout(item);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer shrink-0"
                          title={`'${item.name}' 삭제`}
                          aria-label={`'${item.name}' 삭제`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowTemplateMenu(false);
                    if (!user || !isAllowedCompanyUser(user)) {
                      void requestLoginAndContinue('openShareCodeModal');
                      return;
                    }
                    setShareCodeInput('');
                    setShareCodeError(null);
                    setShowShareCodeModal(true);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center justify-between cursor-pointer"
                >
                  <span>공유 코드로 불러오기</span>
                  <span className="text-[10px] text-slate-400">코드 입력</span>
                </button>

                <div className="border-t border-slate-100 my-1.5" />

                {/* 3. JSON 내보내기 / 가져오기 */}
                <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  JSON 내보내기 / 가져오기
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleExportJson();
                    setShowTemplateMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center justify-between cursor-pointer"
                >
                  <span>JSON 내보내기</span>
                  <span className="text-[10px] text-slate-400">다른 기기 공유용</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTemplateMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center justify-between cursor-pointer"
                >
                  <span>JSON 가져오기</span>
                  <span className="text-[10px] text-slate-400">파일 불러오기</span>
                </button>

                <div className="border-t border-slate-100 my-1.5" />

                {/* 4. 빨간 초기화 항목 */}
                <button
                  type="button"
                  onClick={() => requestLoadTemplate('blank')}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>빈 캔버스로 초기화</span>
                </button>
              </div>
            )}
          </div>

          {/* JSON Export / Import */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 shadow-2xs transition-colors cursor-pointer"
              title="배치도를 JSON 파일로 내보내기 및 공유"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON 내보내기</span>
            </button>

            <label
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
              title="JSON 파일에서 배치도 가져오기"
            >
              <Upload className="w-3.5 h-3.5 text-blue-600" />
              <span>가져오기</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Save Error Banner (네트워크/권한 오류 시 편집 내용 유지 + 다시 시도) */}
      {effectiveSaveStatus === 'error' && saveErrorMessage && (
        <div className="no-print w-full bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-red-700 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{saveErrorMessage} (캔버스 편집 내용은 그대로 유지됩니다.)</span>
          </div>
          <button
            type="button"
            onClick={handleRetrySave}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>다시 시도</span>
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* Floating Property Inspector (When items are selected) */}
      {/* ========================================================= */}
      {totalSelectedCount > 0 && (
        <div className="no-print w-full bg-slate-900 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs z-10 shadow-md animate-fadeIn">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-black text-amber-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {selectedSeatIds.size > 0
                ? `${selectedSeatIds.size}석 선택됨${
                    selectedLabelIds.size > 0 ? ` · 라벨 ${selectedLabelIds.size}개` : ''
                  }`
                : `라벨 ${selectedLabelIds.size}개 선택됨`}
            </span>

            {/* If Single Seat Selected: Edit Floor, Row, Seat Number */}
            {singleSelectedSeat && (
              <div className="flex items-center gap-2 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                <span className="text-slate-400 font-bold">좌석 정보:</span>
                <input
                  type="text"
                  value={singleSelectedSeat.floor}
                  onChange={(e) => updateSelectedSeats({ floor: e.target.value })}
                  className="w-12 bg-slate-950 text-white font-bold px-1.5 py-0.5 rounded border border-slate-600 text-center"
                  placeholder="층"
                  title="층 이름"
                />
                <input
                  type="text"
                  value={singleSelectedSeat.row}
                  onChange={(e) => updateSelectedSeats({ row: e.target.value })}
                  className="w-14 bg-slate-950 text-white font-bold px-1.5 py-0.5 rounded border border-slate-600 text-center"
                  placeholder="열"
                  title="열 이름"
                />
                <input
                  type="number"
                  value={singleSelectedSeat.seatNumber}
                  onChange={(e) =>
                    updateSelectedSeats({
                      seatNumber: parseInt(e.target.value, 10) || 1,
                    })
                  }
                  className="w-14 bg-slate-950 text-white font-bold px-1.5 py-0.5 rounded border border-slate-600 text-center"
                  placeholder="번호"
                  title="좌석 번호"
                />
              </div>
            )}

            {/* If Multiple Seats Selected: Renumber & Grouping */}
            {selectedSeatIds.size > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                {selectedSeatIds.size > 1 && (
                  <>
                    <span className="text-slate-400 font-bold">일괄 번호:</span>
                    <button
                      type="button"
                      onClick={() => handleRenumberSelectedSeats(1)}
                      className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded font-bold text-white transition-colors cursor-pointer"
                      title="좌측부터 1번으로 자동 연속 부여"
                    >
                      1번부터 재정렬
                    </button>
                    <button
                      type="button"
                      onClick={handleGroupSelectedSeats}
                      className="flex items-center gap-1 px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 rounded font-bold text-white transition-colors cursor-pointer"
                      title="선택된 좌석들을 하나의 그룹으로 묶기 (Ctrl+G)"
                    >
                      <Link2 className="w-3 h-3" />
                      <span>그룹 묶기</span>
                    </button>
                  </>
                )}
                {layout.seats.some((s) => selectedSeatIds.has(s.id) && Boolean(s.groupId)) && (
                  <button
                    type="button"
                    onClick={handleUngroupSelectedSeats}
                    className="flex items-center gap-1 px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded font-bold text-slate-200 transition-colors cursor-pointer"
                    title="선택된 좌석의 그룹 해제 (Ctrl+Shift+G)"
                  >
                    <Unlink className="w-3 h-3" />
                    <span>그룹 해제</span>
                  </button>
                )}
              </div>
            )}

            {/* Grade assignment buttons for selected seats */}
            {selectedSeatIds.size > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-bold">등급:</span>
                {AVAILABLE_GRADES.map((gradeKey) => {
                  const style = getGradeStyle(gradeKey);
                  return (
                    <button
                      type="button"
                      key={gradeKey}
                      onClick={() => updateSelectedSeats({ grade: gradeKey })}
                      className="px-2 py-1 rounded font-bold text-[11px] border border-white/20 transition-transform active:scale-95 cursor-pointer flex items-center gap-1"
                      style={{ backgroundColor: style.hex, color: '#ffffff' }}
                      title={`${gradeKey}으로 지정`}
                    >
                      <span>{gradeCustomNames?.[gradeKey] || gradeKey}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 결번 처리 Toggle */}
            {selectedSeatIds.size > 0 && (
              <button
                type="button"
                onClick={handleToggleDisabled}
                className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-slate-200 rounded font-bold border border-zinc-600 transition-colors cursor-pointer"
                title="통로/결번으로 지정하여 번호 건너뛰기"
              >
                결번 처리
              </button>
            )}

            {/* Rotation controls */}
            <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">
              <span className="text-slate-400 font-bold">회전:</span>
              <button
                type="button"
                onClick={() => handleRotateSelected(-15)}
                className="px-1.5 py-0.5 hover:bg-slate-700 rounded text-slate-300 font-mono font-bold cursor-pointer"
                title="-15° 회전"
              >
                -15°
              </button>
              <button
                type="button"
                onClick={() => handleRotateSelected(15)}
                className="px-1.5 py-0.5 hover:bg-slate-700 rounded text-slate-300 font-mono font-bold cursor-pointer"
                title="+15° 회전"
              >
                +15°
              </button>
              <button
                type="button"
                onClick={() => handleRotateSelected(90)}
                className="px-1.5 py-0.5 hover:bg-slate-700 rounded text-slate-300 font-mono font-bold cursor-pointer"
                title="+90° 회전"
              >
                90°
              </button>
            </div>

            {/* Single Label Properties */}
            {singleSelectedLabel && (
              <div className="flex flex-wrap items-center gap-2 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                <span className="text-slate-400 font-bold">텍스트:</span>
                <input
                  type="text"
                  value={singleSelectedLabel.text}
                  onChange={(e) => updateSelectedLabel({ text: e.target.value })}
                  className="w-32 bg-slate-950 text-white font-bold px-1.5 py-0.5 rounded border border-slate-600"
                />
                <span className="text-slate-400 font-bold ml-1">글자:</span>
                <input
                  type="number"
                  min={10}
                  max={48}
                  value={singleSelectedLabel.fontSize}
                  onChange={(e) =>
                    updateSelectedLabel({
                      fontSize: parseInt(e.target.value, 10) || 14,
                    })
                  }
                  className="w-12 bg-slate-950 text-white font-bold px-1 py-0.5 rounded border border-slate-600 text-center"
                />
                {singleSelectedLabel.isStageBanner && (
                  <>
                    <span className="text-slate-400 font-bold ml-1">너비:</span>
                    <input
                      type="number"
                      min={MIN_STAGE_SIZE}
                      value={stageWidthInput}
                      onFocus={handleStageDimFocus}
                      onChange={(e) => handleStageDimChange('width', e.target.value)}
                      onBlur={() => handleStageDimBlur('width')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="w-16 bg-slate-950 text-white font-bold px-1.5 py-0.5 rounded border border-slate-600 text-center"
                      title="STAGE 너비 (최소 40px)"
                    />
                    <span className="text-slate-400 font-bold ml-1">높이:</span>
                    <input
                      type="number"
                      min={MIN_STAGE_SIZE}
                      value={stageHeightInput}
                      onFocus={handleStageDimFocus}
                      onChange={(e) => handleStageDimChange('height', e.target.value)}
                      onBlur={() => handleStageDimBlur('height')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="w-16 bg-slate-950 text-white font-bold px-1.5 py-0.5 rounded border border-slate-600 text-center"
                      title="STAGE 높이 (최소 40px)"
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: Copy & Delete */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySelected}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold border border-slate-700 transition-colors cursor-pointer"
              title="복사 (Ctrl+C)"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>복사</span>
            </button>

            <button
              type="button"
              onClick={handleDeleteSelected}
              className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition-colors cursor-pointer"
              title="선택 항목 삭제 (Delete 키)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>삭제</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedSeatIds(new Set());
                setSelectedLabelIds(new Set());
              }}
              className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              title="선택 해제 (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Color & Legend Inspector Card (둥근 카드, 회색 섹션 라벨) */}
      {/* ========================================================= */}
      {(selectedSeatIds.size > 0 || singleSelectedLabel !== null) && (
        <div className="no-print w-full bg-slate-100/90 border-b border-slate-200 px-4 py-2.5 z-10">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs px-3.5 py-2.5 flex flex-col gap-2.5">
            {/* Top Row: Section Header + STAGE Targets + Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {selectedSeatIds.size > 0
                      ? `좌석 색상 (${selectedSeatIds.size}석 선택)`
                      : singleSelectedLabel?.isStageBanner
                      ? 'STAGE 도형 색상'
                      : '라벨 색상'}
                  </span>
                </div>

                {/* STAGE Target Selector: 배경색 / 글자색 / 테두리색 */}
                {selectedSeatIds.size === 0 && singleSelectedLabel?.isStageBanner && (
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    {(
                      [
                        {
                          key: 'bgColor',
                          label: '배경색',
                          color: singleSelectedLabel.bgColor || DEFAULT_STAGE_BG_COLOR,
                        },
                        {
                          key: 'color',
                          label: '글자색',
                          color: singleSelectedLabel.color || DEFAULT_STAGE_TEXT_COLOR,
                        },
                        {
                          key: 'borderColor',
                          label: '테두리색',
                          color: singleSelectedLabel.borderColor || DEFAULT_STAGE_BORDER_COLOR,
                        },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setStageColorTarget(tab.key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          stageColorTarget === tab.key
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                          style={{ backgroundColor: tab.color }}
                        />
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleResetColorToDefault}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                  title="선택 항목의 색상을 기본색으로 되돌리기"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>기본색으로 되돌리기</span>
                </button>

                {selectedSeatIds.size > 0 && (
                  <button
                    type="button"
                    onClick={requestApplyColorToAllSeats}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer"
                    title="현재 색상을 전체 좌석에 일괄 적용 (확인 팝업)"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>전체 좌석에 적용</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Row: Presets, Custom Picker + #RRGGBB, Recent Colors, Legend Register */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
              {/* 1. 프리셋 팔레트 (10색) */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  프리셋 팔레트
                </span>
                <div className="flex items-center gap-1.5">
                  {COLOR_PRESET_PALETTE.map((preset) => {
                    const isActive = activeElementColor === preset.hex.toLowerCase();
                    const checkColor = getReadableTextColor(preset.hex);
                    return (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() =>
                          applyColorToSelection(preset.hex, {
                            recordUndo: true,
                            addRecent: true,
                          })
                        }
                        className={`w-6 h-6 rounded-lg border transition-transform hover:scale-110 flex items-center justify-center cursor-pointer ${
                          isActive
                            ? 'ring-2 ring-blue-500 ring-offset-1 border-slate-400'
                            : 'border-slate-300'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                        title={`${preset.name} (${preset.hex.toUpperCase()})`}
                        aria-label={`${preset.name} (${preset.hex.toUpperCase()})`}
                      >
                        {isActive && (
                          <Check className="w-3.5 h-3.5" style={{ color: checkColor }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. 커스텀 색상 선택기 & #RRGGBB 입력 */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  커스텀 색상 (#RRGGBB)
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={activeElementColor}
                    onMouseDown={() => {
                      colorPickerSessionPushedRef.current = false;
                    }}
                    onFocus={() => {
                      colorPickerSessionPushedRef.current = false;
                    }}
                    onChange={(e) => {
                      setHexColorInput(e.target.value.toUpperCase());
                      setHexColorError(false);
                      applyColorToSelection(e.target.value, {
                        recordUndo: false,
                        addRecent: false,
                      });
                    }}
                    onBlur={(e) => {
                      colorPickerSessionPushedRef.current = false;
                      addRecentColor(e.target.value);
                    }}
                    className="w-7 h-7 rounded-lg border border-slate-300 bg-white p-0.5 cursor-pointer"
                    title="커스텀 색상 선택"
                  />
                  <input
                    type="text"
                    value={hexColorInput}
                    maxLength={7}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setHexColorInput(val);
                      const candidate = val.trim().startsWith('#')
                        ? val.trim()
                        : `#${val.trim()}`;
                      if (isValidHexColor(candidate)) {
                        setHexColorError(false);
                      }
                    }}
                    onBlur={() => {
                      if (hexColorInput.trim().toLowerCase() !== activeElementColor) {
                        handleHexInputCommit(hexColorInput);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleHexInputCommit(hexColorInput);
                      }
                    }}
                    placeholder="#7C3AED"
                    className={`w-24 px-2 py-1 rounded-lg border text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 ${
                      hexColorError
                        ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-300'
                        : 'border-slate-300 bg-slate-50 text-slate-800 focus:bg-white focus:ring-blue-400'
                    }`}
                    title="#RRGGBB 형식 입력 후 Enter"
                  />
                </div>
              </div>

              {/* 3. 최근 사용 색상 */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  최근 사용 색상
                </span>
                <div className="flex items-center gap-1.5 min-h-[26px]">
                  {recentColors.length === 0 ? (
                    <span className="text-[11px] text-slate-400 font-medium">
                      선택 기록 없음
                    </span>
                  ) : (
                    recentColors.map((hex) => {
                      const isActive = activeElementColor === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          type="button"
                          onClick={() =>
                            applyColorToSelection(hex, {
                              recordUndo: true,
                              addRecent: true,
                            })
                          }
                          className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 cursor-pointer ${
                            isActive
                              ? 'ring-2 ring-blue-500 ring-offset-1 border-slate-500'
                              : 'border-slate-300'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={hex.toUpperCase()}
                          aria-label={`최근 색상 ${hex.toUpperCase()}`}
                        />
                      );
                    })
                  )}
                </div>
              </div>

              {/* 4. 범례에 현재 색상 등록 */}
              {selectedSeatIds.size > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    범례 이름 지정
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-5 h-5 rounded-md border border-slate-300 shrink-0"
                      style={{ backgroundColor: activeElementColor }}
                    />
                    <input
                      type="text"
                      value={legendLabelDraft}
                      onChange={(e) => setLegendLabelDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddLegendItem(activeElementColor, legendLabelDraft);
                        }
                      }}
                      placeholder="예: VIP석"
                      className="w-24 px-2 py-1 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleAddLegendItem(activeElementColor, legendLabelDraft)
                      }
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white transition-colors cursor-pointer"
                      title="현재 색상에 이름을 붙여 범례에 추가"
                    >
                      <Plus className="w-3 h-3" />
                      <span>범례 추가</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SVG Interactive Canvas Viewport */}
      {/* ========================================================= */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="relative w-full overflow-hidden bg-slate-100 flex items-center justify-center min-h-[680px] cursor-default"
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`}
          className="w-full max-w-full h-auto min-h-[680px] bg-white transition-transform duration-75"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
        >
          {/* Grid pattern */}
          {showGrid && (
            <defs>
              <pattern
                id="custom-grid-pattern"
                width={Math.max(10, snapSize)}
                height={Math.max(10, snapSize)}
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r="1" fill="#cbd5e1" opacity="0.7" />
              </pattern>
            </defs>
          )}

          {/* Background rect for capturing canvas clicks */}
          <rect
            x={0}
            y={0}
            width={layout.canvasWidth}
            height={layout.canvasHeight}
            fill={showGrid ? 'url(#custom-grid-pattern)' : '#ffffff'}
          />

          {/* 1. Labels rendering */}
          {layout.labels.map((lbl) => {
            const isSelected = selectedLabelIds.has(lbl.id);
            const rot = lbl.rotation || 0;

            if (lbl.isStageBanner) {
              const bW = lbl.width || 360;
              const bH = lbl.height || 36;
              const resizeHandles: Array<{
                id: ResizeHandle;
                x: number;
                y: number;
                cursor: string;
              }> = [
                { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
                { id: 'n', x: bW / 2, y: 0, cursor: 'ns-resize' },
                { id: 'ne', x: bW, y: 0, cursor: 'nesw-resize' },
                { id: 'e', x: bW, y: bH / 2, cursor: 'ew-resize' },
                { id: 'se', x: bW, y: bH, cursor: 'nwse-resize' },
                { id: 's', x: bW / 2, y: bH, cursor: 'ns-resize' },
                { id: 'sw', x: 0, y: bH, cursor: 'nesw-resize' },
                { id: 'w', x: 0, y: bH / 2, cursor: 'ew-resize' },
              ];
              return (
                <g
                  key={lbl.id}
                  transform={`translate(${lbl.x}, ${lbl.y}) rotate(${rot}, ${bW / 2}, ${bH / 2})`}
                  onMouseDown={(e) => handleElementMouseDown(e, 'label', lbl.id)}
                  className="cursor-move select-none"
                >
                  <rect
                    width={bW}
                    height={bH}
                    rx={lbl.borderRadius || 6}
                    fill={lbl.bgColor || '#1e293b'}
                    stroke={isSelected ? '#3b82f6' : lbl.borderColor || '#334155'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeDasharray={isSelected ? '4 2' : undefined}
                  />
                  <text
                    x={bW / 2}
                    y={bH / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={lbl.color || '#f8fafc'}
                    fontSize={lbl.fontSize || 14}
                    fontWeight={lbl.fontWeight || 'black'}
                    letterSpacing="0.25em"
                    className="pointer-events-none select-none font-sans"
                  >
                    {lbl.text}
                  </text>
                  <text
                    x={bW / 2}
                    y={bH + 16}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize={10}
                    fontWeight="600"
                    className="pointer-events-none select-none"
                  >
                    무대 방향
                  </text>
                  {isSelected &&
                    currentTool !== 'ticket_select' &&
                    resizeHandles.map((h) => (
                      <rect
                        key={h.id}
                        x={h.x - 4.5}
                        y={h.y - 4.5}
                        width={9}
                        height={9}
                        rx={1.5}
                        fill="#ffffff"
                        stroke="#2563eb"
                        strokeWidth={1.75}
                        style={{ cursor: h.cursor }}
                        onMouseDown={(e) => handleStageResizeMouseDown(e, lbl, h.id)}
                      />
                    ))}
                </g>
              );
            }

            if (lbl.bgColor || lbl.borderColor || (lbl.width && lbl.height)) {
              const boxW = lbl.width || Math.max(44, lbl.text.length * (lbl.fontSize * 0.9) + 16);
              const boxH = lbl.height || lbl.fontSize + 12;
              return (
                <g
                  key={lbl.id}
                  transform={`translate(${lbl.x}, ${lbl.y}) rotate(${rot}, ${boxW / 2}, ${boxH / 2})`}
                  onMouseDown={(e) => handleElementMouseDown(e, 'label', lbl.id)}
                  className="cursor-move select-none"
                >
                  <rect
                    width={boxW}
                    height={boxH}
                    rx={lbl.borderRadius ?? 4}
                    fill={lbl.bgColor || '#f8fafc'}
                    stroke={isSelected ? '#3b82f6' : lbl.borderColor || '#cbd5e1'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeDasharray={isSelected ? '3 2' : undefined}
                  />
                  <text
                    x={boxW / 2}
                    y={boxH / 2 + (lbl.fontSize || 12) * 0.36}
                    textAnchor="middle"
                    fill={lbl.color || '#0f172a'}
                    fontSize={lbl.fontSize || 12}
                    fontWeight={lbl.fontWeight || 'bold'}
                    className="pointer-events-none select-none font-sans"
                  >
                    {lbl.text}
                  </text>
                </g>
              );
            }

            return (
              <g
                key={lbl.id}
                transform={`translate(${lbl.x}, ${lbl.y}) rotate(${rot})`}
                onMouseDown={(e) => handleElementMouseDown(e, 'label', lbl.id)}
                className="cursor-move select-none"
              >
                {isSelected && (
                  <rect
                    x={-4}
                    y={-lbl.fontSize}
                    width={lbl.text.length * (lbl.fontSize * 0.9) + 8}
                    height={lbl.fontSize + 8}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                    rx={2}
                  />
                )}
                <text
                  x={0}
                  y={0}
                  fill={lbl.color || '#334155'}
                  fontSize={lbl.fontSize || 13}
                  fontWeight={lbl.fontWeight || 'bold'}
                  className="pointer-events-none select-none font-sans"
                >
                  {lbl.text}
                </text>
              </g>
            );
          })}

          {/* 2. Seats rendering */}
          {layout.seats.map((seat) => {
            const isSelectedInEditor = selectedSeatIds.has(seat.id);
            const seatKey = `${seat.floor}_${cleanRowName(seat.row)}_${seat.seatNumber}`;

            // Check if booked via text organizer or ticket click
            const bookedGrade = seatGradeMap.get(seatKey);
            const isBooked = Boolean(bookedGrade);

            // Active visual grade: priority given to bookedGrade, then seat.grade, else default white
            const effectiveGrade = bookedGrade || seat.grade;
            const style = effectiveGrade ? getGradeStyle(effectiveGrade) : null;

            const w = seat.width || 24;
            const h = seat.height || 24;
            const rot = seat.rotation || 0;
            const centerX = seat.x + w / 2;
            const centerY = seat.y + h / 2;

            if (seat.isDisabled) {
              // Disabled / empty space
              return (
                <g
                  key={seat.id}
                  transform={`translate(${seat.x}, ${seat.y}) rotate(${rot}, ${w / 2}, ${h / 2})`}
                  onMouseDown={(e) => handleElementMouseDown(e, 'seat', seat.id)}
                  className="cursor-pointer select-none opacity-40 hover:opacity-80"
                >
                  <rect
                    width={w}
                    height={h}
                    rx={2}
                    fill="#f1f5f9"
                    stroke={isSelectedInEditor ? '#3b82f6' : '#94a3b8'}
                    strokeWidth={isSelectedInEditor ? 2 : 1}
                    strokeDasharray="2 2"
                  />
                  <line x1={0} y1={0} x2={w} y2={h} stroke="#cbd5e1" strokeWidth={1} />
                </g>
              );
            }

            const validSeatColor = isValidHexColor(seat.color) ? seat.color : undefined;
            const fillBg =
              isBooked && style
                ? style.hex
                : validSeatColor
                ? validSeatColor
                : seat.grade && style
                ? style.hex
                : DEFAULT_SEAT_COLOR;

            const textFill =
              isBooked && style
                ? style.textColor.includes('slate-900')
                  ? '#0f172a'
                  : '#ffffff'
                : validSeatColor
                ? getReadableTextColor(validSeatColor)
                : seat.grade && style
                ? style.textColor.includes('slate-900')
                  ? '#0f172a'
                  : '#ffffff'
                : '#0f172a';

            const strokeColor = isSelectedInEditor
              ? '#2563eb'
              : isBooked
              ? '#0f172a'
              : '#475569';
            const strokeWidth = isSelectedInEditor ? 2.5 : 1;

            return (
              <g
                key={seat.id}
                transform={`translate(${seat.x}, ${seat.y}) rotate(${rot}, ${w / 2}, ${h / 2})`}
                onMouseDown={(e) => handleElementMouseDown(e, 'seat', seat.id)}
                className="cursor-pointer select-none group"
              >
                <title>{`${seat.floor} ${seat.row} ${seat.seatNumber}번 (${effectiveGrade || '일반'})`}</title>

                {/* Seat Box */}
                <rect
                  width={w}
                  height={h}
                  rx={2}
                  fill={fillBg}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  className="transition-colors"
                />

                {/* Selection ring highlight */}
                {isSelectedInEditor && (
                  <rect
                    x={-2}
                    y={-2}
                    width={w + 4}
                    height={h + 4}
                    rx={4}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                  />
                )}

                {/* Grouped seat indicator dot */}
                {seat.groupId && (
                  <circle
                    cx={w - 3}
                    cy={3}
                    r={2.2}
                    fill={isSelectedInEditor ? '#3b82f6' : '#6366f1'}
                    stroke="#ffffff"
                    strokeWidth={0.75}
                    className="pointer-events-none"
                  />
                )}

                {/* Seat Number */}
                <text
                  x={w / 2}
                  y={h / 2 + 3.5}
                  textAnchor="middle"
                  fill={textFill}
                  fontSize={9.5}
                  fontWeight="bold"
                  fontFamily="monospace"
                  className="pointer-events-none select-none font-mono"
                >
                  {seat.customLabel || seat.seatNumber}
                </text>
              </g>
            );
          })}

          {/* 3. Marquee Selection Box */}
          {isMarqueeSelecting && marqueeStart && marqueeCurrent && (
            <rect
              x={Math.min(marqueeStart.x, marqueeCurrent.x)}
              y={Math.min(marqueeStart.y, marqueeCurrent.y)}
              width={Math.abs(marqueeCurrent.x - marqueeStart.x)}
              height={Math.abs(marqueeCurrent.y - marqueeStart.y)}
              fill="rgba(59, 130, 246, 0.12)"
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              rx={2}
            />
          )}
        </svg>

        {/* Canvas Legend Card (캔버스 한쪽에 표시, 이름 수정 및 삭제 지원) */}
        <div
          className={`${
            (layout.legend?.length || 0) === 0 ? 'no-print ' : ''
          }absolute bottom-4 left-4 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-md p-3 w-64 max-h-64 overflow-y-auto z-10`}
        >
          <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              범례 (Legend)
            </span>
            <button
              type="button"
              onClick={() => handleAddLegendItem()}
              className="no-print flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="새 범례 항목 추가"
            >
              <Plus className="w-3 h-3" />
              <span>추가</span>
            </button>
          </div>

          {(layout.legend?.length || 0) === 0 ? (
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              색상에 이름을 붙여 범례를 관리해 보세요.
            </p>
          ) : (
            <div className="space-y-1.5">
              {(layout.legend || []).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-1.5 group"
                >
                  <input
                    type="color"
                    value={isValidHexColor(item.color) ? item.color : DEFAULT_SEAT_COLOR}
                    onMouseDown={() => {
                      colorPickerSessionPushedRef.current = false;
                    }}
                    onFocus={() => {
                      colorPickerSessionPushedRef.current = false;
                    }}
                    onChange={(e) =>
                      handleUpdateLegendItemColor(item.id, e.target.value, false)
                    }
                    onBlur={(e) => {
                      colorPickerSessionPushedRef.current = false;
                      addRecentColor(e.target.value);
                    }}
                    className="w-5 h-5 rounded-md border border-slate-300 bg-white p-0 cursor-pointer shrink-0"
                    title={`범례 색상 변경 (${item.color.toUpperCase()})`}
                  />

                  <input
                    type="text"
                    value={item.label}
                    onFocus={handleLegendLabelFocus}
                    onChange={(e) => handleLegendLabelChange(item.id, e.target.value)}
                    onBlur={() => handleLegendLabelBlur(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="등급/구역명"
                    className="flex-1 min-w-0 px-1.5 py-0.5 rounded-md border border-transparent hover:border-slate-200 focus:border-blue-400 focus:bg-white bg-transparent text-xs font-bold text-slate-700 outline-none"
                  />

                  {selectedSeatIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        applyColorToSelection(item.color, {
                          recordUndo: true,
                          addRecent: true,
                        })
                      }
                      className="no-print px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 shrink-0 cursor-pointer"
                      title="선택된 좌석에 이 색상 적용"
                    >
                      적용
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteLegendItem(item.id)}
                    className="no-print p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer shrink-0"
                    title="범례 항목 삭제"
                    aria-label={`${item.label} 범례 삭제`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Viewport Control Pill (Zoom In, Zoom Out, Reset, 100%) */}
        <div className="no-print absolute bottom-4 right-4 bg-white/95 backdrop-blur-xs border border-slate-300 rounded-xl px-2 py-1.5 flex items-center gap-1 shadow-md text-xs z-10">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
            className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer"
            title="축소"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="px-1.5 font-bold font-mono text-slate-800 text-[11px] min-w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
            className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer"
            title="확대"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer ml-0.5"
            title="화면 배율 리셋 (100%)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* Row Generator Modal Dialog */}
      {/* ========================================================= */}
      {showRowGenerator && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Columns className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">
                  열 만들기 (한 줄 일괄 생성)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRowGenerator(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 py-4 text-xs">
              {/* 층 및 열 이름 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">층 구분</label>
                  <select
                    value={rowGenConfig.floor}
                    onChange={(e) =>
                      setRowGenConfig((prev) => ({ ...prev, floor: e.target.value }))
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
                  >
                    <option value="1층">1층</option>
                    <option value="2층">2층</option>
                    <option value="3층">3층</option>
                    <option value="발코니">발코니</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">열 이름</label>
                  <input
                    type="text"
                    value={rowGenConfig.rowName}
                    onChange={(e) =>
                      setRowGenConfig((prev) => ({ ...prev, rowName: e.target.value }))
                    }
                    placeholder="예: 1열, A, OP1"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* 좌석 수 & 시작 번호 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">좌석 수 (개)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={rowGenConfig.seatCount}
                    onChange={(e) =>
                      setRowGenConfig((prev) => ({
                        ...prev,
                        seatCount: parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">시작 좌석 번호</label>
                  <input
                    type="number"
                    min={1}
                    value={rowGenConfig.startNumber}
                    onChange={(e) =>
                      setRowGenConfig((prev) => ({
                        ...prev,
                        startNumber: parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* 번호 부여 방향 & 간격 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">번호 순서</label>
                  <select
                    value={rowGenConfig.numberDirection}
                    onChange={(e) =>
                      setRowGenConfig((prev) => ({
                        ...prev,
                        numberDirection: e.target.value as 'asc' | 'desc',
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
                  >
                    <option value="asc">좌측→우측 오름차순 (1, 2, 3..)</option>
                    <option value="desc">좌측→우측 내림차순 (10, 9, 8..)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    좌석 간격 (픽셀)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={60}
                    value={rowGenConfig.spacing}
                    onChange={(e) =>
                      setRowGenConfig((prev) => ({
                        ...prev,
                        spacing: parseInt(e.target.value, 10) || 30,
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* 배치 모양 (직선 vs 곡선) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  배치 형태 (직선 / 곡선)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setRowGenConfig((prev) => ({ ...prev, shape: 'straight' }))
                    }
                    className={`py-2 px-3 rounded-lg border font-bold text-center cursor-pointer transition-all ${
                      rowGenConfig.shape === 'straight'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    직선 일자형
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRowGenConfig((prev) => ({ ...prev, shape: 'curve' }))
                    }
                    className={`py-2 px-3 rounded-lg border font-bold text-center cursor-pointer transition-all ${
                      rowGenConfig.shape === 'curve'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    부채형 곡선 (무대 중심 호)
                  </button>
                </div>
              </div>

              {/* 곡선 옵션 슬라이더 */}
              {rowGenConfig.shape === 'curve' && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                  <div>
                    <div className="flex justify-between font-bold text-slate-700 mb-1">
                      <span>곡률 반경 (Radius)</span>
                      <span className="font-mono">{rowGenConfig.curveRadius}px</span>
                    </div>
                    <input
                      type="range"
                      min={200}
                      max={1000}
                      step={20}
                      value={rowGenConfig.curveRadius}
                      onChange={(e) =>
                        setRowGenConfig((prev) => ({
                          ...prev,
                          curveRadius: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-slate-700 mb-1">
                      <span>부채꼴 각도 (Sweep Angle)</span>
                      <span className="font-mono">{rowGenConfig.curveAngle}°</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={120}
                      step={5}
                      value={rowGenConfig.curveAngle}
                      onChange={(e) =>
                        setRowGenConfig((prev) => ({
                          ...prev,
                          curveAngle: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* 기본 등급 지정 */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  생성 시 기본 등급
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_GRADES.map((g) => {
                    const style = getGradeStyle(g);
                    const isSelected = rowGenConfig.grade === g;
                    return (
                      <button
                        type="button"
                        key={g}
                        onClick={() =>
                          setRowGenConfig((prev) => ({ ...prev, grade: g }))
                        }
                        className={`px-2.5 py-1 rounded-md font-bold text-xs border cursor-pointer transition-all ${
                          isSelected
                            ? 'ring-2 ring-blue-500 shadow-xs'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: style.hex,
                          color: '#ffffff',
                          borderColor: style.hex,
                        }}
                      >
                        {gradeCustomNames?.[g] || g}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowRowGenerator(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleGenerateRow}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>열 생성하기</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Save / Save As Modal Dialog (최초 저장 / 다른 이름으로 저장 / 중복 처리) */}
      {/* ========================================================= */}
      {showSaveModal && (() => {
        const trimmed = saveNameInput.trim();
        const duplicateByName = trimmed
          ? savedLayouts.find(
              (item) =>
                item.name.trim() === trimmed &&
                (saveModalMode === 'save_as' || item.id !== currentLayoutId)
            )
          : undefined;
        const autoUniqueName = trimmed
          ? getUniqueLayoutName(
              trimmed,
              savedLayouts.map((s) => s.name)
            )
          : '';

        const submitNewDoc = (targetName: string) => {
          void persistLayoutToFirestore({
            targetId: null,
            targetName,
            isNewDoc: true,
          });
        };

        const submitOverwriteDuplicate = () => {
          if (!duplicateByName) return;
          void persistLayoutToFirestore({
            targetId: duplicateByName.id,
            targetName: duplicateByName.name,
            isNewDoc: false,
            existingShareCode: duplicateByName.shareCode,
          });
        };

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  {saveModalMode === 'save_as' ? (
                    <FilePlus2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Save className="w-5 h-5 text-emerald-600" />
                  )}
                  <h3 className="text-base font-black text-slate-900">
                    {saveModalMode === 'save_as' ? '다른 이름으로 저장' : '좌석배치도 저장'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    배치도 이름
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={saveNameInput}
                    onChange={(e) => {
                      setSaveNameInput(e.target.value);
                      if (saveErrorMessage) {
                        setSaveErrorMessage(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (saveStatus === 'saving') return;
                        if (!trimmed) {
                          showToast('배치도 이름을 입력해 주세요.');
                          return;
                        }
                        if (!duplicateByName) {
                          submitNewDoc(trimmed);
                        }
                      }
                    }}
                    placeholder="예: 우리극장 1층 커스텀 배치"
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 rounded-xl px-3 py-2 font-bold text-slate-900 text-sm outline-none"
                  />
                </div>

                {duplicateByName ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
                    <div className="font-bold">
                      같은 이름(<strong>'{duplicateByName.name}'</strong>)의 배치도가 이미 있습니다.
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      기존 문서에 덮어쓰기하거나, 이름을 <strong>'{autoUniqueName}'</strong>(으)로 구분해 새 문서로 저장할 수 있습니다.
                    </p>
                  </div>
                ) : (
                  <div className="text-slate-500 font-medium leading-relaxed">
                    {saveModalMode === 'save_as'
                      ? '새 배치도 문서와 새 공유 코드가 발급되며, 저장 후 편집 대상이 새 문서로 전환됩니다.'
                      : '내 계정에 저장되며 상단 템플릿 > 내 배치도에서 언제든 불러올 수 있습니다.'}
                  </div>
                )}

                {saveStatus === 'error' && saveErrorMessage && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-semibold flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{saveErrorMessage}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  취소
                </button>

                {duplicateByName ? (
                  <>
                    <button
                      type="button"
                      onClick={submitOverwriteDuplicate}
                      disabled={saveStatus === 'saving'}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      기존 문서에 덮어쓰기
                    </button>
                    <button
                      type="button"
                      onClick={() => submitNewDoc(autoUniqueName)}
                      disabled={saveStatus === 'saving'}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>'{autoUniqueName}'로 저장</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => submitNewDoc(trimmed)}
                    disabled={!trimmed || saveStatus === 'saving'}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saveStatus === 'saving' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>{saveModalMode === 'save_as' ? '새 문서로 저장' : '저장하기'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* Autosave Draft Recovery Modal ("임시저장된 작업을 복구할까요?") */}
      {/* ========================================================= */}
      {pendingDraftRecovery && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                <History className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-slate-900">
                  임시저장된 작업을 복구할까요?
                </h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed mt-1.5">
                  서버에 아직 저장되지 않은 임시저장 작업본이 있습니다. 복구하면 중단된 지점부터 이어서 편집 및 저장할 수 있습니다.
                </p>
                <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="font-bold text-slate-800 truncate">
                    배치도: {pendingDraftRecovery.layout.name || '새 커스텀 좌석배치도'}
                  </div>
                  <div className="text-slate-500 flex items-center justify-between">
                    <span>
                      좌석 {pendingDraftRecovery.layout.seats.filter((s) => !s.isDisabled).length}석
                    </span>
                    <span>
                      {new Date(pendingDraftRecovery.savedAt).toLocaleString('ko-KR')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-5 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleDiscardAutosaveDraft}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                버리기 (새로 시작)
              </button>
              <button
                type="button"
                onClick={handleRecoverAutosaveDraft}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>복구하기</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Google Auth Modal Dialog (미로그인 저장 / 세션 만료 재로그인 요청) */}
      {/* ========================================================= */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <LogIn className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">
                  {isReauthPrompt ? '세션 만료 · 다시 로그인' : '로그인이 필요합니다'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  pendingAuthActionRef.current = null;
                  setIsReauthPrompt(false);
                  setShowAuthModal(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs text-slate-600 leading-relaxed">
              <p className="font-medium">
                {isReauthPrompt
                  ? '로그인 세션이 만료되었거나 인증 토큰 오류가 발생했습니다. 편집 중인 캔버스는 그대로 유지되며, 다시 로그인하면 저장이 자동으로 이어집니다.'
                  : pendingAuthActionRef.current
                  ? '배치도를 저장하려면 먼저 Google 계정으로 로그인해 주세요. 로그인 완료 후 자동으로 저장이 이어집니다.'
                  : 'Google 계정으로 로그인하면 내 배치도 목록을 저장하고 언제든 불러올 수 있습니다.'}
              </p>
              {authErrorMessage && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-semibold">
                  {authErrorMessage}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  pendingAuthActionRef.current = null;
                  setIsReauthPrompt(false);
                  setShowAuthModal(false);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSigningIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>{isReauthPrompt ? '다시 로그인하고 저장 이어하기' : 'Google 계정으로 로그인'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Confirmation Modal Dialog (템플릿 변경 / 삭제 확인 팝업) */}
      {/* ========================================================= */}
      {pendingConfirmAction && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  pendingConfirmAction.isDestructive
                    ? 'bg-red-50 text-red-600'
                    : 'bg-amber-50 text-amber-600'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-black text-slate-900">
                  {pendingConfirmAction.title}
                </h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed mt-1.5">
                  {pendingConfirmAction.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-5 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingConfirmAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = pendingConfirmAction.onConfirm;
                  setPendingConfirmAction(null);
                  action();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer ${
                  pendingConfirmAction.isDestructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {pendingConfirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Share Code Import Modal Dialog (공유 코드로 불러오기) */}
      {/* ========================================================= */}
      {showShareCodeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">
                  공유 코드로 불러오기
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowShareCodeModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  공유 코드
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={shareCodeInput}
                  onChange={(e) => {
                    setShareCodeInput(e.target.value.toUpperCase());
                    setShareCodeError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const normalized = normalizeShareCode(shareCodeInput);
                      if (!normalized) {
                        setShareCodeError('4~32자리 영문/숫자 공유 코드를 입력해 주세요.');
                        return;
                      }
                      const activeUser = user || auth.currentUser;
                      if (!activeUser || !isAllowedCompanyUser(activeUser)) {
                        setShowShareCodeModal(false);
                        void requestLoginAndContinue('openShareCodeModal');
                        return;
                      }
                      const executeFetch = async () => {
                        setIsLoadingShareCode(true);
                        setShareCodeError(null);
                        const res = await loadLayoutByShareCode(normalized, activeUser);
                        setIsLoadingShareCode(false);
                        if (res.ok) {
                          setShowShareCodeModal(false);
                        } else if (res.error) {
                          setShareCodeError(res.error);
                        }
                      };
                      if (isDirty) {
                        setShowShareCodeModal(false);
                        setPendingConfirmAction({
                          title: '공유 배치도 불러오기',
                          message: `저장하지 않은 변경사항이 있습니다. 공유 코드 '${normalized}' 배치도를 불러오면 현재 변경사항이 사라집니다. 계속하시겠습니까?`,
                          confirmLabel: '불러오기',
                          onConfirm: () => {
                            void executeFetch();
                          },
                        });
                      } else {
                        void executeFetch();
                      }
                    }
                  }}
                  placeholder="예: A1B2C3"
                  autoFocus
                  className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 text-sm uppercase outline-none"
                />
              </div>

              {shareCodeError ? (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-semibold">
                  {shareCodeError}
                </div>
              ) : (
                <p className="text-slate-500 font-medium leading-relaxed">
                  전달받은 공유 코드를 입력하면 해당 좌석배치도를 캔버스로 불러옵니다.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowShareCodeModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isLoadingShareCode || !shareCodeInput.trim()}
                onClick={() => {
                  const normalized = normalizeShareCode(shareCodeInput);
                  if (!normalized) {
                    setShareCodeError('4~32자리 영문/숫자 공유 코드를 입력해 주세요.');
                    return;
                  }
                  const activeUser = user || auth.currentUser;
                  if (!activeUser || !isAllowedCompanyUser(activeUser)) {
                    setShowShareCodeModal(false);
                    void requestLoginAndContinue('openShareCodeModal');
                    return;
                  }
                  const executeFetch = async () => {
                    setIsLoadingShareCode(true);
                    setShareCodeError(null);
                    const res = await loadLayoutByShareCode(normalized, activeUser);
                    setIsLoadingShareCode(false);
                    if (res.ok) {
                      setShowShareCodeModal(false);
                    } else if (res.error) {
                      setShareCodeError(res.error);
                    }
                  };
                  if (isDirty) {
                    setShowShareCodeModal(false);
                    setPendingConfirmAction({
                      title: '공유 배치도 불러오기',
                      message: `저장하지 않은 변경사항이 있습니다. 공유 코드 '${normalized}' 배치도를 불러오면 현재 변경사항이 사라집니다. 계속하시겠습니까?`,
                      confirmLabel: '불러오기',
                      onConfirm: () => {
                        void executeFetch();
                      },
                    });
                  } else {
                    void executeFetch();
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingShareCode ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>불러오기</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
