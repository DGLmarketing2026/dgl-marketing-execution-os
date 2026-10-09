/**
 * DGL Marketing Import Bridge
 * NOVA export -> DGL_MARKETING_DATA_HUB
 *
 * SAFE DESIGN:
 * 1) previewMarketingImport() valida sin escribir.
 * 2) importMarketingFromNovaExport() escribe solo si la validación pasa.
 * 3) rebuildMarketingAudiences() se ejecuta después de una importación válida.
 *
 * Este archivo NO consulta Salesforce y NO modifica NOVA.
 */

const MKT_IMPORT_PROP = 'NOVA_MARKETING_EXPORT_ID';
const MKT_IMPORT_FILE_NAME = 'NOVA_MARKETING_EXPORT';

const MKT_IMPORT_SHEETS = Object.freeze({
  accounts: {
    sheetName: 'ACCOUNTS',
    required: ['accountId','accountName'],
    optional: [
      'status','tier','accountManager','industry','country','servicesUsed',
      'lastLoadDate','lastQuoteDate','daysSinceLastLoad',
      'quotes30d','quotes60d','quotes90d',
      'loads30d','loads60d','loads90d',
      'revenueYTD','revenueHistoric','branch'
    ]
  },
  contacts: {
    sheetName: 'CONTACTS',
    required: ['contactId','accountId','email'],
    optional: [
      'firstName','lastName','title','language',
      'marketingStatus','doNotContact'
    ]
  },
  quotes: {
    sheetName: 'QUOTES',
    required: ['quoteId','accountId','quoteDate','status'],
    optional: [
      'contactId','service','branch','amount','reason','daysOpen','lane'
    ]
  },
  loadsSummary: {
    sheetName: 'LOADS_SUMMARY',
    required: ['accountId','service'],
    optional: [
      'lastLoadDate','loads30d','loads60d','loads90d',
      'revenue30d','revenue90d'
    ]
  },
  exclusions: {
    sheetName: 'EXCLUSIONS',
    required: [],
    optional: [
      'accountId','contactId','reason','source',
      'startDate','endDate','active'
    ]
  }
});

/**
 * OPCIONAL.
 * Si el archivo se llama exactamente NOVA_MARKETING_EXPORT y solo existe uno,
 * no hace falta configurar nada.
 *
 * Si hay varios archivos con ese nombre, usa esta función desde otra función
 * o guarda manualmente la propiedad NOVA_MARKETING_EXPORT_ID en Script Properties.
 */
function setMarketingImportSourceId(spreadsheetId) {
  spreadsheetId = String(spreadsheetId || '').trim();
  if (!spreadsheetId) throw new Error('Debes indicar un Spreadsheet ID.');
  const ss = SpreadsheetApp.openById(spreadsheetId);
  PropertiesService.getScriptProperties().setProperty(MKT_IMPORT_PROP, ss.getId());
  return {
    ok: true,
    spreadsheetId: ss.getId(),
    name: ss.getName(),
    url: ss.getUrl()
  };
}

/**
 * Borra únicamente la referencia a la fuente NOVA.
 * NO borra archivos ni datos.
 */
function clearMarketingImportSourceId() {
  PropertiesService.getScriptProperties().deleteProperty(MKT_IMPORT_PROP);
  return { ok:true };
}

/**
 * SOLO LECTURA.
 * Busca la fuente, valida pestañas/columnas y devuelve conteos + muestras.
 * NO escribe en DGL_MARKETING_DATA_HUB.
 */
function previewMarketingImport() {
  v6AuraAssertExternalAllowed_('LEGACY_NOVA_IMPORT');
  const source = getMarketingImportSource_();
  const result = readAndValidateMarketingExport_(source);

  return {
    ok: result.errors.length === 0,
    source: {
      spreadsheetId: source.getId(),
      name: source.getName(),
      url: source.getUrl()
    },
    counts: {
      accounts: result.snapshot.accounts.length,
      contacts: result.snapshot.contacts.length,
      quotes: result.snapshot.quotes.length,
      loadsSummary: result.snapshot.loadsSummary.length,
      exclusions: result.snapshot.exclusions.length
    },
    warnings: result.warnings,
    errors: result.errors,
    samples: {
      accounts: result.snapshot.accounts.slice(0, 3),
      contacts: result.snapshot.contacts.slice(0, 3).map(redactContactForPreview_),
      quotes: result.snapshot.quotes.slice(0, 3)
    }
  };
}

/**
 * IMPORTACIÓN REAL.
 * 1) Valida la fuente.
 * 2) Escribe/upsert en DGL_MARKETING_DATA_HUB.
 * 3) Reconstruye audiencias.
 *
 * Si existen errores de validación, NO escribe nada.
 */
function importMarketingFromNovaExport() {
  v6AuraAssertExternalAllowed_('LEGACY_NOVA_IMPORT');
  const source = getMarketingImportSource_();
  const result = readAndValidateMarketingExport_(source);

  if (result.errors.length) {
    throw new Error(
      'Importación cancelada. Corrige primero: ' + result.errors.join(' | ')
    );
  }

  const pushResult = pushMarketingSnapshot(result.snapshot);
  const audienceResult = rebuildMarketingAudiences();

  mktLogSync_(
    'NOVA_MARKETING_EXPORT',
    {
      ok:true,
      accounts: result.snapshot.accounts.length,
      contacts: result.snapshot.contacts.length,
      quotes: result.snapshot.quotes.length,
      audienceRows: Number(audienceResult && audienceResult.audienceRows || 0)
    },
    'Importación NOVA -> Marketing completada desde ' + source.getName()
  );

  return {
    ok:true,
    source: source.getName(),
    imported: pushResult,
    audiences: audienceResult,
    warnings: result.warnings
  };
}

/**
 * Crea un trigger diario SOLO cuando ya hayas probado manualmente
 * previewMarketingImport() e importMarketingFromNovaExport().
 *
 * No ejecutes esto antes de validar una fuente real de NOVA.
 */
function installDailyMarketingImportTrigger() {
  removeDailyMarketingImportTrigger();

  v6AuraNewTrigger_('importMarketingFromNovaExport')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  return { ok:true, schedule:'Daily around 06:00 project timezone' };
}

/**
 * Elimina solamente triggers de importMarketingFromNovaExport.
 */
function removeDailyMarketingImportTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'importMarketingFromNovaExport') {
      ScriptApp.deleteTrigger(t);
    }
  });
  return { ok:true };
}


/* ============================================================
 * INTERNAL HELPERS
 * ============================================================ */

function getMarketingImportSource_() {
  v6AuraAssertExternalAllowed_('LEGACY_NOVA_IMPORT');
  const props = PropertiesService.getScriptProperties();
  const configuredId = String(props.getProperty(MKT_IMPORT_PROP) || '').trim();

  if (configuredId) {
    try {
      return SpreadsheetApp.openById(configuredId);
    } catch (err) {
      throw new Error(
        'La propiedad ' + MKT_IMPORT_PROP +
        ' apunta a un archivo que no se puede abrir. ' +
        String(err && err.message || err)
      );
    }
  }

  const files = DriveApp.getFilesByName(MKT_IMPORT_FILE_NAME);
  const matches = [];
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
      matches.push(f);
    }
  }

  if (matches.length === 0) {
    throw new Error(
      'No existe una Google Sheet llamada exactamente "' +
      MKT_IMPORT_FILE_NAME +
      '". NOVA todavía no está entregando la fuente de Marketing.'
    );
  }

  if (matches.length > 1) {
    throw new Error(
      'Hay ' + matches.length + ' archivos llamados "' +
      MKT_IMPORT_FILE_NAME +
      '". Configura el ID exacto en Script Properties usando la clave ' +
      MKT_IMPORT_PROP + '.'
    );
  }

  const ss = SpreadsheetApp.openById(matches[0].getId());

  // Guardamos la referencia encontrada para no volver a buscar por nombre.
  props.setProperty(MKT_IMPORT_PROP, ss.getId());
  return ss;
}

function readAndValidateMarketingExport_(ss) {
  const snapshot = {
    accounts: [],
    contacts: [],
    quotes: [],
    loadsSummary: [],
    exclusions: []
  };

  const warnings = [];
  const errors = [];

  Object.keys(MKT_IMPORT_SHEETS).forEach(key => {
    const cfg = MKT_IMPORT_SHEETS[key];
    const sh = ss.getSheetByName(cfg.sheetName);

    if (!sh) {
      // ACCOUNTS, CONTACTS y QUOTES son las tres fuentes mínimas.
      if (['accounts','contacts','quotes'].indexOf(key) !== -1) {
        errors.push('Falta la pestaña obligatoria ' + cfg.sheetName + '.');
      } else {
        warnings.push(
          'No existe ' + cfg.sheetName +
          '; se importará sin esta fuente opcional.'
        );
      }
      return;
    }

    if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) {
      errors.push('La pestaña ' + cfg.sheetName + ' está vacía.');
      return;
    }

    const table = readSheetObjects_(sh);
    const headers = table.headers;

    cfg.required.forEach(h => {
      if (headers.indexOf(h) === -1) {
        errors.push(
          'En ' + cfg.sheetName +
          ' falta la columna obligatoria "' + h + '".'
        );
      }
    });

    if (errors.some(e => e.indexOf('En ' + cfg.sheetName) === 0)) {
      return;
    }

    snapshot[key] = table.records;
  });

  // Validaciones de integridad que no cambian datos.
  const accountIds = new Set(snapshot.accounts.map(x => String(x.accountId || '')));
  const contactIds = new Set();

  snapshot.contacts.forEach(c => {
    const cid = String(c.contactId || '');
    if (cid) {
      if (contactIds.has(cid)) {
        errors.push('Contact ID duplicado en CONTACTS: ' + cid);
      }
      contactIds.add(cid);
    }

    if (c.accountId && !accountIds.has(String(c.accountId))) {
      warnings.push(
        'Contacto ' + (cid || '(sin ID)') +
        ' referencia Account ID inexistente en ACCOUNTS: ' + c.accountId
      );
    }
  });

  const quoteIds = new Set();
  snapshot.quotes.forEach(q => {
    const qid = String(q.quoteId || '');
    if (qid) {
      if (quoteIds.has(qid)) {
        errors.push('Quote ID duplicado en QUOTES: ' + qid);
      }
      quoteIds.add(qid);
    }

    if (q.accountId && !accountIds.has(String(q.accountId))) {
      warnings.push(
        'Quote ' + (qid || '(sin ID)') +
        ' referencia Account ID inexistente en ACCOUNTS: ' + q.accountId
      );
    }
  });

  // Evitar contactos sin email útil.
  snapshot.contacts = snapshot.contacts.filter(c => {
    const email = String(c.email || '').trim();
    if (!email) return false;
    return true;
  });

  return { snapshot, warnings: unique_(warnings), errors: unique_(errors) };
}

function readSheetObjects_(sh) {
  const values = sh.getDataRange().getValues();
  if (!values.length) return { headers:[], records:[] };

  const headers = values[0].map(h => String(h || '').trim());

  const records = values.slice(1)
    .filter(row => row.some(v => String(v || '').trim() !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = normalizeImportValue_(h, row[i]);
      });
      return obj;
    });

  return { headers, records };
}

function normalizeImportValue_(header, value) {
  if (value instanceof Date) return value;

  const numericFields = [
    'daysSinceLastLoad',
    'quotes30d','quotes60d','quotes90d',
    'loads30d','loads60d','loads90d',
    'revenueYTD','revenueHistoric',
    'amount','daysOpen','revenue30d','revenue90d'
  ];

  if (numericFields.indexOf(header) !== -1) {
    if (value === '' || value == null) return '';
    const num = Number(value);
    return isNaN(num) ? value : num;
  }

  if (header === 'doNotContact' || header === 'active') {
    if (typeof value === 'boolean') return value;
    const s = String(value || '').trim().toLowerCase();
    if (['true','yes','1','si','sí'].indexOf(s) !== -1) return true;
    if (['false','no','0'].indexOf(s) !== -1) return false;
  }

  return value;
}

function redactContactForPreview_(c) {
  const copy = Object.assign({}, c);
  const email = String(copy.email || '');
  if (email.indexOf('@') > 1) {
    const parts = email.split('@');
    copy.email =
      parts[0].slice(0,2) + '***@' + parts.slice(1).join('@');
  }
  return copy;
}

function unique_(arr) {
  return Array.from(new Set(arr));
}
