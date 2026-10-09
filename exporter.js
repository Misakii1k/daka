// 工时与薪资核算及五大视觉主题导出引擎 (收银小票 / 复古工卡 / 极简报表 / 日历热力 / 记账便签)
// 严格规范：严禁使用任何 emoji
(() => {
  'use strict';

  // 人民币金额大写转换函数
  function toChineseCurrency(n) {
    const num = Math.max(0, Number(n) || 0);
    if (num === 0) return '零元整';
    const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
    const radices = ['', '拾', '佰', '仟'];
    const bigRadices = ['', '万', '亿'];

    const yuan = Math.floor(num);
    const jiao = Math.floor((num * 10) % 10);
    const fen = Math.round((num * 100) % 10);

    let chineseStr = '';
    if (yuan > 0) {
      let zeroCount = 0;
      const strYuan = String(yuan);
      const len = strYuan.length;
      for (let i = 0; i < len; i++) {
        const p = len - i - 1;
        const d = Number(strYuan[i]);
        const quotient = Math.floor(p / 4);
        const modulus = p % 4;

        if (d === 0) {
          zeroCount++;
        } else {
          if (zeroCount > 0) {
            chineseStr += '零';
          }
          zeroCount = 0;
          chineseStr += digits[d] + radices[modulus];
        }

        if (modulus === 0 && zeroCount < 4) {
          chineseStr += bigRadices[quotient];
        }
      }
      chineseStr += '元';
    } else {
      chineseStr += '零元';
    }

    if (jiao === 0 && fen === 0) {
      chineseStr += '整';
    } else {
      if (jiao > 0) chineseStr += digits[jiao] + '角';
      else if (yuan > 0 && fen > 0) chineseStr += '零';
      if (fen > 0) chineseStr += digits[fen] + '分';
    }
    return chineseStr;
  }

  // 计算指定月份的薪资与考勤明细数据
  function computeMonthReportData(monthDate, log, settings, wageRate, userName) {
    const y = monthDate.getFullYear();
    const m = monthDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const firstDayWeekIndex = new Date(y, m, 1).getDay(); // 当月1号为周几 (0-6)
    const pad = n => String(n).padStart(2, '0');
    const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    const toMin = t => {
      if (!t) return 0;
      const [h, min] = t.split(':').map(Number);
      return h * 60 + min;
    };

    const rate = Number(wageRate != null ? wageRate : (settings.wage || 30)) || 0;
    const stdHours = Number(settings.std || 8);
    const defaultLunch = Number(settings.lunch || 60);

    let totalMinutes = 0;
    let attendedDays = 0;
    let normalDays = 0;
    let missingDays = 0;
    let overMinutes = 0;

    const dailyItems = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const curDate = new Date(y, m, day);
      const k = `${y}-${pad(m + 1)}-${pad(day)}`;
      const r = log[k] || null;
      const dayOfWeek = WD[curDate.getDay()];
      const isWeekend = (curDate.getDay() === 0 || curDate.getDay() === 6);

      let inTime = '';
      let outTime = '';
      let lunchSpan = defaultLunch;
      let workedMin = 0;
      let status = '未打卡';
      let note = '';

      if (r) {
        inTime = r.in || '';
        outTime = r.out || '';
        if (r.lunch != null) lunchSpan = r.lunch;
        if (r.note) note = r.note;

        if (inTime && outTime) {
          let span = toMin(outTime) - toMin(inTime);
          if (span < 0) span += 1440;
          workedMin = Math.max(0, span - lunchSpan);
          totalMinutes += workedMin;
          attendedDays++;
          normalDays++;

          const over = workedMin - (stdHours * 60);
          if (over > 0) {
            overMinutes += over;
            status = '超时加班';
          } else {
            status = isWeekend ? '周末出勤' : '正常出勤';
          }
        } else if (inTime || outTime) {
          missingDays++;
          status = '缺卡待补';
        }
      }

      const workedHours = workedMin > 0 ? (workedMin / 60) : 0;
      const daySalary = workedHours * rate;

      dailyItems.push({
        dateKey: k,
        dayNum: day,
        dayStr: `${pad(m + 1)}-${pad(day)}`,
        fullDateStr: `${y}年${m + 1}月${pad(day)}日`,
        dayOfWeek,
        isWeekend,
        hasRecord: !!(r && inTime && outTime),
        inTime: inTime || '--:--',
        outTime: outTime || '--:--',
        lunchSpan,
        workedMin,
        workedHours: Number(workedHours.toFixed(1)),
        daySalary: Number(daySalary.toFixed(2)),
        status,
        note
      });
    }

    const totalHours = Number((totalMinutes / 60).toFixed(1));
    const totalSalary = Number((totalHours * rate).toFixed(2));
    const avgHours = attendedDays > 0 ? Number((totalHours / attendedDays).toFixed(1)) : 0;
    const overHours = Number((overMinutes / 60).toFixed(1));

    const now = new Date();
    const printTimeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const receiptNo = `REC-${y}${pad(m + 1)}${pad(daysInMonth)}-${pad(attendedDays)}${pad(Math.floor(totalHours))}`;
    const periodStr = `${y}年${m + 1}月01日 至 ${y}年${m + 1}月${pad(daysInMonth)}日`;

    return {
      year: y,
      month: m + 1,
      periodStr,
      userName: userName || '本人出勤',
      wageRate: rate,
      stdHours,
      attendedDays,
      missingDays,
      totalHours,
      totalSalary,
      totalSalaryCn: toChineseCurrency(totalSalary),
      avgHours,
      overHours,
      receiptNo,
      printTimeStr,
      daysInMonth,
      firstDayWeekIndex,
      dailyItems
    };
  }

  // ==================== 版式 1：热敏收银小票 Canvas 渲染器 ====================
  function renderReceiptCanvas(reportData) {
    const dpr = 2.0;
    const logicW = 480;

    const toothH = 14;
    const headerH = 260;
    const tableHeaderH = 34;
    const rowH = 28;
    const rowsCount = reportData.dailyItems.length;
    const summaryH = 230;
    const footerH = 200;
    const padY = 16;

    const logicH = toothH * 2 + headerH + tableHeaderH + (rowsCount * rowH) + summaryH + footerH + padY * 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(logicW * dpr);
    canvas.height = Math.round(logicH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 绘制锯齿纸张轮廓
    ctx.save();
    ctx.beginPath();
    const toothCount = 32;
    const toothStep = logicW / toothCount;
    ctx.moveTo(0, toothH);
    for (let i = 0; i < toothCount; i++) {
      ctx.lineTo((i + 0.5) * toothStep, 2);
      ctx.lineTo((i + 1) * toothStep, toothH);
    }
    ctx.lineTo(logicW, logicH - toothH);
    for (let i = toothCount - 1; i >= 0; i--) {
      ctx.lineTo((i + 0.5) * toothStep, logicH - 2);
      ctx.lineTo(i * toothStep, logicH - toothH);
    }
    ctx.lineTo(0, toothH);
    ctx.closePath();

    ctx.fillStyle = '#faf8f2';
    ctx.fill();
    ctx.strokeStyle = '#e2ded5';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    function drawDashedLine(y, isDouble = false) {
      ctx.save();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.0;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(logicW - 24, y);
      ctx.stroke();
      if (isDouble) {
        ctx.beginPath();
        ctx.moveTo(24, y + 4);
        ctx.lineTo(logicW - 24, y + 4);
        ctx.stroke();
      }
      ctx.restore();
    }

    let curY = toothH + 28;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px "Courier New", Consolas, monospace';
    ctx.fillText('*** 工时考勤结算小票 ***', logicW / 2, curY);
    curY += 20;
    ctx.font = '10.5px "Courier New", Consolas, monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('WORKLOG RECEIPT / CASHIER SETTLEMENT', logicW / 2, curY);
    curY += 18;

    drawDashedLine(curY, true);
    curY += 20;

    ctx.font = '12px "Courier New", Consolas, monospace';
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText(`单号: ${reportData.receiptNo}`, 24, curY);
    curY += 18;
    ctx.fillText(`打印: ${reportData.printTimeStr}`, 24, curY);
    curY += 18;
    ctx.fillText(`周期: ${reportData.periodStr}`, 24, curY);
    curY += 18;
    ctx.fillText(`核算对象: ${reportData.userName}`, 24, curY);
    ctx.textAlign = 'right';
    ctx.fillText(`单价: ￥${reportData.wageRate.toFixed(2)}/h`, logicW - 24, curY);
    curY += 18;
    ctx.textAlign = 'left';
    ctx.fillText(`标准作息: ${reportData.stdHours}小时/日`, 24, curY);
    ctx.textAlign = 'right';
    ctx.fillText(`结算方式: 本地核算清单`, logicW - 24, curY);
    curY += 20;

    drawDashedLine(curY);
    curY += 16;

    ctx.font = 'bold 11.5px "Courier New", Consolas, monospace';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.fillText('日期', 24, curY);
    ctx.fillText('星期', 68, curY);
    ctx.fillText('时段(上班-下班)', 108, curY);
    ctx.textAlign = 'right';
    ctx.fillText('工时', logicW - 96, curY);
    ctx.fillText('小计(元)', logicW - 24, curY);

    curY += 10;
    drawDashedLine(curY);
    curY += 18;

    ctx.font = '11px "Courier New", Consolas, monospace';
    reportData.dailyItems.forEach(item => {
      ctx.textAlign = 'left';
      ctx.fillStyle = item.isWeekend ? '#64748b' : '#0f172a';
      ctx.fillText(item.dayStr, 24, curY);
      ctx.fillText(item.dayOfWeek.replace('周', ''), 72, curY);

      if (item.hasRecord) {
        ctx.fillStyle = '#1e293b';
        ctx.fillText(`${item.inTime}-${item.outTime}`, 108, curY);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(item.status, 108, curY);
      }

      ctx.textAlign = 'right';
      if (item.workedHours > 0) {
        ctx.fillStyle = '#0f172a';
        ctx.fillText(`${item.workedHours.toFixed(1)}`, logicW - 96, curY);
        ctx.fillText(`${item.daySalary.toFixed(2)}`, logicW - 24, curY);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('0.0', logicW - 96, curY);
        ctx.fillText('0.00', logicW - 24, curY);
      }
      curY += rowH;
    });

    curY += 2;
    drawDashedLine(curY);
    curY += 20;

    ctx.font = '12.5px "Courier New", Consolas, monospace';
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'left';
    ctx.fillText('出勤天数:', 24, curY);
    ctx.textAlign = 'right';
    ctx.fillText(`${reportData.attendedDays} 天`, logicW - 24, curY);
    curY += 20;
    ctx.textAlign = 'left';
    ctx.fillText('总计工时:', 24, curY);
    ctx.textAlign = 'right';
    ctx.fillText(`${reportData.totalHours.toFixed(1)} 小时`, logicW - 24, curY);
    curY += 20;
    ctx.textAlign = 'left';
    ctx.fillText('日均工时:', 24, curY);
    ctx.textAlign = 'right';
    ctx.fillText(`${reportData.avgHours.toFixed(1)} 小时`, logicW - 24, curY);
    curY += 20;

    if (reportData.overHours > 0) {
      ctx.textAlign = 'left';
      ctx.fillText('加班工时:', 24, curY);
      ctx.textAlign = 'right';
      ctx.fillText(`+${reportData.overHours.toFixed(1)} 小时`, logicW - 24, curY);
      curY += 20;
    }

    drawDashedLine(curY, true);
    curY += 24;

    ctx.font = 'bold 12px "Courier New", Consolas, monospace';
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText(`实发大写: ${reportData.totalSalaryCn}`, 24, curY);
    curY += 26;

    ctx.font = 'bold 14px "Courier New", Consolas, monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('实付应发金额 TOTAL:', 24, curY);

    ctx.font = 'bold 26px "Courier New", Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`￥${reportData.totalSalary.toFixed(2)}`, logicW - 24, curY + 2);
    curY += 32;

    drawDashedLine(curY);
    curY += 26;

    ctx.textAlign = 'center';
    ctx.font = 'bold 12.5px "Courier New", Consolas, monospace';
    ctx.fillText('*** 感谢您的辛勤付出！***', logicW / 2, curY);
    curY += 18;
    ctx.font = '10px "Courier New", Consolas, monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('请核对打卡工时明细，妥善留存核算小票', logicW / 2, curY);
    curY += 24;

    const barCodeW = logicW - 100;
    const barCodeX = 50;
    const barCodeH = 40;
    ctx.fillStyle = '#0f172a';
    const barPattern = [2, 1, 3, 2, 1, 4, 1, 2, 2, 3, 1, 4, 2, 1, 3, 1, 2, 4, 2, 1, 3, 2, 1, 4, 1, 3, 2, 4, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 4];
    let curBarX = barCodeX;
    barPattern.forEach((w, i) => {
      if (i % 2 === 0) ctx.fillRect(curBarX, curY, w * 1.5, barCodeH);
      curBarX += w * 1.5 + 1.2;
    });

    curY += barCodeH + 16;
    ctx.fillText(`* ${reportData.receiptNo} *`, logicW / 2, curY);

    return canvas;
  }

  // ==================== 版式 2：复古打卡工卡 Canvas 渲染器 ====================
  function renderTimecardCanvas(reportData) {
    const dpr = 2.0;
    const logicW = 540;

    const headerH = 210;
    const tableHeaderH = 40;
    const rowH = 30;
    const rowsCount = reportData.dailyItems.length;
    const footerH = 220;
    const padY = 24;

    const logicH = headerH + tableHeaderH + (rowsCount * rowH) + footerH + padY * 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(logicW * dpr);
    canvas.height = Math.round(logicH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 1. 牛皮纸卡片底衬
    ctx.fillStyle = '#f4ede1';
    ctx.fillRect(0, 0, logicW, logicH);

    // 纸卡工业外边框 (深红褐色双线)
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(18, 18, logicW - 36, logicH - 36);

    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(22, 22, logicW - 44, logicH - 44);

    // 顶部打卡孔 (punch slot)
    ctx.fillStyle = '#e2ded5';
    ctx.beginPath();
    ctx.ellipse(logicW / 2, 22, 32, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2. 票头
    let curY = 48;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#713f12';
    ctx.font = 'bold 22px "Songti SC", "SimSun", serif';
    ctx.fillText('月 度 职 工 考 勤 打 卡 卡 片', logicW / 2, curY);

    curY += 22;
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillStyle = '#a16207';
    ctx.fillText('TIME RECORDER CARD · STANDARD PUNCH RECORD', logicW / 2, curY);

    curY += 28;

    // 工号与人员信息表格栏
    ctx.textAlign = 'left';
    ctx.font = '13px "PingFang SC", sans-serif';
    ctx.fillStyle = '#1e293b';

    ctx.fillText(`卡号: TC-${reportData.year}${String(reportData.month).padStart(2, '0')}-${reportData.attendedDays}`, 36, curY);
    ctx.fillText(`姓名: ${reportData.userName}`, 240, curY);
    ctx.textAlign = 'right';
    ctx.fillText(`计薪标准: ￥${reportData.wageRate.toFixed(2)}/小时`, logicW - 36, curY);

    curY += 24;
    ctx.textAlign = 'left';
    ctx.fillText(`月份: ${reportData.year}年${reportData.month}月`, 36, curY);
    ctx.fillText(`标准工时: ${reportData.stdHours} 小时/天`, 240, curY);
    ctx.textAlign = 'right';
    ctx.fillText(`出勤记录: 针式打卡对齐`, logicW - 36, curY);

    curY += 28;

    // 3. 打卡表格 (经典双栏针打墨水)
    const tblX = 32;
    const tblW = logicW - 64;

    ctx.fillStyle = '#ebd5b3';
    ctx.fillRect(tblX, curY, tblW, tableHeaderH);
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(tblX, curY, tblW, tableHeaderH);

    ctx.fillStyle = '#451a03';
    ctx.font = 'bold 12.5px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('日', tblX + 22, curY + 25);
    ctx.fillText('星期', tblX + 64, curY + 25);
    ctx.fillText('上午 签到', tblX + 138, curY + 25);
    ctx.fillText('下午 签退', tblX + 226, curY + 25);
    ctx.fillText('扣午休', tblX + 296, curY + 25);
    ctx.fillText('实计工时', tblX + 368, curY + 25);
    ctx.fillText('核验签记', tblX + 434, curY + 25);

    curY += tableHeaderH;

    // 逐行打卡 (油墨针打效果)
    ctx.font = 'bold 12px "Courier New", monospace';

    reportData.dailyItems.forEach((item, idx) => {
      if (idx % 2 === 1) {
        ctx.fillStyle = 'rgba(254, 243, 199, 0.45)';
        ctx.fillRect(tblX, curY, tblW, rowH);
      }

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(tblX, curY + rowH);
      ctx.lineTo(tblX + tblW, curY + rowH);
      ctx.stroke();

      // 日期
      ctx.textAlign = 'center';
      ctx.fillStyle = '#451a03';
      ctx.fillText(String(item.dayNum).padStart(2, '0'), tblX + 22, curY + 20);

      // 星期
      ctx.fillStyle = item.isWeekend ? '#92400e' : '#1e293b';
      ctx.fillText(item.dayOfWeek.replace('周', ''), tblX + 64, curY + 20);

      // 签到与签退 (针打蓝印 / 加班红印)
      if (item.hasRecord) {
        ctx.fillStyle = '#1e3a8a'; // 经典复古打卡机深蓝油墨
        ctx.fillText(item.inTime, tblX + 138, curY + 20);
        if (item.status === '超时加班') ctx.fillStyle = '#991b1b'; // 加班采用红墨
        ctx.fillText(item.outTime, tblX + 226, curY + 20);
      } else {
        ctx.fillStyle = '#a8a29e';
        ctx.fillText('--:--', tblX + 138, curY + 20);
        ctx.fillText('--:--', tblX + 226, curY + 20);
      }

      ctx.fillStyle = '#78350f';
      ctx.fillText(item.hasRecord ? `${item.lunchSpan}m` : '--', tblX + 296, curY + 20);

      // 工时
      if (item.workedHours > 0) {
        ctx.fillStyle = item.status === '超时加班' ? '#991b1b' : '#1e3a8a';
        ctx.fillText(`${item.workedHours.toFixed(1)}h`, tblX + 368, curY + 20);
      } else {
        ctx.fillStyle = '#a8a29e';
        ctx.fillText('0.0h', tblX + 368, curY + 20);
      }

      // 核验
      ctx.fillStyle = item.hasRecord ? '#15803d' : '#9ca3af';
      ctx.font = '11px "PingFang SC", sans-serif';
      ctx.fillText(item.hasRecord ? '已核' : '--', tblX + 434, curY + 19);
      ctx.font = 'bold 12px "Courier New", monospace';

      curY += rowH;
    });

    // 表格总外边框
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(tblX, curY - (rowsCount * rowH), tblW, rowsCount * rowH);

    curY += 24;

    // 4. 底部核准签名栏与薪资大字
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tblX, curY, tblW, 76);
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(tblX, curY, tblW, 76);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#451a03';
    ctx.font = 'bold 13px "PingFang SC", sans-serif';
    ctx.fillText(`出勤合计: ${reportData.attendedDays} 天   总工时: ${reportData.totalHours.toFixed(1)} 小时`, tblX + 16, curY + 28);
    ctx.fillText(`应核金额: ${reportData.totalSalaryCn}`, tblX + 16, curY + 54);

    ctx.textAlign = 'right';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillStyle = '#991b1b';
    ctx.fillText(`￥${reportData.totalSalary.toFixed(2)}`, tblX + tblW - 16, curY + 46);

    curY += 98;

    // 签字线与工卡盖章
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, curY + 14);
    ctx.lineTo(210, curY + 14);
    ctx.moveTo(270, curY + 14);
    ctx.lineTo(460, curY + 14);
    ctx.stroke();

    ctx.fillStyle = '#451a03';
    ctx.font = '12px "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('持卡职工签名 (确认领款):', 36, curY + 34);
    ctx.fillText('车间/部门主管核签盖章:', 270, curY + 34);

    return canvas;
  }

  // ==================== 版式 3：现代极简报表 (Bento Swiss) Canvas 渲染器 ====================
  function renderStatementCanvas(reportData) {
    const dpr = 2.0;
    const logicW = 600;

    const headerH = 260;
    const tableHeaderH = 42;
    const rowH = 32;
    const rowsCount = reportData.dailyItems.length;
    const footerH = 160;
    const padY = 28;

    const logicH = headerH + tableHeaderH + (rowsCount * rowH) + footerH + padY * 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(logicW * dpr);
    canvas.height = Math.round(logicH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 1. 现代冷灰白底色
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logicW, logicH);

    let curY = 36;

    // 报表顶栏标题
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('月度工时与报酬结算报告', 32, curY);

    ctx.textAlign = 'right';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`流水号: STMT-${reportData.year}${String(reportData.month).padStart(2, '0')}-${reportData.attendedDays}`, logicW - 32, curY - 2);
    ctx.fillText(`出具时间: ${reportData.printTimeStr}`, logicW - 32, curY + 16);

    curY += 34;

    // 2. Bento 模块化卡片
    // 左侧核心金额大卡
    const bentoCardW = (logicW - 64 - 14) / 2;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(32, curY, bentoCardW, 116, 16);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('当月应付总报酬 TOTAL PAYABLE', 48, curY + 30);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 30px -apple-system, sans-serif';
    ctx.fillText(`￥${reportData.totalSalary.toFixed(2)}`, 48, curY + 70);

    ctx.fillStyle = '#64748b';
    ctx.font = '11.5px -apple-system, sans-serif';
    ctx.fillText(reportData.totalSalaryCn, 48, curY + 96);

    // 右侧指标小卡 (两行两列)
    const rightX = 32 + bentoCardW + 14;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(rightX, curY, bentoCardW, 116, 16);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(`核算对象: ${reportData.userName}`, rightX + 16, curY + 30);
    ctx.fillText(`计薪标准: ￥${reportData.wageRate.toFixed(2)} /小时`, rightX + 16, curY + 54);
    ctx.fillText(`有效出勤: ${reportData.attendedDays} 天   总工时: ${reportData.totalHours.toFixed(1)} h`, rightX + 16, curY + 78);
    ctx.fillText(`日均工时: ${reportData.avgHours.toFixed(1)} h   加班: ${reportData.overHours.toFixed(1)} h`, rightX + 16, curY + 98);

    curY += 138;

    // 3. 瑞士极简明细表格
    const tblX = 32;
    const tblW = logicW - 64;

    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.roundRect(tblX, curY, tblW, tableHeaderH, 10);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12.5px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('日期', tblX + 16, curY + 26);
    ctx.fillText('星期', tblX + 78, curY + 26);
    ctx.fillText('打卡时段', tblX + 138, curY + 26);
    ctx.textAlign = 'right';
    ctx.fillText('工时', tblX + 310, curY + 26);
    ctx.fillText('报酬金额', tblX + 410, curY + 26);
    ctx.fillText('状态', tblX + tblW - 16, curY + 26);

    curY += tableHeaderH + 4;

    // 逐行数据
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    reportData.dailyItems.forEach((item, idx) => {
      if (idx % 2 === 1) {
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(tblX, curY, tblW, rowH);
      }

      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tblX, curY + rowH);
      ctx.lineTo(tblX + tblW, curY + rowH);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = item.isWeekend ? '#94a3b8' : '#0f172a';
      ctx.fillText(item.dayStr, tblX + 16, curY + 20);
      ctx.fillText(item.dayOfWeek, tblX + 78, curY + 20);

      ctx.fillStyle = item.hasRecord ? '#1e293b' : '#94a3b8';
      ctx.fillText(item.hasRecord ? `${item.inTime} - ${item.outTime}` : '--', tblX + 138, curY + 20);

      ctx.textAlign = 'right';
      ctx.fillStyle = item.workedHours > 0 ? '#0f172a' : '#94a3b8';
      ctx.fillText(item.workedHours > 0 ? `${item.workedHours.toFixed(1)} h` : '0.0 h', tblX + 310, curY + 20);

      ctx.fillStyle = item.daySalary > 0 ? '#0f172a' : '#94a3b8';
      ctx.fillText(item.daySalary > 0 ? `￥${item.daySalary.toFixed(2)}` : '￥0.00', tblX + 410, curY + 20);

      // 状态标签
      if (item.status === '正常出勤') ctx.fillStyle = '#15803d';
      else if (item.status === '超时加班') ctx.fillStyle = '#d97706';
      else if (item.status === '周末出勤') ctx.fillStyle = '#2563eb';
      else ctx.fillStyle = '#94a3b8';

      ctx.fillText(item.status, tblX + tblW - 16, curY + 20);

      curY += rowH;
    });

    curY += 24;

    // 4. 底部结算声明
    ctx.textAlign = 'left';
    ctx.font = '11.5px -apple-system, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('财务结算说明：', 32, curY);
    ctx.fillText('1. 本单据系根据日常出勤签到记录自动核算生成；已扣除午间休息。', 32, curY + 18);
    ctx.fillText('2. 标准工时与时薪数据经过本地加密持久化，具有对账凭据参考效力。', 32, curY + 36);

    return canvas;
  }

  // ==================== 版式 4：日历热力手账 (Heatmap Journal) Canvas 渲染器 ====================
  function renderCalendarCanvas(reportData) {
    const dpr = 2.0;
    const logicW = 560;

    const headerH = 170;
    const calGridH = 430; // 7列整月日历方块网格
    const statCardsH = 160;
    const padY = 24;

    const logicH = headerH + calGridH + statCardsH + padY * 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(logicW * dpr);
    canvas.height = Math.round(logicH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 1. 温暖手账微黄底衬
    ctx.fillStyle = '#faf9f6';
    ctx.fillRect(0, 0, logicW, logicH);

    // 手账装饰双框
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, 18, logicW - 36, logicH - 36);

    let curY = 46;

    // 月份大标题与打卡印章
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px "PingFang SC", sans-serif';
    ctx.fillText(`${reportData.year}年${reportData.month}月 出勤热力图鉴`, 36, curY);

    curY += 22;
    ctx.font = '12px "PingFang SC", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`核算对象: ${reportData.userName}   出勤天数: ${reportData.attendedDays}/${reportData.daysInMonth}天   总工时: ${reportData.totalHours}小时`, 36, curY);

    curY += 28;

    // 2. 7 列日历热力网格
    const colCount = 7;
    const cellGap = 8;
    const gridW = logicW - 72;
    const cellW = (gridW - (colCount - 1) * cellGap) / colCount;
    const cellH = 54;

    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    ctx.font = 'bold 12px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';

    for (let c = 0; c < colCount; c++) {
      const x = 36 + c * (cellW + cellGap) + cellW / 2;
      ctx.fillStyle = (c === 0 || c === 6) ? '#f97316' : '#64748b';
      ctx.fillText(weekDays[c], x, curY);
    }

    curY += 14;

    // 绘制日历网格单元
    const firstCol = reportData.firstDayWeekIndex; // 1号的列偏移
    let curCol = firstCol;
    let gridRowY = curY;

    // 映射日期 map
    const dayMap = {};
    reportData.dailyItems.forEach(it => dayMap[it.dayNum] = it);

    for (let day = 1; day <= reportData.daysInMonth; day++) {
      const it = dayMap[day];
      const x = 36 + curCol * (cellW + cellGap);
      const y = gridRowY;

      // 方块底色 (根据工时热力)
      if (it && it.hasRecord) {
        if (it.workedHours >= reportData.stdHours) {
          ctx.fillStyle = '#dcfce7'; // 充实满勤：柔和翡翠绿
          ctx.strokeStyle = '#86efac';
        } else {
          ctx.fillStyle = '#fef3c7'; // 半勤：柔和琥珀金
          ctx.strokeStyle = '#fde047';
        }
      } else {
        ctx.fillStyle = '#ffffff'; // 未打卡：浅白
        ctx.strokeStyle = '#e2e8f0';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, cellW, cellH, 8);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();

      // 日期号
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 10.5px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(day), x + 6, y + 16);

      // 工时大字
      if (it && it.hasRecord) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 13px -apple-system, sans-serif';
        ctx.fillText(`${it.workedHours.toFixed(1)}h`, x + cellW / 2, y + 34);

        ctx.fillStyle = '#15803d';
        ctx.font = '9.5px -apple-system, sans-serif';
        ctx.fillText(`￥${Math.round(it.daySalary)}`, x + cellW / 2, y + 46);
      } else {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.fillText('--', x + cellW / 2, y + 36);
      }

      curCol++;
      if (curCol >= colCount) {
        curCol = 0;
        gridRowY += cellH + cellGap;
      }
    }

    curY = gridRowY + cellH + 24;

    // 3. 底部手账记账大卡片
    const statW = logicW - 72;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(36, curY, statW, 96, 14);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '12px "PingFang SC", sans-serif';
    ctx.fillText('月度报酬结算金额', 54, curY + 34);
    ctx.fillText(reportData.totalSalaryCn, 54, curY + 74);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#b91c1c';
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.fillText(`￥${reportData.totalSalary.toFixed(2)}`, 36 + statW - 20, curY + 48);

    ctx.fillStyle = '#15803d';
    ctx.font = 'bold 12px "PingFang SC", sans-serif';
    ctx.fillText(`日均 ${reportData.avgHours} 小时 · 时薪 ￥${reportData.wageRate}/h`, 36 + statW - 20, curY + 74);

    return canvas;
  }

  // ==================== 版式 5：胶带记账便签 (Sticky Note) Canvas 渲染器 ====================
  function renderMemoCanvas(reportData) {
    const dpr = 2.0;
    const logicW = 500;

    const tapeH = 24;
    const headerH = 140;
    const itemH = 26;
    const rowsCount = reportData.dailyItems.length;
    const footerH = 170;
    const padY = 20;

    const logicH = tapeH + headerH + (rowsCount * itemH) + footerH + padY * 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(logicW * dpr);
    canvas.height = Math.round(logicH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 1. 便签浅鹅黄底色
    ctx.fillStyle = '#fefce8';
    ctx.fillRect(0, 16, logicW, logicH - 32);

    // 细致网格微点阵背景
    ctx.fillStyle = 'rgba(217, 119, 6, 0.08)';
    for (let x = 16; x < logicW; x += 18) {
      for (let y = 30; y < logicH - 32; y += 18) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    // 顶部半透明斜条纹手撕胶带 (Washi Tape)
    const tapeW = 160;
    const tapeX = (logicW - tapeW) / 2;
    ctx.fillStyle = 'rgba(125, 211, 252, 0.72)'; // 冰蓝半透明胶带
    ctx.fillRect(tapeX, 6, tapeW, 20);

    ctx.strokeStyle = 'rgba(14, 165, 233, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tapeX, 6, tapeW, 20);

    let curY = 54;

    // 便签手记标题
    ctx.textAlign = 'center';
    ctx.fillStyle = '#78350f';
    ctx.font = 'bold 20px "PingFang SC", "Kaiti SC", serif';
    ctx.fillText(`${reportData.month}月工时结算备忘便笺`, logicW / 2, curY);

    curY += 22;
    ctx.font = '12px "PingFang SC", sans-serif';
    ctx.fillStyle = '#92400e';
    ctx.fillText(`记账人: ${reportData.userName}   时薪: ￥${reportData.wageRate}/小时`, logicW / 2, curY);

    curY += 18;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(32, curY);
    ctx.lineTo(logicW - 32, curY);
    ctx.stroke();
    ctx.setLineDash([]);

    curY += 22;

    // 便笺单行条目
    ctx.font = '12px -apple-system, sans-serif';
    reportData.dailyItems.forEach(item => {
      ctx.textAlign = 'left';
      if (item.hasRecord) {
        ctx.fillStyle = '#451a03';
        ctx.fillText(`[出勤] ${item.dayStr} ${item.dayOfWeek}`, 36, curY);
        ctx.fillStyle = '#78350f';
        ctx.fillText(`${item.inTime}-${item.outTime}`, 154, curY);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#b45309';
        ctx.fillText(`${item.workedHours.toFixed(1)}h · ￥${item.daySalary.toFixed(2)}`, logicW - 36, curY);
      } else {
        ctx.fillStyle = '#b45309';
        ctx.globalAlpha = 0.45;
        ctx.fillText(`[未卡] ${item.dayStr} ${item.dayOfWeek}`, 36, curY);
        ctx.fillText(item.status, 154, curY);
        ctx.textAlign = 'right';
        ctx.fillText('--', logicW - 36, curY);
        ctx.globalAlpha = 1.0;
      }
      curY += itemH;
    });

    curY += 12;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(32, curY);
    ctx.lineTo(logicW - 32, curY);
    ctx.stroke();
    ctx.setLineDash([]);

    curY += 28;

    // 荧光划线高亮实收金额
    const sumX = 36;
    const sumW = logicW - 72;
    ctx.fillStyle = '#fef08a'; // 荧光笔高亮黄色
    ctx.beginPath();
    ctx.roundRect(sumX, curY - 14, sumW, 64, 8);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#78350f';
    ctx.font = 'bold 13px "PingFang SC", sans-serif';
    ctx.fillText(`当月结算实收 (${reportData.attendedDays}天 / ${reportData.totalHours}h):`, sumX + 16, curY + 14);
    ctx.fillText(`金额大写: ${reportData.totalSalaryCn}`, sumX + 16, curY + 36);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#b91c1c';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.fillText(`￥${reportData.totalSalary.toFixed(2)}`, sumX + sumW - 16, curY + 28);

    curY += 76;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#92400e';
    ctx.font = '11.5px "PingFang SC", sans-serif';
    ctx.fillText('记得按时结算，辛劳一个月，好好犒劳自己！', logicW / 2, curY);

    return canvas;
  }

  // ==================== 主题注册表 ====================
  const ThemeRegistry = {
    receipt: {
      id: 'receipt',
      name: '热敏收银小票（经典凭单）',
      renderCanvas: renderReceiptCanvas
    },
    timecard: {
      id: 'timecard',
      name: '复古打卡工卡（机械纸卡）',
      renderCanvas: renderTimecardCanvas
    },
    statement: {
      id: 'statement',
      name: '现代极简报表（商务对账）',
      renderCanvas: renderStatementCanvas
    },
    calendar: {
      id: 'calendar',
      name: '日历热力手账（出勤图鉴）',
      renderCanvas: renderCalendarCanvas
    },
    memo: {
      id: 'memo',
      name: '胶带记账便签（随身手账）',
      renderCanvas: renderMemoCanvas
    }
  };

  // 生成并下载高清小票长图 (PNG)
  function exportLongImage(reportData, themeId = 'receipt') {
    const theme = ThemeRegistry[themeId] || ThemeRegistry.receipt;
    const canvas = theme.renderCanvas(reportData);

    return new Promise(resolve => {
      canvas.toBlob(blob => {
        if (!blob) {
          resolve(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const themeLabel = theme.name.split('（')[0];
        a.download = `工时结算-${themeLabel}-${reportData.year}年${reportData.month}月-${reportData.userName}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        resolve(true);
      }, 'image/png');
    });
  }

  // 生成并下载标准 Excel / CSV 表格
  function exportExcelCsv(reportData) {
    const lines = [];

    // 1. 表头汇总
    lines.push(`"工时与薪资结算单"`);
    lines.push(`"核算对象","${reportData.userName}","打印时间","${reportData.printTimeStr}"`);
    lines.push(`"计薪周期","${reportData.periodStr}","单号","${reportData.receiptNo}"`);
    lines.push(`"时薪单价","￥${reportData.wageRate.toFixed(2)} 元/小时","标准日工时","${reportData.stdHours} 小时"`);
    lines.push(`"出勤天数","${reportData.attendedDays} 天","总计工时","${reportData.totalHours} 小时"`);
    lines.push(`"应发实付金额","￥${reportData.totalSalary.toFixed(2)}","大写金额","${reportData.totalSalaryCn}"`);
    lines.push('');

    // 2. 每日明细表头
    lines.push(`"日期","星期","上班时间","下班时间","扣除午休(分钟)","计入工时(小时)","当日薪资(元)","考勤状态","备注"`);

    // 3. 每日明细行
    reportData.dailyItems.forEach(item => {
      const row = [
        `"${item.dateKey}"`,
        `"${item.dayOfWeek}"`,
        `"${item.inTime}"`,
        `"${item.outTime}"`,
        `"${item.hasRecord ? item.lunchSpan : 0}"`,
        `"${item.workedHours.toFixed(1)}"`,
        `"${item.daySalary.toFixed(2)}"`,
        `"${item.status}"`,
        `"${(item.note || '').replace(/"/g, '""')}"`
      ];
      lines.push(row.join(','));
    });

    // 4. 底部合计行
    lines.push('');
    lines.push(`"合计","","","","","${reportData.totalHours.toFixed(1)}","${reportData.totalSalary.toFixed(2)}","共出勤 ${reportData.attendedDays} 天",""`);

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `工时薪资明细-${reportData.year}年${reportData.month}月-${reportData.userName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  }

  // 暴露到全局
  window.SalaryExporter = {
    computeMonthReportData,
    renderReceiptCanvas,
    renderTimecardCanvas,
    renderStatementCanvas,
    renderCalendarCanvas,
    renderMemoCanvas,
    renderInvoiceCanvas: renderReceiptCanvas,
    exportLongImage,
    exportExcelCsv,
    ThemeRegistry
  };
})();
