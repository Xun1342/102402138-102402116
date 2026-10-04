/**
 * data.js — 数据模型、示例数据与本地持久化
 *
 * 失物招领平台采用 localStorage 实现本地数据持久化：
 * - 首次打开时生成示例数据（seed）并写入 localStorage；
 * - 用户发布的寻物/招领信息、状态修改都会保存到 localStorage；
 * - 刷新或重新打开页面后数据不丢失。
 *
 * 数据模型（每条信息）：
 * {
 *   id: string,          // 唯一标识
 *   type: 'lost'|'found' // 寻物 / 招领
 *   name: string,        // 物品名称
 *   category: string,    // 物品分类
 *   location: string,    // 遗失/拾获地点
 *   time: string,        // 遗失/拾获时间（datetime-local 格式）
 *   description: string, // 详细描述
 *   contact: string,     // 发布者联系方式（微信号）
 *   photo: string|null,  // 物品照片（base64 dataURL），未上传为 null
 *   status: 'active'|'resolved', // 进行中 / 已解决（已找回·已归还）
 *   createdAt: number    // 发布时间戳
 * }
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'lostfound_items_v1';

  /** 物品分类常量 */
  var CATEGORIES = [
    '校园卡/证件',
    '电子设备',
    '书籍文具',
    '钥匙',
    '水杯雨伞',
    '衣物饰品',
    '其他'
  ];

  /**
   * 生成示例数据。
   * 时间字段基于当前时间动态偏移，保证首次打开时呈现"今天/昨天"等相对时间，
   * 与原型效果一致；生成后写入 localStorage，后续固定不变。
   */
  function buildSeedItems() {
    var now = Date.now();
    var H = 3600 * 1000;
    var D = 24 * H;
    function iso(d) {
      var dt = new Date(d);
      function p(n) { return (n < 10 ? '0' : '') + n; }
      return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()) +
        'T' + p(dt.getHours()) + ':' + p(dt.getMinutes());
    }
    return [
      {
        id: 'seed_001',
        type: 'lost',
        name: '蓝色校园卡',
        category: '校园卡/证件',
        location: '第三教学楼302教室',
        time: iso(now - 2 * H),
        description: '卡面为蓝色，正面贴有小恐龙贴纸，学号尾号316。对我很重要，如有捡到请联系我，非常感谢！',
        contact: 'wxid_xxx123',
        photo: null,
        status: 'active',
        createdAt: now - 2 * H
      },
      {
        id: 'seed_002',
        type: 'found',
        name: '黑色雨伞',
        category: '水杯雨伞',
        location: '图书馆门口',
        time: iso(now - 1 * D - 3 * H),
        description: '黑色折叠伞，伞柄有磨损痕迹，伞套还在。已放在图书馆一楼服务台，失主可凭描述认领。',
        contact: 'wxid_yu_san',
        photo: null,
        status: 'active',
        createdAt: now - 1 * D - 3 * H
      },
      {
        id: 'seed_003',
        type: 'lost',
        name: '白色AirPods耳机',
        category: '电子设备',
        location: '操场跑道',
        time: iso(now - 1 * D - 4 * H),
        description: '白色 AirPods 一代，充电仓背面有刻字"WZX"。晚上在操场跑步时遗失，如有捡到必有重谢！',
        contact: 'wzx_2024',
        photo: null,
        status: 'active',
        createdAt: now - 1 * D - 4 * H
      },
      {
        id: 'seed_004',
        type: 'found',
        name: '一串钥匙（含小熊挂件）',
        category: '钥匙',
        location: '食堂二楼',
        time: iso(now - 12 * H),
        description: '一串钥匙，挂着小熊玩偶挂件，共4把钥匙+1个U盘。捡到后交给食堂二楼窗口阿姨了。',
        contact: 'canteen_li',
        photo: null,
        status: 'active',
        createdAt: now - 12 * H
      },
      {
        id: 'seed_005',
        type: 'lost',
        name: '高数教材一本',
        category: '书籍文具',
        location: '自习室B区',
        time: iso(now - 3 * H),
        description: '《高等数学（同济第七版）》上册，扉页写有名字"吴政迅"和联系方式，里面夹着课堂笔记。',
        contact: 'wzx_2024',
        photo: null,
        status: 'active',
        createdAt: now - 3 * H
      },
      {
        id: 'seed_006',
        type: 'found',
        name: '保温水杯',
        category: '水杯雨伞',
        location: '教学楼A栋一楼',
        time: iso(now - 3 * D),
        description: '银色保温杯，杯身贴有卡通贴纸，内胆完好。已放置在教学楼A栋值班室。',
        contact: 'keep_cup',
        photo: null,
        status: 'resolved',
        createdAt: now - 3 * D
      },
      {
        id: 'seed_007',
        type: 'lost',
        name: '学生证',
        category: '校园卡/证件',
        location: '食堂门口',
        time: iso(now - 4 * D),
        description: '蓝色学生证，内有校园卡充值记录。已找回，感谢拾到的同学！',
        contact: 'stu_card',
        photo: null,
        status: 'resolved',
        createdAt: now - 4 * D
      }
    ];
  }

  /**
   * 读取全部信息。
   * 优先从 localStorage 读取；无数据时生成示例数据；localStorage 不可用时退回内存。
   */
  function loadItems() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) { return parsed; }
      }
    } catch (e) { /* localStorage 不可用或数据损坏，退回内存 */ }
    var seed = buildSeedItems();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    } catch (e) { /* 忽略写入失败 */ }
    return seed;
  }

  /** 保存全部信息到 localStorage（失败时静默降级为内存态） */
  function saveItems(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 生成唯一 id */
  function genId() {
    return 'it_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** 创建一个新的信息对象 */
  function createItem(form) {
    return {
      id: genId(),
      type: form.type,
      name: (form.name || '').trim(),
      category: form.category || '其他',
      location: (form.location || '').trim(),
      time: form.time || '',
      description: (form.description || '').trim(),
      contact: (form.contact || '').trim(),
      photo: form.photo || null,
      status: 'active',
      createdAt: Date.now()
    };
  }

  global.LFData = {
    CATEGORIES: CATEGORIES,
    STORAGE_KEY: STORAGE_KEY,
    loadItems: loadItems,
    saveItems: saveItems,
    createItem: createItem,
    genId: genId
  };
})(window);
