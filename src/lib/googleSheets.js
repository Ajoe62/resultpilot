import { buildSheetsExportPlan } from "./sheetsExportData";

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

let googleScriptPromise;
let tokenClient;

export function getGoogleSheetsConfig() {
  return {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
    spreadsheetId: import.meta.env.VITE_GOOGLE_SHEET_ID || "",
  };
}

export function hasGoogleSheetsConfig() {
  const { clientId, spreadsheetId } = getGoogleSheetsConfig();
  return Boolean(clientId && spreadsheetId);
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);

      if (existingScript) {
        existingScript.addEventListener("load", resolve, { once: true });
        existingScript.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Unable to load Google authorization."));
      document.head.appendChild(script);
    });
  }

  return googleScriptPromise;
}

async function getAccessToken() {
  const { clientId } = getGoogleSheetsConfig();

  if (!clientId) {
    throw new Error("Add VITE_GOOGLE_CLIENT_ID to .env before exporting to Google Sheets.");
  }

  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SHEETS_SCOPE,
      callback: (response) => {
        if (response?.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }

        if (!response?.access_token) {
          reject(new Error("Google did not return an access token."));
          return;
        }

        resolve(response.access_token);
      },
    });

    tokenClient.requestAccessToken({ prompt: "" });
  });
}

async function sheetsRequest(accessToken, path, options = {}) {
  const response = await fetch(`${SHEETS_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message =
      errorBody?.error?.message ||
      `Google Sheets request failed with ${response.status}.`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function quoteSheetTitle(title) {
  return `'${title.replaceAll("'", "''")}'`;
}

async function ensureSheets(accessToken, spreadsheetId, sheetTitles) {
  const spreadsheet = await sheetsRequest(
    accessToken,
    `/${spreadsheetId}?fields=sheets.properties.title`,
  );
  const existingTitles = new Set(
    spreadsheet.sheets?.map((sheet) => sheet.properties.title) || [],
  );
  const missingTitles = sheetTitles.filter((title) => !existingTitles.has(title));

  if (!missingTitles.length) {
    return;
  }

  await sheetsRequest(accessToken, `/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: missingTitles.map((title) => ({
        addSheet: {
          properties: {
            title,
          },
        },
      })),
    }),
  });
}

async function writeSheet(accessToken, spreadsheetId, title, rows) {
  const rangeTitle = quoteSheetTitle(title);

  await sheetsRequest(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(`${rangeTitle}!A:Q`)}:clear`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  await sheetsRequest(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(`${rangeTitle}!A1`)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({
        range: `${rangeTitle}!A1`,
        majorDimension: "ROWS",
        values: rows,
      }),
    },
  );
}

export async function exportResultsToGoogleSheets(results) {
  const { spreadsheetId } = getGoogleSheetsConfig();

  if (!spreadsheetId) {
    throw new Error("Add VITE_GOOGLE_SHEET_ID to .env before exporting to Google Sheets.");
  }

  if (!results.length) {
    throw new Error("There are no results to export.");
  }

  const accessToken = await getAccessToken();
  const exports = buildSheetsExportPlan(results);

  await ensureSheets(accessToken, spreadsheetId, exports.map((group) => group.title));

  for (const exportGroup of exports) {
    await writeSheet(accessToken, spreadsheetId, exportGroup.title, exportGroup.rows);
  }

  return {
    groupCount: exports.length,
    rowCount: exports.reduce((total, group) => total + group.count, 0),
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}
