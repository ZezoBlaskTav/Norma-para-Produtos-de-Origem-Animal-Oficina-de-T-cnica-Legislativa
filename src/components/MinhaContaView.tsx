import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  FileDiff,
  FilePlus2,
  FolderOpen,
  LogIn,
  LogOut,
  Plus,
  Save,
  Trash2,
  UserCheck,
} from 'lucide-react';
import {
  CloudAlteracaoItem,
  CloudNormaItem,
  EsferaPreferida,
  UserProfileData,
} from '../utils/cloudStorage';

interface MinhaContaViewProps {
  currentUser: User | null;
  profile: UserProfileData | null;
  cloudNormas: CloudNormaItem[];
  cloudAlteracoes: CloudAlteracaoItem[];
  activeCloudNormaId: string;
  activeCloudAltId: string;
  cloudSyncStatus: 'idle' | 'saving' | 'synced' | 'error' | 'offline';
  cloudSyncError: string | null;
  onOpenAuthScreen: () => void;
  onSignOut: () => Promise<void>;
  onUpdateProfile: (data: {
    nomeCompleto: string;
    orgao: string;
    cargo: string;
    esferaPreferida: EsferaPreferida;
  }) => Promise<void>;
  onSelectCloudNorma: (item: CloudNormaItem) => void;
  onCreateNewCloudNorma: () => Promise<void>;
  onDeleteCloudNorma: (normaId: string) => Promise<void>;
  onSelectCloudAlteracao: (item: CloudAlteracaoItem) => void;
  onCreateNewCloudAlteracao: () => Promise<void>;
  onDeleteCloudAlteracao: (altId: string) => Promise<void>;
  onForceCloudSync: () => Promise<void>;
}

function formatDateBr(iso?: string): string {
  if (!iso) return 'Agora';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const MinhaContaView: React.FC<MinhaContaViewProps> = ({
  currentUser,
  profile,
  cloudNormas,
  cloudAlteracoes,
  activeCloudNormaId,
  activeCloudAltId,
  cloudSyncStatus,
  cloudSyncError,
  onOpenAuthScreen,
  onSignOut,
  onUpdateProfile,
  onSelectCloudNorma,
  onCreateNewCloudNorma,
  onDeleteCloudNorma,
  onSelectCloudAlteracao,
  onCreateNewCloudAlteracao,
  onDeleteCloudAlteracao,
  onForceCloudSync,
}) => {
  const [nomeCompleto, setNomeCompleto] = useState(
    profile?.nomeCompleto || currentUser?.displayName || ''
  );
  const [orgao, setOrgao] = useState(profile?.orgao || '');
  const [cargo, setCargo] = useState(profile?.cargo || '');
  const [esferaPreferida, setEsferaPreferida] = useState<EsferaPreferida>(
    profile?.esferaPreferida || 'Municipal'
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedMsg, setProfileSavedMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'norma'; id: string; titulo: string }
    | { kind: 'alteracao'; id: string; titulo: string }
    | null
  >(null);
  const [busyAction, setBusyAction] = useState(false);

  useEffect(() => {
    if (profile) {
      setNomeCompleto(profile.nomeCompleto);
      setOrgao(profile.orgao);
      setCargo(profile.cargo);
      setEsferaPreferida(profile.esferaPreferida);
    }
  }, [profile]);

  if (!currentUser || !currentUser.emailVerified || !profile) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <section className="bg-white border border-slate-200 rounded-lg p-8 space-y-5">
          <div className="flex items-start gap-3">
            <CloudOff className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold text-slate-900">
                Você está usando o modo local (sem login na nuvem)
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Suas alterações continuam salvas automaticamente neste navegador
                (localStorage e IndexedDB), mas para sincronizar suas minutas e
                acessá-las de qualquer computador entre ou crie seu cadastro.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenAuthScreen}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
          >
            <LogIn className="w-4 h-4" />
            <span>Entrar ou criar cadastro</span>
          </button>
        </section>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSavedMsg(null);
    setProfileErrorMsg(null);
    try {
      await onUpdateProfile({
        nomeCompleto: nomeCompleto.trim(),
        orgao: orgao.trim(),
        cargo: cargo.trim(),
        esferaPreferida,
      });
      setProfileSavedMsg('Cadastro atualizado na nuvem com sucesso.');
    } catch (err) {
      setProfileErrorMsg(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar seu cadastro.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setBusyAction(true);
    try {
      if (pendingDelete.kind === 'norma') {
        await onDeleteCloudNorma(pendingDelete.id);
      } else {
        await onDeleteCloudAlteracao(pendingDelete.id);
      }
      setPendingDelete(null);
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Conta e Status de Sincronização */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <UserCheck className="w-4 h-4 text-slate-800" />
            <h1 className="text-base font-semibold text-slate-900">
              {profile.nomeCompleto}
            </h1>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${
                cloudSyncStatus === 'error'
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : cloudSyncStatus === 'saving'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              <Cloud className="w-3 h-3" />
              <span>
                {cloudSyncStatus === 'saving'
                  ? 'Sincronizando na nuvem...'
                  : cloudSyncStatus === 'error'
                    ? 'Falha na sincronização'
                    : 'Salvamento automático na nuvem ativo'}
              </span>
            </span>
          </div>
          <p className="text-xs text-slate-600">
            {profile.email}
            {profile.orgao ? ` · ${profile.orgao}` : ''}
            {profile.cargo ? ` · ${profile.cargo}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void onForceCloudSync()}
            disabled={cloudSyncStatus === 'saving'}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Sincronizar agora</span>
          </button>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </section>

      {cloudSyncError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{cloudSyncError}</span>
        </div>
      )}

      {/* Biblioteca na Nuvem: Normas (Editor Estruturado) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FilePlus2 className="w-4 h-4 text-slate-700 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Minhas Normas e Decretos na Nuvem
              </h2>
              <p className="text-xs text-slate-500">
                Cada edição no Editor Estruturado é gravada automaticamente na
                sua conta
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onCreateNewCloudNorma()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Minuta na Nuvem</span>
          </button>
        </div>

        <div className="divide-y divide-slate-200">
          {cloudNormas.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              Nenhuma norma gravada ainda na nuvem. Clique em "Sincronizar agora"
              ou "Nova Minuta na Nuvem".
            </div>
          ) : (
            cloudNormas.map((item) => {
              const isActive = item.id === activeCloudNormaId;
              return (
                <div
                  key={item.id}
                  className={`px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isActive ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {item.titulo}
                      </span>
                      {isActive && (
                        <span className="px-1.5 py-0.5 text-[11px] font-medium bg-slate-900 text-white rounded shrink-0">
                          Em edição
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {item.doc.artigos.length}{' '}
                      {item.doc.artigos.length === 1 ? 'artigo' : 'artigos'} ·
                      Atualizado em {formatDateBr(item.updatedAtIso)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectCloudNorma(item)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded whitespace-nowrap"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Abrir no Editor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingDelete({
                          kind: 'norma',
                          id: item.id,
                          titulo: item.titulo,
                        })
                      }
                      aria-label={`Excluir ${item.titulo}`}
                      className="p-1.5 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Biblioteca na Nuvem: Atos Alteradores (Ajuste e Redação NR) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileDiff className="w-4 h-4 text-slate-700 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Meus Atos Alteradores (NR) na Nuvem
              </h2>
              <p className="text-xs text-slate-500">
                Alterações e acréscimos (art. 12 da LC nº 95/98) sincronizados
                automaticamente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onCreateNewCloudAlteracao()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Ato Alterador na Nuvem</span>
          </button>
        </div>

        <div className="divide-y divide-slate-200">
          {cloudAlteracoes.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              Nenhum ato alterador gravado na nuvem ainda.
            </div>
          ) : (
            cloudAlteracoes.map((item) => {
              const isActive = item.id === activeCloudAltId;
              return (
                <div
                  key={item.id}
                  className={`px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isActive ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {item.titulo}
                      </span>
                      {isActive && (
                        <span className="px-1.5 py-0.5 text-[11px] font-medium bg-slate-900 text-white rounded shrink-0">
                          Em edição
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {item.dispositivos.length}{' '}
                      {item.dispositivos.length === 1
                        ? 'dispositivo ajustado'
                        : 'dispositivos ajustados'}{' '}
                      · Atualizado em {formatDateBr(item.updatedAtIso)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectCloudAlteracao(item)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded whitespace-nowrap"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Abrir em Ajuste (NR)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingDelete({
                          kind: 'alteracao',
                          id: item.id,
                          titulo: item.titulo,
                        })
                      }
                      aria-label={`Excluir ${item.titulo}`}
                      className="p-1.5 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Edição do Cadastro Institucional */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Dados do Cadastro
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Informações institucionais vinculadas à sua conta
          </p>
        </div>

        {profileSavedMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{profileSavedMsg}</span>
          </div>
        )}

        {profileErrorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs text-red-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{profileErrorMsg}</span>
          </div>
        )}

        <form
          onSubmit={handleSaveProfile}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nome completo
            </label>
            <input
              type="text"
              required
              value={nomeCompleto}
              onChange={(e) => setNomeCompleto(e.target.value)}
              className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Esfera legislativa padrão
            </label>
            <select
              value={esferaPreferida}
              onChange={(e) =>
                setEsferaPreferida(e.target.value as EsferaPreferida)
              }
              className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
            >
              <option value="Municipal">Municipal</option>
              <option value="Estadual">Estadual</option>
              <option value="Federal">Federal</option>
              <option value="Distrital">Distrital</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Órgão / Entidade
            </label>
            <input
              type="text"
              value={orgao}
              onChange={(e) => setOrgao(e.target.value)}
              className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Cargo / Função
            </label>
            <input
              type="text"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {savingProfile ? 'Salvando...' : 'Salvar alterações no cadastro'}
              </span>
            </button>
          </div>
        </form>
      </section>

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-slate-900">
                  Excluir registro da nuvem?
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  O registro <strong>"{pendingDelete.titulo}"</strong> será
                  removido permanentemente da sua conta na nuvem.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={busyAction}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={busyAction}
                className="px-4 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md"
              >
                {busyAction ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
