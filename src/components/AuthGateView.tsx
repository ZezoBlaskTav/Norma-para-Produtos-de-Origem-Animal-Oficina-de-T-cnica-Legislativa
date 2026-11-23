import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  KeyRound,
  Lock,
  LogOut,
  MailCheck,
  RefreshCw,
  Scale,
  UserPlus,
} from 'lucide-react';
import { AuthErrorInfo } from '../utils/googleAuth';
import { EsferaPreferida, UserProfileData } from '../utils/cloudStorage';
import { GoogleSignInButton } from './GoogleSignInButton';

type AuthMode = 'login' | 'register' | 'reset';

interface AuthGateViewProps {
  currentUser: User | null;
  userProfile: UserProfileData | null;
  isAdminUser: boolean;
  needsProfileCompletion: boolean;
  needsEmailVerification: boolean;
  busy: boolean;
  authError: AuthErrorInfo | null;
  statusMessage: string | null;
  onLoginEmail: (email: string, password: string) => Promise<void>;
  onRegisterEmail: (data: {
    email: string;
    password: string;
    nomeCompleto: string;
    orgao: string;
    cargo: string;
    esferaPreferida: EsferaPreferida;
  }) => Promise<void>;
  onLoginGoogle: () => Promise<void>;
  onRequestReset: (email: string) => Promise<void>;
  onResendVerification: () => Promise<void>;
  onCheckVerification: () => Promise<void>;
  onCompleteProfile: (data: {
    nomeCompleto: string;
    orgao: string;
    cargo: string;
    esferaPreferida: EsferaPreferida;
  }) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const AuthGateView: React.FC<AuthGateViewProps> = ({
  currentUser,
  userProfile,
  isAdminUser,
  needsProfileCompletion,
  needsEmailVerification,
  busy,
  authError,
  statusMessage,
  onLoginEmail,
  onRegisterEmail,
  onLoginGoogle,
  onRequestReset,
  onResendVerification,
  onCheckVerification,
  onCompleteProfile,
  onSignOut,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nomeCompleto, setNomeCompleto] = useState(
    currentUser?.displayName || ''
  );
  const [orgao, setOrgao] = useState('');
  const [cargo, setCargo] = useState('');
  const [esferaPreferida, setEsferaPreferida] =
    useState<EsferaPreferida>('Municipal');
  const [localValidationError, setLocalValidationError] = useState<
    string | null
  >(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const handleCopyHostname = async (hostname: string) => {
    try {
      await navigator.clipboard.writeText(hostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    } catch {
      // Silencioso
    }
  };

  const renderErrorBox = () => {
    const msg = localValidationError || authError?.message;
    if (!msg) return null;

    if (authError?.code === 'unauthorized-domain' && !localValidationError) {
      return (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-md space-y-2.5 text-xs text-red-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold">
                Domínio externo não autorizado no Firebase Auth
              </div>
              <p className="text-red-800 leading-relaxed">{authError.message}</p>
            </div>
          </div>
          {authError.hostname && (
            <div className="flex items-center gap-2 bg-white border border-red-200 rounded px-2.5 py-1.5">
              <code className="font-mono font-semibold text-slate-900">
                {authError.hostname}
              </code>
              <button
                type="button"
                onClick={() => handleCopyHostname(authError.hostname!)}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap"
              >
                {copiedDomain ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedDomain ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          )}
          <a
            href={`https://console.firebase.google.com/project/${encodeURIComponent(
              authError.projectId
            )}/authentication/settings`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-900 underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>
              Adicionar domínio em Authentication → Settings → Authorized domains
            </span>
          </a>
        </div>
      );
    }

    return (
      <div className="p-3.5 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-xs text-red-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span className="leading-relaxed">{msg}</span>
      </div>
    );
  };

  // Etapa 1: Usuário logado via E-mail/Senha aguardando confirmação do e-mail
  if (currentUser && needsEmailVerification) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-7 space-y-5">
          <div className="flex items-center gap-2.5 text-slate-900">
            <MailCheck className="w-5 h-5 text-slate-900 shrink-0" />
            <h1 className="text-lg font-semibold">
              Confirme seu e-mail para continuar
            </h1>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            Enviamos um link de confirmação para{' '}
            <strong className="text-slate-900">{currentUser.email}</strong>.
            Verifique sua caixa de entrada (ou spam), clique no link e depois
            clique em <strong>Já confirmei meu e-mail</strong>.
          </p>

          {statusMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {renderErrorBox()}

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => void onCheckVerification()}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
              <span>Já confirmei meu e-mail</span>
            </button>

            <button
              type="button"
              onClick={() => void onResendVerification()}
              disabled={busy}
              className="w-full px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
            >
              Reenviar e-mail de confirmação
            </button>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair / Trocar conta</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Etapa 2: Usuário autenticado (ex.: Google) concluindo o cadastro institucional
  if (currentUser && needsProfileCompletion) {
    const handleProfileSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalValidationError(null);
      if (nomeCompleto.trim().length < 2) {
        setLocalValidationError('Informe seu nome completo.');
        return;
      }
      await onCompleteProfile({
        nomeCompleto: nomeCompleto.trim(),
        orgao: orgao.trim(),
        cargo: cargo.trim(),
        esferaPreferida,
      });
    };

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-lg p-7 space-y-5">
          <div className="flex items-center gap-2.5">
            <UserPlus className="w-5 h-5 text-slate-900 shrink-0" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Complete seu cadastro institucional
              </h1>
              <p className="text-xs text-slate-500">
                Conta autenticada: {currentUser.email}
              </p>
            </div>
          </div>

          {renderErrorBox()}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nome completo *
              </label>
              <input
                type="text"
                required
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                placeholder="Ex.: Maria Clara da Silva"
                className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Órgão / Entidade
                </label>
                <input
                  type="text"
                  value={orgao}
                  onChange={(e) => setOrgao(e.target.value)}
                  placeholder="Ex.: Prefeitura Municipal"
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
                  placeholder="Ex.: Procuradora / Assessora"
                  className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                />
              </div>
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

            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md"
            >
              {busy ? 'Salvando cadastro...' : 'Concluir solicitação de acesso'}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair desta conta</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Etapa 3A: Cadastro concluído, aguardando liberação pelo administrador
  if (
    currentUser &&
    userProfile &&
    !isAdminUser &&
    userProfile.status === 'pendente'
  ) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-lg p-7 space-y-5">
          <div className="flex items-start gap-3">
            <Clock3 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 rounded">
                  Acesso pendente de aprovação
                </span>
              </div>
              <h1 className="text-lg font-semibold text-slate-900">
                Aguardando liberação do administrador
              </h1>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            Seu cadastro foi registrado no sistema e aguarda validação pela
            administração. Assim que seu acesso for liberado, esta tela será
            desbloqueada automaticamente — não é necessário recarregar a página.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-2 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Nome</span>
              <span className="font-medium text-slate-900 text-right">
                {userProfile.nomeCompleto}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">E-mail</span>
              <span className="font-medium text-slate-900 text-right">
                {userProfile.email}
              </span>
            </div>
            {userProfile.orgao && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Órgão</span>
                <span className="font-medium text-slate-900 text-right">
                  {userProfile.orgao}
                </span>
              </div>
            )}
            {userProfile.cargo && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Cargo</span>
                <span className="font-medium text-slate-900 text-right">
                  {userProfile.cargo}
                </span>
              </div>
            )}
          </div>

          {userProfile.observacaoAcesso && (
            <div className="p-3 bg-slate-100 border border-slate-200 rounded-md text-xs text-slate-700">
              <strong className="text-slate-900">Observação:</strong>{' '}
              {userProfile.observacaoAcesso}
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              Norma · Oficina de Técnica Legislativa
            </span>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair / Trocar conta</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Etapa 3B: Usuário bloqueado pelo administrador
  if (
    currentUser &&
    userProfile &&
    !isAdminUser &&
    userProfile.status === 'bloqueado'
  ) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white border border-red-200 rounded-lg p-7 space-y-5">
          <div className="flex items-start gap-3">
            <Ban className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-800 border border-red-200 rounded">
                Acesso bloqueado
              </span>
              <h1 className="text-lg font-semibold text-slate-900">
                Sua conta não possui autorização ativa
              </h1>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            O acesso da conta{' '}
            <strong className="text-slate-900">{userProfile.email}</strong> foi
            suspenso ou não foi autorizado pelo administrador do sistema.
          </p>

          {userProfile.observacaoAcesso && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-900 leading-relaxed">
              <strong>Motivo / Observação:</strong>{' '}
              {userProfile.observacaoAcesso}
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end">
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair da conta</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Etapa 4: Tela principal de Login & Cadastro
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidationError(null);

    if (mode === 'reset') {
      if (!email.trim()) {
        setLocalValidationError('Informe o e-mail da sua conta.');
        return;
      }
      await onRequestReset(email.trim());
      return;
    }

    if (mode === 'login') {
      if (!email.trim() || !password) {
        setLocalValidationError('Preencha e-mail e senha.');
        return;
      }
      await onLoginEmail(email.trim(), password);
      return;
    }

    if (nomeCompleto.trim().length < 2) {
      setLocalValidationError('Informe seu nome completo.');
      return;
    }
    if (password.length < 6) {
      setLocalValidationError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalValidationError('As senhas digitadas não conferem.');
      return;
    }

    await onRegisterEmail({
      email: email.trim(),
      password,
      nomeCompleto: nomeCompleto.trim(),
      orgao: orgao.trim(),
      cargo: cargo.trim(),
      esferaPreferida,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="max-w-md w-full space-y-5">
        {/* Identidade */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2 text-slate-900">
            <Scale className="w-6 h-6" />
            <span className="text-xl font-bold tracking-tight">Norma</span>
          </div>
          <p className="text-xs text-slate-600">
            Oficina de Técnica Legislativa · LC nº 95/1998 e Decreto nº 12.002/2024
          </p>
        </div>

        <section className="bg-white border border-slate-200 rounded-lg p-6 sm:p-7 space-y-5">
          {/* Seletor Entrar / Cadastrar */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setLocalValidationError(null);
              }}
              className={`py-2 text-xs font-medium rounded transition-colors ${
                mode === 'login' || mode === 'reset'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setLocalValidationError(null);
              }}
              className={`py-2 text-xs font-medium rounded transition-colors ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Solicitar Acesso
            </button>
          </div>

          {statusMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {renderErrorBox()}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nome completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={nomeCompleto}
                    onChange={(e) => setNomeCompleto(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Órgão / Entidade
                    </label>
                    <input
                      type="text"
                      value={orgao}
                      onChange={(e) => setOrgao(e.target.value)}
                      placeholder="Prefeitura / Secretaria"
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
                      placeholder="Assessor / Procurador"
                      className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                E-mail *
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@orgao.gov.br"
                className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Senha *
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setLocalValidationError(null);
                      }}
                      className="text-xs text-slate-600 hover:text-slate-900 underline"
                    >
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  autoComplete={
                    mode === 'register' ? 'new-password' : 'current-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                />
              </div>
            )}

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Confirmar senha *
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Esfera padrão
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
              </>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md transition-colors"
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>
                {busy
                  ? 'Processando...'
                  : mode === 'register'
                    ? 'Criar conta e solicitar acesso'
                    : mode === 'reset'
                      ? 'Enviar link de redefinição'
                      : 'Entrar no sistema'}
              </span>
            </button>

            {mode === 'reset' && (
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-xs text-slate-600 hover:text-slate-900 underline"
              >
                Voltar para o login
              </button>
            )}
          </form>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2.5 text-slate-500">
                ou acesse rapidamente com
              </span>
            </div>
          </div>

          <div className="flex justify-center">
            <GoogleSignInButton
              onClick={() => void onLoginGoogle()}
              disabled={busy}
              label="Sign in with Google"
            />
          </div>

          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            Se o login Google exibir <em>“app em fase de testes / Erro 403”</em>,
            peça ao administrador para incluir seu e-mail em{' '}
            <strong>Usuários de teste</strong> no Google Cloud ou acesse usando{' '}
            <strong>E-mail e senha</strong> acima.
          </p>
        </section>

        <div className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>
            Acesso restrito a usuários cadastrados e autorizados pela administração.
          </span>
        </div>
      </div>
    </div>
  );
};
