export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  description?: string;
  appProperties?: Record<string, string>;
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export class DriveAuthError extends Error {
  constructor(message = 'Sessão expirada ou autorização necessária.') {
    super(message);
    this.name = 'DriveAuthError';
  }
}

async function handleDriveResponse<T>(res: Response): Promise<T> {
  if (res.status === 401 || res.status === 403) {
    throw new DriveAuthError(
      'Permissão ausente ou sessão expirada. Conecte-se novamente ao Google Drive.'
    );
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Erro na API do Google Drive (${res.status})`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function listDriveFiles(
  accessToken: string,
  options?: { query?: string; filter?: 'all' | 'normas' | 'docs' }
): Promise<DriveFileItem[]> {
  const clauses: string[] = [
    'trashed = false',
    "mimeType != 'application/vnd.google-apps.folder'",
  ];
  if (options?.query?.trim()) {
    const escaped = options.query.trim().replace(/'/g, "\\'");
    clauses.push(`name contains '${escaped}'`);
  }
  if (options?.filter === 'normas') {
    clauses.push(
      `(name contains '.norma.json' or name contains '.norma-db.json')`
    );
  } else if (options?.filter === 'docs') {
    clauses.push(
      `(mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/pdf' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = 'text/plain')`
    );
  }

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    pageSize: '40',
    orderBy: 'modifiedTime desc',
    fields:
      'files(id,name,mimeType,modifiedTime,size,webViewLink,description,appProperties)',
  });

  const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await handleDriveResponse<{ files?: DriveFileItem[] }>(res);
  return data.files || [];
}

export async function findOrCreateDriveFolder(
  accessToken: string,
  folderName: string,
  appRole: string
): Promise<DriveFileItem> {
  const escapedName = folderName.replace(/'/g, "\\'");
  const q = `mimeType = 'application/vnd.google-apps.folder' and trashed = false and (appProperties has { key='normaAppRole' and value='${appRole}' } or name = '${escapedName}')`;

  const params = new URLSearchParams({
    q,
    pageSize: '5',
    orderBy: 'modifiedTime desc',
    fields:
      'files(id,name,mimeType,modifiedTime,webViewLink,description,appProperties)',
  });

  const searchRes = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const found = await handleDriveResponse<{ files?: DriveFileItem[] }>(
    searchRes
  );
  if (found.files && found.files.length > 0) {
    return found.files[0];
  }

  const createRes = await fetch(
    `${DRIVE_API_BASE}/files?fields=id,name,mimeType,modifiedTime,webViewLink,description,appProperties`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        description:
          'Banco de dados e cópias de segurança da Oficina Legislativa Norma.',
        appProperties: {
          normaAppRole: appRole,
        },
      }),
    }
  );

  return handleDriveResponse<DriveFileItem>(createRes);
}

export async function listDriveFilesInFolder(
  accessToken: string,
  folderId: string
): Promise<DriveFileItem[]> {
  const escapedId = folderId.replace(/'/g, "\\'");
  const params = new URLSearchParams({
    q: `'${escapedId}' in parents and trashed = false`,
    pageSize: '100',
    orderBy: 'modifiedTime desc',
    fields:
      'files(id,name,mimeType,modifiedTime,size,webViewLink,description,appProperties)',
  });

  const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await handleDriveResponse<{ files?: DriveFileItem[] }>(res);
  return data.files || [];
}

export async function uploadNewDriveFile(
  accessToken: string,
  params: {
    name: string;
    blob: Blob;
    uploadMimeType: string;
    targetDriveMimeType?: string;
    description?: string;
    parents?: string[];
    appProperties?: Record<string, string>;
  }
): Promise<DriveFileItem> {
  const metadata: Record<string, unknown> = {
    name: params.name,
  };
  if (params.targetDriveMimeType) {
    metadata.mimeType = params.targetDriveMimeType;
  }
  if (params.description) {
    metadata.description = params.description;
  }
  if (params.parents && params.parents.length > 0) {
    metadata.parents = params.parents;
  }
  if (params.appProperties) {
    metadata.appProperties = params.appProperties;
  }

  const boundary = `norma_boundary_${Date.now()}`;
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}\r\n`;
  const mediaHeader = `--${boundary}\r\nContent-Type: ${params.uploadMimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const body = new Blob([metaPart, mediaHeader, params.blob, closing], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const res = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink,description,appProperties`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    }
  );

  return handleDriveResponse<DriveFileItem>(res);
}

export async function overwriteDriveFile(
  accessToken: string,
  fileId: string,
  params: {
    name?: string;
    blob: Blob;
    uploadMimeType: string;
    description?: string;
    appProperties?: Record<string, string>;
  }
): Promise<DriveFileItem> {
  const metadata: Record<string, unknown> = {};
  if (params.name) metadata.name = params.name;
  if (params.description) metadata.description = params.description;
  if (params.appProperties) metadata.appProperties = params.appProperties;

  const boundary = `norma_update_${Date.now()}`;
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}\r\n`;
  const mediaHeader = `--${boundary}\r\nContent-Type: ${params.uploadMimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const body = new Blob([metaPart, mediaHeader, params.blob, closing], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const res = await fetch(
    `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink,description,appProperties`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    }
  );

  return handleDriveResponse<DriveFileItem>(res);
}

export async function readDriveFileAsText(
  accessToken: string,
  file: DriveFileItem
): Promise<string> {
  const isGoogleDoc = file.mimeType === 'application/vnd.google-apps.document';
  const url = isGoogleDoc
    ? `${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}/export?mimeType=text/plain`
    : `${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}?alt=media`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new DriveAuthError(
      'Permissão ausente ou sessão expirada. Conecte-se novamente ao Google Drive.'
    );
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Não foi possível ler o arquivo (${res.status})`);
  }
  return res.text();
}

export async function trashDriveFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const res = await fetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    }
  );

  await handleDriveResponse(res);
}
