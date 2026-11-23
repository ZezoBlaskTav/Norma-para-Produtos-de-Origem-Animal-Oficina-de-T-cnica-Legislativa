import { NormaImagemItem } from '../types/norma';

export const MAX_IMAGES_PER_NORMA = 10;
export const MAX_SINGLE_IMAGE_CHARS = 220_000;
export const MAX_TOTAL_IMAGES_CHARS = 550_000;

export const IMAGE_WIDTH_STEPS_MM = [
  25, 35, 45, 55, 70, 85, 100, 120, 140, 155,
] as const;

export function snapLarguraMm(mm: number): number {
  const num = Number(mm);
  if (!Number.isFinite(num)) return 55;
  let best: number = IMAGE_WIDTH_STEPS_MM[3];
  let bestDiff = Infinity;
  for (const step of IMAGE_WIDTH_STEPS_MM) {
    const diff = Math.abs(step - num);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = step;
    }
  }
  return best;
}

export function estimateTotalImagesChars(imagens?: NormaImagemItem[]): number {
  if (!Array.isArray(imagens)) return 0;
  return imagens.reduce(
    (sum, img) => sum + (typeof img.dataUrl === 'string' ? img.dataUrl.length : 0),
    0
  );
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(',');
  const base64 = parts.length > 1 ? parts[1] : parts[0];
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

export function getPdfImageFormat(
  mimeType: NormaImagemItem['mimeType'],
  dataUrl: string
): 'PNG' | 'JPEG' {
  if (mimeType === 'image/jpeg' || dataUrl.startsWith('data:image/jpeg')) {
    return 'JPEG';
  }
  return 'PNG';
}

export function getDocxImageType(
  mimeType: NormaImagemItem['mimeType'],
  dataUrl: string
): 'png' | 'jpg' {
  if (mimeType === 'image/jpeg' || dataUrl.startsWith('data:image/jpeg')) {
    return 'jpg';
  }
  return 'png';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Não foi possível ler o arquivo de imagem.'));
      }
    };
    reader.onerror = () =>
      reject(new Error('Falha ao ler o arquivo selecionado.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error(
          'Formato de imagem inválido ou arquivo corrompido. Use PNG, JPG, WebP ou SVG.'
        )
      );
    img.src = src;
  });
}

function canvasHasTransparency(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] < 250) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export interface ProcessedNormaImage {
  dataUrl: string;
  mimeType: 'image/png' | 'image/jpeg';
  widthPx: number;
  heightPx: number;
  suggestedLarguraMm: number;
}

export async function processUploadedImageFile(
  file: File,
  existingImages: NormaImagemItem[] = []
): Promise<ProcessedNormaImage> {
  if (existingImages.length >= MAX_IMAGES_PER_NORMA) {
    throw new Error(
      `Limite máximo de ${MAX_IMAGES_PER_NORMA} imagens por norma atingido.`
    );
  }

  const allowedTypes = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/svg+xml',
    'image/gif',
  ];
  const lowerName = file.name.toLowerCase();
  const hasValidExt = /\.(png|jpe?g|webp|svg|gif)$/i.test(lowerName);
  if (file.type && !allowedTypes.includes(file.type) && !hasValidExt) {
    throw new Error(
      'Formato não suportado. Selecione uma imagem PNG, JPG, WebP ou SVG.'
    );
  }

  if (file.size > 12 * 1024 * 1024) {
    throw new Error(
      'Arquivo muito grande (acima de 12 MB). Reduza a imagem antes de enviar.'
    );
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(rawDataUrl);

  const naturalW = Math.max(1, img.naturalWidth || img.width || 600);
  const naturalH = Math.max(1, img.naturalHeight || img.height || 400);

  const maxDims = [900, 720, 540, 400];
  let chosenUrl = '';
  let chosenMime: 'image/png' | 'image/jpeg' = 'image/png';
  let outW = naturalW;
  let outH = naturalH;

  for (const maxDim of maxDims) {
    const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
    const w = Math.max(1, Math.round(naturalW * scale));
    const h = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Navegador sem suporte a processamento gráfico Canvas.');
    }

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const hasAlpha = canvasHasTransparency(ctx, w, h);
    const pngUrl = canvas.toDataURL('image/png');

    if (hasAlpha && pngUrl.length <= MAX_SINGLE_IMAGE_CHARS) {
      chosenUrl = pngUrl;
      chosenMime = 'image/png';
      outW = w;
      outH = h;
      break;
    }

    if (!hasAlpha && pngUrl.length <= MAX_SINGLE_IMAGE_CHARS) {
      chosenUrl = pngUrl;
      chosenMime = 'image/png';
      outW = w;
      outH = h;
      break;
    }

    // Se PNG exceder orçamento, comprimir em JPEG (com fundo branco para transparência)
    const jpgCanvas = document.createElement('canvas');
    jpgCanvas.width = w;
    jpgCanvas.height = h;
    const jpgCtx = jpgCanvas.getContext('2d');
    if (jpgCtx) {
      jpgCtx.fillStyle = '#ffffff';
      jpgCtx.fillRect(0, 0, w, h);
      jpgCtx.drawImage(img, 0, 0, w, h);
      for (const q of [0.84, 0.72, 0.58]) {
        const jpgUrl = jpgCanvas.toDataURL('image/jpeg', q);
        if (jpgUrl.length <= MAX_SINGLE_IMAGE_CHARS) {
          chosenUrl = jpgUrl;
          chosenMime = 'image/jpeg';
          outW = w;
          outH = h;
          break;
        }
      }
      if (chosenUrl) break;
    }
  }

  if (!chosenUrl || chosenUrl.length > MAX_SINGLE_IMAGE_CHARS) {
    throw new Error(
      'A imagem continua muito pesada após a otimização para sincronização em nuvem. Tente uma imagem com menor resolução.'
    );
  }

  const currentTotal = estimateTotalImagesChars(existingImages);
  if (currentTotal + chosenUrl.length > MAX_TOTAL_IMAGES_CHARS) {
    throw new Error(
      'Espaço total de imagens nesta norma atingido. Remova alguma imagem existente antes de adicionar outra.'
    );
  }

  const aspect = outW / outH;
  const suggestedLarguraMm = aspect <= 1.35 ? 55 : 120;

  return {
    dataUrl: chosenUrl,
    mimeType: chosenMime,
    widthPx: outW,
    heightPx: outH,
    suggestedLarguraMm,
  };
}

export function generateSampleInspectionStamp(options?: {
  municipio?: string;
  registro?: string;
}): ProcessedNormaImage {
  const width = 460;
  const height = 310;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Navegador sem suporte a processamento gráfico Canvas.');
  }

  const cx = width / 2;
  const cy = height / 2;
  const rx = 205;
  const ry = 132;
  const ink = '#0f172a';

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  // Borda oval externa dupla (padrão oficial de carimbo de inspeção)
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 11, ry - 11, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Linhas horizontais divisórias internas
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 158, cy - 36);
  ctx.lineTo(cx + 158, cy - 36);
  ctx.moveTo(cx - 158, cy + 36);
  ctx.lineTo(cx + 158, cy + 36);
  ctx.stroke();

  // Texto superior
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 20px Georgia, "Times New Roman", serif';
  ctx.fillText(
    (options?.municipio || 'INSPEÇÃO MUNICIPAL').toUpperCase().slice(0, 26),
    cx,
    cy - 74
  );

  // Sigla central
  ctx.font = 'bold 46px Georgia, "Times New Roman", serif';
  ctx.fillText('S. I. M.', cx, cy + 2);

  // Subtítulo e registro
  ctx.font = 'bold 18px Georgia, "Times New Roman", serif';
  ctx.fillText('INSPECIONADO', cx, cy + 62);

  ctx.font = '600 15px monospace';
  ctx.fillText(
    `REG. Nº ${(options?.registro || '000/00').toUpperCase().slice(0, 14)}`,
    cx,
    cy + 94
  );

  const dataUrl = canvas.toDataURL('image/png');
  return {
    dataUrl,
    mimeType: 'image/png',
    widthPx: width,
    heightPx: height,
    suggestedLarguraMm: 55,
  };
}
