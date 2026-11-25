import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Cloud,
  Database,
  FileDown,
  FileDiff,
  FilePlus2,
  FileText,
  FolderOpen,
  HardDrive,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Scale,
  ShieldCheck,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AlteracaoDispositivo,
  AlteracaoMetadata,
  NormaDocument,
  NormaRevision,
} from './types/norma';
import {
  DEFAULT_ALTERACOES,
  DEFAULT_ALTERACAO_META,
  NORMA_TEMPLATES,
} from './data/templates';
import {
  renderAlteracaoDecreeText,
  renderNormaPlainText,
} from './utils/legistica';
import {
  exportAlteracaoToDocx,
  exportAlteracaoToPdf,
  exportNormaToDocx,
  exportNormaToPdf,
} from './utils/exporters';
import { GuiaOrientacaoView } from './components/GuiaOrientacaoView';
import { EditorEstruturadoView } from './components/EditorEstruturadoView';
import { AjusteNormaView } from './components/AjusteNormaView';
import {
  AuditSourceMode,
  AuditorNormaView,
} from './components/AuditorNormaView';
import { GoogleDriveView } from './components/GoogleDriveView';
import { AuthGateView } from './components/AuthGateView';
import { MinhaContaView } from './components/MinhaContaView';
import { ControleAcessoView } from './components/ControleAcessoView';
import {
  AuthErrorInfo,
  clearAccessToken,
  formatFirebaseAuthError,
  getAccessToken,
  googleAppSignIn,
  googleSignIn,
  initAuth,
  loginWithEmail,
  logout,
  registerWithEmail,
  reloadCurrentUser,
  requestPasswordReset,
  resendVerificationEmail,
} from './utils/googleAuth';
import {
  ADMIN_EMAIL,
  AllowlistEntry,
  CloudAlteracaoItem,
  CloudNormaItem,
  EsferaPreferida,
  UserProfileData,
  addAllowlistEmail,
  adminRepairOwnProfile,
  createCloudNormaRevision,
  deleteCloudAlteracao,
  deleteCloudNorma,
  deleteCloudNormaRevision,
  formatCloudSyncErrorMessage,
  isFirestoreQuotaError,
  removeAllowlistEmail,
  sanitizeFirestoreId,
  saveUserProfile,
  subscribeAllUsers,
  subscribeAllowlist,
  subscribeNormaRevisions,
  subscribeUserAlteracoes,
  subscribeUserNormas,
  subscribeUserProfile,
  updateCloudNormaRevisionNote,
  updateUserAccess,
  upsertCloudAlteracao,
  upsertCloudNorma,
} from './utils/cloudStorage';
import {
  ActiveDriveDbLink,
  NormaDatabaseRecord,
  SaveNormaCopyToDriveOptions,
  SaveNormaCopyToDriveResult,
  saveNormaCopyWithImagesToDrive,
  syncNormaImagesToDriveFolder,
  updateDriveDatabaseRecord,
} from './utils/driveDatabase';
import { DriveAuthError } from './utils/googleDrive';
import {
  LocalRecoveryPoint,
  computeNormaSignature,
  computeWorkspaceSignature,
  deleteLocalNormaRevision,
  listLocalRecoverySnapshots,
  listLocalNormaRevisions,
  loadWorkspaceFromIndexedDB,
  pushLocalRecoverySnapshot,
  saveLocalNormaRevision,
  saveWorkspaceToIndexedDB,
  updateLocalNormaRevisionNote,
} from './utils/localPersistence';
import { summarizeNormaChanges } from './utils/normaDiff';

type ActiveTab =
  | 'guia'
  | 'editor'
  | 'ajuste'
  | 'auditor'
  | 'drive'
  | 'conta'
  | 'acesso';

const STORAGE_KEYS = {
  doc: 'norma_studio_doc_v1',
  altMeta: 'norma_studio_alt_meta_v1',
  altItems: 'norma_studio_alt_items_v1',
  auditText: 'norma_studio_audit_text_v1',
  driveSyncMeta: 'norma_studio_drive_sync_meta_v1',
  activeCloudNormaId: 'norma_studio_cloud_norma_id_v1',
  activeCloudAltId: 'norma_studio_cloud_alt_id_v1',
};

interface DriveSyncMeta {
  link: ActiveDriveDbLink | null;
  syncedSignature: string | null;
}

interface PendingProfileRegistration {
  nomeCompleto: string;
  orgao: string;
  cargo: string;
  esferaPreferida: EsferaPreferida;
}

const TAB_INFO: Record<
  ActiveTab,
  {
    label: string;
    breadcrumb: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  guia: {
    label: 'Guia de Orientação',
    breadcrumb: 'Guia Prático de Técnica Legislativa',
    icon: BookOpen,
  },
  editor: {
    label: 'Editor Estruturado',
    breadcrumb: 'Criação de Lei, Decreto, Regimento ou Norma',
    icon: FilePlus2,
  },
  ajuste: {
    label: 'Ajuste e Redação (NR)',
    breadcrumb: 'Alteração de Norma Vigente',
    icon: FileDiff,
  },
  auditor: {
    label: 'Auditor LC 95/98',
    breadcrumb: 'Auditoria de Conformidade Formal',
    icon: ShieldCheck,
  },
  drive: {
    label: 'Google Drive',
    breadcrumb: 'Banco de Dados e Drive',
    icon: HardDrive,
  },
  conta: {
    label: 'Minha Conta e Nuvem',
    breadcrumb: 'Cadastro e Biblioteca na Nuvem',
    icon: UserCircle2,
  },
  acesso: {
    label: 'Controle de Acesso',
    breadcrumb: 'Gestão de Usuários e Permissões',
    icon: Users,
  },
};

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('guia');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('norma_sidebar_collapsed_v1') === '1';
    } catch {
      return false;
    }
  });
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('norma_sidebar_collapsed_v1', next ? '1' : '0');
      } catch {
        // Ignora erro de armazenamento local
      }
      return next;
    });
  }, []);
  const [exportStatus, setExportStatus] = useState<
    'idle' | 'pdf' | 'docx' | 'erro'
  >('idle');
  const [exportBusy, setExportBusy] = useState(false);
  const [auditSourceMode, setAuditSourceMode] =
    useState<AuditSourceMode>('editor');

  // Autenticação da conta no sistema e acesso ao Drive
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [, setAuthRefreshTick] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [needsDriveAuth, setNeedsDriveAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [driveAuthError, setDriveAuthError] = useState<AuthErrorInfo | null>(
    null
  );
  const [appAuthStatus, setAppAuthStatus] = useState<string | null>(null);

  // Perfil, controle de acesso e dados na nuvem (Firestore)
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [pendingRegProfile, setPendingRegProfile] =
    useState<PendingProfileRegistration | null>(null);
  const [cloudNormas, setCloudNormas] = useState<CloudNormaItem[]>([]);
  const [cloudAlteracoes, setCloudAlteracoes] = useState<CloudAlteracaoItem[]>(
    []
  );
  const [cloudNormasLoaded, setCloudNormasLoaded] = useState(false);
  const [cloudAlteracoesLoaded, setCloudAlteracoesLoaded] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfileData[]>([]);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [adminAccessError, setAdminAccessError] = useState<string | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<
    'idle' | 'saving' | 'synced' | 'error' | 'offline'
  >('offline');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [cloudQuotaPaused, setCloudQuotaPaused] = useState(false);
  const [sidebarSavedFeedback, setSidebarSavedFeedback] = useState(false);
  const [normaRevisions, setNormaRevisions] = useState<NormaRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);

  const [activeCloudNormaId, setActiveCloudNormaId] = useState<string>(() => {
    try {
      return (
        localStorage.getItem(STORAGE_KEYS.activeCloudNormaId) ||
        'minuta_principal'
      );
    } catch {
      return 'minuta_principal';
    }
  });

  const [activeCloudAltId, setActiveCloudAltId] = useState<string>(() => {
    try {
      return (
        localStorage.getItem(STORAGE_KEYS.activeCloudAltId) ||
        'alterador_principal'
      );
    } catch {
      return 'alterador_principal';
    }
  });

  const [doc, setDoc] = useState<NormaDocument>(() => {
    const defaultTpl =
      NORMA_TEMPLATES.find((t) => t.id === 'tpl-decreto-governanca') ||
      NORMA_TEMPLATES[0];
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.doc);
      if (saved) return JSON.parse(saved) as NormaDocument;
    } catch {
      // Fallback para modelo inicial
    }
    return JSON.parse(JSON.stringify(defaultTpl)) as NormaDocument;
  });

  const [altMeta, setAltMeta] = useState<AlteracaoMetadata>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.altMeta);
      if (saved) return JSON.parse(saved) as AlteracaoMetadata;
    } catch {
      // Fallback
    }
    return DEFAULT_ALTERACAO_META;
  });

  const [alteracoes, setAlteracoes] = useState<AlteracaoDispositivo[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.altItems);
      if (saved) return JSON.parse(saved) as AlteracaoDispositivo[];
    } catch {
      // Fallback
    }
    return DEFAULT_ALTERACOES;
  });

  const [auditText, setAuditText] = useState<string>(() => {
    const defaultTpl =
      NORMA_TEMPLATES.find((t) => t.id === 'tpl-decreto-governanca') ||
      NORMA_TEMPLATES[0];
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.auditText);
      if (saved !== null) return saved;
    } catch {
      // Fallback
    }
    return renderNormaPlainText(defaultTpl);
  });

  const [driveSyncMeta, setDriveSyncMeta] = useState<DriveSyncMeta>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.driveSyncMeta);
      if (raw) return JSON.parse(raw) as DriveSyncMeta;
    } catch {
      // Ignorar
    }
    return { link: null, syncedSignature: null };
  });

  const [localSnapshots, setLocalSnapshots] = useState<LocalRecoveryPoint[]>(
    []
  );
  const [lastLocalSavedAt, setLastLocalSavedAt] = useState<string | null>(null);
  const [headerSyncModalOpen, setHeaderSyncModalOpen] = useState(false);
  const [headerSyncBusy, setHeaderSyncBusy] = useState(false);
  const [headerSyncError, setHeaderSyncError] = useState<string | null>(null);

  const currentSignature = useMemo(
    () => computeWorkspaceSignature(doc, altMeta, alteracoes),
    [doc, altMeta, alteracoes]
  );

  const normaSignature = useMemo(
    () =>
      computeWorkspaceSignature(doc, DEFAULT_ALTERACAO_META, []),
    [doc]
  );

  const altSignature = useMemo(
    () =>
      computeWorkspaceSignature(
        NORMA_TEMPLATES[0],
        altMeta,
        alteracoes
      ),
    [altMeta, alteracoes]
  );

  const hasUnsyncedDriveChanges = Boolean(
    driveSyncMeta.syncedSignature &&
      driveSyncMeta.syncedSignature !== currentSignature
  );

  const lastSnapshotSignatureRef = useRef<string | null>(null);
  const lastCloudNormaSigRef = useRef<string | null>(null);
  const lastCloudAltSigRef = useRef<string | null>(null);
  const cloudQuotaPausedRef = useRef<boolean>(false);
  const cloudNormasRef = useRef<CloudNormaItem[]>([]);
  const cloudAlteracoesRef = useRef<CloudAlteracaoItem[]>([]);

  useEffect(() => {
    cloudNormasRef.current = cloudNormas;
  }, [cloudNormas]);

  useEffect(() => {
    cloudAlteracoesRef.current = cloudAlteracoes;
  }, [cloudAlteracoes]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.activeCloudNormaId, activeCloudNormaId);
      localStorage.setItem(STORAGE_KEYS.activeCloudAltId, activeCloudAltId);
    } catch {
      // Ignorar
    }
  }, [activeCloudNormaId, activeCloudAltId]);

  // Recuperação automática do IndexedDB caso localStorage estivesse vazio
  useEffect(() => {
    let active = true;
    (async () => {
      const hasLocalDoc = Boolean(localStorage.getItem(STORAGE_KEYS.doc));
      if (!hasLocalDoc) {
        const idbState = await loadWorkspaceFromIndexedDB();
        if (active && idbState?.doc) {
          setDoc(idbState.doc);
          if (idbState.altMeta) setAltMeta(idbState.altMeta);
          if (idbState.alteracoes) setAlteracoes(idbState.alteracoes);
          if (idbState.auditText) setAuditText(idbState.auditText);
          setLastLocalSavedAt(idbState.updatedAt);
        }
      }
      const snaps = await listLocalRecoverySnapshots();
      if (active) {
        setLocalSnapshots(snaps);
        if (snaps.length > 0) {
          lastSnapshotSignatureRef.current = snaps[0].signature;
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Persistência imediata em localStorage + redundância em IndexedDB
  useEffect(() => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEYS.doc, JSON.stringify(doc));
      localStorage.setItem(STORAGE_KEYS.altMeta, JSON.stringify(altMeta));
      localStorage.setItem(STORAGE_KEYS.altItems, JSON.stringify(alteracoes));
      localStorage.setItem(STORAGE_KEYS.auditText, auditText);
      setLastLocalSavedAt(now);
    } catch {
      // Ignore storage quota errors
    }

    const timer = window.setTimeout(() => {
      void saveWorkspaceToIndexedDB({
        doc,
        altMeta,
        alteracoes,
        auditText,
        updatedAt: now,
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [doc, altMeta, alteracoes, auditText]);

  // Pontos de restauração locais automáticos (proteção contra queda de energia)
  useEffect(() => {
    if (lastSnapshotSignatureRef.current === currentSignature) return;
    const timer = window.setTimeout(async () => {
      lastSnapshotSignatureRef.current = currentSignature;
      const updated = await pushLocalRecoverySnapshot({
        savedAt: new Date().toISOString(),
        signature: currentSignature,
        label: `${doc.tipo} nº ${doc.numero || '___'}`,
        subLabel: `${doc.artigos.length} art. · ${alteracoes.length} alt. (NR)`,
        doc,
        altMeta,
        alteracoes,
        auditText,
      });
      setLocalSnapshots(updated);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [currentSignature, doc, altMeta, alteracoes, auditText]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.driveSyncMeta,
        JSON.stringify(driveSyncMeta)
      );
    } catch {
      // Ignorar
    }
  }, [driveSyncMeta]);

  // Observador do Firebase Auth
  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
        setNeedsDriveAuth(false);
        setDriveAuthError(null);
        setAuthReady(true);
      },
      (user) => {
        setGoogleUser(user);
        setNeedsDriveAuth(true);
        setAuthReady(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const isAdminUser = Boolean(
    googleUser?.emailVerified &&
      googleUser.email?.toLowerCase() === ADMIN_EMAIL
  );

  // Subscrição ao perfil e coleções do usuário no Firestore
  useEffect(() => {
    if (!googleUser) {
      setUserProfile(null);
      setProfileLoaded(false);
      setCloudNormas([]);
      setCloudAlteracoes([]);
      setAllUsers([]);
      setAllowlist([]);
      setCloudSyncStatus('offline');
      return;
    }

    setProfileLoaded(false);
    const unsubProfile = subscribeUserProfile(
      googleUser.uid,
      (prof) => {
        setUserProfile(prof);
        setProfileLoaded(true);
        if (
          prof?.needsAdminRepair &&
          googleUser.emailVerified &&
          googleUser.email?.toLowerCase() === ADMIN_EMAIL
        ) {
          void adminRepairOwnProfile(googleUser.uid).catch(() => {
            // Silencioso; o administrador já tem acesso garantido pelas regras
          });
        }
        if (
          !prof &&
          googleUser.emailVerified &&
          pendingRegProfile
        ) {
          void saveUserProfile(
            googleUser.uid,
            {
              ...pendingRegProfile,
              email: googleUser.email || '',
            },
            true
          ).then(() => {
            setPendingRegProfile(null);
          });
        }
      },
      (err) => {
        setProfileLoaded(true);
        setCloudSyncStatus('error');
        setCloudSyncError(err.message);
      }
    );

    return () => {
      unsubProfile();
    };
  }, [googleUser, pendingRegProfile]);

  const isUserApproved = Boolean(
    isAdminUser || (userProfile && userProfile.status === 'aprovado')
  );

  const isCloudEligible = Boolean(
    googleUser &&
      googleUser.emailVerified &&
      userProfile &&
      isUserApproved
  );

  useEffect(() => {
    if (!isCloudEligible || !googleUser) {
      setCloudNormas([]);
      setCloudAlteracoes([]);
      setCloudNormasLoaded(false);
      setCloudAlteracoesLoaded(false);
      if (!googleUser) setCloudSyncStatus('offline');
      return;
    }

    setCloudNormasLoaded(false);
    setCloudAlteracoesLoaded(false);
    setCloudSyncStatus('synced');
    setCloudSyncError(null);

    const unsubNormas = subscribeUserNormas(
      googleUser.uid,
      (items) => {
        cloudNormasRef.current = items;
        setCloudNormas(items);
        setCloudNormasLoaded(true);
      },
      (err) => {
        setCloudSyncStatus('error');
        setCloudSyncError(err.message);
      }
    );

    const unsubAlts = subscribeUserAlteracoes(
      googleUser.uid,
      (items) => {
        cloudAlteracoesRef.current = items;
        setCloudAlteracoes(items);
        setCloudAlteracoesLoaded(true);
      },
      (err) => {
        setCloudSyncStatus('error');
        setCloudSyncError(err.message);
      }
    );

    return () => {
      unsubNormas();
      unsubAlts();
    };
  }, [isCloudEligible, googleUser]);

  // Subscrição e espelhamento local do histórico de revisões da norma ativa
  useEffect(() => {
    const localList = listLocalNormaRevisions(activeCloudNormaId);
    setNormaRevisions(localList);
    setRevisionsError(null);

    if (!isCloudEligible || !googleUser) {
      setRevisionsLoading(false);
      return;
    }

    setRevisionsLoading(true);
    const unsubRevs = subscribeNormaRevisions(
      googleUser.uid,
      activeCloudNormaId,
      (cloudList) => {
        // Mescla revisões da nuvem com eventuais revisões locais offline ainda não enviadas
        const localCurrent = listLocalNormaRevisions(activeCloudNormaId);
        const byId = new Map<string, NormaRevision>();
        for (const l of localCurrent) {
          byId.set(l.id, l);
        }
        for (const c of cloudList) {
          byId.set(c.id, c);
        }
        const merged = Array.from(byId.values()).sort((a, b) => {
          if (b.numeroRevisao !== a.numeroRevisao) {
            return b.numeroRevisao - a.numeroRevisao;
          }
          return b.createdAtIso.localeCompare(a.createdAtIso);
        });
        setNormaRevisions(merged);
        setRevisionsLoading(false);
      },
      (err) => {
        setRevisionsLoading(false);
        setRevisionsError(err.message);
      }
    );

    return () => {
      unsubRevs();
    };
  }, [isCloudEligible, googleUser, activeCloudNormaId]);

  // Subscrições administrativas (lista de usuários e e-mails pré-autorizados)
  useEffect(() => {
    if (!isAdminUser || !googleUser) {
      setAllUsers([]);
      setAllowlist([]);
      setAdminAccessError(null);
      return;
    }

    setAdminAccessError(null);
    const unsubUsers = subscribeAllUsers(
      (list) => setAllUsers(list),
      (err) => setAdminAccessError(err.message)
    );
    const unsubAllow = subscribeAllowlist(
      (entries) => setAllowlist(entries),
      (err) => setAdminAccessError(err.message)
    );

    return () => {
      unsubUsers();
      unsubAllow();
    };
  }, [isAdminUser, googleUser]);

  useEffect(() => {
    if (!isAdminUser && activeTab === 'acesso') {
      setActiveTab('guia');
    }
  }, [isAdminUser, activeTab]);

  // Auto-save contínuo da norma ativa no Firestore (com debounce econômico e proteção de cota)
  useEffect(() => {
    if (!isCloudEligible || !googleUser || !cloudNormasLoaded) return;
    if (cloudQuotaPausedRef.current) return;

    if (lastCloudNormaSigRef.current === null) {
      const existingCloud = cloudNormasRef.current.find(
        (n) => n.id === activeCloudNormaId
      );
      if (existingCloud) {
        const existingCloudSig = computeWorkspaceSignature(
          existingCloud.doc,
          DEFAULT_ALTERACAO_META,
          []
        );
        if (existingCloudSig === normaSignature) {
          lastCloudNormaSigRef.current = normaSignature;
          return;
        }
      }
    }

    if (lastCloudNormaSigRef.current === normaSignature) return;

    const hasImages = (doc.imagens?.length ?? 0) > 0;
    const debounceMs = hasImages ? 15000 : 6000;

    const timer = window.setTimeout(async () => {
      if (cloudQuotaPausedRef.current) return;
      setCloudSyncStatus('saving');
      setCloudSyncError(null);
      try {
        const exists = cloudNormasRef.current.some(
          (n) => n.id === activeCloudNormaId
        );
        await upsertCloudNorma(
          googleUser.uid,
          activeCloudNormaId,
          doc,
          exists
        );
        lastCloudNormaSigRef.current = normaSignature;
        setCloudSyncStatus('synced');
      } catch (err) {
        setCloudSyncStatus('error');
        if (isFirestoreQuotaError(err)) {
          cloudQuotaPausedRef.current = true;
          setCloudQuotaPaused(true);
          lastCloudNormaSigRef.current = normaSignature;
        }
        setCloudSyncError(
          formatCloudSyncErrorMessage(
            err,
            'Falha ao salvar norma automaticamente na nuvem.'
          )
        );
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [
    isCloudEligible,
    cloudNormasLoaded,
    googleUser,
    doc,
    normaSignature,
    activeCloudNormaId,
  ]);

  // Auto-save contínuo do ato alterador (NR) no Firestore
  useEffect(() => {
    if (!isCloudEligible || !googleUser || !cloudAlteracoesLoaded) return;
    if (cloudQuotaPausedRef.current) return;

    if (lastCloudAltSigRef.current === null) {
      const existingAlt = cloudAlteracoesRef.current.find(
        (a) => a.id === activeCloudAltId
      );
      if (existingAlt) {
        const existingAltSig = computeWorkspaceSignature(
          NORMA_TEMPLATES[0],
          existingAlt.meta,
          existingAlt.dispositivos
        );
        if (existingAltSig === altSignature) {
          lastCloudAltSigRef.current = altSignature;
          return;
        }
      }
    }

    if (lastCloudAltSigRef.current === altSignature) return;

    const timer = window.setTimeout(async () => {
      if (cloudQuotaPausedRef.current) return;
      setCloudSyncStatus('saving');
      setCloudSyncError(null);
      try {
        const exists = cloudAlteracoesRef.current.some(
          (a) => a.id === activeCloudAltId
        );
        await upsertCloudAlteracao(
          googleUser.uid,
          activeCloudAltId,
          altMeta,
          alteracoes,
          exists
        );
        lastCloudAltSigRef.current = altSignature;
        setCloudSyncStatus('synced');
      } catch (err) {
        setCloudSyncStatus('error');
        if (isFirestoreQuotaError(err)) {
          cloudQuotaPausedRef.current = true;
          setCloudQuotaPaused(true);
          lastCloudAltSigRef.current = altSignature;
        }
        setCloudSyncError(
          formatCloudSyncErrorMessage(
            err,
            'Falha ao salvar ato alterador automaticamente na nuvem.'
          )
        );
      }
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [
    isCloudEligible,
    cloudAlteracoesLoaded,
    googleUser,
    altMeta,
    alteracoes,
    altSignature,
    activeCloudAltId,
  ]);

  const handleForceCloudSync = useCallback(async () => {
    if (!isCloudEligible || !googleUser) return;
    cloudQuotaPausedRef.current = false;
    setCloudQuotaPaused(false);
    setCloudSyncStatus('saving');
    setCloudSyncError(null);
    try {
      const normaExists = cloudNormasRef.current.some(
        (n) => n.id === activeCloudNormaId
      );
      const altExists = cloudAlteracoesRef.current.some(
        (a) => a.id === activeCloudAltId
      );
      await upsertCloudNorma(googleUser.uid, activeCloudNormaId, doc, normaExists);
      await upsertCloudAlteracao(
        googleUser.uid,
        activeCloudAltId,
        altMeta,
        alteracoes,
        altExists
      );
      lastCloudNormaSigRef.current = normaSignature;
      lastCloudAltSigRef.current = altSignature;
      setCloudSyncStatus('synced');
    } catch (err) {
      setCloudSyncStatus('error');
      if (isFirestoreQuotaError(err)) {
        cloudQuotaPausedRef.current = true;
        setCloudQuotaPaused(true);
      }
      setCloudSyncError(
        formatCloudSyncErrorMessage(
          err,
          'Não foi possível concluir a sincronização com a nuvem.'
        )
      );
    }
  }, [
    isCloudEligible,
    googleUser,
    activeCloudNormaId,
    activeCloudAltId,
    doc,
    altMeta,
    alteracoes,
    normaSignature,
    altSignature,
  ]);

  const pushImmediateLocalSnapshot = useCallback(
    async (targetDoc: NormaDocument) => {
      const sig = computeWorkspaceSignature(targetDoc, altMeta, alteracoes);
      lastSnapshotSignatureRef.current = sig;
      const updated = await pushLocalRecoverySnapshot({
        savedAt: new Date().toISOString(),
        signature: sig,
        label: `${targetDoc.tipo} nº ${targetDoc.numero || '___'}`,
        subLabel: `${targetDoc.artigos.length} art. · ${alteracoes.length} alt. (NR)`,
        doc: targetDoc,
        altMeta,
        alteracoes,
        auditText,
      });
      setLocalSnapshots(updated);
    },
    [altMeta, alteracoes, auditText]
  );

  const handleSaveNormaNow = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const updatedDoc: NormaDocument = {
      ...doc,
      updatedAt: nowIso,
    };
    try {
      localStorage.setItem(STORAGE_KEYS.doc, JSON.stringify(updatedDoc));
    } catch {
      // Ignorar erro de quota do localStorage
    }
    await saveWorkspaceToIndexedDB({
      doc: updatedDoc,
      altMeta,
      alteracoes,
      auditText,
      updatedAt: nowIso,
    });
    await pushImmediateLocalSnapshot(updatedDoc);

    if (isCloudEligible && googleUser && !cloudQuotaPausedRef.current) {
      setCloudSyncStatus('saving');
      setCloudSyncError(null);
      try {
        const exists = cloudNormasRef.current.some(
          (n) => n.id === activeCloudNormaId
        );
        await upsertCloudNorma(
          googleUser.uid,
          activeCloudNormaId,
          updatedDoc,
          exists
        );
        lastCloudNormaSigRef.current = normaSignature;
        setCloudSyncStatus('synced');
      } catch (err) {
        setCloudSyncStatus('error');
        if (isFirestoreQuotaError(err)) {
          cloudQuotaPausedRef.current = true;
          setCloudQuotaPaused(true);
          lastCloudNormaSigRef.current = normaSignature;
        }
        setCloudSyncError(
          formatCloudSyncErrorMessage(
            err,
            'Falha ao salvar decreto na nuvem.'
          )
        );
        if (!isFirestoreQuotaError(err)) {
          throw err;
        }
      }
    }

    setSidebarSavedFeedback(true);
    window.setTimeout(() => setSidebarSavedFeedback(false), 2200);
  }, [
    doc,
    altMeta,
    alteracoes,
    auditText,
    pushImmediateLocalSnapshot,
    isCloudEligible,
    googleUser,
    activeCloudNormaId,
    normaSignature,
  ]);

  const handleSaveAsNewNorma = useCallback(async () => {
    const nextId = sanitizeFirestoreId(`norma_${Date.now()}`);
    const nowIso = new Date().toISOString();
    const clonedDoc: NormaDocument = {
      ...JSON.parse(JSON.stringify(doc)),
      id: nextId,
      updatedAt: nowIso,
    };
    const clonedSig = computeWorkspaceSignature(
      clonedDoc,
      DEFAULT_ALTERACAO_META,
      []
    );
    await saveWorkspaceToIndexedDB({
      doc: clonedDoc,
      altMeta,
      alteracoes,
      auditText,
      updatedAt: nowIso,
    });
    await pushImmediateLocalSnapshot(clonedDoc);

    if (isCloudEligible && googleUser && !cloudQuotaPausedRef.current) {
      setCloudSyncStatus('saving');
      setCloudSyncError(null);
      try {
        await upsertCloudNorma(googleUser.uid, nextId, clonedDoc, false);
        setCloudSyncStatus('synced');
      } catch (err) {
        setCloudSyncStatus('error');
        if (isFirestoreQuotaError(err)) {
          cloudQuotaPausedRef.current = true;
          setCloudQuotaPaused(true);
        }
        setCloudSyncError(
          formatCloudSyncErrorMessage(
            err,
            'Falha ao salvar nova cópia na nuvem.'
          )
        );
        if (!isFirestoreQuotaError(err)) {
          throw err;
        }
      }
    }

    lastCloudNormaSigRef.current = clonedSig;
    setActiveCloudNormaId(nextId);
    setDoc(clonedDoc);
    setSidebarSavedFeedback(true);
    window.setTimeout(() => setSidebarSavedFeedback(false), 2200);
  }, [
    doc,
    altMeta,
    alteracoes,
    auditText,
    pushImmediateLocalSnapshot,
    isCloudEligible,
    googleUser,
  ]);

  const handlePrepareNewDraftSlot = useCallback(async () => {
    await pushImmediateLocalSnapshot(doc);
    if (isCloudEligible && googleUser) {
      const exists = cloudNormasRef.current.some(
        (n) => n.id === activeCloudNormaId
      );
      if (exists || lastCloudNormaSigRef.current !== normaSignature) {
        try {
          await upsertCloudNorma(
            googleUser.uid,
            activeCloudNormaId,
            doc,
            exists
          );
        } catch {
          // Mantém snapshot local caso falhe sincronização prévia
        }
      }
    }
    const freshId = sanitizeFirestoreId(`norma_${Date.now()}`);
    lastCloudNormaSigRef.current = null;
    setActiveCloudNormaId(freshId);
  }, [
    doc,
    pushImmediateLocalSnapshot,
    isCloudEligible,
    googleUser,
    activeCloudNormaId,
    normaSignature,
  ]);

  const handleSelectCloudNorma = useCallback(
    (item: CloudNormaItem) => {
      if (lastCloudNormaSigRef.current !== normaSignature) {
        void pushImmediateLocalSnapshot(doc);
      }
      lastCloudNormaSigRef.current = computeWorkspaceSignature(
        item.doc,
        DEFAULT_ALTERACAO_META,
        []
      );
      setActiveCloudNormaId(item.id);
      setDoc(item.doc);
      setActiveTab('editor');
      setMobileMenuOpen(false);
    },
    [doc, normaSignature, pushImmediateLocalSnapshot]
  );

  const handleDeleteCloudNorma = useCallback(
    async (normaId: string) => {
      if (!googleUser) return;
      await deleteCloudNorma(googleUser.uid, normaId);
      if (normaId === activeCloudNormaId) {
        lastCloudNormaSigRef.current = null;
        setActiveCloudNormaId(sanitizeFirestoreId(`norma_${Date.now()}`));
      }
    },
    [googleUser, activeCloudNormaId]
  );

  const handleCreateNormaRevision = useCallback(
    async (
      titulo: string,
      observacao: string,
      origem: NormaRevision['origem'] = 'manual'
    ) => {
      const safeNormaId = sanitizeFirestoreId(activeCloudNormaId, 'norma');
      const revId = sanitizeFirestoreId(
        `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      );
      const maxNum = normaRevisions.reduce(
        (acc, item) => Math.max(acc, item.numeroRevisao || 0),
        0
      );
      const nextNum = maxNum + 1;
      const previousDoc = normaRevisions[0]?.docSnapshot || null;
      const resumoAlteracoes = summarizeNormaChanges(previousDoc, doc);
      const cleanTitulo = titulo.trim() || `Revisão #${nextNum}`;
      const autorNome =
        userProfile?.nomeCompleto ||
        googleUser?.displayName ||
        googleUser?.email ||
        'Redator';
      const autorEmail = userProfile?.email || googleUser?.email || '';
      const nowIso = new Date().toISOString();
      const docCopy: NormaDocument = JSON.parse(JSON.stringify(doc));

      const localEntry: NormaRevision = {
        id: revId,
        normaId: safeNormaId,
        numeroRevisao: nextNum,
        titulo: cleanTitulo,
        observacao: observacao.trim(),
        autorNome,
        autorEmail,
        origem,
        signature: computeNormaSignature(docCopy),
        resumoAlteracoes,
        docSnapshot: docCopy,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      const nextLocal = saveLocalNormaRevision(localEntry);
      setNormaRevisions((prev) => {
        const map = new Map<string, NormaRevision>();
        for (const item of prev) map.set(item.id, item);
        for (const item of nextLocal) map.set(item.id, item);
        return Array.from(map.values()).sort((a, b) => {
          if (b.numeroRevisao !== a.numeroRevisao) {
            return b.numeroRevisao - a.numeroRevisao;
          }
          return b.createdAtIso.localeCompare(a.createdAtIso);
        });
      });

      if (isCloudEligible && googleUser && !cloudQuotaPausedRef.current) {
        const parentExists = cloudNormasRef.current.some(
          (n) => n.id === safeNormaId
        );
        try {
          await createCloudNormaRevision(
            googleUser.uid,
            safeNormaId,
            {
              revisaoId: revId,
              numeroRevisao: nextNum,
              titulo: cleanTitulo,
              observacao: observacao.trim(),
              autorNome,
              autorEmail,
              origem,
              signature: localEntry.signature,
              resumoAlteracoes,
              docSnapshot: docCopy,
            },
            docCopy,
            parentExists
          );
        } catch (err) {
          if (isFirestoreQuotaError(err)) {
            cloudQuotaPausedRef.current = true;
            setCloudQuotaPaused(true);
            setCloudSyncStatus('error');
            setCloudSyncError(
              formatCloudSyncErrorMessage(
                err,
                'Cota diária gratuita da nuvem atingida hoje.'
              )
            );
          } else {
            throw err;
          }
        }
      }
    },
    [
      activeCloudNormaId,
      normaRevisions,
      doc,
      userProfile,
      googleUser,
      isCloudEligible,
    ]
  );

  const handleUpdateNormaRevisionNote = useCallback(
    async (revisaoId: string, titulo: string, observacao: string) => {
      const safeNormaId = sanitizeFirestoreId(activeCloudNormaId, 'norma');
      updateLocalNormaRevisionNote(safeNormaId, revisaoId, titulo, observacao);
      const nowIso = new Date().toISOString();
      setNormaRevisions((prev) =>
        prev.map((r) =>
          r.id === revisaoId
            ? {
                ...r,
                titulo: titulo.trim() || r.titulo,
                observacao: observacao.trim(),
                updatedAtIso: nowIso,
              }
            : r
        )
      );

      if (isCloudEligible && googleUser) {
        await updateCloudNormaRevisionNote(
          googleUser.uid,
          safeNormaId,
          revisaoId,
          titulo,
          observacao
        );
      }
    },
    [activeCloudNormaId, isCloudEligible, googleUser]
  );

  const handleDeleteNormaRevision = useCallback(
    async (revisaoId: string) => {
      const safeNormaId = sanitizeFirestoreId(activeCloudNormaId, 'norma');
      deleteLocalNormaRevision(safeNormaId, revisaoId);
      setNormaRevisions((prev) => prev.filter((r) => r.id !== revisaoId));

      if (isCloudEligible && googleUser) {
        await deleteCloudNormaRevision(googleUser.uid, safeNormaId, revisaoId);
      }
    },
    [activeCloudNormaId, isCloudEligible, googleUser]
  );

  const handleRestoreWholeNormaFromRevision = useCallback(
    async (snapshotDoc: NormaDocument, sourceLabel: string) => {
      // Registra ponto de segurança automático antes de sobrescrever com a versão restaurada
      try {
        await handleCreateNormaRevision(
          `Backup antes de restaurar (${sourceLabel})`.slice(0, 140),
          `Cópia automática gerada antes da restauração para "${sourceLabel}".`,
          'restauracao'
        );
      } catch {
        // Segue com a restauração mesmo se o backup na nuvem falhar offline
      }

      const cloned: NormaDocument = JSON.parse(JSON.stringify(snapshotDoc));
      // Preserva dataUrl de imagens atuais com mesmo id caso o snapshot remoto tenha omitido binários
      if (cloned.imagens && cloned.imagens.length > 0 && doc.imagens) {
        const currentById = new Map(doc.imagens.map((img) => [img.id, img]));
        cloned.imagens = cloned.imagens.map((img) => {
          if (img.dataUrl) return img;
          const match = currentById.get(img.id);
          return match?.dataUrl ? { ...img, dataUrl: match.dataUrl } : img;
        });
      }

      setDoc({
        ...cloned,
        id: doc.id,
        updatedAt: new Date().toISOString(),
      });
    },
    [doc, handleCreateNormaRevision]
  );

  const handleGoogleAppSignIn = async () => {
    setIsLoggingIn(true);
    setDriveAuthError(null);
    setAppAuthStatus(null);
    try {
      const user = await googleAppSignIn();
      setGoogleUser(user);
    } catch (err) {
      setDriveAuthError(formatFirebaseAuthError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleDriveSignIn = async () => {
    setIsLoggingIn(true);
    setDriveAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setNeedsDriveAuth(false);
      }
    } catch (err) {
      setDriveAuthError(formatFirebaseAuthError(err));
      setNeedsDriveAuth(true);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLoginEmail = async (email: string, password: string) => {
    setIsLoggingIn(true);
    setDriveAuthError(null);
    setAppAuthStatus(null);
    try {
      const user = await loginWithEmail(email, password);
      setGoogleUser(user);
    } catch (err) {
      setDriveAuthError(formatFirebaseAuthError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegisterEmail = async (data: {
    email: string;
    password: string;
    nomeCompleto: string;
    orgao: string;
    cargo: string;
    esferaPreferida: EsferaPreferida;
  }) => {
    setIsLoggingIn(true);
    setDriveAuthError(null);
    setAppAuthStatus(null);
    try {
      setPendingRegProfile({
        nomeCompleto: data.nomeCompleto,
        orgao: data.orgao,
        cargo: data.cargo,
        esferaPreferida: data.esferaPreferida,
      });
      const user = await registerWithEmail({
        email: data.email,
        password: data.password,
        nomeCompleto: data.nomeCompleto,
      });
      setGoogleUser(user);
      setAppAuthStatus(
        'Conta criada! Enviamos um link de confirmação para o seu e-mail.'
      );
    } catch (err) {
      setPendingRegProfile(null);
      setDriveAuthError(formatFirebaseAuthError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRequestReset = async (email: string) => {
    setIsLoggingIn(true);
    setDriveAuthError(null);
    setAppAuthStatus(null);
    try {
      await requestPasswordReset(email);
      setAppAuthStatus(
        'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.'
      );
    } catch (err) {
      setDriveAuthError(formatFirebaseAuthError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleResendVerification = async () => {
    setIsLoggingIn(true);
    setDriveAuthError(null);
    setAppAuthStatus(null);
    try {
      await resendVerificationEmail();
      setAppAuthStatus('Novo e-mail de confirmação enviado.');
    } catch (err) {
      setDriveAuthError(formatFirebaseAuthError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCheckVerification = async () => {
    setIsLoggingIn(true);
    setDriveAuthError(null);
    setAppAuthStatus(null);
    try {
      const refreshed = await reloadCurrentUser();
      if (refreshed) {
        setGoogleUser(refreshed);
        setAuthRefreshTick((t) => t + 1);
        if (!refreshed.emailVerified) {
          setAppAuthStatus(
            'E-mail ainda não confirmado. Verifique sua caixa de entrada e clique no link enviado.'
          );
        } else if (pendingRegProfile) {
          await saveUserProfile(
            refreshed.uid,
            { ...pendingRegProfile, email: refreshed.email || '' },
            true
          );
          setPendingRegProfile(null);
        }
      }
    } catch (err) {
      setDriveAuthError(formatFirebaseAuthError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCompleteProfile = async (data: {
    nomeCompleto: string;
    orgao: string;
    cargo: string;
    esferaPreferida: EsferaPreferida;
  }) => {
    if (!googleUser) return;
    setIsLoggingIn(true);
    setDriveAuthError(null);
    try {
      await saveUserProfile(
        googleUser.uid,
        {
          ...data,
          email: googleUser.email || '',
        },
        true
      );
      setPendingRegProfile(null);
    } catch (err) {
      setDriveAuthError(formatFirebaseAuthError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await logout();
    setGoogleUser(null);
    setUserProfile(null);
    setAllUsers([]);
    setAllowlist([]);
    setNeedsDriveAuth(true);
    setAppAuthStatus(null);
    setDriveAuthError(null);
  };

  const handleTokenExpired = () => {
    clearAccessToken();
    setNeedsDriveAuth(true);
  };

  const handleMarkDriveSynced = (link: ActiveDriveDbLink) => {
    setDriveSyncMeta({
      link,
      syncedSignature: currentSignature,
    });
  };

  const handleClearDbLink = (removedFileId: string) => {
    setDriveSyncMeta((prev) =>
      prev.link?.fileId === removedFileId
        ? { link: null, syncedSignature: null }
        : prev
    );
  };

  const handleRestoreDatabaseRecord = (
    record: NormaDatabaseRecord,
    link?: ActiveDriveDbLink
  ) => {
    const nextDoc = record.doc || doc;
    const nextMeta = record.altMeta || altMeta;
    const nextAlt = record.alteracoes || alteracoes;

    if (record.doc) {
      setDoc({ ...record.doc, updatedAt: new Date().toISOString() });
    }
    if (record.altMeta) {
      setAltMeta(record.altMeta);
    }
    if (record.alteracoes) {
      setAlteracoes(record.alteracoes);
    }
    if (record.auditText) {
      setAuditText(record.auditText);
    }

    const restoredSig = computeWorkspaceSignature(nextDoc, nextMeta, nextAlt);
    if (link) {
      setDriveSyncMeta({ link, syncedSignature: restoredSig });
    }

    if (record.kind === 'alteracao') {
      setActiveTab('ajuste');
    } else {
      setActiveTab('editor');
    }
  };

  const handleRestoreLocalSnapshot = (snap: LocalRecoveryPoint) => {
    setDoc({ ...snap.doc, updatedAt: new Date().toISOString() });
    setAltMeta(snap.altMeta);
    setAlteracoes(snap.alteracoes);
    if (snap.auditText) {
      setAuditText(snap.auditText);
    }
    setActiveTab('editor');
  };

  const handleQuickUpdateLinkedRecord = async () => {
    if (!driveSyncMeta.link) return;
    const token = await getAccessToken();
    if (!token) {
      setHeaderSyncModalOpen(false);
      handleTokenExpired();
      setActiveTab('drive');
      return;
    }

    setHeaderSyncBusy(true);
    setHeaderSyncError(null);
    try {
      const link = driveSyncMeta.link;
      const now = new Date().toISOString();
      const record: NormaDatabaseRecord = {
        schemaVersion: 1,
        recordId: link.recordId,
        kind: link.kind,
        titulo: link.titulo,
        resumo:
          link.kind === 'alteracao'
            ? `Altera ${altMeta.normaAlvoNome} (${alteracoes.length} dispositivos)`
            : doc.ementa || `${doc.artigos.length} artigos estruturados`,
        savedAt: now,
        savedByEmail: googleUser?.email || undefined,
        doc: link.kind === 'alteracao' ? undefined : doc,
        altMeta: link.kind === 'norma' ? undefined : altMeta,
        alteracoes: link.kind === 'norma' ? undefined : alteracoes,
        auditText: link.kind === 'pacote' ? auditText : undefined,
      };
      const updated = await updateDriveDatabaseRecord(
        token,
        link.fileId,
        record
      );
      if (
        link.kind !== 'alteracao' &&
        (doc.imagens || []).some(
          (img) =>
            typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/')
        )
      ) {
        await syncNormaImagesToDriveFolder(token, {
          normaId: activeCloudNormaId || doc.id,
          doc,
        });
      }
      setDriveSyncMeta({
        link: {
          ...link,
          fileName: updated.name,
          savedAt: now,
        },
        syncedSignature: currentSignature,
      });
      setHeaderSyncModalOpen(false);
    } catch (err) {
      if (err instanceof DriveAuthError) {
        setHeaderSyncModalOpen(false);
        handleTokenExpired();
        setActiveTab('drive');
      } else {
        setHeaderSyncError(
          err instanceof Error
            ? err.message
            : 'Erro ao atualizar registro no Banco de Dados.'
        );
      }
    } finally {
      setHeaderSyncBusy(false);
    }
  };

  const handleSaveNormaCopyToDrive = useCallback(
    async (
      options: Omit<
        SaveNormaCopyToDriveOptions,
        'normaId' | 'doc' | 'savedByEmail'
      >
    ): Promise<SaveNormaCopyToDriveResult> => {
      const token = await getAccessToken();
      if (!token) {
        handleTokenExpired();
        throw new DriveAuthError(
          'Conecte sua conta do Google Drive para salvar uma cópia.'
        );
      }

      try {
        const result = await saveNormaCopyWithImagesToDrive(token, {
          ...options,
          normaId: activeCloudNormaId || doc.id,
          doc,
          savedByEmail: googleUser?.email || undefined,
        });

        if (result.recordFile && result.recordMetadata) {
          setDriveSyncMeta({
            link: {
              fileId: result.recordFile.id,
              fileName: result.recordFile.name,
              recordId: result.recordMetadata.recordId,
              kind: result.recordMetadata.kind,
              titulo: result.recordMetadata.titulo,
              savedAt: result.recordMetadata.savedAt,
            },
            syncedSignature: currentSignature,
          });
        }

        return result;
      } catch (err) {
        if (err instanceof DriveAuthError) {
          handleTokenExpired();
        }
        throw err;
      }
    },
    [activeCloudNormaId, doc, googleUser?.email, currentSignature]
  );

  const handleNavigate = (tab: ActiveTab) => {
    if (tab === 'auditor') {
      if (activeTab === 'ajuste') {
        setAuditSourceMode('ajuste');
      } else if (activeTab === 'editor') {
        setAuditSourceMode('editor');
      }
    }
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const handleAuditFromEditor = () => {
    setAuditSourceMode('editor');
    setActiveTab('auditor');
  };

  const handleAuditFromAjuste = () => {
    setAuditSourceMode('ajuste');
    setActiveTab('auditor');
  };

  const handleChangeAvulsoText = (next: string) => {
    setAuditText(next);
    setAuditSourceMode('avulso');
  };

  const editorPlainText = renderNormaPlainText(doc);
  const ajustePlainText = renderAlteracaoDecreeText(altMeta, alteracoes);
  const activeAuditText =
    auditSourceMode === 'editor'
      ? editorPlainText
      : auditSourceMode === 'ajuste'
        ? ajustePlainText
        : auditText;

  const isAjusteAtivo = activeTab === 'ajuste';
  const activeExportTitle = isAjusteAtivo
    ? `${altMeta.atoAlteradorTipo} nº ${altMeta.atoAlteradorNumero || '___'} (Alterador)`
    : `${doc.tipo} nº ${doc.numero || '___'}`;

  const handleExportPdf = () => {
    try {
      setExportBusy(true);
      if (isAjusteAtivo) {
        exportAlteracaoToPdf(altMeta, alteracoes);
      } else {
        exportNormaToPdf(doc);
      }
      setExportStatus('pdf');
      setTimeout(() => setExportStatus('idle'), 2000);
    } catch {
      setExportStatus('erro');
    } finally {
      setExportBusy(false);
    }
  };

  const handleExportDocx = async () => {
    try {
      setExportBusy(true);
      if (isAjusteAtivo) {
        await exportAlteracaoToDocx(altMeta, alteracoes);
      } else {
        await exportNormaToDocx(doc);
      }
      setExportStatus('docx');
      setTimeout(() => setExportStatus('idle'), 2000);
    } catch {
      setExportStatus('erro');
    } finally {
      setExportBusy(false);
    }
  };

  // Gate obrigatório de Autenticação e Controle de Acesso (RBAC)
  const needsEmailVerification = Boolean(
    googleUser && !googleUser.emailVerified
  );
  const needsProfileCompletion = Boolean(
    googleUser &&
      googleUser.emailVerified &&
      profileLoaded &&
      !userProfile
  );
  const isCheckingProfile = Boolean(
    googleUser && googleUser.emailVerified && !profileLoaded
  );
  const shouldShowAuthGate =
    !googleUser ||
    needsEmailVerification ||
    needsProfileCompletion ||
    !isUserApproved;

  if (!authReady || isCheckingProfile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 gap-3 text-slate-600">
        <Scale className="w-6 h-6 text-slate-900 animate-pulse" />
        <span className="text-xs font-medium">
          Verificando credenciais e permissões de acesso...
        </span>
      </div>
    );
  }

  if (shouldShowAuthGate) {
    return (
      <AuthGateView
        currentUser={googleUser}
        userProfile={userProfile}
        isAdminUser={isAdminUser}
        needsEmailVerification={needsEmailVerification}
        needsProfileCompletion={needsProfileCompletion}
        busy={isLoggingIn}
        authError={driveAuthError}
        statusMessage={appAuthStatus}
        onLoginEmail={handleLoginEmail}
        onRegisterEmail={handleRegisterEmail}
        onLoginGoogle={handleGoogleAppSignIn}
        onRequestReset={handleRequestReset}
        onResendVerification={handleResendVerification}
        onCheckVerification={handleCheckVerification}
        onCompleteProfile={handleCompleteProfile}
        onSignOut={handleGoogleSignOut}
      />
    );
  }

  const visibleTabs = (Object.keys(TAB_INFO) as ActiveTab[]).filter(
    (key) => key !== 'acesso' || isAdminUser
  );
  const pendingUsersCount = allUsers.filter(
    (u) => u.status === 'pendente'
  ).length;
  const currentTabInfo = TAB_INFO[activeTab];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar Desktop (260px expandida / 72px recolhida) */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30 transition-[width] duration-200 ease-out ${
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-[260px]'
        }`}
      >
        <div
          className={`h-16 flex items-center border-b border-slate-200 shrink-0 ${
            sidebarCollapsed ? 'px-3 justify-center' : 'px-5 justify-between'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Scale className="w-5 h-5 text-slate-900 shrink-0" />
            {!sidebarCollapsed && (
              <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
                Norma
              </span>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title="Recolher barra lateral para ampliar área de edição"
              aria-label="Recolher barra lateral"
              className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors shrink-0"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        <div
          className={`flex-1 overflow-y-auto custom-scrollbar py-4 space-y-5 ${
            sidebarCollapsed ? 'px-2' : 'px-3'
          }`}
        >
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title="Expandir barra lateral"
              aria-label="Expandir barra lateral"
              className="w-full flex items-center justify-center p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          <nav aria-label="Menu principal" className="space-y-1">
            {visibleTabs.map((key) => {
              const item = TAB_INFO[key];
              const Icon = item.icon;
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleNavigate(key)}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={`relative w-full flex items-center ${
                    sidebarCollapsed
                      ? 'justify-center px-2 py-2.5'
                      : 'gap-3 px-3 py-2.5'
                  } text-sm font-medium rounded-md transition-colors text-left whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="truncate flex-1">{item.label}</span>
                  )}
                  {key === 'acesso' &&
                    pendingUsersCount > 0 &&
                    (sidebarCollapsed ? (
                      <span
                        className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500"
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className={`px-1.5 py-0.5 text-[11px] font-semibold rounded tabular-nums ${
                          isActive
                            ? 'bg-white text-slate-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {pendingUsersCount}
                      </span>
                    ))}
                </button>
              );
            })}
          </nav>

          {sidebarCollapsed ? (
            <div className="pt-3 border-t border-slate-200 space-y-1.5">
              <button
                type="button"
                onClick={() => void handleSaveNormaNow()}
                disabled={cloudSyncStatus === 'saving'}
                title="Salvar minuta atual"
                aria-label="Salvar minuta atual"
                className="w-full flex items-center justify-center p-2.5 text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md transition-colors"
              >
                {sidebarSavedFeedback ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={exportBusy}
                title="Exportar PDF"
                aria-label="Exportar PDF"
                className="w-full flex items-center justify-center p-2.5 text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-md transition-colors"
              >
                {exportStatus === 'pdf' ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handleExportDocx}
                disabled={exportBusy}
                title="Exportar DOCX"
                aria-label="Exportar DOCX"
                className="w-full flex items-center justify-center p-2.5 text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 rounded-md transition-colors"
              >
                {exportStatus === 'docx' ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
              </button>
            </div>
          ) : (
            <>
              {/* Resumo da Minuta em Edição + Botão Salvar + Acesso aos Decretos Salvos */}
              <div className="px-3 pt-5 border-t border-slate-200 space-y-3">
                <div className="text-xs font-semibold text-slate-500">
                  {isAjusteAtivo ? 'Ato alterador ativo' : 'Minuta ativa no editor'}
                </div>
                <div className="space-y-1 text-xs">
                  <div className="font-medium text-slate-900 truncate">
                    {activeExportTitle}
                  </div>
                  <div className="text-slate-500 line-clamp-2 leading-relaxed">
                    {isAjusteAtivo
                      ? `Altera ${altMeta.normaAlvoNome}`
                      : doc.ementa || 'Sem ementa definida'}
                  </div>
                  <div className="pt-1 text-slate-600 font-mono tabular-nums">
                    {isAjusteAtivo
                      ? `${alteracoes.length} ${
                          alteracoes.length === 1
                            ? 'dispositivo ajustado'
                            : 'dispositivos ajustados'
                        }`
                      : `${doc.artigos.length} ${
                          doc.artigos.length === 1 ? 'artigo' : 'artigos'
                        }`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSaveNormaNow()}
                  disabled={cloudSyncStatus === 'saving'}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
                >
                  {sidebarSavedFeedback ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Save className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {cloudSyncStatus === 'saving'
                      ? 'Salvando...'
                      : sidebarSavedFeedback
                        ? 'Minuta salva'
                        : 'Salvar minuta atual'}
                  </span>
                </button>

                <div className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600 tabular-nums">
                      Minutas salvas ({cloudNormas.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNavigate('conta')}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-900 underline"
                    >
                      Gerenciar
                    </button>
                  </div>
                  {cloudNormas.length === 0 ? (
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Clique em “Salvar minuta atual” para listar seus documentos aqui.
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pr-0.5">
                      {cloudNormas.map((item) => {
                        const isCurrent = item.id === activeCloudNormaId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectCloudNorma(item)}
                            className={`w-full text-left px-2.5 py-2 rounded-md border text-xs transition-colors flex items-start gap-2 ${
                              isCurrent
                                ? 'bg-slate-100 border-slate-300 text-slate-900 font-medium'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <FolderOpen className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{item.titulo}</div>
                              <div className="text-[11px] text-slate-500 tabular-nums">
                                {item.doc.artigos.length}{' '}
                                {item.doc.artigos.length === 1 ? 'dispositivo' : 'dispositivos'}
                                {isCurrent ? ' · Em edição' : ''}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Exportação Oficial PDF e DOCX */}
              <div className="px-3 pt-5 border-t border-slate-200 space-y-2.5">
                <div className="text-xs font-semibold text-slate-500">
                  Exportar norma atual
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Padrão A4 adaptado à espécie (LC nº 95/98, Regimento ou ABNT NBR 6024).
                </p>
                <div className="space-y-2 pt-0.5">
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={exportBusy}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  >
                    {exportStatus === 'pdf' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <FileDown className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{exportStatus === 'pdf' ? 'PDF gerado' : 'Exportar PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportDocx}
                    disabled={exportBusy}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  >
                    {exportStatus === 'docx' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      {exportStatus === 'docx' ? 'DOCX gerado' : 'Exportar DOCX'}
                    </span>
                  </button>
                </div>
                {exportStatus === 'erro' && (
                  <p className="text-xs text-red-700">
                    Não foi possível gerar o arquivo. Tente novamente.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Cartão da Conta do Usuário no Rodapé da Sidebar */}
        <div
          className={`border-t border-slate-200 space-y-2 ${
            sidebarCollapsed ? 'p-2.5' : 'p-4'
          }`}
        >
          {userProfile && (
            <button
              type="button"
              onClick={() => handleNavigate('conta')}
              title={
                sidebarCollapsed
                  ? `${userProfile.nomeCompleto} (${userProfile.orgao || userProfile.email})`
                  : undefined
              }
              aria-label="Abrir minha conta"
              className={`w-full text-left flex items-center rounded-md hover:bg-slate-50 transition-colors ${
                sidebarCollapsed ? 'justify-center p-2' : 'gap-2.5 p-2'
              }`}
            >
              <UserCircle2 className="w-5 h-5 text-slate-700 shrink-0" />
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {userProfile.nomeCompleto}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {userProfile.orgao || userProfile.email}
                  </div>
                </div>
              )}
            </button>
          )}
          {!sidebarCollapsed && (
            <div className="text-[11px] text-slate-500 leading-relaxed px-1">
              Referência: LC nº 95/1998 e Decreto nº 12.002/2024.
            </div>
          )}
        </div>
      </aside>

      {/* Drawer Mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-slate-900" />
                <span className="text-base font-bold text-slate-900">Norma</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fechar menu"
                className="p-2 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <nav className="p-3 space-y-1">
                {visibleTabs.map((key) => {
                  const item = TAB_INFO[key];
                  const Icon = item.icon;
                  const isActive = activeTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleNavigate(key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors text-left ${
                        isActive
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {key === 'acesso' && pendingUsersCount > 0 && (
                        <span
                          className={`px-1.5 py-0.5 text-[11px] font-semibold rounded tabular-nums ${
                            isActive
                              ? 'bg-white text-slate-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {pendingUsersCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="px-4 py-3 border-t border-slate-200 space-y-2.5">
                <button
                  type="button"
                  onClick={() => void handleSaveNormaNow()}
                  disabled={cloudSyncStatus === 'saving'}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md whitespace-nowrap"
                >
                  {sidebarSavedFeedback ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Save className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {cloudSyncStatus === 'saving'
                      ? 'Salvando...'
                      : sidebarSavedFeedback
                        ? 'Minuta salva'
                        : 'Salvar minuta atual'}
                  </span>
                </button>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-600 tabular-nums">
                    Minutas salvas ({cloudNormas.length})
                  </div>
                  {cloudNormas.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      Nenhuma minuta salva ainda.
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {cloudNormas.map((item) => {
                        const isCurrent = item.id === activeCloudNormaId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectCloudNorma(item)}
                            className={`w-full text-left px-2.5 py-2 rounded-md border text-xs flex items-start gap-2 ${
                              isCurrent
                                ? 'bg-slate-100 border-slate-300 text-slate-900 font-medium'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <FolderOpen className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
                            <span className="truncate flex-1">{item.titulo}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-4 py-4 border-t border-slate-200 space-y-2 shrink-0">
              <div className="text-xs font-semibold text-slate-500">
                Exportar norma atual ({activeExportTitle})
              </div>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={exportBusy}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{exportStatus === 'pdf' ? 'PDF gerado' : 'Exportar PDF'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportDocx}
                disabled={exportBusy}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>
                  {exportStatus === 'docx' ? 'DOCX gerado' : 'Exportar DOCX'}
                </span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Conteúdo Principal */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ease-out ${
          sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[260px]'
        }`}
      >
        <header className="h-14 sm:h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir navegação"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title={
                sidebarCollapsed
                  ? 'Expandir barra lateral'
                  : 'Recolher barra lateral para ampliar área de trabalho'
              }
              aria-label={
                sidebarCollapsed
                  ? 'Expandir barra lateral'
                  : 'Recolher barra lateral'
              }
              className="hidden lg:inline-flex p-1.5 -ml-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
                Oficina Legislativa
              </span>
              <span
                className="text-slate-300 hidden sm:inline"
                aria-hidden="true"
              >
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {currentTabInfo.breadcrumb}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isCloudEligible && (
              <button
                type="button"
                onClick={() => handleNavigate('conta')}
                className={`hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  cloudSyncStatus === 'error'
                    ? 'bg-red-50 text-red-800 border-red-200'
                    : cloudSyncStatus === 'saving'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <Cloud className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {cloudSyncStatus === 'saving'
                    ? 'Salvando na nuvem...'
                    : cloudQuotaPaused
                      ? 'Nuvem pausada (salvo local)'
                      : cloudSyncStatus === 'error'
                        ? 'Erro na nuvem'
                        : 'Nuvem salva'}
                </span>
              </button>
            )}

            {!needsDriveAuth && driveSyncMeta.link ? (
              <button
                type="button"
                onClick={() => {
                  setHeaderSyncError(null);
                  setHeaderSyncModalOpen(true);
                }}
                className={`hidden xl:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  hasUnsyncedDriveChanges
                    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Database className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {hasUnsyncedDriveChanges
                    ? 'Salvar no Banco (Drive)'
                    : 'Drive em dia'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleNavigate('drive')}
                className="hidden xl:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Database className="w-3.5 h-3.5 shrink-0" />
                <span>Google Drive</span>
              </button>
            )}

            {activeTab !== 'editor' ? (
              <button
                type="button"
                onClick={() => handleNavigate('editor')}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Abrir Editor
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleNavigate('ajuste')}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Ajustar Norma (NR)
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 max-w-[1680px] w-full mx-auto">
          {activeTab === 'guia' && (
            <GuiaOrientacaoView
              onNavigate={handleNavigate}
              onLoadModeloDecreto={() => {
                void (async () => {
                  await handlePrepareNewDraftSlot();
                  const modelo =
                    NORMA_TEMPLATES.find(
                      (t) => t.id === 'tpl-decreto-modelo-estruturado'
                    ) || NORMA_TEMPLATES[0];
                  setDoc({
                    ...JSON.parse(JSON.stringify(modelo)),
                    updatedAt: new Date().toISOString(),
                  });
                  setActiveTab('editor');
                })();
              }}
            />
          )}
          {activeTab === 'editor' && (
            <EditorEstruturadoView
              doc={doc}
              onChange={setDoc}
              onAuditDraft={handleAuditFromEditor}
              activeCloudNormaId={activeCloudNormaId}
              cloudNormas={cloudNormas}
              localSnapshots={localSnapshots}
              cloudSyncStatus={cloudSyncStatus}
              cloudSyncError={cloudSyncError}
              onSaveNormaNow={handleSaveNormaNow}
              onSaveAsNewNorma={handleSaveAsNewNorma}
              onPrepareNewDraftSlot={handlePrepareNewDraftSlot}
              onSelectCloudNorma={handleSelectCloudNorma}
              onDeleteCloudNorma={handleDeleteCloudNorma}
              onRestoreLocalSnapshot={handleRestoreLocalSnapshot}
              revisions={normaRevisions}
              revisionsLoading={revisionsLoading}
              revisionsError={revisionsError}
              onCreateRevision={(titulo, observacao) =>
                handleCreateNormaRevision(titulo, observacao, 'manual')
              }
              onUpdateRevisionNote={handleUpdateNormaRevisionNote}
              onDeleteRevision={handleDeleteNormaRevision}
              onRestoreWholeRevision={handleRestoreWholeNormaFromRevision}
              needsDriveAuth={needsDriveAuth}
              driveLoggingIn={isLoggingIn}
              driveAuthError={driveAuthError}
              onConnectGoogleDrive={handleGoogleDriveSignIn}
              onSaveNormaCopyToDrive={handleSaveNormaCopyToDrive}
            />
          )}
          {activeTab === 'ajuste' && (
            <AjusteNormaView
              meta={altMeta}
              alteracoes={alteracoes}
              onChangeMeta={setAltMeta}
              onChangeAlteracoes={setAlteracoes}
              onAuditDraft={handleAuditFromAjuste}
            />
          )}
          {activeTab === 'auditor' && (
            <AuditorNormaView
              source={auditSourceMode}
              onChangeSource={setAuditSourceMode}
              editorDocTitle={`${doc.tipo} nº ${doc.numero || '___'}`}
              ajusteDocTitle={`${altMeta.atoAlteradorTipo} nº ${altMeta.atoAlteradorNumero || '___'}`}
              activeDocTipo={
                auditSourceMode === 'editor'
                  ? doc.tipo
                  : auditSourceMode === 'ajuste'
                    ? altMeta.atoAlteradorTipo
                    : undefined
              }
              text={activeAuditText}
              onChangeCustomText={handleChangeAvulsoText}
            />
          )}
          {activeTab === 'drive' && (
            <GoogleDriveView
              user={googleUser}
              needsAuth={needsDriveAuth}
              isLoggingIn={isLoggingIn}
              authErrorInfo={driveAuthError}
              onSignIn={handleGoogleDriveSignIn}
              onSignOut={handleGoogleSignOut}
              onTokenExpired={handleTokenExpired}
              doc={doc}
              activeCloudNormaId={activeCloudNormaId}
              altMeta={altMeta}
              alteracoes={alteracoes}
              auditText={auditText}
              localSnapshots={localSnapshots}
              lastLocalSavedAt={lastLocalSavedAt}
              activeDbLink={driveSyncMeta.link}
              hasUnsyncedDriveChanges={hasUnsyncedDriveChanges}
              onRestoreDatabaseRecord={handleRestoreDatabaseRecord}
              onRestoreLocalSnapshot={handleRestoreLocalSnapshot}
              onMarkDriveSynced={handleMarkDriveSynced}
              onClearDbLink={handleClearDbLink}
              onLoadDocFromDrive={(loaded) => {
                setDoc({
                  ...loaded,
                  updatedAt: new Date().toISOString(),
                });
                setActiveTab('editor');
              }}
              onAuditTextFromDrive={(text) => {
                setAuditText(text);
                setAuditSourceMode('avulso');
                setActiveTab('auditor');
              }}
            />
          )}
          {activeTab === 'conta' && (
            <MinhaContaView
              currentUser={googleUser}
              profile={userProfile}
              cloudNormas={cloudNormas}
              cloudAlteracoes={cloudAlteracoes}
              activeCloudNormaId={activeCloudNormaId}
              activeCloudAltId={activeCloudAltId}
              cloudSyncStatus={cloudSyncStatus}
              cloudSyncError={cloudSyncError}
              onOpenAuthScreen={() => void handleGoogleSignOut()}
              onSignOut={handleGoogleSignOut}
              onUpdateProfile={async (data) => {
                if (!googleUser) return;
                await saveUserProfile(
                  googleUser.uid,
                  {
                    ...data,
                    email: googleUser.email || userProfile?.email || '',
                  },
                  false
                );
              }}
              onSelectCloudNorma={(item) => {
                lastCloudNormaSigRef.current = computeWorkspaceSignature(
                  item.doc,
                  DEFAULT_ALTERACAO_META,
                  []
                );
                setActiveCloudNormaId(item.id);
                setDoc(item.doc);
                setActiveTab('editor');
              }}
              onCreateNewCloudNorma={async () => {
                if (!googleUser) return;
                const modelo =
                  NORMA_TEMPLATES.find(
                    (t) => t.id === 'tpl-decreto-modelo-estruturado'
                  ) || NORMA_TEMPLATES[0];
                const nextId = sanitizeFirestoreId(`norma_${Date.now()}`);
                const freshDoc: NormaDocument = {
                  ...JSON.parse(JSON.stringify(modelo)),
                  id: nextId,
                  updatedAt: new Date().toISOString(),
                };
                lastCloudNormaSigRef.current = computeWorkspaceSignature(
                  freshDoc,
                  DEFAULT_ALTERACAO_META,
                  []
                );
                await upsertCloudNorma(googleUser.uid, nextId, freshDoc, false);
                setActiveCloudNormaId(nextId);
                setDoc(freshDoc);
                setActiveTab('editor');
              }}
              onDeleteCloudNorma={async (normaId) => {
                if (!googleUser) return;
                await deleteCloudNorma(googleUser.uid, normaId);
                if (normaId === activeCloudNormaId) {
                  setActiveCloudNormaId(sanitizeFirestoreId(`norma_${Date.now()}`));
                }
              }}
              onSelectCloudAlteracao={(item) => {
                lastCloudAltSigRef.current = computeWorkspaceSignature(
                  NORMA_TEMPLATES[0],
                  item.meta,
                  item.dispositivos
                );
                setActiveCloudAltId(item.id);
                setAltMeta(item.meta);
                setAlteracoes(item.dispositivos);
                setActiveTab('ajuste');
              }}
              onCreateNewCloudAlteracao={async () => {
                if (!googleUser) return;
                const nextId = sanitizeFirestoreId(`alt_${Date.now()}`);
                const freshMeta = {
                  ...DEFAULT_ALTERACAO_META,
                  atoAlteradorNumero: '',
                };
                lastCloudAltSigRef.current = computeWorkspaceSignature(
                  NORMA_TEMPLATES[0],
                  freshMeta,
                  []
                );
                await upsertCloudAlteracao(
                  googleUser.uid,
                  nextId,
                  freshMeta,
                  [],
                  false
                );
                setActiveCloudAltId(nextId);
                setAltMeta(freshMeta);
                setAlteracoes([]);
                setActiveTab('ajuste');
              }}
              onDeleteCloudAlteracao={async (altId) => {
                if (!googleUser) return;
                await deleteCloudAlteracao(googleUser.uid, altId);
                if (altId === activeCloudAltId) {
                  setActiveCloudAltId(sanitizeFirestoreId(`alt_${Date.now()}`));
                }
              }}
              onForceCloudSync={handleForceCloudSync}
            />
          )}
          {activeTab === 'acesso' && isAdminUser && googleUser && (
            <ControleAcessoView
              currentAdminUid={googleUser.uid}
              users={allUsers}
              allowlist={allowlist}
              accessError={adminAccessError}
              onUpdateUserAccess={async (targetUid, payload) => {
                await updateUserAccess(targetUid, payload);
              }}
              onAddAllowlistEmail={async (input) => {
                await addAllowlistEmail({
                  ...input,
                  addedByUid: googleUser.uid,
                });
              }}
              onRemoveAllowlistEmail={async (emailKey) => {
                await removeAllowlistEmail(emailKey);
              }}
            />
          )}
        </main>
      </div>

      {/* Modal Rápido de Confirmação para Atualização no Banco do Drive */}
      {headerSyncModalOpen && driveSyncMeta.link && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="header-db-sync-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h3
                  id="header-db-sync-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Atualizar registro no Banco de Dados do Drive?
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  O registro vinculado{' '}
                  <strong>"{driveSyncMeta.link.titulo}"</strong> (
                  {driveSyncMeta.link.fileName}) no Google Drive será atualizado
                  com as alterações atuais do Editor e de Ajuste e Redação (NR).
                </p>
                {headerSyncError && (
                  <p className="text-xs text-red-700 pt-1">{headerSyncError}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setHeaderSyncModalOpen(false)}
                disabled={headerSyncBusy}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeaderSyncModalOpen(false);
                  setActiveTab('drive');
                }}
                disabled={headerSyncBusy}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
              >
                Abrir Banco
              </button>
              <button
                type="button"
                onClick={handleQuickUpdateLinkedRecord}
                disabled={headerSyncBusy}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md whitespace-nowrap"
              >
                {headerSyncBusy ? 'Salvando...' : 'Confirmar atualização'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
