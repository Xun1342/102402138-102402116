/**
 * core.js — 核心业务逻辑（纯函数）
 *
 * 所有不依赖 DOM 的业务规则集中在此文件，便于单元测试：
 * 表单校验、关键词搜索、分类筛选、状态标记、统计、格式化等。
 */
(function (global) {
  'use strict';

  var TYPES = ['lost', 'found'];

  /** 状态文案：寻物 → 寻找中/已找回；招领 → 待认领/已归还 */
  function statusText(item) {
    if (!item) { return ''; }
    if (item.status === 'resolved') {
      return item.type === 'lost' ? '已找回' : '已归还';
    }
    return item.type === 'lost' ? '寻找中' : '待认领';
  }

  /** 类型文案：lost → 寻物；found → 招领 */
  function typeText(type) {
    return type === 'lost' ? '寻物' : '招领';
  }

  /** 将 "2026-09-27T10:30" 格式化为 "2026-09-27 10:30"；空值返回 '' */
  function formatItemTime(timeStr) {
    if (!timeStr) { return ''; }
    return String(timeStr).replace('T', ' ');
  }

  /**
   * 校验发布表单。
   * @param {Object} form {type,name,category,location,time,contact,description}
   * @returns {{ok:boolean, errors:Object}} errors 以字段名为键，值为错误提示
   */
  function validatePublish(form) {
    var errors = {};
    form = form || {};
    if (TYPES.indexOf(form.type) === -1) {
      errors.type = '请选择信息类型（寻物/招领）';
    }
    if (!form.name || !String(form.name).trim()) {
      errors.name = '请填写物品名称';
    } else if (String(form.name).trim().length > 30) {
      errors.name = '物品名称不能超过30个字';
    }
    if (!form.location || !String(form.location).trim()) {
      errors.location = '请填写遗失/拾获地点';
    }
    if (!form.time) {
      errors.time = '请选择遗失/拾获时间';
    }
    if (!form.contact || !String(form.contact).trim()) {
      errors.contact = '请填写联系方式（微信号）';
    } else if (String(form.contact).trim().length > 50) {
      errors.contact = '联系方式不能超过50个字符';
    }
    if (form.description && String(form.description).trim().length > 500) {
      errors.description = '描述不能超过500个字';
    }
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  /**
   * 判断单条信息是否命中关键词。
   * 匹配范围：物品名称、地点、分类、描述；忽略首尾空格、大小写不敏感。
   */
  function isKeywordMatch(item, keyword) {
    var kw = String(keyword || '').trim().toLowerCase();
    if (!kw) { return true; }
    var haystack = [
      item.name, item.location, item.category, item.description
    ].join(' ').toLowerCase();
    return haystack.indexOf(kw) !== -1;
  }

  /**
   * 搜索信息。
   * @param {Array} items 信息列表
   * @param {string} keyword 关键词（可为空）
   * @param {string} type 'all' | 'lost' | 'found'
   * @param {string} category 分类（可为空字符串表示不限）
   * @returns {Array} 按发布时间倒序的结果
   */
  function searchItems(items, keyword, type, category) {
    var list = Array.isArray(items) ? items : [];
    var result = list.filter(function (item) {
      if (type !== 'all' && item.type !== type) { return false; }
      if (category && item.category !== category) { return false; }
      if (!isKeywordMatch(item, keyword)) { return false; }
      return true;
    });
    result.sort(function (a, b) { return b.createdAt - a.createdAt; });
    return result;
  }

  /**
   * 按 id 查找信息。
   * @returns {Object|null}
   */
  function getItemById(items, id) {
    var list = Array.isArray(items) ? items : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { return list[i]; }
    }
    return null;
  }

  /**
   * 将信息标记为"已解决"（寻物→已找回，招领→已归还）。
   * 纯函数：返回新数组，不修改入参。重复标记为幂等操作。
   * @returns {{items:Array, changed:boolean}}
   */
  function markResolved(items, id) {
    var list = Array.isArray(items) ? items : [];
    var changed = false;
    var next = list.map(function (item) {
      if (item.id === id && item.status !== 'resolved') {
        changed = true;
        return Object.assign({}, item, { status: 'resolved' });
      }
      return item;
    });
    return { items: next, changed: changed };
  }

  /**
   * 统计某类型发布的数量。
   * @param {Array} items 全部信息
   * @param {string} type 'lost' | 'found'
   * @returns {{total:number, active:number, resolved:number}}
   */
  function statsByType(items, type) {
    var list = Array.isArray(items) ? items : [];
    var total = 0, active = 0, resolved = 0;
    list.forEach(function (item) {
      if (item.type !== type) { return; }
      total++;
      if (item.status === 'resolved') { resolved++; } else { active++; }
    });
    return { total: total, active: active, resolved: resolved };
  }

  /** 相对时间文案：几分钟前 / 今天 / 昨天 / N天前 */
  function relativeTime(ts) {
    if (!ts) { return ''; }
    var diff = Date.now() - ts;
    if (diff < 60 * 1000) { return '刚刚'; }
    if (diff < 60 * 60 * 1000) { return Math.floor(diff / 60000) + '分钟前'; }
    var d = new Date(ts);
    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) { return '今天' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    var yest = new Date(now.getTime() - 24 * 3600 * 1000);
    var isYest = d.getFullYear() === yest.getFullYear() &&
      d.getMonth() === yest.getMonth() && d.getDate() === yest.getDate();
    if (isYest) { return '昨天' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** 物品图标：按分类返回 emoji */
  function categoryIcon(category) {
    var map = {
      '校园卡/证件': '🪪',
      '电子设备': '🎧',
      '书籍文具': '📚',
      '钥匙': '🔑',
      '水杯雨伞': '☔',
      '衣物饰品': '🧥'
    };
    return map[category] || '🎒';
  }

  global.LFCore = {
    TYPES: TYPES,
    statusText: statusText,
    typeText: typeText,
    formatItemTime: formatItemTime,
    validatePublish: validatePublish,
    isKeywordMatch: isKeywordMatch,
    searchItems: searchItems,
    getItemById: getItemById,
    markResolved: markResolved,
    statsByType: statsByType,
    relativeTime: relativeTime,
    categoryIcon: categoryIcon
  };
})(window);
