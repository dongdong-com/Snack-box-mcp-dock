/**
 * Saramin AI MCP — Unified Custom Server
 *
 * 포함된 도구 그룹:
 *   Google Drive   : search, read_file, create_file, update_file, delete_file, create_folder
 *   Google Workspace: calendar_*, tasks_*, docs_*, slides_*, meet_*
 *   Axure          : scan_projects, list_pages, get_page, search_axure, get_summary, get_flow
 *
 * 환경변수 (필수):
 *   GOOGLE_OAUTH_PATH   - GCP OAuth 클라이언트 시크릿 JSON 경로
 *   GOOGLE_TOKEN_PATH   - Google 통합 토큰 JSON 경로 (최초 인증 후 자동 생성)
 *
 * 환경변수 (선택):
 *   AXURE_DEFAULT_DIR   - Axure HTML export 기본 탐색 경로
 *   AXURE_LAST_USED     - 마지막 사용 경로 저장 파일 경로
 *   NODE_EXTRA_CA_CERTS - 기업 SSL 인증서 경로 (Zscaler 등)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire }  from 'module';
import { load as cheerioLoad } from 'cheerio';
import { Server }               from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 환경변수 경로 ─────────────────────────────────────────────────────────────
const OAUTH_PATH      = process.env.GOOGLE_OAUTH_PATH  ?? path.join(__dirname, '../credentials/gcp-oauth.keys.json');
const TOKEN_PATH      = process.env.GOOGLE_TOKEN_PATH  ?? path.join(__dirname, '../credentials/google-token.json');
const AXURE_DIR       = process.env.AXURE_DEFAULT_DIR  ?? path.join(__dirname, '../../reports');
const AXURE_LAST_USED = process.env.AXURE_LAST_USED    ?? path.join(__dirname, '../axure-last-used.json');

// ── Zscaler / 기업 SSL 인증서 (선택) ─────────────────────────────────────────
if (process.env.NODE_EXTRA_CA_CERTS && fs.existsSync(process.env.NODE_EXTRA_CA_CERTS)) {
  // NODE_EXTRA_CA_CERTS 는 Node.js가 자동으로 참조하므로 별도 처리 불필요
  process.stderr.write(`[mcp] Zscaler CA loaded: ${process.env.NODE_EXTRA_CA_CERTS}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Auth (OAuth2, 토큰 자동 갱신)
// ─────────────────────────────────────────────────────────────────────────────
function buildGoogleAuth() {
  if (!fs.existsSync(OAUTH_PATH)) throw new Error(`GOOGLE_OAUTH_PATH not found: ${OAUTH_PATH}`);
  if (!fs.existsSync(TOKEN_PATH)) throw new Error(`GOOGLE_TOKEN_PATH not found: ${TOKEN_PATH}\n→ scripts/auth-google.py 로 먼저 인증하세요.`);

  const { client_id, client_secret } = JSON.parse(fs.readFileSync(OAUTH_PATH, 'utf-8')).installed;
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));

  const oauth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost');
  oauth2.setCredentials(token);
  oauth2.on('tokens', (t) => {
    const updated = { ...JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')), ...t };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
    process.stderr.write(`[mcp] Google token refreshed. Expires: ${new Date(updated.expiry_date).toISOString()}\n`);
  });
  return oauth2;
}

const auth     = buildGoogleAuth();
const drive    = google.drive({ version: 'v3', auth });
const calendar = google.calendar({ version: 'v3', auth });
const tasks    = google.tasks({ version: 'v1', auth });
const docs     = google.docs({ version: 'v1', auth });
const slides   = google.slides({ version: 'v1', auth });
const meet     = google.meet({ version: 'v2', auth });

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────────────
const ok  = (text) => ({ content: [{ type: 'text', text: String(text) }], isError: false });
const err = (text) => ({ content: [{ type: 'text', text: String(text) }], isError: true  });

const EXPORT_MAP = {
  'application/vnd.google-apps.document':     { mime: 'text/markdown', ext: 'md'  },
  'application/vnd.google-apps.spreadsheet':  { mime: 'text/csv',      ext: 'csv' },
  'application/vnd.google-apps.presentation': { mime: 'text/plain',    ext: 'txt' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Axure 헬퍼
// ─────────────────────────────────────────────────────────────────────────────
const AXURE_SKIP = new Set(['index.html', 'start.html', 'start_c_1.html', 'start_with_pages.html']);

function axureSaveLastUsed(dir) {
  try { fs.writeFileSync(AXURE_LAST_USED, JSON.stringify({ dir, updatedAt: new Date().toISOString() })); }
  catch (_) {}
}

function axureLoadLastUsed() {
  try {
    const d = JSON.parse(fs.readFileSync(AXURE_LAST_USED, 'utf-8'));
    return fs.existsSync(d.dir) ? d.dir : null;
  } catch (_) { return null; }
}

function axureResolveDir(exportDir) {
  if (exportDir && fs.existsSync(exportDir)) { axureSaveLastUsed(exportDir); return exportDir; }
  const last = axureLoadLastUsed();
  if (last) return last;
  return fs.existsSync(AXURE_DIR) ? AXURE_DIR : null;
}

function axureIsExport(dir) {
  const files = fs.readdirSync(dir);
  return files.some(f => f.endsWith('.html')) && !files.includes('package.json');
}

function axureFindProjects(baseDir, depth = 0) {
  if (depth > 2) return [];
  const results = [];
  if (!fs.existsSync(baseDir)) return results;
  if (axureIsExport(baseDir)) { results.push(baseDir); return results; }
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (entry.isDirectory()) results.push(...axureFindProjects(path.join(baseDir, entry.name), depth + 1));
  }
  return results;
}

function axureGetPages(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.html') && !AXURE_SKIP.has(f))
    .map(f => ({ file: f, name: path.basename(f, '.html') }));
}

function axureExtractText(html) {
  const $ = cheerioLoad(html);
  $('script, style').remove();
  const texts = [];
  $('[data-label], .ax_default, .text, p, h1, h2, h3, h4, td, th, [class*="text"], [class*="label"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 1) texts.push(t);
  });
  return [...new Set(texts)];
}

function axureExtractAnnotations(html) {
  const $ = cheerioLoad(html);
  const notes = [];
  $('[data-annotation], .annotation, [class*="note"], [class*="comment"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t) notes.push(t);
  });
  return notes;
}

// ─────────────────────────────────────────────────────────────────────────────
// 도구 정의
// ─────────────────────────────────────────────────────────────────────────────
const TOOLS = [
  // ── Google Drive ────────────────────────────────────────────────────────────
  { name: 'gdrive_search',
    description: 'Google Drive에서 파일 검색',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'gdrive_read_file',
    description: 'Google Drive 파일 내용 읽기. Docs→Markdown, Sheets→CSV 자동 변환',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] } },
  { name: 'gdrive_create_file',
    description: 'Google Drive에 파일 생성 (Docs/Sheets/Slides 포함)',
    inputSchema: { type: 'object', properties: {
      name:      { type: 'string' },
      content:   { type: 'string' },
      mime_type: { type: 'string', description: 'text/plain | application/vnd.google-apps.document | ...spreadsheet | ...presentation' },
      folder_id: { type: 'string' },
    }, required: ['name', 'content'] } },
  { name: 'gdrive_update_file',
    description: 'Google Drive 파일 내용 수정',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' }, content: { type: 'string' } }, required: ['file_id', 'content'] } },
  { name: 'gdrive_delete_file',
    description: 'Google Drive 파일 삭제 (휴지통으로 이동)',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] } },
  { name: 'gdrive_create_folder',
    description: 'Google Drive에 폴더 생성',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, parent_folder_id: { type: 'string' } }, required: ['name'] } },

  // ── Google Calendar ─────────────────────────────────────────────────────────
  { name: 'calendar_list_events',
    description: '구글 캘린더 일정 목록 조회',
    inputSchema: { type: 'object', properties: {
      calendar_id: { type: 'string' }, max_results: { type: 'number' },
      time_min: { type: 'string', description: 'ISO8601 (예: 2026-04-01T00:00:00+09:00)' },
      time_max: { type: 'string' }, search_query: { type: 'string' },
    } } },
  { name: 'calendar_create_event',
    description: '구글 캘린더 일정 생성 (add_meet_link=true 시 Meet 링크 포함)',
    inputSchema: { type: 'object', required: ['summary', 'start', 'end'], properties: {
      summary: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' },
      description: { type: 'string' }, location: { type: 'string' },
      attendees: { type: 'array', items: { type: 'string' } },
      add_meet_link: { type: 'boolean' }, calendar_id: { type: 'string' },
    } } },
  { name: 'calendar_update_event',
    description: '구글 캘린더 일정 수정',
    inputSchema: { type: 'object', required: ['event_id'], properties: {
      event_id: { type: 'string' }, calendar_id: { type: 'string' },
      summary: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' },
      description: { type: 'string' }, location: { type: 'string' },
    } } },
  { name: 'calendar_delete_event',
    description: '구글 캘린더 일정 삭제',
    inputSchema: { type: 'object', required: ['event_id'], properties: {
      event_id: { type: 'string' }, calendar_id: { type: 'string' },
    } } },

  // ── Google Tasks ────────────────────────────────────────────────────────────
  { name: 'tasks_list_tasklists', description: '구글 Tasks 태스크리스트 목록 조회', inputSchema: { type: 'object', properties: {} } },
  { name: 'tasks_list',
    description: '구글 Tasks 할일 목록 조회',
    inputSchema: { type: 'object', properties: {
      tasklist_id: { type: 'string' }, show_completed: { type: 'boolean' }, show_hidden: { type: 'boolean' },
    } } },
  { name: 'tasks_create',
    description: '구글 Tasks 할일 추가',
    inputSchema: { type: 'object', required: ['title'], properties: {
      title: { type: 'string' }, notes: { type: 'string' },
      due: { type: 'string', description: 'ISO8601' }, tasklist_id: { type: 'string' },
    } } },
  { name: 'tasks_complete',
    description: '구글 Tasks 할일 완료 처리',
    inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' }, tasklist_id: { type: 'string' } } } },
  { name: 'tasks_delete',
    description: '구글 Tasks 할일 삭제',
    inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' }, tasklist_id: { type: 'string' } } } },

  // ── Google Docs / Slides / Meet ─────────────────────────────────────────────
  { name: 'docs_append_text',
    description: 'Google Docs 문서 끝에 텍스트 추가',
    inputSchema: { type: 'object', required: ['document_id', 'text'], properties: {
      document_id: { type: 'string' }, text: { type: 'string' },
    } } },
  { name: 'slides_create',
    description: 'Google Slides 프레젠테이션 생성',
    inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } },
  { name: 'slides_get',
    description: 'Google Slides 프레젠테이션 내용 조회',
    inputSchema: { type: 'object', required: ['presentation_id'], properties: { presentation_id: { type: 'string' } } } },
  { name: 'slides_add_slide',
    description: 'Google Slides에 슬라이드 추가 (제목 + 본문)',
    inputSchema: { type: 'object', required: ['presentation_id', 'title'], properties: {
      presentation_id: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' },
    } } },
  { name: 'meet_create_space',
    description: 'Google Meet 회의 공간 생성 및 링크 반환',
    inputSchema: { type: 'object', properties: {} } },

  // ── Axure ───────────────────────────────────────────────────────────────────
  { name: 'axure_scan_projects',
    description: 'Axure HTML export 폴더 탐색',
    inputSchema: { type: 'object', properties: { base_dir: { type: 'string', description: '탐색 기준 디렉터리 (생략 시 기본 경로)' } } } },
  { name: 'axure_list_pages',
    description: 'Axure 기획서 페이지 목록',
    inputSchema: { type: 'object', properties: { export_dir: { type: 'string' } } } },
  { name: 'axure_get_page',
    description: 'Axure 특정 페이지 기획 내용 추출',
    inputSchema: { type: 'object', required: ['page_name'], properties: {
      page_name: { type: 'string' }, export_dir: { type: 'string' },
    } } },
  { name: 'axure_search',
    description: 'Axure 기획서 전체 키워드 검색',
    inputSchema: { type: 'object', required: ['keyword'], properties: {
      keyword: { type: 'string' }, export_dir: { type: 'string' },
    } } },
  { name: 'axure_get_summary',
    description: 'Axure 기획서 전체 요약',
    inputSchema: { type: 'object', properties: { export_dir: { type: 'string' } } } },
  { name: 'axure_get_flow',
    description: 'Axure flow.html 화면 흐름 구조 추출',
    inputSchema: { type: 'object', properties: { export_dir: { type: 'string' } } } },
];

// ─────────────────────────────────────────────────────────────────────────────
// 도구 실행
// ─────────────────────────────────────────────────────────────────────────────
async function callTool(name, args) {
  // ── Google Drive ────────────────────────────────────────────────────────────
  if (name === 'gdrive_search') {
    const q   = String(args?.query ?? '').replace(/'/g, "\\'");
    const res = await drive.files.list({ q: `fullText contains '${q}'`, pageSize: 10, fields: 'files(id, name, mimeType, modifiedTime)' });
    const list = (res.data.files ?? []).map(f => `• ${f.name}\n  ID: ${f.id}\n  Type: ${f.mimeType}\n  Modified: ${f.modifiedTime}`).join('\n\n');
    return ok(`${res.data.files?.length ?? 0}개 파일:\n\n${list}`);
  }
  if (name === 'gdrive_read_file') {
    const fileId = String(args?.file_id ?? '');
    const meta   = await drive.files.get({ fileId, fields: 'mimeType, name' });
    const mime   = meta.data.mimeType ?? '';
    if (mime.startsWith('application/vnd.google-apps')) {
      const { mime: exportMime } = EXPORT_MAP[mime] ?? { mime: 'text/plain' };
      const res = await drive.files.export({ fileId, mimeType: exportMime }, { responseType: 'text' });
      return ok(`[${meta.data.name}]\n\n${res.data}`);
    }
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return ok(`[${meta.data.name}]\n\n${Buffer.from(res.data).toString('utf-8')}`);
  }
  if (name === 'gdrive_create_file') {
    const mimeType = String(args?.mime_type ?? 'text/plain');
    const res = await drive.files.create({
      requestBody: { name: String(args?.name ?? 'untitled'), mimeType, parents: args?.folder_id ? [String(args.folder_id)] : undefined },
      media: { mimeType, body: String(args?.content ?? '') },
      fields: 'id, name, webViewLink',
    });
    return ok(`✅ 파일 생성\n이름: ${res.data.name}\nID: ${res.data.id}\nURL: ${res.data.webViewLink}`);
  }
  if (name === 'gdrive_update_file') {
    const fileId = String(args?.file_id ?? '');
    const meta   = await drive.files.get({ fileId, fields: 'mimeType, name' });
    await drive.files.update({ fileId, media: { mimeType: meta.data.mimeType, body: String(args?.content ?? '') } });
    return ok(`✅ 파일 수정\n이름: ${meta.data.name}`);
  }
  if (name === 'gdrive_delete_file') {
    const fileId = String(args?.file_id ?? '');
    const meta   = await drive.files.get({ fileId, fields: 'name' });
    await drive.files.delete({ fileId });
    return ok(`🗑️ 파일 삭제\n이름: ${meta.data.name}`);
  }
  if (name === 'gdrive_create_folder') {
    const res = await drive.files.create({
      requestBody: { name: String(args?.name ?? 'New Folder'), mimeType: 'application/vnd.google-apps.folder', parents: args?.parent_folder_id ? [String(args.parent_folder_id)] : undefined },
      fields: 'id, name, webViewLink',
    });
    return ok(`📁 폴더 생성\n이름: ${res.data.name}\nID: ${res.data.id}`);
  }

  // ── Google Calendar ─────────────────────────────────────────────────────────
  if (name === 'calendar_list_events') {
    const calId = args?.calendar_id ?? 'primary';
    const params = { calendarId: calId, maxResults: args?.max_results ?? 10, singleEvents: true, orderBy: 'startTime', timeMin: args?.time_min ?? new Date().toISOString() };
    if (args?.time_max) params.timeMax = args.time_max;
    if (args?.search_query) params.q = args.search_query;
    const res = await calendar.events.list(params);
    const events = res.data.items ?? [];
    if (!events.length) return ok('일정이 없습니다.');
    return ok(`${events.length}개 일정:\n\n` + events.map(e => `• ${e.summary ?? '(제목 없음)'}\n  ID: ${e.id}\n  시작: ${e.start?.dateTime ?? e.start?.date}\n  Meet: ${e.hangoutLink ?? '-'}`).join('\n\n'));
  }
  if (name === 'calendar_create_event') {
    const calId = args?.calendar_id ?? 'primary';
    const event = { summary: args.summary, description: args?.description, location: args?.location, start: { dateTime: args.start, timeZone: 'Asia/Seoul' }, end: { dateTime: args.end, timeZone: 'Asia/Seoul' }, attendees: (args?.attendees ?? []).map(e => ({ email: e })) };
    if (args?.add_meet_link) event.conferenceData = { createRequest: { requestId: Date.now().toString(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
    const res = await calendar.events.insert({ calendarId: calId, conferenceDataVersion: args?.add_meet_link ? 1 : 0, requestBody: event });
    const e = res.data;
    return ok([`✅ 일정 생성`, `제목: ${e.summary}`, `ID: ${e.id}`, `URL: ${e.htmlLink}`, e.hangoutLink ? `Meet: ${e.hangoutLink}` : ''].filter(Boolean).join('\n'));
  }
  if (name === 'calendar_update_event') {
    const calId = args?.calendar_id ?? 'primary';
    const patch = {};
    if (args?.summary) patch.summary = args.summary;
    if (args?.description) patch.description = args.description;
    if (args?.location) patch.location = args.location;
    if (args?.start) patch.start = { dateTime: args.start, timeZone: 'Asia/Seoul' };
    if (args?.end) patch.end = { dateTime: args.end, timeZone: 'Asia/Seoul' };
    const res = await calendar.events.patch({ calendarId: calId, eventId: args.event_id, requestBody: patch });
    return ok(`✅ 일정 수정\n제목: ${res.data.summary}\nID: ${res.data.id}`);
  }
  if (name === 'calendar_delete_event') {
    const calId = args?.calendar_id ?? 'primary';
    const cur = (await calendar.events.get({ calendarId: calId, eventId: args.event_id })).data;
    await calendar.events.delete({ calendarId: calId, eventId: args.event_id });
    return ok(`🗑️ 일정 삭제\n제목: ${cur.summary}`);
  }

  // ── Google Tasks ────────────────────────────────────────────────────────────
  if (name === 'tasks_list_tasklists') {
    const res = await tasks.tasklists.list({ maxResults: 20 });
    return ok(`태스크리스트 ${res.data.items?.length ?? 0}개:\n\n` + (res.data.items ?? []).map(l => `• ${l.title}\n  ID: ${l.id}`).join('\n\n'));
  }
  if (name === 'tasks_list') {
    const tlId = args?.tasklist_id ?? '@default';
    const res  = await tasks.tasks.list({ tasklist: tlId, showCompleted: args?.show_completed ?? false, showHidden: args?.show_hidden ?? false });
    const items = res.data.items ?? [];
    if (!items.length) return ok('할일이 없습니다.');
    return ok(`${items.length}개 할일:\n\n` + items.map(t => `${t.status === 'completed' ? '[완료]' : '[ ]'} ${t.title}\n  ID: ${t.id}${t.due ? '\n  마감: ' + t.due : ''}`).join('\n\n'));
  }
  if (name === 'tasks_create') {
    const task = { title: args.title };
    if (args?.notes) task.notes = args.notes;
    if (args?.due) task.due = args.due;
    const res = await tasks.tasks.insert({ tasklist: args?.tasklist_id ?? '@default', requestBody: task });
    return ok(`✅ 할일 추가\n제목: ${res.data.title}\nID: ${res.data.id}`);
  }
  if (name === 'tasks_complete') {
    const res = await tasks.tasks.patch({ tasklist: args?.tasklist_id ?? '@default', task: args.task_id, requestBody: { status: 'completed' } });
    return ok(`✅ 할일 완료\n제목: ${res.data.title}`);
  }
  if (name === 'tasks_delete') {
    const cur = (await tasks.tasks.get({ tasklist: args?.tasklist_id ?? '@default', task: args.task_id })).data;
    await tasks.tasks.delete({ tasklist: args?.tasklist_id ?? '@default', task: args.task_id });
    return ok(`🗑️ 할일 삭제\n제목: ${cur.title}`);
  }

  // ── Google Docs / Slides / Meet ─────────────────────────────────────────────
  if (name === 'docs_append_text') {
    const doc = (await docs.documents.get({ documentId: args.document_id })).data;
    const bodyEnd = doc.body?.content?.at(-1)?.endIndex ?? 1;
    await docs.documents.batchUpdate({ documentId: args.document_id, requestBody: { requests: [{ insertText: { location: { index: bodyEnd - 1 }, text: '\n' + args.text } }] } });
    return ok(`✅ 텍스트 추가\n문서: ${doc.title}`);
  }
  if (name === 'slides_create') {
    const pres = (await slides.presentations.create({ requestBody: { title: args.title } })).data;
    return ok(`✅ 프레젠테이션 생성\n제목: ${pres.title}\nURL: https://docs.google.com/presentation/d/${pres.presentationId}/edit`);
  }
  if (name === 'slides_get') {
    const pres = (await slides.presentations.get({ presentationId: args.presentation_id })).data;
    const text = (pres.slides ?? []).map((s, i) => `[슬라이드 ${i+1}]\n` + (s.pageElements ?? []).flatMap(el => (el.shape?.text?.textElements ?? []).map(t => t.textRun?.content ?? '').filter(Boolean)).join('\n')).join('\n\n');
    return ok(`[${pres.title}] ${pres.slides?.length ?? 0}슬라이드\n\n${text}`);
  }
  if (name === 'slides_add_slide') {
    const slideId = `slide_${Date.now()}`, titleId = `title_${Date.now()}`, bodyId = `body_${Date.now()}`;
    const requests = [
      { createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' } } },
      { createShape: { objectId: titleId, shapeType: 'TEXT_BOX', elementProperties: { pageObjectId: slideId, size: { width: { magnitude: 6000000, unit: 'EMU' }, height: { magnitude: 1000000, unit: 'EMU' } }, transform: { scaleX: 1, scaleY: 1, translateX: 457200, translateY: 274638, unit: 'EMU' } } } },
      { insertText: { objectId: titleId, text: args.title } },
    ];
    if (args?.body) {
      requests.push({ createShape: { objectId: bodyId, shapeType: 'TEXT_BOX', elementProperties: { pageObjectId: slideId, size: { width: { magnitude: 6000000, unit: 'EMU' }, height: { magnitude: 3000000, unit: 'EMU' } }, transform: { scaleX: 1, scaleY: 1, translateX: 457200, translateY: 1600000, unit: 'EMU' } } } });
      requests.push({ insertText: { objectId: bodyId, text: args.body } });
    }
    await slides.presentations.batchUpdate({ presentationId: args.presentation_id, requestBody: { requests } });
    return ok(`✅ 슬라이드 추가\n제목: ${args.title}`);
  }
  if (name === 'meet_create_space') {
    const res = await meet.spaces.create({ requestBody: {} });
    return ok(`✅ Meet 공간 생성\n링크: ${res.data.meetingUri}`);
  }

  // ── Axure ───────────────────────────────────────────────────────────────────
  if (name === 'axure_scan_projects') {
    const baseDir  = args?.base_dir ? String(args.base_dir) : AXURE_DIR;
    const projects = axureFindProjects(baseDir);
    if (!projects.length) return ok(`기획서를 찾을 수 없습니다. (탐색 경로: ${baseDir})`);
    return ok(`Axure 기획서 ${projects.length}개:\n\n` + projects.map((p, i) => `${i+1}. ${path.basename(p)}\n   경로: ${p}`).join('\n\n'));
  }
  if (name === 'axure_list_pages') {
    const dir = axureResolveDir(args?.export_dir);
    if (!dir) return err('기획서 경로를 찾을 수 없습니다. export_dir 파라미터를 지정하세요.');
    const pages = axureGetPages(dir);
    return ok(`📁 ${path.basename(dir)}\n총 ${pages.length}개 페이지:\n\n` + pages.map((p, i) => `  [${i+1}] ${p.name}`).join('\n'));
  }
  if (name === 'axure_get_page') {
    const dir = axureResolveDir(args?.export_dir);
    if (!dir) return err('기획서 경로를 찾을 수 없습니다.');
    const pages = axureGetPages(dir);
    const target = pages.find(p => p.name.includes(args.page_name) || p.file.includes(args.page_name));
    if (!target) return err(`페이지 "${args.page_name}"을 찾을 수 없습니다.`);
    const html  = fs.readFileSync(path.join(dir, target.file), 'utf-8');
    const texts = axureExtractText(html);
    const notes = axureExtractAnnotations(html);
    let result  = `═══ ${target.name} ═══\n\n▶ 기획 내용\n` + texts.map((t, i) => `  ${i+1}. ${t}`).join('\n');
    if (notes.length) result += `\n\n▶ 위젯 주석\n` + notes.map(n => `  • ${n}`).join('\n');
    return ok(result);
  }
  if (name === 'axure_search') {
    const dir = axureResolveDir(args?.export_dir);
    if (!dir) return err('기획서 경로를 찾을 수 없습니다.');
    const keyword = String(args.keyword).toLowerCase();
    const pages   = axureGetPages(dir);
    const matches = [];
    for (const page of pages) {
      const html  = fs.readFileSync(path.join(dir, page.file), 'utf-8');
      const texts = axureExtractText(html).filter(t => t.toLowerCase().includes(keyword));
      if (texts.length) matches.push({ page: page.name, texts });
    }
    if (!matches.length) return ok(`"${args.keyword}" 검색 결과 없음`);
    return ok(`"${args.keyword}" — ${matches.length}개 페이지에서 발견\n\n` + matches.map(m => `▶ ${m.page}\n` + m.texts.slice(0, 3).map(t => `   ...${t}...`).join('\n')).join('\n\n'));
  }
  if (name === 'axure_get_summary') {
    const dir = axureResolveDir(args?.export_dir);
    if (!dir) return err('기획서 경로를 찾을 수 없습니다.');
    const pages = axureGetPages(dir);
    const cats  = { '기획 문서': [], '화면': [], '기타': [] };
    const docKeywords = ['표지', '히스토리', 'changelog', '개요', 'flow', 'cover'];
    for (const p of pages) {
      const lower = p.name.toLowerCase();
      if (docKeywords.some(k => lower.includes(k))) cats['기획 문서'].push(p.name);
      else if (lower.includes('화면') || lower.match(/\d{4}/)) cats['화면'].push(p.name);
      else cats['기타'].push(p.name);
    }
    let result = `══════════════════════════\n  📋 ${path.basename(dir)}\n══════════════════════════\n  총 페이지: ${pages.length}개\n\n`;
    for (const [cat, list] of Object.entries(cats)) {
      if (list.length) result += `📂 ${cat}\n` + list.map(n => `   • ${n}`).join('\n') + '\n\n';
    }
    return ok(result.trim());
  }
  if (name === 'axure_get_flow') {
    const dir = axureResolveDir(args?.export_dir);
    if (!dir) return err('기획서 경로를 찾을 수 없습니다.');
    const flowFile = path.join(dir, 'flow.html');
    if (!fs.existsSync(flowFile)) return ok('flow.html 파일이 없습니다. Axure에서 Flow 다이어그램을 내보내야 합니다.');
    const html  = fs.readFileSync(flowFile, 'utf-8');
    const texts = axureExtractText(html);
    return ok(`🔀 화면 흐름 구조:\n\n` + texts.map(t => `  • ${t}`).join('\n'));
  }

  return err(`Unknown tool: ${name}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP 서버 시작
// ─────────────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'saramin-ai-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    return await callTool(req.params.name, req.params.arguments ?? {});
  } catch (e) {
    return err(`Error: ${e.message}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('[saramin-ai-mcp] v1.0.0 started — GDrive / Calendar / Tasks / Docs / Slides / Meet / Axure\n');
