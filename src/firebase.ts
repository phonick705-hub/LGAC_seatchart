import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  setPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
  UserCredential,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

function createPersistentAuth() {
  try {
    return initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createPersistentAuth();
export const authPersistenceReady: Promise<void> = setPersistence(
  auth,
  browserLocalPersistence
).catch((err) => {
  console.warn('Failed to enforce browserLocalPersistence:', err);
});

export const COMPANY_DOMAIN = 'lgart.com';
export const COMPANY_AUTH_ERROR_MESSAGE = '회사 계정으로만 로그인할 수 있습니다';

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
  hd: COMPANY_DOMAIN,
});

export class CompanyAccountRequiredError extends Error {
  constructor(message = COMPANY_AUTH_ERROR_MESSAGE) {
    super(message);
    this.name = 'CompanyAccountRequiredError';
  }
}

export function isAllowedCompanyUser(user: User | null | undefined): user is User {
  if (!user) return false;
  const email = (user.email || '').trim().toLowerCase();
  return Boolean(
    user.emailVerified === true &&
      email.endsWith(`@${COMPANY_DOMAIN}`) &&
      /^[^@\s]+@lgart\.com$/.test(email)
  );
}

export const PENDING_AUTH_REDIRECT_KEY = 'custom_theater_pending_auth_redirect_v1';
export const PENDING_SHARE_CODE_KEY = 'custom_theater_pending_share_code_v1';

export interface PendingAuthRedirectPayload {
  action:
    | 'enterCustom'
    | 'save'
    | 'saveAs'
    | 'retrySave'
    | 'openMyLayouts'
    | 'openShareCodeModal'
    | 'loginOnly';
  theater?: string;
  targetDocId?: string | null;
  targetName?: string;
  isNewDoc?: boolean;
  isPublic?: boolean;
  existingShareCode?: string;
  createdAt: number;
}

export function normalizeShareCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toUpperCase();
  if (!/^[A-Z0-9\-]{4,32}$/.test(normalized)) return null;
  return normalized;
}

export function extractShareCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeShareCode(params.get('code'));
  } catch {
    return null;
  }
}

export function savePendingShareCode(code: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const normalized = normalizeShareCode(code);
    if (normalized) {
      sessionStorage.setItem(PENDING_SHARE_CODE_KEY, normalized);
    } else {
      sessionStorage.removeItem(PENDING_SHARE_CODE_KEY);
    }
  } catch (e) {
    console.warn('Failed to persist pending share code:', e);
  }
}

export function readPendingShareCode(): string | null {
  const urlCode = extractShareCodeFromUrl();
  if (urlCode) {
    savePendingShareCode(urlCode);
    return urlCode;
  }
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return normalizeShareCode(sessionStorage.getItem(PENDING_SHARE_CODE_KEY));
  } catch {
    return null;
  }
}

export function clearPendingShareCode(): void {
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(PENDING_SHARE_CODE_KEY);
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('code')) {
        url.searchParams.delete('code');
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState(null, '', nextUrl);
      }
    } catch {
      // ignore
    }
  }
}

export function isMobileOrInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isInApp =
    /KAKAOTALK|NAVER|Line\/|Instagram|FBAN|FBAV|FB_IAB|DaumApps|everytimeApp|BAND|Whale\/.*Mobile|SamsungBrowser.*CrossApp|; wv\)/i.test(
      ua
    );
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    ua
  );
  return isInApp || isMobile;
}

export function savePendingAuthRedirect(
  payload: Omit<PendingAuthRedirectPayload, 'createdAt'>
): void {
  try {
    const full: PendingAuthRedirectPayload = {
      ...payload,
      createdAt: Date.now(),
    };
    sessionStorage.setItem(PENDING_AUTH_REDIRECT_KEY, JSON.stringify(full));
  } catch (e) {
    console.warn('Failed to persist pending auth redirect action:', e);
  }
}

export function readAndClearPendingAuthRedirect(): PendingAuthRedirectPayload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_AUTH_REDIRECT_KEY);
    sessionStorage.removeItem(PENDING_AUTH_REDIRECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAuthRedirectPayload;
    if (!parsed || typeof parsed.createdAt !== 'number') return null;
    // Ignore stale entries older than 10 minutes
    if (Date.now() - parsed.createdAt > 10 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function signInWithGoogleAutoFallback(
  pendingPayload?: Omit<PendingAuthRedirectPayload, 'createdAt'>
): Promise<{ mode: 'popup'; credential: UserCredential } | { mode: 'redirect' }> {
  await authPersistenceReady;
  await setPersistence(auth, browserLocalPersistence);

  if (isMobileOrInAppBrowser()) {
    if (pendingPayload) {
      savePendingAuthRedirect(pendingPayload);
    }
    await signInWithRedirect(auth, googleProvider);
    return { mode: 'redirect' };
  }

  try {
    const credential = await signInWithPopup(auth, googleProvider);
    if (!isAllowedCompanyUser(credential.user)) {
      await signOut(auth);
      throw new CompanyAccountRequiredError();
    }
    return { mode: 'popup', credential };
  } catch (err) {
    if (err instanceof CompanyAccountRequiredError) {
      throw err;
    }
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: string }).code)
        : '';
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    const shouldFallbackToRedirect =
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      msg.includes('popup-blocked') ||
      msg.includes('popup blocked');

    if (shouldFallbackToRedirect) {
      if (pendingPayload) {
        savePendingAuthRedirect(pendingPayload);
      }
      await signInWithRedirect(auth, googleProvider);
      return { mode: 'redirect' };
    }
    throw err;
  }
}

export async function isAuthSessionError(err: unknown): Promise<boolean> {
  if (!auth.currentUser || !isAllowedCompanyUser(auth.currentUser)) return true;
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code).toLowerCase()
      : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (
    code.includes('unauthenticated') ||
    code.includes('user-token-expired') ||
    code.includes('invalid-user-token') ||
    code.includes('user-disabled') ||
    code.includes('requires-recent-login') ||
    msg.includes('unauthenticated') ||
    msg.includes('token expired') ||
    msg.includes('invalid token') ||
    msg.includes('auth/user-token-expired')
  ) {
    return true;
  }

  if (code.includes('permission-denied') || msg.includes('permission')) {
    try {
      await auth.currentUser.getIdToken(true);
      return false;
    } catch {
      return true;
    }
  }

  return false;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();
