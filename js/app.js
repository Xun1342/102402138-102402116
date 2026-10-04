/**
 * app.js — 页面渲染与交互逻辑
 *
 * 单页应用：通过 hash 路由切换 首页 / 发布 / 搜索 / 详情 / 我的发布 五个视图。
 * 所有数据操作通过 LFData 读写，业务规则通过 LFCore 计算。
 */
(function () {
  'use strict';

  var Data = window.LFData;
  var Core = window.LFCore;

  /** 全局数据（内存态 + localStorage 双写） */
  var items = Data.loadItems();

  /* ---------------- 工具函数 ---------------- */
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function saveItems() {
    var ok = Data.saveItems(items);
    if (!ok) { showToast('数据保存失败，存储空间可能已满'); }
  }

  var toastTimer = null;
  function showToast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2000);
  }

  /** 复制文本（clipboard API 优先，降级 execCommand） */
  function copyText(text, tip) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
    }
    function done() { showToast(tip || '已复制'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); done(); });
    } else {
      fallback();
      done();
    }
  }

  /* ---------------- 通用渲染片段 ---------------- */

  /** 信息卡片（首页/搜索共用） */
  function cardHTML(item) {
    var tagCls = item.type === 'lost' ? 'tag-lost' : 'tag-found';
    var typeTag = Core.typeText(item.type);
    var statusTag = item.status === 'resolved'
      ? '<span class="tag tag-resolved">' + Core.statusText(item) + '</span>'
      : '<span class="tag tag-active">' + Core.statusText(item) + '</span>';
    var icon = item.photo
      ? '<img src="' + item.photo + '" alt="照片" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">'
      : Core.categoryIcon(item.category);
    return '' +
      '<div class="card' + (item.status === 'resolved' ? ' resolved' : '') + '" data-id="' + item.id + '">' +
        '<div class="card-icon">' + icon + '</div>' +
        '<div class="card-main">' +
          '<div class="card-top">' +
            '<span class="tag ' + tagCls + '">' + typeTag + '</span>' +
            '<span class="card-name">' + escapeHTML(item.name) + '</span>' +
          '</div>' +
          '<div class="card-meta">' + escapeHTML(item.location) + '<em>·</em>' + Core.relativeTime(item.createdAt) + '</div>' +
        '</div>' +
        '<div class="card-right">' + statusTag + '<span class="card-arrow">›</span></div>' +
      '</div>';
  }

  /** HTML 转义，防止特殊字符破坏页面 */
  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 渲染卡片列表到容器；空则显示空状态 */
  function renderList(containerSel, list, emptySel) {
    var box = $(containerSel);
    if (!list.length) {
      box.innerHTML = '';
      $(emptySel).classList.remove('hidden');
      return;
    }
    $(emptySel).classList.add('hidden');
    box.innerHTML = list.map(cardHTML).join('');
  }

  /* ================= 路由 ================= */
  function route() {
    var hash = location.hash || '#/home';
    var parts = hash.replace(/^#\/?/, '').split('/');
    var page = parts[0] || 'home';

    $$('.view').forEach(function (v) { v.classList.add('hidden'); });

    if (page === 'home') {
      $('#view-home').classList.remove('hidden');
      renderHome();
    } else if (page === 'publish') {
      $('#view-publish').classList.remove('hidden');
    } else if (page === 'search') {
      $('#view-search').classList.remove('hidden');
      renderSearchPanel();
      setTimeout(function () { $('#search-input').focus(); }, 60);
    } else if (page === 'detail') {
      var id = decodeURIComponent(parts[1] || '');
      $('#view-detail').classList.remove('hidden');
      renderDetail(id);
    } else if (page === 'mine') {
      $('#view-mine').classList.remove('hidden');
      renderMine();
    }

    updateTabbar(page);
    window.scrollTo(0, 0);
  }

  function updateTabbar(page) {
    var activeNav = (page === 'mine') ? 'mine' : (page === 'publish' ? 'publish' : 'home');
    $$('.tabbar-item').forEach(function (btn) {
      var isPublish = btn.classList.contains('tabbar-publish');
      var target = isPublish ? 'publish' : btn.getAttribute('data-nav');
      btn.classList.toggle('active', target === activeNav);
    });
  }

  function go(hash) { location.hash = hash; }

  /* ================= 首页 ================= */
  var homeType = 'all';

  function renderHome() {
    $$('#home-tabs .tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-type') === homeType);
    });
    var list = Core.searchItems(items, '', homeType);
    renderList('#home-list', list, '#home-empty');
  }

  /* ================= 发布页 ================= */
  var publishType = 'lost';
  var currentPhoto = null;

  function renderPublishType() {
    $$('#publish-type .type-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-type') === publishType);
    });
    $('#publish-tip').textContent = publishType === 'lost'
      ? '填写丢失物品信息，发布后可在"我的发布"中查看。'
      : '填写捡到物品信息，发布后可在"我的发布"中查看。';
  }

  function initPublishForm() {
    var sel = $('#f-category');
    sel.innerHTML = Data.CATEGORIES.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');
    // 时间默认当前时刻（分钟精度）
    var now = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    $('#f-time').value = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) +
      'T' + p(now.getHours()) + ':' + p(now.getMinutes());
    resetPhoto();
    clearFormErrors();
  }

  function resetPhoto() {
    currentPhoto = null;
    $('#photo-placeholder').innerHTML = '<span class="photo-icon">📷</span><span>上传照片</span>';
  }

  function clearFormErrors() {
    $$('.form-error').forEach(function (p) { p.classList.add('hidden'); });
  }

  function showFormErrors(errors) {
    $$('.form-error').forEach(function (p) {
      var field = p.getAttribute('data-for');
      if (errors[field]) {
        p.textContent = errors[field];
        p.classList.remove('hidden');
      } else {
        p.classList.add('hidden');
      }
    });
  }

  /** 照片压缩：最长边 500px、jpeg 0.7，控制 localStorage 体积 */
  function handlePhotoFile(file) {
    if (!file || !/^image\//.test(file.type)) {
      showToast('请选择图片文件');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast('图片不能超过 8MB');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var maxSide = 500;
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale);
        var h = Math.round(img.height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        currentPhoto = dataUrl;
        $('#photo-placeholder').innerHTML = '<img src="' + dataUrl + '" alt="照片">';
      };
      img.onerror = function () { showToast('图片读取失败，请更换图片'); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function submitPublish(e) {
    e.preventDefault();
    var form = {
      type: publishType,
      name: $('#f-name').value,
      category: $('#f-category').value,
      location: $('#f-location').value,
      time: $('#f-time').value,
      description: $('#f-description').value,
      contact: $('#f-contact').value,
      photo: currentPhoto
    };
    var check = Core.validatePublish(form);
    if (!check.ok) {
      showFormErrors(check.errors);
      showToast('请完善必填信息后再发布');
      return;
    }
    var item = Data.createItem(form);
    items.unshift(item);
    saveItems();
    // 清空表单，展示成功弹窗
    $('#publish-form').reset();
    initPublishForm();
    $('#success-modal').classList.remove('hidden');
  }

  /* ================= 搜索页 ================= */
  var HOT_TAGS = ['校园卡', '耳机', '雨伞', '钥匙', '水杯', '教材', '学生证'];
  var searchKeyword = '';
  var searchCat = '';

  function renderSearchPanel() {
    $('#hot-tags').innerHTML = HOT_TAGS.map(function (t) {
      return '<button type="button" class="hot-tag">' + t + '</button>';
    }).join('');
    var cats = ['', ].concat(Data.CATEGORIES);
    $('#cat-tags').innerHTML = cats.map(function (c) {
      var label = c || '全部';
      var cls = c === searchCat ? 'cat-tag active' : 'cat-tag';
      return '<button type="button" class="' + cls + '" data-cat="' + escapeHTML(c) + '">' + label + '</button>';
    }).join('');
  }

  function doSearch() {
    var kw = $('#search-input').value.trim();
    var result = Core.searchItems(items, kw, 'all', searchCat);
    var panel = $('#search-panel');
    var resultBox = $('#search-result');
    var emptyBox = $('#search-empty');
    var hasQuery = kw !== '' || searchCat !== '';

    if (!hasQuery) {
      panel.classList.remove('hidden');
      resultBox.classList.add('hidden');
      emptyBox.classList.add('hidden');
      return;
    }
    panel.classList.add('hidden');
    emptyBox.classList.add('hidden');
    if (result.length) {
      resultBox.classList.remove('hidden');
      var parts = [];
      if (kw) { parts.push('关键词"' + escapeHTML(kw) + '"'); }
      if (searchCat) { parts.push('分类「' + escapeHTML(searchCat) + '」'); }
      $('#result-info').innerHTML = parts.join(' + ') + '，共找到 <b>' + result.length + '</b> 条相关信息';
      $('#search-list').innerHTML = result.map(cardHTML).join('');
    } else {
      resultBox.classList.add('hidden');
      emptyBox.classList.remove('hidden');
    }
  }

  /* ================= 详情页 ================= */
  function renderDetail(id) {
    var item = Core.getItemById(items, id);
    var body = $('#detail-body');
    if (!item) {
      body.innerHTML = '<div class="empty"><div class="empty-icon">🤔</div><p>信息不存在或已删除</p>' +
        '<button class="btn-primary btn-empty" onclick="location.hash=\'#/home\'">返回首页</button></div>';
      return;
    }
    var typeTag = item.type === 'lost' ? 'tag-lost' : 'tag-found';
    var statusTag = item.status === 'resolved'
      ? '<span class="tag tag-resolved">' + Core.statusText(item) + '</span>'
      : '<span class="tag tag-active">' + Core.statusText(item) + '</span>';
    var photoBlock = item.photo
      ? '<div class="detail-photo"><img src="' + item.photo + '" alt="物品照片"></div>'
      : '<div class="detail-photo">' + Core.categoryIcon(item.category) + '</div>';
    var descBlock = item.description
      ? '<div class="detail-desc"><p class="detail-sec-title">详细描述</p><p>' + escapeHTML(item.description) + '</p></div>'
      : '<div class="detail-desc"><p class="detail-sec-title">详细描述</p><p class="detail-row-value">暂无描述</p></div>';

    body.innerHTML = '' +
      '<div class="detail-card">' +
        photoBlock +
        '<div class="detail-head">' +
          '<div class="detail-title-row">' +
            '<span class="detail-name">' + escapeHTML(item.name) + '</span>' +
            '<span class="tag ' + typeTag + '">' + Core.typeText(item.type) + '</span>' +
            statusTag +
          '</div>' +
          '<div class="detail-sub">发布于 ' + Core.relativeTime(item.createdAt) + ' · ' + escapeHTML(item.category) + '</div>' +
        '</div>' +
        '<div class="detail-body">' +
          '<div class="detail-row"><span class="detail-row-label">' + (item.type === 'lost' ? '遗失地点' : '拾获地点') + '</span>' +
            '<span class="detail-row-value">' + escapeHTML(item.location) + '</span></div>' +
          '<div class="detail-row"><span class="detail-row-label">' + (item.type === 'lost' ? '遗失时间' : '拾获时间') + '</span>' +
            '<span class="detail-row-value">' + escapeHTML(Core.formatItemTime(item.time)) + '</span></div>' +
          '<div class="detail-row"><span class="detail-row-label">物品分类</span>' +
            '<span class="detail-row-value">' + escapeHTML(item.category) + '</span></div>' +
          '<div class="detail-row"><span class="detail-row-label">信息状态</span>' +
            '<span class="detail-row-value">' + Core.statusText(item) + '</span></div>' +
        '</div>' +
        descBlock +
      '</div>' +
      '<div class="contact-card">' +
        '<div class="contact-left">' +
          '<div class="contact-avatar">💬</div>' +
          '<div><div class="contact-label">发布者微信</div>' +
          '<div class="contact-value" id="detail-contact">' + escapeHTML(item.contact) + '</div></div>' +
        '</div>' +
        '<button class="btn-copy" id="btn-copy-contact">复制微信号</button>' +
      '</div>' +
      '<button class="btn-contact" id="btn-contact">联系' + (item.type === 'lost' ? '拾获者' : '失主') + '</button>';

    $('#btn-copy-contact').addEventListener('click', function () {
      copyText(item.contact, '微信号已复制');
    });
    $('#btn-contact').addEventListener('click', function () {
      copyText(item.contact, '已复制微信号，去微信添加联系吧');
    });
  }

  /* ================= 我的发布 ================= */
  var mineType = 'lost';

  function renderMine() {
    $$('#mine-tabs .tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-type') === mineType);
    });
    var mine = Core.searchItems(items, '', mineType);
    var stats = Core.statsByType(items, mineType);
    $('#mine-count').innerHTML = '共 <b>' + stats.total + '</b> 条发布记录 · 进行中 <b>' + stats.active +
      '</b> · 已解决 <b>' + stats.resolved + '</b>';

    var box = $('#mine-list');
    if (!mine.length) {
      box.innerHTML = '';
      $('#mine-empty').classList.remove('hidden');
      return;
    }
    $('#mine-empty').classList.add('hidden');
    box.innerHTML = mine.map(function (item) {
      var resolved = item.status === 'resolved';
      var icon = item.photo
        ? '<img src="' + item.photo + '" alt="照片" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">'
        : Core.categoryIcon(item.category);
      var btnText = resolved
        ? (item.type === 'lost' ? '已找回' : '已归还')
        : (item.type === 'lost' ? '标记已找回' : '标记已归还');
      return '' +
        '<div class="mine-card' + (resolved ? ' resolved' : '') + '" data-id="' + item.id + '">' +
          '<div class="card-icon">' + icon + '</div>' +
          '<div class="mine-info">' +
            '<div class="card-top"><span class="card-name">' + escapeHTML(item.name) + '</span></div>' +
            '<div class="mine-meta">' + escapeHTML(item.location) + '<em>·</em>' + Core.relativeTime(item.createdAt) + '</div>' +
          '</div>' +
          '<button class="btn-mark' + (resolved ? ' resolved' : '') + '" data-id="' + item.id + '">' + btnText + '</button>' +
        '</div>';
    }).join('');
  }

  /* ================= 事件绑定 ================= */
  function bindEvents() {
    // 底部导航
    $$('.tabbar-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.classList.contains('tabbar-publish') ? 'publish' : btn.getAttribute('data-nav');
        if (target === 'publish') { initPublishForm(); }
        go('#/' + target);
      });
    });

    // 首页 Tab
    $$('#home-tabs .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        homeType = t.getAttribute('data-type');
        renderHome();
      });
    });

    // 首页搜索框 → 搜索页
    $('#home-search').addEventListener('click', function () { go('#/search'); });

    // 首页列表点击 → 详情
    $('#home-list').addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (card) { go('#/detail/' + card.getAttribute('data-id')); }
    });

    // 发布类型切换
    $$('#publish-type .type-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        publishType = btn.getAttribute('data-type');
        renderPublishType();
      });
    });

    // 照片上传
    $('#photo-placeholder').addEventListener('click', function () { $('#f-photo').click(); });
    $('#f-photo').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) { handlePhotoFile(e.target.files[0]); }
    });

    // 发布提交
    $('#publish-form').addEventListener('submit', submitPublish);

    // 成功弹窗
    $('#modal-goto-mine').addEventListener('click', function () {
      $('#success-modal').classList.add('hidden');
      initPublishForm();
      go('#/mine');
    });
    $('#modal-close').addEventListener('click', function () {
      $('#success-modal').classList.add('hidden');
      initPublishForm();
    });

    // 搜索页
    $('#search-back').addEventListener('click', function () { go('#/home'); });
    $('#search-input').addEventListener('input', doSearch);
    $('#search-clear').addEventListener('click', function () {
      $('#search-input').value = '';
      searchKeyword = '';
      searchCat = '';
      $('#search-clear').classList.add('hidden');
      $('#search-input').focus();
      renderSearchPanel();
      doSearch();
    });
    $('#hot-tags').addEventListener('click', function (e) {
      var tag = e.target.closest('.hot-tag');
      if (!tag) { return; }
      $('#search-input').value = tag.textContent;
      doSearch();
    });
    $('#cat-tags').addEventListener('click', function (e) {
      var tag = e.target.closest('.cat-tag');
      if (!tag) { return; }
      searchCat = tag.getAttribute('data-cat');
      renderSearchPanel();
      doSearch();
    });

    // 搜索列表点击 → 详情
    $('#search-list').addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (card) { go('#/detail/' + card.getAttribute('data-id')); }
    });

    // 详情页返回 / 分享
    $('#detail-back').addEventListener('click', function () {
      if (history.length > 1) { history.back(); } else { go('#/home'); }
    });
    $('#detail-share').addEventListener('click', function () {
      copyText(location.href, '链接已复制');
    });

    // 我的发布 Tab
    $$('#mine-tabs .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        mineType = t.getAttribute('data-type');
        renderMine();
      });
    });

    // 我的发布列表：标记状态
    $('#mine-list').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-mark');
      if (!btn || btn.classList.contains('resolved')) { return; }
      var id = btn.getAttribute('data-id');
      var item = Core.getItemById(items, id);
      if (!item) { return; }
      var action = item.type === 'lost' ? '已找回' : '已归还';
      if (!window.confirm('确认标记为「' + action + '」吗？')) { return; }
      var result = Core.markResolved(items, id);
      items = result.items;
      saveItems();
      renderMine();
      showToast('已标记为「' + action + '」');
    });

    // 我的发布：去发布
    $('#mine-publish-btn').addEventListener('click', function () {
      initPublishForm();
      go('#/publish');
    });

    // 我的发布卡片点击 → 详情（点击"标记"按钮时除外，避免与标记操作冲突）
    $('#mine-list').addEventListener('click', function (e) {
      var card = e.target.closest('.mine-card');
      if (card && !e.target.closest('.btn-mark')) {
        go('#/detail/' + card.getAttribute('data-id'));
      }
    });

    // 输入关键词时显示/隐藏清除按钮
    $('#search-input').addEventListener('input', function () {
      $('#search-clear').classList.toggle('hidden', !this.value);
    });

    window.addEventListener('hashchange', route);
  }

  /* ================= 启动 ================= */
  document.addEventListener('DOMContentLoaded', function () {
    initPublishForm();
    bindEvents();
    route();
  });
})();
