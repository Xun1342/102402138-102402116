/**
 * test.js — 单元测试用例
 *
 * 测试对象：js/core.js（业务规则）与 js/data.js（数据模型）。
 * 设计方法：以白盒测试为主（覆盖每个函数的正常、边界、异常分支），
 * 共 30 个测试用例，覆盖：表单校验、关键词搜索、类型/分类筛选、
 * 状态标记、ID 查询、统计、格式化、数据创建等。
 *
 * 运行方式：直接用谷歌浏览器打开 test/test.html 即可查看测试结果。
 */
(function () {
  'use strict';

  var Core = window.LFCore;
  var Data = window.LFData;

  /* ---------------- 极简断言框架 ---------------- */
  var passed = 0;
  var failed = 0;
  var failures = [];

  function run(name, fn) {
    try {
      fn();
      passed++;
      log(name, true);
    } catch (e) {
      failed++;
      failures.push({ name: name, msg: e.message });
      log(name, false, e.message);
    }
  }

  function assert(cond, msg) {
    if (!cond) { throw new Error(msg || '断言失败'); }
  }
  function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error((msg || '值不相等') + '：期望 [' + expected + ']，实际 [' + actual + ']');
    }
  }
  function assertDeepEqual(actual, expected, msg) {
    var a = JSON.stringify(actual);
    var e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error((msg || '对象不相等') + '：期望 ' + e + '，实际 ' + a);
    }
  }

  function log(name, ok, msg) {
    var li = document.createElement('li');
    li.innerHTML = '<span class="badge ' + (ok ? 'p' : 'f') + '">' + (ok ? '✓' : '✗') + '</span>' +
      '<span>' + name + '</span>' +
      (msg ? '<span class="msg">' + msg + '</span>' : '');
    document.getElementById('results').appendChild(li);
  }

  function renderSummary() {
    var box = document.getElementById('summary');
    box.className = 'summary ' + (failed === 0 ? 'pass' : 'fail');
    box.innerHTML = '共 <b>' + (passed + failed) + '</b> 个用例：通过 <b class="pass-num">' + passed +
      '</b>，失败 <b class="fail-num">' + failed + '</b>' +
      (failed === 0 ? ' —— 全部通过 ✓' : ' —— 存在失败，请检查！');
  }

  /* ---------------- 测试数据构造 ---------------- */
  function makeItem(over) {
    var base = {
      id: 'it_test',
      type: 'lost',
      name: '蓝色校园卡',
      category: '校园卡/证件',
      location: '第三教学楼302教室',
      time: '2026-09-27T10:30',
      description: '卡面为蓝色，正面贴有小恐龙贴纸',
      contact: 'wxid_test',
      photo: null,
      status: 'active',
      createdAt: 1000
    };
    var obj = Object.assign({}, base);
    if (over) { Object.assign(obj, over); }
    return obj;
  }

  function validForm() {
    return {
      type: 'lost',
      name: '蓝色校园卡',
      category: '校园卡/证件',
      location: '第三教学楼',
      time: '2026-09-27T10:30',
      description: '卡面为蓝色',
      contact: 'wxid_test'
    };
  }

  /* =========================================================
     一、表单校验 validatePublish
     ========================================================= */
  run('1. 合法表单校验通过', function () {
    assert(Core.validatePublish(validForm()).ok === true);
  });

  run('2. 缺少物品名称 → 校验失败并提示', function () {
    var f = validForm(); f.name = '';
    var r = Core.validatePublish(f);
    assertEqual(r.ok, false);
    assert(!!r.errors.name, '应提示物品名称缺失');
  });

  run('3. 名称为空白字符 → 校验失败', function () {
    var f = validForm(); f.name = '   ';
    var r = Core.validatePublish(f);
    assertEqual(r.ok, false);
    assert(!!r.errors.name);
  });

  run('4. 名称超过30字 → 校验失败', function () {
    var f = validForm(); f.name = new Array(32).join('长');
    var r = Core.validatePublish(f);
    assertEqual(r.ok, false);
    assert(!!r.errors.name);
  });

  run('5. 缺少地点 → 校验失败', function () {
    var f = validForm(); f.location = '';
    var r = Core.validatePublish(f);
    assertEqual(r.ok, false);
    assert(!!r.errors.location);
  });

  run('6. 缺少时间 → 校验失败', function () {
    var f = validForm(); f.time = '';
    var r = Core.validatePublish(f);
    assertEqual(r.ok, false);
    assert(!!r.errors.time);
  });

  run('7. 缺少联系方式 → 校验失败', function () {
    var f = validForm(); f.contact = '';
    var r = Core.validatePublish(f);
    assertEqual(r.ok, false);
    assert(!!r.errors.contact);
  });

  run('8. 联系方式超过50字符 → 校验失败', function () {
    var f = validForm(); f.contact = new Array(52).join('a');
    var r = Core.validatePublish(f);
    assertEqual(r.ok, false);
    assert(!!r.errors.contact);
  });

  run('9. 非法类型 → 校验失败', function () {
    var f = validForm(); f.type = 'hack';
    var r = Core.validatePublish(f);
    assertEqual(r.ok, false);
    assert(!!r.errors.type);
  });

  run('10. 描述超过500字 → 校验失败', function () {
    var f = validForm(); f.description = new Array(502).join('很');
    var r = Core.validatePublish(f);
    assertEqual(r.ok, false);
    assert(!!r.errors.description);
  });

  /* =========================================================
     二、关键词搜索 searchItems / isKeywordMatch
     ========================================================= */
  var pool = [
    makeItem({ id: 'a', name: '蓝色校园卡', type: 'lost', createdAt: 300 }),
    makeItem({ id: 'b', name: '黑色雨伞', type: 'found', category: '水杯雨伞', location: '图书馆门口', createdAt: 200 }),
    makeItem({ id: 'c', name: '白色AirPods耳机', type: 'lost', category: '电子设备', description: '充电仓背面有刻字', createdAt: 100 })
  ];

  run('11. 关键词命中物品名称', function () {
    var r = Core.searchItems(pool, '校园卡', 'all');
    assertEqual(r.length, 1);
    assertEqual(r[0].id, 'a');
  });

  run('12. 关键词命中描述文本', function () {
    var r = Core.searchItems(pool, '刻字', 'all');
    assertEqual(r.length, 1);
    assertEqual(r[0].id, 'c');
  });

  run('13. 关键词命中地点文本', function () {
    var r = Core.searchItems(pool, '图书馆', 'all');
    assertEqual(r.length, 1);
    assertEqual(r[0].id, 'b');
  });

  run('14. 无匹配关键词 → 返回空数组', function () {
    var r = Core.searchItems(pool, '不存在的物品xyz', 'all');
    assertEqual(r.length, 0);
  });

  run('15. 关键词首尾空格被忽略', function () {
    var r = Core.searchItems(pool, '  校园卡  ', 'all');
    assertEqual(r.length, 1);
  });

  run('16. 大小写不敏感匹配', function () {
    var r = Core.searchItems(pool, 'airpods', 'all');
    assertEqual(r.length, 1);
  });

  run('17. 空关键词返回全部且按时间倒序', function () {
    var r = Core.searchItems(pool, '', 'all');
    assertEqual(r.length, 3);
    assertEqual(r[0].id, 'a'); // createdAt 最大，排最前
  });

  run('18. 类型筛选 lost', function () {
    var r = Core.searchItems(pool, '', 'lost');
    assertEqual(r.length, 2);
    r.forEach(function (i) { assertEqual(i.type, 'lost'); });
  });

  run('19. 类型筛选 found', function () {
    var r = Core.searchItems(pool, '', 'found');
    assertEqual(r.length, 1);
    assertEqual(r[0].id, 'b');
  });

  run('20. 分类筛选「水杯雨伞」', function () {
    var r = Core.searchItems(pool, '', 'all', '水杯雨伞');
    assertEqual(r.length, 1);
    assertEqual(r[0].id, 'b');
  });

  run('21. 关键词 + 类型组合筛选', function () {
    var r = Core.searchItems(pool, 'AirPods', 'found');
    assertEqual(r.length, 0); // AirPods 是 lost，组合后无结果
    var r2 = Core.searchItems(pool, 'AirPods', 'lost');
    assertEqual(r2.length, 1);
  });

  /* =========================================================
     三、状态标记 markResolved
     ========================================================= */
  run('22. 标记寻物信息 → 已找回', function () {
    var list = [makeItem({ id: 'x' })];
    var r = Core.markResolved(list, 'x');
    assertEqual(r.changed, true);
    assertEqual(r.items[0].status, 'resolved');
    assertEqual(Core.statusText(r.items[0]), '已找回');
  });

  run('23. 标记招领信息 → 已归还', function () {
    var list = [makeItem({ id: 'y', type: 'found' })];
    var r = Core.markResolved(list, 'y');
    assertEqual(r.items[0].status, 'resolved');
    assertEqual(Core.statusText(r.items[0]), '已归还');
  });

  run('24. 重复标记为幂等操作（不再产生变更）', function () {
    var list = [makeItem({ id: 'z', status: 'resolved' })];
    var r = Core.markResolved(list, 'z');
    assertEqual(r.changed, false);
    assertEqual(r.items[0].status, 'resolved');
  });

  run('25. markResolved 不修改原数组（纯函数）', function () {
    var list = [makeItem({ id: 'p' })];
    var snapshot = JSON.stringify(list);
    Core.markResolved(list, 'p');
    assertEqual(JSON.stringify(list), snapshot, '原数组不应被修改');
  });

  run('26. 标记不存在的 id → changed 为 false', function () {
    var list = [makeItem({ id: 'q' })];
    var r = Core.markResolved(list, 'not_exist');
    assertEqual(r.changed, false);
  });

  /* =========================================================
     四、查询与统计
     ========================================================= */
  run('27. getItemById 找到存在的信息', function () {
    var item = Core.getItemById(pool, 'b');
    assert(!!item);
    assertEqual(item.name, '黑色雨伞');
  });

  run('28. getItemById 找不到返回 null', function () {
    assertEqual(Core.getItemById(pool, 'missing'), null);
  });

  run('29. statsByType 统计总数/进行中/已解决', function () {
    var list = [
      makeItem({ id: 's1', type: 'lost' }),
      makeItem({ id: 's2', type: 'lost', status: 'resolved' }),
      makeItem({ id: 's3', type: 'found' })
    ];
    var st = Core.statsByType(list, 'lost');
    assertEqual(st.total, 2);
    assertEqual(st.active, 1);
    assertEqual(st.resolved, 1);
  });

  /* =========================================================
     五、格式化与数据模型
     ========================================================= */
  run('30. formatItemTime 转换时间格式', function () {
    assertEqual(Core.formatItemTime('2026-09-27T10:30'), '2026-09-27 10:30');
    assertEqual(Core.formatItemTime(''), '');
  });

  run('31. statusText 各状态文案正确', function () {
    assertEqual(Core.statusText(makeItem({ type: 'lost' })), '寻找中');
    assertEqual(Core.statusText(makeItem({ type: 'found' })), '待认领');
    assertEqual(Core.statusText(makeItem({ type: 'lost', status: 'resolved' })), '已找回');
    assertEqual(Core.statusText(makeItem({ type: 'found', status: 'resolved' })), '已归还');
  });

  run('32. createItem 生成完整数据对象', function () {
    var item = Data.createItem({
      type: 'found', name: ' 红色保温杯 ', category: '水杯雨伞',
      location: ' 操场 ', time: '2026-10-01T08:00',
      description: '杯身有卡通贴纸', contact: 'abc123', photo: null
    });
    assert(!!item.id, '应生成 id');
    assertEqual(item.status, 'active');
    assertEqual(item.name, '红色保温杯', '名称应去除首尾空格');
    assertEqual(item.location, '操场');
    assertEqual(item.photo, null);
    assert(typeof item.createdAt === 'number');
  });

  run('33. createItem 默认分类与照片', function () {
    var item = Data.createItem({
      type: 'lost', name: '笔记本', category: '', location: '图书馆',
      time: '2026-10-01T08:00', description: '', contact: 'wx'
    });
    assertEqual(item.category, '其他', '空分类应回落为"其他"');
    assertEqual(item.photo, null);
  });

  run('34. 不同 createItem 生成唯一 id', function () {
    var a = Data.createItem(validForm());
    var b = Data.createItem(validForm());
    assert(a.id !== b.id, '两次创建的 id 不应相同');
  });

  run('35. relativeTime 处理无效时间戳', function () {
    assertEqual(Core.relativeTime(0), '');
    assertEqual(Core.relativeTime(null), '');
  });

  /* ---------------- 汇总 ---------------- */
  renderSummary();
  window.__testResult = { passed: passed, failed: failed };
})();
