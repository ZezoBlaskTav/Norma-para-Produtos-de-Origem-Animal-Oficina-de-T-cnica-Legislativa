import React, { useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  Stamp,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ArtigoItem,
  NormaImagemAlinhamento,
  NormaImagemItem,
  NormaImagemPosicao,
} from '../types/norma';
import { formatArtigoNumero } from '../utils/legistica';
import {
  IMAGE_WIDTH_STEPS_MM,
  MAX_IMAGES_PER_NORMA,
  MAX_TOTAL_IMAGES_CHARS,
  estimateCharsSizeKb,
  estimateTotalImagesChars,
  generateSampleInspectionStamp,
  processUploadedImageFile,
  snapLarguraMm,
} from '../utils/imageProcessing';

const PRINT_WIDTH_CLASS_BY_MM: Record<number, string> = {
  25: 'w-[16%]',
  35: 'w-[22%]',
  45: 'w-[28%]',
  55: 'w-[35%]',
  70: 'w-[44%]',
  85: 'w-[53%]',
  100: 'w-[63%]',
  120: 'w-[75%]',
  140: 'w-[88%]',
  155: 'w-[97%]',
};

const WIDTH_LABELS_BY_MM: Record<number, string> = {
  25: '25 mm (Carimbo compacto)',
  35: '35 mm (Carimbo pequeno)',
  45: '45 mm (Selo médio)',
  55: '55 mm (Carimbo padrão)',
  70: '70 mm (Brasão / Figura)',
  85: '85 mm (Meia folha)',
  100: '100 mm (Média ampla)',
  120: '120 mm (Diagrama)',
  140: '140 mm (Quase total)',
  155: '155 mm (Largura útil A4)',
};

function makeImageId(): string {
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const NormaImagemPreviewBlock: React.FC<{ img: NormaImagemItem }> = ({
  img,
}) => {
  const snappedMm = snapLarguraMm(img.larguraMm);
  const widthClass = PRINT_WIDTH_CLASS_BY_MM[snappedMm] || 'w-[35%]';
  const alignContainerClass =
    img.alinhamento === 'left'
      ? 'items-start text-left'
      : img.alinhamento === 'right'
        ? 'items-end text-right'
        : 'items-center text-center';

  return (
    <figure className={`flex flex-col gap-2 py-3 break-inside-avoid ${alignContainerClass}`}>
      {img.titulo.trim() && (
        <div className="font-bold text-xs tracking-wider uppercase text-slate-900">
          {img.titulo.trim()}
        </div>
      )}
      <img
        src={img.dataUrl}
        alt={img.legenda.trim() || img.titulo.trim() || 'Imagem oficial anexada à norma'}
        className={`${widthClass} max-w-full h-auto object-contain`}
      />
      {img.legenda.trim() && (
        <figcaption className="text-xs italic text-slate-700 max-w-prose">
          {img.legenda.trim()}
        </figcaption>
      )}
    </figure>
  );
};

interface NormaImagensSectionProps {
  imagens: NormaImagemItem[];
  artigos: ArtigoItem[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onChange: (next: NormaImagemItem[]) => void;
}

export const NormaImagensSection: React.FC<NormaImagensSectionProps> = ({
  imagens,
  artigos,
  isCollapsed,
  onToggleCollapse,
  onChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busyUpload, setBusyUpload] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totalChars = estimateTotalImagesChars(imagens);
  const totalBytesKb = estimateCharsSizeKb(totalChars);
  const maxBytesKb = estimateCharsSizeKb(MAX_TOTAL_IMAGES_CHARS);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg(null);
    setBusyUpload(true);

    let working = [...imagens];
    try {
      for (const file of Array.from(fileList)) {
        const processed = await processUploadedImageFile(file, working);
        const cleanName = file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        const isFirstAnexo = working.filter((i) => i.posicao === 'anexo').length === 0;
        const defaultTitle = isFirstAnexo
          ? `ANEXO ÚNICO — ${cleanName ? cleanName.toUpperCase() : 'MODELO OFICIAL'}`
          : `ANEXO ${working.length + 1} — ${cleanName ? cleanName.toUpperCase() : 'MODELO OFICIAL'}`;

        const nextItem: NormaImagemItem = {
          id: makeImageId(),
          titulo: defaultTitle.slice(0, 180),
          legenda: '',
          dataUrl: processed.dataUrl,
          mimeType: processed.mimeType,
          widthPx: processed.widthPx,
          heightPx: processed.heightPx,
          larguraMm: snapLarguraMm(processed.suggestedLarguraMm),
          alinhamento: 'center',
          posicao: 'anexo',
        };
        working = [...working, nextItem];
      }
      onChange(working);
    } catch (err) {
      if (working.length > imagens.length) {
        onChange(working);
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Não foi possível processar a imagem selecionada.'
      );
    } finally {
      setBusyUpload(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInsertSampleStamp = () => {
    setErrorMsg(null);
    if (imagens.length >= MAX_IMAGES_PER_NORMA) {
      setErrorMsg(
        `Limite máximo de ${MAX_IMAGES_PER_NORMA} imagens por norma atingido.`
      );
      return;
    }

    try {
      const processed = generateSampleInspectionStamp();
      const totalChars = estimateTotalImagesChars(imagens);
      if (totalChars + processed.dataUrl.length > MAX_TOTAL_IMAGES_CHARS) {
        const remainingKb = estimateCharsSizeKb(
          Math.max(0, MAX_TOTAL_IMAGES_CHARS - totalChars)
        );
        const stampKb = estimateCharsSizeKb(processed.dataUrl.length);
        setErrorMsg(
          `O modelo de carimbo (${stampKb} KB) excede o espaço restante nesta norma (${remainingKb} KB de ${maxBytesKb} KB disponíveis). Remova alguma imagem existente antes de inserir outra.`
        );
        return;
      }

      const anexoCount = imagens.filter((i) => i.posicao === 'anexo').length;
      const titulo =
        anexoCount === 0
          ? 'ANEXO ÚNICO — MODELO DE CARIMBO OFICIAL DE INSPEÇÃO (S.I.M.)'
          : `ANEXO ${anexoCount + 1} — MODELO DE CARIMBO DE INSPEÇÃO`;

      const nextItem: NormaImagemItem = {
        id: makeImageId(),
        titulo,
        legenda:
          'Modelo ilustrativo de carimbo oficial (dimensões mínimas recomendadas conforme regulamento sanitário).',
        dataUrl: processed.dataUrl,
        mimeType: processed.mimeType,
        widthPx: processed.widthPx,
        heightPx: processed.heightPx,
        larguraMm: snapLarguraMm(processed.suggestedLarguraMm),
        alinhamento: 'center',
        posicao: 'anexo',
      };
      onChange([...imagens, nextItem]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Não foi possível gerar o modelo de carimbo.'
      );
    }
  };

  const updateItem = (id: string, patch: Partial<NormaImagemItem>) => {
    onChange(
      imagens.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeItem = (id: string) => {
    setErrorMsg(null);
    onChange(imagens.filter((item) => item.id !== id));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= imagens.length) return;
    const copy = [...imagens];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    onChange(copy);
  };

  return (
    <section
      id="secao-imagens-norma"
      className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-3 ${
          isCollapsed ? '' : 'border-b border-slate-200 pb-3'
        }`}
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            4. Imagens, Carimbos e Anexos Gráficos ({imagens.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Modelos de carimbo de inspeção, brasões, selos oficiais e anexos incluídos na prévia, PDF e DOCX
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
          <span>{isCollapsed ? 'Expandir' : 'Recolher'}</span>
        </button>
      </div>

      {!isCollapsed && (
        <div className="space-y-4">
          {/* Área de envio e modelo rápido */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={`border border-dashed rounded-lg p-4 transition-colors space-y-3 ${
              isDragging
                ? 'border-slate-900 bg-slate-100'
                : 'border-slate-300 bg-slate-50/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              multiple
              onChange={(e) => void handleFiles(e.target.files)}
              className="hidden"
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <ImagePlus className="w-4 h-4 text-slate-700 shrink-0" />
                  <span>
                    Enviar imagem do computador ou arrastar arquivo aqui
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Aceita PNG (com fundo transparente), JPG, WebP ou SVG. As imagens são otimizadas automaticamente para impressão, PDF, Word (DOCX) e nuvem.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyUpload || imagens.length >= MAX_IMAGES_PER_NORMA}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{busyUpload ? 'Processando...' : 'Selecionar imagem'}</span>
                </button>

                <button
                  type="button"
                  disabled={busyUpload || imagens.length >= MAX_IMAGES_PER_NORMA}
                  onClick={handleInsertSampleStamp}
                  title="Insere um modelo editável de carimbo oval do Serviço de Inspeção Municipal"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <Stamp className="w-3.5 h-3.5" />
                  <span>Modelo de Carimbo (S.I.M.)</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums pt-1 border-t border-slate-200/80">
              <span>
                {imagens.length} / {MAX_IMAGES_PER_NORMA} imagens na minuta
              </span>
              <span>
                {totalBytesKb} KB / {maxBytesKb} KB usados
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {imagens.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhuma imagem anexada. Adicione um carimbo oficial, brasão ou figura técnica acima para que apareça na Prévia Oficial e nos arquivos exportados.
            </p>
          ) : (
            <div className="space-y-4">
              {imagens.map((img, idx) => (
                <div
                  key={img.id}
                  className="border border-slate-200 rounded-lg p-4 bg-white space-y-3"
                >
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Miniatura */}
                    <div className="w-full sm:w-32 h-28 bg-slate-50 border border-slate-200 rounded-md p-2 flex items-center justify-center shrink-0">
                      <img
                        src={img.dataUrl}
                        alt={img.titulo || `Imagem ${idx + 1}`}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>

                    {/* Metadados e posicionamento */}
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-semibold text-slate-600 tabular-nums">
                          Imagem {idx + 1} · {img.widthPx}×{img.heightPx}px ·{' '}
                          {estimateCharsSizeKb(img.dataUrl.length)} KB
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveItem(idx, -1)}
                            disabled={idx === 0}
                            aria-label="Mover imagem para cima"
                            className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded border border-slate-200"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(idx, 1)}
                            disabled={idx === imagens.length - 1}
                            aria-label="Mover imagem para baixo"
                            className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded border border-slate-200"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(img.id)}
                            aria-label="Remover imagem"
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded border border-slate-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Título ou identificação do Anexo (opcional)
                        </label>
                        <input
                          type="text"
                          value={img.titulo}
                          onChange={(e) =>
                            updateItem(img.id, { titulo: e.target.value })
                          }
                          placeholder="Ex.: ANEXO ÚNICO — MODELO DE CARIMBO DE INSPEÇÃO"
                          className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Legenda / Especificação técnica abaixo da imagem (opcional)
                        </label>
                        <input
                          type="text"
                          value={img.legenda}
                          onChange={(e) =>
                            updateItem(img.id, { legenda: e.target.value })
                          }
                          placeholder="Ex.: Carimbo oval para embalagens primárias (mín. 35 × 25 mm)."
                          className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Onde inserir
                          </label>
                          <select
                            value={img.posicao}
                            onChange={(e) => {
                              const nextPos = e.target.value as NormaImagemPosicao;
                              updateItem(img.id, {
                                posicao: nextPos,
                                artigoId:
                                  nextPos === 'pos_artigo'
                                    ? img.artigoId || artigos[0]?.id
                                    : undefined,
                              });
                            }}
                            className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                          >
                            <option value="anexo">Anexo ao final do ato</option>
                            <option value="pos_artigo">Logo após um artigo</option>
                            <option value="cabecalho">Cabeçalho superior</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Largura na página A4
                          </label>
                          <select
                            value={snapLarguraMm(img.larguraMm)}
                            onChange={(e) =>
                              updateItem(img.id, {
                                larguraMm: snapLarguraMm(Number(e.target.value)),
                              })
                            }
                            className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
                          >
                            {IMAGE_WIDTH_STEPS_MM.map((mm) => (
                              <option key={mm} value={mm}>
                                {WIDTH_LABELS_BY_MM[mm] || `${mm} mm`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Alinhamento
                          </label>
                          <div className="grid grid-cols-3 border border-slate-300 rounded-md overflow-hidden bg-white">
                            {(
                              [
                                { val: 'left', icon: AlignLeft, label: 'Esquerda' },
                                { val: 'center', icon: AlignCenter, label: 'Centro' },
                                { val: 'right', icon: AlignRight, label: 'Direita' },
                              ] as Array<{
                                val: NormaImagemAlinhamento;
                                icon: React.ComponentType<{ className?: string }>;
                                label: string;
                              }>
                            ).map((opt) => {
                              const Icon = opt.icon;
                              const active = img.alinhamento === opt.val;
                              return (
                                <button
                                  key={opt.val}
                                  type="button"
                                  onClick={() =>
                                    updateItem(img.id, { alinhamento: opt.val })
                                  }
                                  title={opt.label}
                                  aria-label={`Alinhar à ${opt.label.toLowerCase()}`}
                                  className={`py-1.5 flex items-center justify-center transition-colors ${
                                    active
                                      ? 'bg-slate-900 text-white'
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {img.posicao === 'pos_artigo' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Exibir imagem imediatamente após:
                          </label>
                          <select
                            value={img.artigoId || artigos[0]?.id || ''}
                            onChange={(e) =>
                              updateItem(img.id, { artigoId: e.target.value })
                            }
                            className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                          >
                            {artigos.map((art, aIdx) => (
                              <option key={art.id} value={art.id}>
                                {formatArtigoNumero(aIdx + 1, art.sufixo)} —{' '}
                                {art.caput.trim().slice(0, 65) || '(sem texto)'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
