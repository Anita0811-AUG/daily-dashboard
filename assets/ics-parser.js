// ics-parser.js — 轻量 ICS 日历解析器（纯前端，无需后端）
(function() {
  'use strict';

  /**
   * 解析 ICS 文本，返回事件数组
   */
  function parseICS(icsText) {
    // 1. 行展开（ICS 用 CRLF + 空格/Tab 表示续行）
    var lines = icsText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var unfolded = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.charAt(0) === ' ' || line.charAt(0) === '\t') {
        if (unfolded.length > 0) {
          unfolded[unfolded.length - 1] += line.substring(1);
        }
      } else {
        unfolded.push(line);
      }
    }

    // 2. 解析 VEVENT 块
    var events = [];
    var current = null;
    for (var j = 0; j < unfolded.length; j++) {
      var l = unfolded[j];
      if (l === 'BEGIN:VEVENT') {
        current = {};
      } else if (l === 'END:VEVENT') {
        if (current) events.push(current);
        current = null;
      } else if (current) {
        var colonIdx = l.indexOf(':');
        if (colonIdx === -1) continue;
        var propPart = l.substring(0, colonIdx);
        var valuePart = l.substring(colonIdx + 1);
        // 解析属性名和参数（如 DTSTART;TZID=...:20260801T150000）
        var semiIdx = propPart.indexOf(';');
        var propName = semiIdx === -1 ? propPart : propPart.substring(0, semiIdx);
        var params = {};
        if (semiIdx !== -1) {
          var paramStr = propPart.substring(semiIdx + 1);
          paramStr.split(';').forEach(function(p) {
            var eq = p.indexOf('=');
            if (eq !== -1) {
              params[p.substring(0, eq)] = p.substring(eq + 1);
            }
          });
        }
        current[propName] = { value: valuePart, params: params };
      }
    }
    return events;
  }

  /**
   * 解析 ICS 日期时间值
   * 格式: 20260801T150000 (本地) 或 20260801T070000Z (UTC) 或 20260801 (全天)
   * 返回 Date 对象
   */
  function parseICSDate(value, params) {
    // 全天事件: YYYYMMDD
    if (value.length === 8 && value.indexOf('T') === -1) {
      var y = parseInt(value.substring(0, 4), 10);
      var m = parseInt(value.substring(4, 6), 10) - 1;
      var d = parseInt(value.substring(6, 8), 10);
      return new Date(y, m, d);
    }
    // 带时间的: YYYYMMDDTHHMMSS 或 YYYYMMDDTHHMMSSZ
    var isUTC = value.charAt(value.length - 1) === 'Z';
    var dateStr = isUTC ? value.substring(0, value.length - 1) : value;
    var year = parseInt(dateStr.substring(0, 4), 10);
    var month = parseInt(dateStr.substring(4, 6), 10) - 1;
    var day = parseInt(dateStr.substring(6, 8), 10);
    var hour = parseInt(dateStr.substring(9, 11), 10);
    var minute = parseInt(dateStr.substring(11, 13), 10);
    var second = parseInt(dateStr.substring(13, 15), 10) || 0;

    if (isUTC) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
    // 如果有 TZID 参数，先按 UTC 解析再转换（简化处理：按本地时间）
    // 注意：完整时区处理需要 tz database，这里用简化方案
    return new Date(year, month, day, hour, minute, second);
  }

  /**
   * 检查事件是否在今天发生（处理重复事件）
   */
  function isEventToday(ev, todayStart, todayEnd) {
    var dtstart = ev.DTSTART;
    var dtend = ev.DTEND;
    if (!dtstart) return false;

    var start = parseICSDate(dtstart.value, dtstart.params);
    var end = dtend ? parseICSDate(dtend.value, dtend.params) : new Date(start.getTime() + 3600000);

    var allDay = dtstart.value.length === 8 && dtstart.value.indexOf('T') === -1;

    // 非重复事件：检查是否与今天重叠
    if (!ev.RRULE) {
      return start < todayEnd && end > todayStart;
    }

    // 重复事件处理
    var rrule = ev.RRULE.value;
    var freq = '';
    var interval = 1;
    var until = null;
    var byday = null;

    rrule.split(';').forEach(function(part) {
      var eq = part.indexOf('=');
      if (eq === -1) return;
      var key = part.substring(0, eq);
      var val = part.substring(eq + 1);
      if (key === 'FREQ') freq = val;
      else if (key === 'INTERVAL') interval = parseInt(val, 10);
      else if (key === 'UNTIL') until = parseICSDate(val, {});
      else if (key === 'BYDAY') byday = val.split(',');
    });

    if (until && until < todayStart) return false;

    var duration = end.getTime() - start.getTime();
    var current = new Date(start);

    // 最多迭代 365 次（一年）防止死循环
    for (var i = 0; i < 366 && current <= todayEnd; i++) {
      var currentEnd = new Date(current.getTime() + duration);
      if (current < todayEnd && currentEnd > todayStart) {
        return true;
      }
      // 按频率推进
      if (freq === 'DAILY') {
        current.setDate(current.getDate() + interval);
      } else if (freq === 'WEEKLY') {
        // 如果有 BYDAY，检查今天是否在指定日期
        if (byday) {
          var dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
          var todayDay = new Date(current);
          // 找本周内的匹配日
          for (var d = 0; d < 7; d++) {
            if (byday.some(function(b) { return dayMap[b] === todayDay.getDay(); })) {
              var dayEnd = new Date(todayDay.getTime() + duration);
              if (todayDay < todayEnd && dayEnd > todayStart) return true;
            }
            todayDay.setDate(todayDay.getDate() + 1);
          }
          current.setDate(current.getDate() + 7 * interval);
        } else {
          current.setDate(current.getDate() + 7 * interval);
        }
      } else if (freq === 'MONTHLY') {
        current.setMonth(current.getMonth() + interval);
      } else if (freq === 'YEARLY') {
        current.setFullYear(current.getFullYear() + interval);
      } else {
        break;
      }
    }
    return false;
  }

  /**
   * 从事件列表中提取今日事件
   */
  function getTodayEvents(events) {
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    var todayEnd = new Date(todayStart.getTime() + 86400000);

    var results = [];
    events.forEach(function(ev) {
      if (!isEventToday(ev, todayStart, todayEnd)) return;

      var dtstart = ev.DTSTART;
      var dtend = ev.DTEND;
      var allDay = dtstart && dtstart.value.length === 8 && dtstart.value.indexOf('T') === -1;

      var startTime = '';
      var endTime = '';

      if (!allDay && dtstart) {
        var start = parseICSDate(dtstart.value, dtstart.params);
        // 转为本地时间显示
        startTime = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0');
        if (dtend) {
          var end = parseICSDate(dtend.value, dtend.params);
          endTime = String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
        }
      }

      results.push({
        title: ev.SUMMARY ? ev.SUMMARY.value : '未命名事件',
        startTime: startTime,
        endTime: endTime,
        allDay: allDay,
        location: ev.LOCATION ? ev.LOCATION.value : ''
      });
    });

    // 排序：全天在前，然后按时间
    results.sort(function(a, b) {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return (a.startTime || '23:59').localeCompare(b.startTime || '23:59');
    });

    return results;
  }

  // 暴露 API
  window.ICSParser = {
    parse: parseICS,
    getTodayEvents: getTodayEvents
  };
})();
