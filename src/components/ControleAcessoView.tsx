import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  MailPlus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  ADMIN_EMAIL,
  AllowlistEntry,
  UserAccessStatus,
  UserProfileData,
} from '../utils/cloudStorage';
import { activeFirebaseConfig } from '../utils/googleAuth';

interface ControleAcessoViewProps {
  currentAdminUid: string;
  users: UserProfileData[];
  allowlist: AllowlistEntry[];
  accessError: string | null;
  onUpdateUserAccess: (
    targetUid: string,
    payload: {
      status: UserAccessStatus;
      observacaoAcesso: string;
    }
  ) => Promise<void>;
  onAddAllowlistEmail: (input: {
    email: string;
    orgaoSugerido: string;
    observacao: string;
  }) => Promise<void>;
  onRemoveAllowlistEmail: (emailKey: string) => Promise<void>;
}

type StatusFilter = 'pendente' | 'aprovado' | 'bloqueado' | 'todos';

function formatDateBr(iso?: string): string {
  if (!iso) return '—';
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

export const ControleAcessoView: React.FC<ControleAcessoViewProps> = ({
  currentAdminUid,
  users,
  allowlist,
  accessError,
  onUpdateUserAccess,
  onAddAllowlistEmail,
  onRemoveAllowlistEmail,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pendente');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de alteração de status de usuário
  const [pendingUserAction, setPendingUserAction] = useState<{
    user: UserProfileData;
    nextStatus: UserAccessStatus;
    observacao: string;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Formulário de pré-autorização (allowlist)
  const [allowEmail, setAllowEmail] = useState('');
  const [allowOrgao, setAllowOrgao] = useState('');
  const [allowObs, setAllowObs] = useState('');
  const [allowBusy, setAllowBusy] = useState(false);
  const [allowMsg, setAllowMsg] = useState<string | null>(null);
  const [allowErr, setAllowErr] = useState<string | null>(null);

  // Modal de remoção da allowlist
  const [pendingAllowRemove, setPendingAllowRemove] =
    useState<AllowlistEntry | null>(null);
  const [copiedTestEmails, setCopiedTestEmails] = useState(false);

  const counts = useMemo(() => {
    let pendentes = 0;
    let aprovados = 0;
    let bloqueados = 0;
    for (const u of users) {
      if (u.status === 'pendente') pendentes += 1;
      else if (u.status === 'aprovado') aprovados += 1;
      else if (u.status === 'bloqueado') bloqueados += 1;
    }
    return {
      total: users.length,
      pendentes,
      aprovados,
      bloqueados,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== 'todos' && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        u.nomeCompleto.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.orgao.toLowerCase().includes(q) ||
        u.cargo.toLowerCase().includes(q)
      );
    });
  }, [users, statusFilter, searchTerm]);

  const handleConfirmUserAction = async () => {
    if (!pendingUserAction) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await onUpdateUserAccess(pendingUserAction.user.uid, {
        status: pendingUserAction.nextStatus,
        observacaoAcesso: pendingUserAction.observacao.trim().slice(0, 300),
      });
      setPendingUserAction(null);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar a permissão deste usuário.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleAddAllowlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setAllowBusy(true);
    setAllowMsg(null);
    setAllowErr(null);
    try {
      await onAddAllowlistEmail({
        email: allowEmail.trim(),
        orgaoSugerido: allowOrgao.trim(),
        observacao: allowObs.trim(),
      });
      setAllowMsg(
        `E-mail ${allowEmail.trim().toLowerCase()} pré-autorizado com sucesso.`
      );
      setAllowEmail('');
      setAllowOrgao('');
      setAllowObs('');
    } catch (err) {
      setAllowErr(
        err instanceof Error
          ? err.message
          : 'Não foi possível adicionar o e-mail à lista de pré-autorização.'
      );
    } finally {
      setAllowBusy(false);
    }
  };

  const handleConfirmAllowRemove = async () => {
    if (!pendingAllowRemove) return;
    setActionBusy(true);
    try {
      await onRemoveAllowlistEmail(pendingAllowRemove.emailKey);
      setPendingAllowRemove(null);
    } catch (err) {
      setAllowErr(
        err instanceof Error
          ? err.message
          : 'Não foi possível remover este e-mail da lista.'
      );
      setPendingAllowRemove(null);
    } finally {
      setActionBusy(false);
    }
  };

  const renderStatusBadge = (user: UserProfileData) => {
    if (user.role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-slate-900 text-white rounded">
          <ShieldCheck className="w-3 h-3" />
          <span>Administrador</span>
        </span>
      );
    }
    if (user.status === 'aprovado') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
          <CheckCircle2 className="w-3 h-3" />
          <span>Aprovado</span>
        </span>
      );
    }
    if (user.status === 'bloqueado') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-800 border border-red-200 rounded">
          <Ban className="w-3 h-3" />
          <span>Bloqueado</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 rounded">
        <Clock3 className="w-3 h-3" />
        <span>Pendente</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho e KPIs */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-900" />
              <h1 className="text-lg font-semibold text-slate-900">
                Controle de Acesso ao Sistema
              </h1>
            </div>
            <p className="text-xs text-slate-600">
              Aprove novos cadastros, suspenda acessos ou pré-autorize e-mails
              institucionais para entrada automática.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Administrador: <strong className="text-slate-800">{ADMIN_EMAIL}</strong>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-md">
            <div className="text-xs text-amber-900 font-medium">
              Pendentes de aprovação
            </div>
            <div className="text-2xl font-bold text-amber-950 mt-1 tabular-nums">
              {counts.pendentes}
            </div>
          </div>
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-md">
            <div className="text-xs text-emerald-900 font-medium">
              Usuários aprovados
            </div>
            <div className="text-2xl font-bold text-emerald-950 mt-1 tabular-nums">
              {counts.aprovados}
            </div>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs text-slate-600 font-medium">
              Contas bloqueadas
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
              {counts.bloqueados}
            </div>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs text-slate-600 font-medium">
              E-mails pré-autorizados
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
              {allowlist.length}
            </div>
          </div>
        </div>
      </section>

      {accessError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{accessError}</span>
        </div>
      )}

      {/* Aviso sobre Usuários de Teste do Google OAuth (Erro 403: access_denied) */}
      <section className="bg-amber-50/70 border border-amber-200 rounded-lg p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Importante para login com conta Google (Erro 403: access_denied)
              </span>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed max-w-3xl">
              Aprovar o usuário abaixo libera o acesso dele dentro do sistema e no
              banco em nuvem, mas enquanto o projeto{' '}
              <code className="font-mono font-semibold">
                {activeFirebaseConfig.projectId}
              </code>{' '}
              estiver <strong>Em fase de testes</strong> na Tela de permissão OAuth
              do Google Cloud, o Google bloqueia o botão <em>Sign in with Google</em>{' '}
              (erro 403) para e-mails que não estejam cadastrados em{' '}
              <strong>Usuários de teste (Test users)</strong> no Google Cloud Console.
              Alternativamente, o usuário pode entrar criando senha em{' '}
              <strong>E-mail e senha</strong> ou você pode publicar o app no Google
              Cloud.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const emailSet = new Set<string>();
                users
                  .filter((u) => u.status === 'aprovado')
                  .forEach((u) => {
                    if (u.email) emailSet.add(u.email.trim().toLowerCase());
                  });
                allowlist.forEach((a) => {
                  if (a.email) emailSet.add(a.email.trim().toLowerCase());
                });
                const listText = Array.from(emailSet).join(', ');
                if (listText) {
                  void navigator.clipboard.writeText(listText).then(() => {
                    setCopiedTestEmails(true);
                    setTimeout(() => setCopiedTestEmails(false), 2500);
                  });
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-950 bg-white border border-amber-300 hover:bg-amber-100 rounded-md whitespace-nowrap"
            >
              {copiedTestEmails ? (
                <Check className="w-3.5 h-3.5 text-emerald-700" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>
                {copiedTestEmails
                  ? 'E-mails copiados'
                  : 'Copiar e-mails aprovados'}
              </span>
            </button>

            <a
              href={`https://console.cloud.google.com/auth/audience?project=${encodeURIComponent(
                activeFirebaseConfig.projectId
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir Usuários de Teste (Google Cloud)</span>
            </a>
          </div>
        </div>
      </section>

      {/* Lista de Usuários Cadastrados */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'pendente', label: `Pendentes (${counts.pendentes})` },
                { id: 'aprovado', label: `Aprovados (${counts.aprovados})` },
                { id: 'bloqueado', label: `Bloqueados (${counts.bloqueados})` },
                { id: 'todos', label: `Todos (${counts.total})` },
              ] as { id: StatusFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, e-mail ou órgão..."
              className="w-full text-xs bg-white border border-slate-300 rounded-md pl-9 pr-3 py-2 text-slate-900"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {filteredUsers.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              Nenhum usuário encontrado neste filtro.
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isSelfOrMainAdmin =
                u.uid === currentAdminUid ||
                u.email.trim().toLowerCase() === ADMIN_EMAIL;

              return (
                <div
                  key={u.uid}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {u.nomeCompleto}
                      </span>
                      {renderStatusBadge(u)}
                      <span className="px-2 py-0.5 text-[11px] text-slate-600 bg-slate-100 rounded">
                        {u.esferaPreferida}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 break-all">
                      {u.email}
                      {u.orgao ? ` · ${u.orgao}` : ''}
                      {u.cargo ? ` · ${u.cargo}` : ''}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Cadastro em {formatDateBr(u.createdAtIso)}
                      {u.observacaoAcesso
                        ? ` · Obs.: ${u.observacaoAcesso}`
                        : ''}
                    </div>
                  </div>

                  {!isSelfOrMainAdmin && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {u.status !== 'aprovado' && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setPendingUserAction({
                              user: u,
                              nextStatus: 'aprovado',
                              observacao: u.observacaoAcesso || '',
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>
                            {u.status === 'bloqueado'
                              ? 'Reativar acesso'
                              : 'Aprovar acesso'}
                          </span>
                        </button>
                      )}

                      {u.status !== 'bloqueado' && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setPendingUserAction({
                              user: u,
                              nextStatus: 'bloqueado',
                              observacao: u.observacaoAcesso || '',
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-md whitespace-nowrap"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>
                            {u.status === 'pendente'
                              ? 'Recusar / Bloquear'
                              : 'Bloquear acesso'}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Pré-autorização de E-mails (Allowlist) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 space-y-1">
          <div className="flex items-center gap-2">
            <MailPlus className="w-4 h-4 text-slate-800" />
            <h2 className="text-sm font-semibold text-slate-900">
              E-mails Pré-autorizados (Aprovação Automática)
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Cadastre e-mails institucionais antes do primeiro acesso. Quando a
            pessoa entrar e confirmar o e-mail, a liberação ocorre
            automaticamente sem ficar na fila pendente.
          </p>
        </div>

        <div className="p-5 border-b border-slate-200 bg-slate-50/60 space-y-3">
          {allowMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{allowMsg}</span>
            </div>
          )}
          {allowErr && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{allowErr}</span>
            </div>
          )}

          <form
            onSubmit={handleAddAllowlist}
            className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
          >
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                E-mail institucional *
              </label>
              <input
                type="email"
                required
                maxLength={180}
                value={allowEmail}
                onChange={(e) => setAllowEmail(e.target.value)}
                placeholder="servidor@prefeitura.rs.gov.br"
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Órgão / Secretaria
              </label>
              <input
                type="text"
                maxLength={160}
                value={allowOrgao}
                onChange={(e) => setAllowOrgao(e.target.value)}
                placeholder="Procuradoria / Gabinete"
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Observação
              </label>
              <input
                type="text"
                maxLength={240}
                value={allowObs}
                onChange={(e) => setAllowObs(e.target.value)}
                placeholder="Equipe de redação oficial"
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={allowBusy}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md whitespace-nowrap"
              >
                <MailPlus className="w-3.5 h-3.5" />
                <span>{allowBusy ? 'Salvando...' : 'Pré-autorizar'}</span>
              </button>
            </div>
          </form>
        </div>

        <div className="divide-y divide-slate-200">
          {allowlist.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              Nenhum e-mail pré-autorizado no momento.
            </div>
          ) : (
            allowlist.map((entry) => (
              <div
                key={entry.emailKey}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="text-sm font-medium text-slate-900 break-all">
                    {entry.email}
                  </div>
                  <div className="text-xs text-slate-500">
                    {entry.orgaoSugerido || 'Órgão não especificado'}
                    {entry.observacao ? ` · ${entry.observacao}` : ''} ·
                    Adicionado em {formatDateBr(entry.createdAtIso)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPendingAllowRemove(entry)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 bg-white border border-slate-200 hover:border-red-200 rounded-md self-start sm:self-auto whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover</span>
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Modal de confirmação de alteração de acesso */}
      {pendingUserAction && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-slate-900">
                {pendingUserAction.nextStatus === 'aprovado'
                  ? 'Confirmar liberação de acesso?'
                  : 'Confirmar bloqueio de acesso?'}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Usuário: <strong>{pendingUserAction.user.nomeCompleto}</strong>{' '}
                ({pendingUserAction.user.email})
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Observação / Motivo (opcional, visível ao usuário)
              </label>
              <textarea
                rows={3}
                maxLength={300}
                value={pendingUserAction.observacao}
                onChange={(e) =>
                  setPendingUserAction({
                    ...pendingUserAction,
                    observacao: e.target.value,
                  })
                }
                placeholder={
                  pendingUserAction.nextStatus === 'aprovado'
                    ? 'Ex.: Acesso liberado para elaboração de minutas.'
                    : 'Ex.: Cadastro não vinculado ao órgão autorizado.'
                }
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
              />
            </div>

            {actionError && (
              <p className="text-xs text-red-700">{actionError}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingUserAction(null)}
                disabled={actionBusy}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmUserAction()}
                disabled={actionBusy}
                className={`px-4 py-2 text-xs font-medium text-white rounded-md ${
                  pendingUserAction.nextStatus === 'bloqueado'
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {actionBusy
                  ? 'Salvando...'
                  : pendingUserAction.nextStatus === 'aprovado'
                    ? 'Liberar acesso'
                    : 'Bloquear acesso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de remoção da allowlist */}
      {pendingAllowRemove && (
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
                  Remover pré-autorização?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  O e-mail <strong>{pendingAllowRemove.email}</strong> deixará
                  de receber aprovação automática em novos cadastros. Contas já
                  aprovadas permanecem ativas até eventual bloqueio manual.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingAllowRemove(null)}
                disabled={actionBusy}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmAllowRemove()}
                disabled={actionBusy}
                className="px-4 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md"
              >
                {actionBusy ? 'Removendo...' : 'Confirmar remoção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
