// Cloudflare Pages Functions - 工时核算长图与表格导出后端端点
// 默认关闭；客户端已支持本地导出，只有显式配置 EXPORT_ENABLED=1 后才启用。
// 严格规范：绝不使用任何 emoji

import {
  Env,
  corsHeaders,
  handleOptions,
  isEnabled,
  jsonResponse,
  notFound,
  readJson
} from './_shared';

const MAX_IMAGE_BASE64 = 8 * 1024 * 1024;

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function safeFilename(value: unknown, fallback: string): string {
  const cleaned = String(value == null ? '' : value)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return (cleaned || fallback).slice(0, 80);
}

export async function onRequestOptions(context: { request: Request; env: Env }): Promise<Response> {
  return handleOptions(context.request, context.env);
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (!isEnabled(env, 'EXPORT_ENABLED')) return notFound();

  const cors = corsHeaders(request, env);
  let body: any;
  try {
    body = await readJson(request, 12 * 1024 * 1024);
  } catch (err: any) {
    return jsonResponse({ ok: false, error: err.message || '非法的 JSON 请求体' }, 400, cors);
  }

  const { action, reportData, imageBase64, filename } = body || {};

  // 1. 后端生成并返回标准 CSV 明细表格文件流
  if (action === 'export_csv') {
    if (!reportData || typeof reportData !== 'object') {
      return jsonResponse({ ok: false, error: '缺少核算报表数据' }, 400, cors);
    }

    const lines: string[] = [];
    lines.push([csvCell('工时与薪资结算单')].join(','));
    lines.push([csvCell('核算对象'), csvCell(reportData.userName || '本人'), csvCell('打印时间'), csvCell(reportData.printTimeStr || new Date().toLocaleString('zh-CN'))].join(','));
    lines.push([csvCell('计薪周期'), csvCell(reportData.periodStr || ''), csvCell('单号'), csvCell(reportData.receiptNo || '')].join(','));
    lines.push([csvCell('时薪单价'), csvCell(`￥${Number(reportData.wageRate || 0).toFixed(2)} 元/小时`), csvCell('标准日工时'), csvCell(`${reportData.stdHours || 8} 小时`)].join(','));
    lines.push([csvCell('出勤天数'), csvCell(`${reportData.attendedDays || 0} 天`), csvCell('总计工时'), csvCell(`${Number(reportData.totalHours || 0).toFixed(1)} 小时`)].join(','));
    lines.push([csvCell('应发实付金额'), csvCell(`￥${Number(reportData.totalSalary || 0).toFixed(2)}`), csvCell('大写金额'), csvCell(reportData.totalSalaryCn || '')].join(','));
    lines.push('');
    lines.push(['日期', '星期', '上班时间', '下班时间', '扣除午休(分钟)', '计入工时(小时)', '当日薪资(元)', '考勤状态', '备注'].map(csvCell).join(','));

    if (Array.isArray(reportData.dailyItems)) {
      for (const item of reportData.dailyItems) {
        lines.push([
          csvCell(item.dateKey || ''),
          csvCell(item.dayOfWeek || ''),
          csvCell(item.inTime || ''),
          csvCell(item.outTime || ''),
          csvCell(item.hasRecord ? item.lunchSpan : 0),
          csvCell(Number(item.workedHours || 0).toFixed(1)),
          csvCell(Number(item.daySalary || 0).toFixed(2)),
          csvCell(item.status || ''),
          csvCell(item.note || '')
        ].join(','));
      }
    }

    lines.push('');
    lines.push([
      csvCell('合计'), csvCell(''), csvCell(''), csvCell(''), csvCell(''),
      csvCell(Number(reportData.totalHours || 0).toFixed(1)),
      csvCell(Number(reportData.totalSalary || 0).toFixed(2)),
      csvCell(`共出勤 ${reportData.attendedDays || 0} 天`),
      csvCell('')
    ].join(','));

    const csvText = '\uFEFF' + lines.join('\r\n');
    const csvBytes = new TextEncoder().encode(csvText);
    const targetName = safeFilename(
      filename,
      `工时薪资明细-${reportData.year || ''}年${reportData.month || ''}月-${reportData.userName || '本人'}.csv`
    );

    return new Response(csvBytes, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(targetName)}`,
        ...cors,
        'Cache-Control': 'no-cache'
      }
    });
  }

  // 2. 后端接收凭单长图并以标准二进制附件流返回
  if (action === 'export_image') {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return jsonResponse({ ok: false, error: '缺少长图 Base64 数据' }, 400, cors);
    }
    if (imageBase64.length > MAX_IMAGE_BASE64) {
      return jsonResponse({ ok: false, error: '长图数据过大' }, 413, cors);
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    let binaryString: string;
    try {
      binaryString = atob(cleanBase64);
    } catch {
      return jsonResponse({ ok: false, error: '长图 Base64 数据不合法' }, 400, cors);
    }
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const targetName = safeFilename(filename, `工时凭单-${Date.now()}.png`);

    return new Response(bytes.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(targetName)}`,
        ...cors,
        'Cache-Control': 'no-cache'
      }
    });
  }

  return jsonResponse({ ok: false, error: '未知的导出动作' }, 400, cors);
}
