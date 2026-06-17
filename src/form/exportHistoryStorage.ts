import { useCallback, useState } from 'react';

import { FormObject, PatternType } from './schema';
import { formToEffectiveExport, getExportDisplayFileName } from './exportState';

const INDEX_KEY = 'pattern-modifiers-export-history-index';
const INDEX_PAGE_PREFIX = 'pattern-modifiers-export-history-index-page';
const ENTRY_PREFIX = 'pattern-modifiers-export-history-entry';
const INDEX_PAGE_SIZE = 250;
const MAX_CHUNK_CHARS = 80_000;

interface IndexMeta {
  v: 1;
  pages: number;
}

export interface ExportHistoryListItem {
  id: string;
  fileName: string;
  patternType: PatternType;
  exportedAt: number;
}

interface IndexRow extends ExportHistoryListItem {
  storageKeys: string[];
}

export interface StoredExportRecord {
  v: 1;
  id: string;
  fileName: string;
  patternType: PatternType;
  exportedAt: number;
  effective: Partial<FormObject>;
}

const readIndexMeta = (): IndexMeta | null => {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return null;

    const meta = JSON.parse(raw) as IndexMeta;
    return meta.v === 1 ? meta : null;
  } catch {
    return null;
  }
};

const writeIndexMeta = (meta: IndexMeta) => {
  localStorage.setItem(INDEX_KEY, JSON.stringify(meta));
};

const readIndexRows = (): IndexRow[] => {
  const meta = readIndexMeta();
  if (!meta) return [];

  const rows: IndexRow[] = [];

  for (let page = 0; page < meta.pages; page++) {
    try {
      const raw = localStorage.getItem(`${INDEX_PAGE_PREFIX}-${page}`);
      if (!raw) continue;

      rows.push(...(JSON.parse(raw) as IndexRow[]));
    } catch {
      // Skip unreadable pages.
    }
  }

  return rows;
};

const writeIndexRows = (rows: IndexRow[]) => {
  const previousMeta = readIndexMeta();

  if (previousMeta) {
    for (let page = 0; page < previousMeta.pages; page++) {
      localStorage.removeItem(`${INDEX_PAGE_PREFIX}-${page}`);
    }
  }

  if (rows.length === 0) {
    localStorage.removeItem(INDEX_KEY);
    return;
  }

  const pageCount = Math.ceil(rows.length / INDEX_PAGE_SIZE);

  for (let page = 0; page < pageCount; page++) {
    const slice = rows.slice(page * INDEX_PAGE_SIZE, (page + 1) * INDEX_PAGE_SIZE);
    localStorage.setItem(`${INDEX_PAGE_PREFIX}-${page}`, JSON.stringify(slice));
  }

  writeIndexMeta({ v: 1, pages: pageCount });
};

const removeStorageKeys = (keys: string[]) => {
  for (const key of keys) {
    localStorage.removeItem(key);
  }
};

const savePayload = (id: string, payload: StoredExportRecord): string[] => {
  const json = JSON.stringify(payload);

  if (json.length <= MAX_CHUNK_CHARS) {
    const key = `${ENTRY_PREFIX}-${id}`;
    localStorage.setItem(key, json);
    return [key];
  }

  const keys: string[] = [];
  const chunkCount = Math.ceil(json.length / MAX_CHUNK_CHARS);

  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const key = `${ENTRY_PREFIX}-${id}-chunk-${chunk}`;
    localStorage.setItem(key, json.slice(chunk * MAX_CHUNK_CHARS, (chunk + 1) * MAX_CHUNK_CHARS));
    keys.push(key);
  }

  return keys;
};

const loadPayload = (storageKeys: string[]): StoredExportRecord | null => {
  try {
    const json = storageKeys.map((key) => localStorage.getItem(key) ?? '').join('');
    if (!json) return null;

    const record = JSON.parse(json) as StoredExportRecord;
    return record.v === 1 ? record : null;
  } catch {
    return null;
  }
};

export const listExportHistory = (): ExportHistoryListItem[] =>
  readIndexRows()
    .map(({ id, fileName, patternType, exportedAt }) => ({ id, fileName, patternType, exportedAt }))
    .sort((a, b) => b.exportedAt - a.exportedAt);

export const loadExportHistoryRecord = (id: string): StoredExportRecord | null => {
  const row = readIndexRows().find((entry) => entry.id === id);
  if (!row) return null;

  return loadPayload(row.storageKeys);
};

export const recordExportHistory = (form: FormObject): ExportHistoryListItem | null => {
  try {
    const id = crypto.randomUUID();
    const exportedAt = Date.now();
    const fileName = getExportDisplayFileName(form);
    const patternType = form.type;
    const effective = formToEffectiveExport(form);

    const payload: StoredExportRecord = {
      v: 1,
      id,
      fileName,
      patternType,
      exportedAt,
      effective
    };

    const storageKeys = savePayload(id, payload);
    const rows = readIndexRows();
    rows.push({ id, fileName, patternType, exportedAt, storageKeys });
    writeIndexRows(rows);

    return { id, fileName, patternType, exportedAt };
  } catch {
    return null;
  }
};

export const deleteExportHistoryItem = (id: string) => {
  const rows = readIndexRows();
  const row = rows.find((entry) => entry.id === id);
  if (!row) return;

  removeStorageKeys(row.storageKeys);
  writeIndexRows(rows.filter((entry) => entry.id !== id));
};

export const useExportHistory = () => {
  const [entries, setEntries] = useState<ExportHistoryListItem[]>(() => listExportHistory());
  const [selectedId, setSelectedId] = useState('');

  const refresh = useCallback(() => {
    setEntries(listExportHistory());
  }, []);

  const record = useCallback(
    (source: FormObject) => {
      const item = recordExportHistory(source);
      refresh();
      if (item) setSelectedId(item.id);
      return item;
    },
    [refresh]
  );

  const remove = useCallback(
    (id: string) => {
      deleteExportHistoryItem(id);
      refresh();
      setSelectedId((current) => (current === id ? '' : current));
    },
    [refresh]
  );

  return {
    entries,
    selectedId,
    setSelectedId,
    record,
    remove,
    refresh
  };
};
