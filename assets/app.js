// app.js — 日常管理看板应用逻辑
(function() {
  'use strict';

  // === 工具函数 ===
  function getTodayKey() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatDateCN(date) {
    var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日 星期' + weekdays[date.getDay()];
  }

  function getGreeting() {
    var h = new Date().getHours();
    if (h < 6) return '夜深了，注意休息';
    if (h < 9) return '早上好，新的一天开始了';
    if (h < 12) return '上午好，保持专注';
    if (h < 14) return '中午好，记得吃饭';
    if (h < 18) return '下午好，继续加油';
    if (h < 22) return '晚上好，辛苦了';
    return '夜深了，早点休息';
  }

  function loadData(key) {
    try {
      var data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch(e) { return null; }
  }

  function saveData(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
  }

  var categoryMap = {
    food: { name: '餐饮', cls: 'cat-food' },
    transport: { name: '交通', cls: 'cat-transport' },
    shopping: { name: '购物', cls: 'cat-shopping' },
    entertainment: { name: '娱乐', cls: 'cat-entertainment' },
    other: { name: '其他', cls: 'cat-other' }
  };

  // === 日期显示 ===
  function renderHeader() {
    document.getElementById('dateDisplay').textContent = formatDateCN(new Date());
    document.getElementById('greeting').textContent = getGreeting();
  }

  // ========================================
  // 1. 待办事项（支持推迟提醒）
  // ========================================
  function getAllTodosByDate() {
    return loadData('dashboard_todos') || {};
  }

  function getTodos() {
    var all = getAllTodosByDate();
    var todayKey = getTodayKey();
    var ownTodos = all[todayKey] || [];

    // 查找其他日期中 deferredTo === today 且未完成的待办
    var deferredTodos = [];
    Object.keys(all).forEach(function(date) {
      if (date === todayKey) return;
      all[date].forEach(function(t) {
        if (t.deferredTo === todayKey && !t.done) {
          // 添加来源标记（仅用于显示，不持久化）
          deferredTodos.push(Object.assign({}, t, { deferredFrom: date }));
        }
      });
    });

    // 合并：推迟来的排在前，今天的排在后
    return deferredTodos.concat(ownTodos);
  }

  function saveTodos(todos) {
    var all = getAllTodosByDate();
    var todayKey = getTodayKey();
    // 只保存属于今天的待办（deferredFrom 不为空的来自其他日期，跳过）
    all[todayKey] = todos.filter(function(t) { return !t.deferredFrom; });
    saveData('dashboard_todos', all);
  }

  // 根据 id 在所有日期中查找待办
  function findTodoById(id) {
    var all = getAllTodosByDate();
    for (var date in all) {
      var found = all[date].find(function(t) { return t.id === id; });
      if (found) return { todo: found, date: date, all: all };
    }
    return null;
  }

  window.addTodo = function() {
    var input = document.getElementById('todoInput');
    var timeInput = document.getElementById('todoTime');
    var text = input.value.trim();
    if (!text) return;
    var all = getAllTodosByDate();
    var todayKey = getTodayKey();
    if (!all[todayKey]) all[todayKey] = [];
    var todo = { id: Date.now(), text: text, done: false };
    if (timeInput && timeInput.value) {
      todo.time = timeInput.value;
      todo.notified = false;
    }
    all[todayKey].push(todo);
    saveData('dashboard_todos', all);
    input.value = '';
    if (timeInput) timeInput.value = '';
    renderTodos();
    startReminderCheck();
  };

  window.toggleTodo = function(id) {
    var result = findTodoById(id);
    if (!result) return;
    result.todo.done = !result.todo.done;
    saveData('dashboard_todos', result.all);
    renderTodos();
  };

  window.deleteTodo = function(id) {
    var result = findTodoById(id);
    if (!result) return;
    result.all[result.date] = result.all[result.date].filter(function(t) { return t.id !== id; });
    saveData('dashboard_todos', result.all);
    renderTodos();
  };

  // 推迟待办到指定日期
  window.deferTodo = function(id, dateStr) {
    if (!dateStr) return;
    var result = findTodoById(id);
    if (!result) return;
    result.todo.deferredTo = dateStr;
    saveData('dashboard_todos', result.all);
    renderTodos();
  };

  // 取消推迟
  window.cancelDefer = function(id) {
    var result = findTodoById(id);
    if (!result) return;
    delete result.todo.deferredTo;
    saveData('dashboard_todos', result.all);
    renderTodos();
  };

  // 显示/隐藏推迟日期选择器
  window.toggleDeferPicker = function(id) {
    var picker = document.getElementById('defer-picker-' + id);
    if (picker) {
      picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
    }
  };

  // 确认推迟日期
  window.confirmDefer = function(id) {
    var input = document.getElementById('defer-input-' + id);
    if (!input || !input.value) return;
    deferTodo(id, input.value);
  };

  function renderTodos() {
    var todos = getTodos();
    var list = document.getElementById('todoList');
    var done = todos.filter(function(t) { return t.done; }).length;
    var total = todos.length;
    var percent = total > 0 ? Math.round(done / total * 100) : 0;

    document.getElementById('todoDone').textContent = done;
    document.getElementById('todoTotal').textContent = total;
    document.getElementById('todoProgress').style.width = percent + '%';

    if (todos.length === 0) {
      list.innerHTML = '<li class="todo-empty">还没有待办事项，添加一个开始吧</li>';
      return;
    }

    list.innerHTML = todos.map(function(t) {
      var isDeferred = !!t.deferredFrom;
      var deferredDate = t.deferredFrom ? t.deferredFrom.substring(5).replace('-', '/') : '';
      var hasDeferTo = !!t.deferredTo;
      var deferToDisplay = hasDeferTo ? t.deferredTo.substring(5).replace('-', '/') : '';

      var html = '<li class="todo-item' + (t.done ? ' done' : '') + '">';
      html += '<input type="checkbox" ' + (t.done ? 'checked' : '') + ' onclick="toggleTodo(' + t.id + ')">';
      html += '<div class="todo-content">';
      html += '<span class="todo-text">' + escapeHtml(t.text) + '</span>';

      // 标签区
      var badges = '';
      if (t.time) {
        badges += '<span class="todo-badge badge-time">🕐 ' + t.time + '</span>';
      }
      if (isDeferred) {
        badges += '<span class="todo-badge badge-from">⏰ 来自 ' + deferredDate + '</span>';
      }
      if (hasDeferTo) {
        badges += '<span class="todo-badge badge-to">→ 推迟到 ' + deferToDisplay + '</span>';
      }
      if (badges) html += '<span class="todo-badges">' + badges + '</span>';

      html += '</div>';

      // 操作按钮
      html += '<div class="todo-actions">';
      if (!t.done && !hasDeferTo) {
        html += '<button class="btn btn-defer-text" onclick="toggleDeferPicker(' + t.id + ')" title="推迟到其他日期">推迟</button>';
      }
      if (hasDeferTo) {
        html += '<button class="btn-icon btn-defer" onclick="cancelDefer(' + t.id + ')" title="取消推迟">↩</button>';
      }
      html += '<button class="btn-icon" onclick="deleteTodo(' + t.id + ')" title="删除">×</button>';
      html += '</div>';
      html += '</li>';

      // 推迟日期选择器
      if (!t.done && !hasDeferTo) {
        html += '<li class="defer-picker" id="defer-picker-' + t.id + '" style="display:none">';
        html += '<input type="date" id="defer-input-' + t.id + '" class="defer-date-input">';
        html += '<button class="btn btn-primary btn-sm" onclick="confirmDefer(' + t.id + ')">确认</button>';
        html += '</li>';
      }

      return html;
    }).join('');
  }

  // ========================================
  // 2. 体重记录
  // ========================================
  function getWeights() {
    return loadData('dashboard_weights') || [];
  }

  function saveWeights(weights) {
    saveData('dashboard_weights', weights);
  }

  window.saveWeight = function() {
    var input = document.getElementById('weightInput');
    var val = parseFloat(input.value);
    if (!val || val <= 0 || val > 300) return;
    var weights = getWeights();
    var todayKey = getTodayKey();
    var existing = weights.find(function(w) { return w.date === todayKey; });
    if (existing) {
      existing.weight = val;
    } else {
      weights.push({ date: todayKey, weight: val });
    }
    weights.sort(function(a, b) { return a.date.localeCompare(b.date); });
    // 只保留最近30条
    if (weights.length > 30) weights = weights.slice(-30);
    saveWeights(weights);
    input.value = '';
    renderWeight();
    renderCalorie();
  };

  function renderWeight() {
    var weights = getWeights();
    var todayKey = getTodayKey();
    var todayWeight = weights.find(function(w) { return w.date === todayKey; });

    var currentEl = document.getElementById('weightCurrent');
    var changeEl = document.getElementById('weightChange');

    if (todayWeight) {
      currentEl.textContent = todayWeight.weight.toFixed(1);
    } else if (weights.length > 0) {
      currentEl.textContent = weights[weights.length - 1].weight.toFixed(1);
    } else {
      currentEl.textContent = '--';
    }

    // 计算变化
    if (weights.length >= 2) {
      var lastTwo = weights.slice(-2);
      var diff = lastTwo[1].weight - lastTwo[0].weight;
      changeEl.style.display = '';
      if (Math.abs(diff) < 0.05) {
        changeEl.className = 'weight-change flat';
        changeEl.textContent = '→ 持平';
      } else if (diff > 0) {
        changeEl.className = 'weight-change up';
        changeEl.textContent = '↑ +' + diff.toFixed(1) + ' kg';
      } else {
        changeEl.className = 'weight-change down';
        changeEl.textContent = '↓ ' + diff.toFixed(1) + ' kg';
      }
    } else {
      changeEl.style.display = 'none';
    }

    // 渲染近7天趋势图
    var recent = weights.slice(-7);
    var dates = recent.map(function(w) { return w.date; });
    var wValues = recent.map(function(w) { return w.weight; });
    var goalWeight = loadData('dashboard_weight_goal') || null;

    // 显示目标体重信息
    var goalDisplay = document.getElementById('weightGoalDisplay');
    if (goalDisplay) {
      if (goalWeight) {
        var currentWeight = todayWeight ? todayWeight.weight : (weights.length > 0 ? weights[weights.length - 1].weight : null);
        var html = '<span class="goal-label">🎯 目标: ' + goalWeight.toFixed(1) + ' kg</span>';
        if (currentWeight) {
          var diff = currentWeight - goalWeight;
          if (Math.abs(diff) < 0.05) {
            html += '<span class="goal-diff" style="color:var(--success)">已达标!</span>';
          } else if (diff > 0) {
            html += '<span class="goal-diff positive">还差 ' + diff.toFixed(1) + ' kg</span>';
          } else {
            html += '<span class="goal-diff negative">低于目标 ' + Math.abs(diff).toFixed(1) + ' kg</span>';
          }
        }
        goalDisplay.innerHTML = html;
        goalDisplay.style.display = 'flex';
      } else {
        goalDisplay.style.display = 'none';
      }
    }

    if (window.renderWeightChart) {
      window.renderWeightChart(dates, wValues, goalWeight);
    }
  }

  // 保存目标体重
  window.saveWeightGoal = function() {
    var input = document.getElementById('weightGoalInput');
    var val = parseFloat(input.value);
    if (!val || val <= 0 || val > 300) return;
    saveData('dashboard_weight_goal', val);
    input.value = '';
    renderWeight();
  };

  // ========================================
  // 2.5 热量消耗计算（Mifflin-St Jeor 公式）
  // ========================================
  function getCalorieProfile() {
    return loadData('dashboard_calorie_profile') || {};
  }

  function saveCalorieProfileData(profile) {
    saveData('dashboard_calorie_profile', profile);
  }

  // Mifflin-St Jeor 公式计算 BMR
  function calcBMR(weight, height, age, gender) {
    if (gender === 'male') {
      return 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      return 10 * weight + 6.25 * height - 5 * age - 161;
    }
  }

  window.saveCalorieProfile = function() {
    var heightEl = document.getElementById('heightInput');
    var ageEl = document.getElementById('ageInput');
    var genderEl = document.getElementById('genderSelect');
    var activityEl = document.getElementById('activitySelect');

    var profile = getCalorieProfile();
    if (heightEl.value) profile.height = parseFloat(heightEl.value);
    if (ageEl.value) profile.age = parseInt(ageEl.value);
    profile.gender = genderEl.value;
    profile.activity = parseFloat(activityEl.value);

    saveCalorieProfileData(profile);
    renderCalorie();
  };

  function renderCalorie() {
    var profile = getCalorieProfile();
    var resultEl = document.getElementById('calorieResult');
    if (!resultEl) return;

    // 恢复已保存的值到输入框
    var heightEl = document.getElementById('heightInput');
    var ageEl = document.getElementById('ageInput');
    var genderEl = document.getElementById('genderSelect');
    var activityEl = document.getElementById('activitySelect');

    if (profile.height && !heightEl.value) heightEl.value = profile.height;
    if (profile.age && !ageEl.value) ageEl.value = profile.age;
    if (profile.gender) genderEl.value = profile.gender;
    if (profile.activity) activityEl.value = profile.activity;

    // 检查是否有足够的数据计算
    if (!profile.height || !profile.age || !profile.gender || !profile.activity) {
      resultEl.innerHTML = '<div class="calorie-empty">填写身高、年龄后自动计算每日热量消耗</div>';
      return;
    }

    // 获取当前体重（优先今日，否则最近一条）
    var weights = getWeights();
    var todayKey = getTodayKey();
    var todayWeight = weights.find(function(w) { return w.date === todayKey; });
    var currentWeight = todayWeight ? todayWeight.weight : (weights.length > 0 ? weights[weights.length - 1].weight : null);

    if (!currentWeight) {
      resultEl.innerHTML = '<div class="calorie-empty">先记录体重，即可计算每日热量消耗</div>';
      return;
    }

    // 计算 BMR 和 TDEE
    var bmr = calcBMR(currentWeight, profile.height, profile.age, profile.gender);
    var tdee = bmr * profile.activity;

    // 减脂/增肌建议热量
    var cutCalories = Math.round(tdee - 500);
    var bulkCalories = Math.round(tdee + 300);

    var activityLabels = {
      '1.2': '久坐',
      '1.375': '轻度活动',
      '1.55': '中度活动',
      '1.725': '高度活动',
      '1.9': '极度活动'
    };
    var actLabel = activityLabels[String(profile.activity)] || '';

    resultEl.innerHTML =
      '<div class="calorie-result">' +
        '<div class="cal-main">' +
          '<span class="cal-value">' + Math.round(tdee) + '</span>' +
          '<span class="cal-unit">kcal / 天</span>' +
        '</div>' +
        '<div class="cal-sub">' +
          '基础代谢 <b>' + Math.round(bmr) + '</b> kcal · ' + actLabel + '<br>' +
          '减脂建议 <b>' + cutCalories + '</b> kcal · 增肌建议 <b>' + bulkCalories + '</b> kcal' +
        '</div>' +
      '</div>';
  }

  // ========================================
  // 3. 今日要闻（四分类：金融 → AI → 国际政治 → 国内大事）
  // ========================================

  // 四个新闻分类配置
  var NEWS_CATEGORIES = [
    { key: 'finance', name: '金融', icon: '💰', cls: 'news-cat-finance',
      keywords: ['股', '基金', '经济', '金融', '央行', '利率', 'A股', '美股', '港股', '期货', '货币', '投资', '财经', '银行', '通胀', '降息', '加息', '国债', '汇率', '比特币', '加密', '牛市', '熊市', '涨', '跌', '收益', '财报', '上市', '并购', '新能源车', '半导体', '芯片', '消费', 'PMI', 'GDP', 'CPI', '社融', '信贷', '外资', '北向', '深港通', '沪港通', '标普', '纳斯达克', '道指', '原油', '黄金', '白银', '铜价'] },
    { key: 'ai', name: 'AI', icon: '🤖', cls: 'news-cat-ai',
      keywords: ['AI', '人工智能', '大模型', '大语言模型', 'ChatGPT', 'GPT', 'Claude', 'Gemini', 'OpenAI', 'Anthropic', 'DeepMind', 'Llama', 'Mistral', 'xAI', 'Grok', '豆包', 'Kimi', '智谱', 'GLM', 'DeepSeek', '月之暗面', 'MiniMax', '百川', '阶跃星辰', '文心', '通义', '星火', 'Sora', 'Stable Diffusion', 'Midjourney', 'AGI', '生成式AI', '生成式', 'LLM', '多模态', '视觉模型', '扩散模型', 'Transformer', 'MoE', '混合专家', '预训练', '微调', 'fine-tune', '对齐', 'RLHF', 'RAG', '检索增强', '上下文窗口', 'token', 'prompt', '提示词', '涌现', '泛化', 'zero-shot', 'few-shot', 'LoRA', 'PEFT', '量化压缩', '蒸馏', 'vLLM', '推理加速', '模型训练', '模型推理', '智能体', 'Agent', '参数量', '开源模型', '闭源模型', '模型发布', '模型升级', '模型评测', '模型竞赛', 'AI芯片', '算力', 'GPU', '英伟达', 'NVIDIA', '机器学习', '深度学习', '端侧AI', '边缘AI'] },
    { key: 'world', name: '国际政治', icon: '🌍', cls: 'news-cat-world',
      keywords: ['美国', '俄罗斯', '乌克兰', '中东', '巴勒斯坦', '以色列', '加沙', '欧盟', '北约', '联合国', '特朗普', '拜登', '制裁', '外交', '领导人', '峰会', 'G7', 'G20', '金砖', '东盟', '日本', '韩国', '朝鲜', '伊朗', '沙特', '土耳其', '印度', '巴西', '非洲', '拉美', '欧洲', '英国', '法国', '德国', '首相', '总统', '大选', '关税', '贸易战', '脱钩', '北约', '核', '导弹', '军演', '安全', '签证', '移民', '难民'] },
    { key: 'domestic', name: '国内大事', icon: '🏛️', cls: 'news-cat-domestic',
      keywords: ['习近平', '国务院', '总理', '政策', '改革', '民生', '教育', '医疗', '住房', '就业', '乡村', '振兴', '科技', '环保', '碳', '能源', '交通', '高铁', '基建', '反腐', '纪委', '巡视', '两会', '人大', '政协', '党代会', '全会', '指示', '讲话', '批示', '部署', '召开', '印发', '通知', '意见', '规划', '方案', '试点', '推广', '法治', '司法', '法院', '检察', '公安', '应急', '防汛', '抗旱', '地震', '灾'] }
  ];

  // 数据源：知乎日报 + 36氪快讯 + 今日头条 + 新浪财经 + 东方财富 + 财联社
  var NEWS_SOURCES = [
    { url: 'https://news-at.zhihu.com/api/4/news/latest', type: 'json', name: '知乎日报' },
    { url: 'https://36kr.com/api/newsflash?per_page=20', type: 'json', name: '36氪' },
    { url: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', type: 'json', name: '今日头条' },
    { url: 'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=1686&num=20&page=1', type: 'json', name: '新浪财经' },
    { url: 'https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web&biz=web_news_col&column=350&order=1&needInteractData=0&page_index=1&page_size=20', type: 'json', name: '东方财富' },
    { url: 'https://www.cls.cn/nodeapi/updateTelegraphList?app=CailianpressWeb&os=web&sv=7.7.5&rn=20', type: 'json', name: '财联社' }
  ];

  // CORS 代理列表
  var NEWS_PROXIES = [
    function(url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
    function(url) { return 'https://corsproxy.io/?url=' + encodeURIComponent(url); },
    function(url) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(url); },
    function(url) { return 'https://proxy.cors.sh/' + url; }
  ];

  // 备用要闻（按分类）
  var NEWS_FALLBACK = {
    finance: [
      { title: '央行发布二季度货币政策报告，强调精准施策支持实体经济', url: 'https://finance.sina.com.cn', source: '财经' },
      { title: 'A股三大指数集体收涨，新能源板块领涨两市', url: 'https://finance.eastmoney.com', source: '财经' },
      { title: '美联储维持利率不变，市场预期年内降息窗口收窄', url: 'https://www.yicai.com', source: '第一财经' }
    ],
    ai: [
      { title: '国产大模型再突破，多模态能力比肩国际前沿水平', url: 'https://36kr.com', source: '36氪' },
      { title: 'AI Agent应用加速落地，企业级智能助手市场规模激增', url: 'https://36kr.com', source: '36氪' },
      { title: '英伟达发布新一代AI芯片，算力性能再创新高', url: 'https://www.leiphone.com', source: '雷锋网' }
    ],
    world: [
      { title: '联合国安理会通过新一轮中东停火决议', url: 'https://www.thepaper.cn', source: '澎湃' },
      { title: 'G20峰会聚焦全球经济治理改革，多国达成共识', url: 'https://www.xinhuanet.com', source: '新华社' },
      { title: '欧盟通过新一轮绿色能源转型法案', url: 'https://www.jiemian.com', source: '界面' }
    ],
    domestic: [
      { title: '国务院常务会议部署进一步扩大内需多项举措', url: 'https://www.gov.cn', source: '中国政府网' },
      { title: '教育部发布深化中小学科学教育改革指导意见', url: 'https://www.moe.gov.cn', source: '教育部' },
      { title: '国家医保药品目录调整启动，更多创新药纳入报销', url: 'https://www.nhsa.gov.cn', source: '医保局' }
    ]
  };

  window.refreshNews = function() {
    fetchNews(true);
  };

  function renderNewsLoading() {
    var list = document.getElementById('newsList');
    var syncTime = document.getElementById('newsSyncTime');
    if (list) list.innerHTML = '<li class="news-loading">正在获取今日要闻...</li>';
    if (syncTime) syncTime.textContent = '正在获取...';
  }

  // 按关键词将新闻归类
  function categorizeNews(allItems) {
    var result = { finance: [], ai: [], world: [], domestic: [] };

    allItems.forEach(function(item) {
      var title = (item.title || '').toLowerCase();
      var matched = false;
      for (var i = 0; i < NEWS_CATEGORIES.length; i++) {
        var cat = NEWS_CATEGORIES[i];
        for (var j = 0; j < cat.keywords.length; j++) {
          if (title.indexOf(cat.keywords[j].toLowerCase()) >= 0) {
            result[cat.key].push(item);
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    });

    // 每个分类最多保留 4 条
    Object.keys(result).forEach(function(key) {
      result[key] = result[key].slice(0, 4);
    });

    return result;
  }

  // 渲染按分类的新闻
  function renderNews(categorized, source) {
    var list = document.getElementById('newsList');
    var syncTime = document.getElementById('newsSyncTime');
    if (!list) return;

    var now = new Date();
    var timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    if (syncTime) {
      syncTime.textContent = source === 'live' ? '实时获取 ' + timeStr : (source === 'cache' ? '缓存数据' : (source === 'fallback' ? '网络受限' : ''));
    }

    var html = '';
    NEWS_CATEGORIES.forEach(function(cat) {
      var items = categorized[cat.key] || [];
      // 如果该分类没有实时新闻，使用备用内容
      if (items.length === 0) {
        items = NEWS_FALLBACK[cat.key] || [];
      }

      html += '<div class="news-category ' + cat.cls + '">';
      html += '<div class="news-cat-header"><span class="news-cat-icon">' + cat.icon + '</span>' + cat.name + '</div>';

      items.forEach(function(item) {
        var title = item.title || '';
        var url = item.url || '#';
        var sourceName = item.source || '';
        html += '<a class="news-item" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' +
          '<span class="news-dot"></span>' +
          '<div style="flex:1;min-width:0">' +
          '<div class="news-title">' + escapeHtml(title) + '</div>' +
          (sourceName ? '<div class="news-source">' + escapeHtml(sourceName) + '</div>' : '') +
          '</div></a>';
      });

      html += '</div>';
    });

    list.innerHTML = html;
  }

  function fetchNews(force) {
    renderNewsLoading();

    var cached = loadData('dashboard_news_cache');
    var cacheTime = loadData('dashboard_news_cache_time');
    var todayKey = getTodayKey();

    // 如果今天已有缓存且非强制刷新，直接用缓存
    if (!force && cached && cacheTime && cacheTime.date === todayKey) {
      renderNews(cached, 'cache');
      return;
    }

    // 从多个数据源并行获取
    var allItems = [];
    var sourcesDone = 0;
    var totalSources = NEWS_SOURCES.length;
    var sourceFailed = 0;

    NEWS_SOURCES.forEach(function(src, srcIdx) {
      var proxyIdx = 0;

      function trySource() {
        if (proxyIdx >= NEWS_PROXIES.length) {
          // 该数据源所有代理都失败
          sourcesDone++;
          sourceFailed++;
          checkAllDone();
          return;
        }

        var proxyUrl = NEWS_PROXIES[proxyIdx](src.url);
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 8000);

        fetch(proxyUrl, { signal: controller.signal })
          .then(function(res) { clearTimeout(timeoutId); return res.json(); })
          .then(function(data) {
            // 解析不同数据源的结构
            var items = [];
            if (src.name === '知乎日报') {
              var stories = data.stories || [];
              items = stories.slice(0, 15).map(function(s) {
                return { title: s.title, url: s.url || s.share_url || '', source: '知乎日报' };
              });
            } else if (src.name === '36氪') {
              var flashList = data.data && data.data.items ? data.data.items : (data.items || []);
              items = flashList.slice(0, 15).map(function(f) {
                return {
                  title: f.title || f.summary || f.description || '',
                  url: f.url || f.link || 'https://36kr.com',
                  source: '36氪'
                };
              });
            } else if (src.name === '今日头条') {
              var hotList = data.data || [];
              items = hotList.slice(0, 15).map(function(h) {
                return {
                  title: h.Title || h.title || '',
                  url: h.Url || h.url || 'https://www.toutiao.com',
                  source: '今日头条'
                };
              });
            } else if (src.name === '新浪财经') {
              // 新浪财经滚动新闻: { result: { status:{code:0}, data:[{title,url,ctime,media_name}] } }
              // 或直接 { data: [...] }
              var sinaList = (data.result && data.result.data) ? data.result.data : (data.data || []);
              items = sinaList.slice(0, 15).map(function(r) {
                return {
                  title: r.title || '',
                  url: r.url || '',
                  source: r.media_name || '新浪财经'
                };
              });
            } else if (src.name === '东方财富') {
              // 东方财富新闻: { data: { list: [{Art_Title, Art_UniqueUrl, Art_ShowTime}] } }
              var eastList = (data.data && data.data.list) ? data.data.list : [];
              items = eastList.slice(0, 15).map(function(e) {
                return {
                  title: e.Art_Title || e.title || '',
                  url: e.Art_UniqueUrl || e.url || 'https://finance.eastmoney.com',
                  source: '东方财富'
                };
              });
            } else if (src.name === '财联社') {
              // 财联社电报: { data: { roll_data: [{title, content, shareurl, ctime, subj_id}] } }
              var clsList = (data.data && data.data.roll_data) ? data.data.roll_data : [];
              items = clsList.slice(0, 15).map(function(c) {
                // 去除 HTML 标签
                var cleanTitle = (c.title || c.content || '').replace(/<[^>]+>/g, '');
                return {
                  title: cleanTitle,
                  url: c.shareurl || 'https://www.cls.cn',
                  source: '财联社'
                };
              });
            }
            allItems = allItems.concat(items);
            sourcesDone++;
            checkAllDone();
          })
          .catch(function() {
            clearTimeout(timeoutId);
            proxyIdx++;
            trySource();
          });
      }
      trySource();
    });

    function checkAllDone() {
      if (sourcesDone < totalSources) return;

      // 所有数据源都尝试完毕
      if (allItems.length > 0) {
        // 去重
        var seen = {};
        allItems = allItems.filter(function(item) {
          if (seen[item.title]) return false;
          seen[item.title] = true;
          return true;
        });

        var categorized = categorizeNews(allItems);
        saveData('dashboard_news_cache', categorized);
        saveData('dashboard_news_cache_time', { date: todayKey });
        renderNews(categorized, sourceFailed === totalSources ? 'fallback' : 'live');
      } else if (cached && Object.keys(cached).length > 0) {
        renderNews(cached, 'cache');
      } else {
        // 全部失败，使用备用内容
        var fallbackCategorized = {};
        Object.keys(NEWS_FALLBACK).forEach(function(key) {
          fallbackCategorized[key] = NEWS_FALLBACK[key];
        });
        renderNews(fallbackCategorized, 'fallback');
      }
    }
  }

  // ========================================
  // 4. 育儿分享（增强版：月龄+里程碑+天气穿着+辅食+运动+学习资源）
  // ========================================

  // --- 宝宝信息管理 ---
  function getBabyProfile() {
    return loadData('dashboard_baby_profile') || {};
  }
  function saveBabyProfileData(profile) {
    saveData('dashboard_baby_profile', profile);
  }

  window.saveBabyProfile = function() {
    var birthInput = document.getElementById('babyBirthInput');
    var cityInput = document.getElementById('babyCityInput');
    var genderInput = document.getElementById('babyGenderInput');
    var profile = getBabyProfile();
    if (birthInput.value) profile.birthDate = birthInput.value;
    if (cityInput.value) profile.city = cityInput.value.trim();
    if (genderInput) profile.gender = genderInput.value;
    saveBabyProfileData(profile);
    renderParenting();
  };

  // 计算宝宝月龄
  function calcBabyAge(birthDateStr) {
    if (!birthDateStr) return null;
    var birth = new Date(birthDateStr);
    var now = new Date();
    if (birth > now) return null;
    var years = now.getFullYear() - birth.getFullYear();
    var months = now.getMonth() - birth.getMonth();
    var days = now.getDate() - birth.getDate();
    if (days < 0) {
      months--;
      var prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    var totalMonths = years * 12 + months;
    return { years: years, months: months, days: days, totalMonths: totalMonths };
  }

  // --- 月龄里程碑数据库（0-36个月） ---
  // 来源：WHO儿童发育标准、中国营养学会婴幼儿喂养指南、中华医学会儿科学分会
  var BABY_MILESTONES = {
    0: { tasks: ['纯母乳/配方奶喂养，按需哺乳', '每日补充维生素D 400IU', '多进行肌肤接触（袋鼠护理）', '俯卧练习抬头，每次1-2分钟'], source: 'WHO儿童发育标准', sourceUrl: 'https://www.who.int/childgrowth/standards/zh/' },
    1: { tasks: ['继续按需哺乳，建立喂养规律', '坚持补充维生素D 400IU/天', '多与宝宝说话、眼神交流', '俯卧抬头练习，逐渐增加时间'], source: 'WHO儿童发育标准', sourceUrl: 'https://www.who.int/childgrowth/standards/zh/' },
    2: { tasks: ['继续纯奶喂养', '补充维生素D 400IU/天', '练习追视移动物体', '多做俯卧抬头练习'], source: 'WHO儿童发育标准', sourceUrl: 'https://www.who.int/childgrowth/standards/zh/' },
    3: { tasks: ['纯奶喂养，奶量约150ml/次', '补充维生素D 400IU/天', '练习翻身（俯卧→仰卧）', '抓握玩具练习'], source: 'WHO儿童发育标准', sourceUrl: 'https://www.who.int/childgrowth/standards/zh/' },
    4: { tasks: ['纯奶喂养，可尝试建立4小时喂养间隔', '补充维生素D 400IU/天', '练习翻身（仰卧→俯卧）', '可引入安抚奶嘴满足吸吮需求'], source: '中华医学会儿科学分会', sourceUrl: 'https://www.cma.org.cn/' },
    5: { tasks: ['纯奶喂养为主', '补充维生素D 400IU/天', '练习靠坐，用靠垫支撑', '可引入鸭嘴奶嘴过渡（5-6月龄适用）'], source: '博禾医生·山东大学齐鲁医院', sourceUrl: 'https://m.bohe.cn/article/liangyi/cji06ym4kx3x5j8.html' },
    6: { tasks: ['开始添加辅食！首选强化铁米粉', '引入鸭嘴杯/学饮杯练习喝水', '补充维生素D 400IU/天', '练习独坐', '可引入重力球奶嘴方便饮水'], source: '中国营养学会·婴幼儿喂养指南', sourceUrl: 'https://www.cnsoc.org/' },
    7: { tasks: ['辅食：添加蔬菜泥（胡萝卜、南瓜、菠菜）', '辅食：添加水果泥（苹果、香蕉、梨）', '继续用鸭嘴杯喝水', '练习爬行准备，匍匐前进', '补充维生素D 400IU/天'], source: '中国营养学会·婴幼儿喂养指南', sourceUrl: 'https://www.cnsoc.org/' },
    8: { tasks: ['辅食：添加蛋黄（从1/4开始逐渐增加）', '辅食：添加肉泥（鸡肉、猪肉、鱼肉）', '可从鸭嘴杯过渡到吸管杯', '练习爬行', '补充维生素D 400IU/天'], source: '中国营养学会·婴幼儿喂养指南', sourceUrl: 'https://www.cnsoc.org/' },
    9: { tasks: ['辅食：添加蛋白（全蛋）', '辅食：尝试软烂的碎末状食物', '使用吸管杯/学饮杯喝水', '练习扶站', '补充维生素D 400IU/天'], source: '中国营养学会·婴幼儿喂养指南', sourceUrl: 'https://www.cnsoc.org/' },
    10: { tasks: ['辅食：增加食物颗粒感，从泥到碎末', '辅食：尝试手指食物（煮软的胡萝卜条、面包条）', '使用吸管杯独立喝水', '练习扶物站立和移步', '补充维生素D 400IU/天'], source: '中国营养学会·婴幼儿喂养指南', sourceUrl: 'https://www.cnsoc.org/' },
    11: { tasks: ['辅食：三餐一点，逐步过渡到家庭饮食', '练习用勺子自主进食（可手把手辅助）', '使用吸管杯或敞口杯喝水', '练习独站片刻', '补充维生素D 400IU/天'], source: '中国营养学会·婴幼儿喂养指南', sourceUrl: 'https://www.cnsoc.org/' },
    12: { tasks: ['一岁后可过渡到全脂牛奶（≤500ml/天）', '辅食变为正餐，奶为补充', '戒奶瓶，使用吸管杯/敞口杯', '练习独走', '补充维生素D 400IU/天'], source: '中国营养学会·婴幼儿喂养指南', sourceUrl: 'https://www.cnsoc.org/' },
    15: { tasks: ['一日三餐+两次点心', '鼓励自主用勺进食', '使用敞口杯喝水', '练习走得稳，可推玩具走', '补充维生素D 400IU/天'], source: 'WHO儿童发育标准', sourceUrl: 'https://www.who.int/childgrowth/standards/zh/' },
    18: { tasks: ['家庭饮食为主，注意少盐少糖', '鼓励用勺独立吃饭', '使用敞口杯', '练习跑、扶栏上楼梯', '补充维生素D 400IU/天'], source: 'WHO儿童发育标准', sourceUrl: 'https://www.who.int/childgrowth/standards/zh/' },
    24: { tasks: ['均衡饮食，培养不挑食习惯', '独立用餐具吃饭', '使用普通杯子喝水', '练习跑跳、踢球', '可开始如厕训练'], source: '中华医学会儿科学分会', sourceUrl: 'https://www.cma.org.cn/' },
    30: { tasks: ['参与食物选择和准备', '独立吃饭，学习餐桌礼仪', '练习双脚跳、单脚站', '继续如厕训练', '每日户外活动1-2小时'], source: '中华医学会儿科学分会', sourceUrl: 'https://www.cma.org.cn/' },
    36: { tasks: ['均衡饮食，建立健康饮食习惯', '独立穿脱简单衣物', '练习骑三轮车、平衡车', '如厕训练基本完成', '每日户外活动2小时'], source: '中华医学会儿科学分会', sourceUrl: 'https://www.cma.org.cn/' }
  };

  // 获取最接近的月龄里程碑
  function getMilestoneForAge(totalMonths) {
    if (totalMonths < 0) return null;
    var keys = Object.keys(BABY_MILESTONES).map(Number).sort(function(a, b) { return a - b; });
    var found = null;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] <= totalMonths) found = keys[i];
      else break;
    }
    if (found === null) found = keys[0];
    if (totalMonths > 36) found = 36;
    return { month: found, data: BABY_MILESTONES[found] };
  }

  // --- 辅食推荐数据库 ---
  // 来源：中国营养学会《7-24月龄婴幼儿喂养指南》、下厨房辅食食谱
  var BABY_FOOD_RECIPES = {
    6: { name: '强化铁米粉糊', desc: '取5g婴儿米粉，用40-50°C温水调成稀糊状，初次喂1-2勺，观察3天无过敏再加量', ingredients: '婴儿米粉5g、温水适量', source: '中国营养学会', sourceUrl: 'https://www.cnsoc.org/' },
    7: { name: '胡萝卜南瓜泥', desc: '胡萝卜和南瓜去皮切块蒸熟，用料理棒打成细腻的泥，可拌入米粉中喂食', ingredients: '胡萝卜30g、南瓜30g', source: '中国营养学会', sourceUrl: 'https://www.cnsoc.org/' },
    8: { name: '鸡肉蛋黄粥', desc: '大米煮成软粥，加入煮熟碾碎的蛋黄和鸡肉泥，搅拌均匀', ingredients: '大米20g、鸡胸肉15g、蛋黄1/2个', source: '中国营养学会', sourceUrl: 'https://www.cnsoc.org/' },
    9: { name: '三文鱼蔬菜碎面', desc: '细面条掰碎煮软，加入三文鱼碎和西蓝花碎，煮熟后少许核桃油拌匀', ingredients: '婴儿碎面20g、三文鱼15g、西蓝花15g', source: '下厨房·辅食食谱', sourceUrl: 'https://www.xiachufang.com/category/1021913/' },
    10: { name: '鲜虾豆腐小饼', desc: '鲜虾去壳剁泥，嫩豆腐压碎，加蛋黄和少许面粉搅拌成糊，平底锅小火煎成小饼', ingredients: '鲜虾20g、嫩豆腐30g、蛋黄1个、面粉10g', source: '下厨房·辅食食谱', sourceUrl: 'https://www.xiachufang.com/category/1021913/' },
    11: { name: '番茄牛肉软饭', desc: '牛肉剁碎炒熟，番茄去皮切碎煮成酱汁，拌入软米饭中', ingredients: '软米饭半碗、牛肉20g、番茄30g', source: '下厨房·辅食食谱', sourceUrl: 'https://www.xiachufang.com/category/1021913/' },
    12: { name: '时蔬鸡蛋软饭团', desc: '软米饭拌入炒碎的鸡蛋和焯水切碎的蔬菜，捏成小饭团方便手抓', ingredients: '软米饭半碗、鸡蛋1个、菠菜/胡萝卜适量', source: '中国营养学会', sourceUrl: 'https://www.cnsoc.org/' },
    15: { name: '鲜虾时蔬小馄饨', desc: '鲜虾剁泥拌入蔬菜碎做馅，包小馄饨煮熟，汤里可加少许紫菜', ingredients: '馄饨皮、鲜虾30g、白菜/西葫芦20g', source: '下厨房·幼儿食谱', sourceUrl: 'https://www.xiachufang.com/category/1021913/' },
    18: { name: '五彩蔬菜炒饭', desc: '米饭加胡萝卜丁、玉米粒、豌豆、鸡蛋炒制，少油少盐', ingredients: '米饭1碗、鸡蛋1个、混合蔬菜30g', source: '下厨房·幼儿食谱', sourceUrl: 'https://www.xiachufang.com/category/1021913/' },
    24: { name: '迷你蔬菜鸡蛋饼', desc: '鸡蛋打散加入切碎的蔬菜和少许面粉，煎成小饼，搭配小米粥', ingredients: '鸡蛋2个、面粉30g、西葫芦/胡萝卜适量', source: '下厨房·儿童食谱', sourceUrl: 'https://www.xiachufang.com/category/1021913/' },
    30: { name: '番茄龙利鱼意面', desc: '意面煮软，龙利鱼煎熟拆块，番茄煮成酱汁拌匀', ingredients: '儿童意面30g、龙利鱼40g、番茄1个', source: '下厨房·儿童食谱', sourceUrl: 'https://www.xiachufang.com/category/1021913/' },
    36: { name: '五彩饭团+紫菜蛋花汤', desc: '米饭拌入蔬菜碎捏成饭团，搭配紫菜蛋花汤，营养均衡', ingredients: '米饭1碗、混合蔬菜、鸡蛋1个、紫菜', source: '下厨房·儿童食谱', sourceUrl: 'https://www.xiachufang.com/category/1021913/' }
  };

  function getFoodForAge(totalMonths) {
    var keys = Object.keys(BABY_FOOD_RECIPES).map(Number).sort(function(a, b) { return a - b; });
    var found = null;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] <= totalMonths) found = keys[i];
      else break;
    }
    if (found === null) return null;
    if (totalMonths > 36) found = 36;
    return BABY_FOOD_RECIPES[found];
  }

  // --- 运动活动推荐数据库 ---
  // 来源：WHO身体活动指南、美国儿科学会(AAP)
  var BABY_ACTIVITIES = {
    0: { name: '肌肤接触+追视练习', desc: '每天多次肌肤接触（袋鼠护理）促进 bonding；用黑白卡或红色玩具在眼前20-30cm处缓慢移动，练习追视', source: 'WHO身体活动指南', sourceUrl: 'https://www.who.int/publications/i/item/9789240015128' },
    1: { name: '俯卧抬头+抚触按摩', desc: '每天在清醒时练习俯卧抬头3-5次，每次1-3分钟；做全身抚触按摩促进触觉发育', source: 'WHO身体活动指南', sourceUrl: 'https://www.who.int/publications/i/item/9789240015128' },
    2: { name: '翻身准备+抓握练习', desc: '用玩具引导宝宝侧身，辅助翻身练习；提供不同材质的玩具练习抓握', source: '美国儿科学会', sourceUrl: 'https://www.healthychildren.org/' },
    3: { name: '主动翻身+靠坐练习', desc: '鼓励宝宝自主翻身；用靠垫支撑练习靠坐，每次2-3分钟；敲打玩具练习手眼协调', source: '美国儿科学会', sourceUrl: 'https://www.healthychildren.org/' },
    4: { name: '翻身自如+拉坐练习', desc: '宝宝可自由翻滚；握住宝宝双手轻轻拉起到坐位，练习腹部力量', source: '美国儿科学会', sourceUrl: 'https://www.healthychildren.org/' },
    5: { name: '独坐练习+够取玩具', desc: '用枕头围圈练习独坐；前方放玩具鼓励前倾够取，练习平衡', source: '美国儿科学会', sourceUrl: 'https://www.healthychildren.org/' },
    6: { name: '独坐+爬行准备', desc: '练习独立坐稳；在面前放玩具鼓励前趴和匍匐爬行；双手传递玩具练习', source: 'WHO身体活动指南', sourceUrl: 'https://www.who.int/publications/i/item/9789240015128' },
    7: { name: '匍匐爬行+敲击玩具', desc: '鼓励匍匐前进追玩具；练习双手敲击玩具发出声音，锻炼手部力量', source: 'WHO身体活动指南', sourceUrl: 'https://www.who.int/publications/i/item/9789240015128' },
    8: { name: '手膝爬行+扶站准备', desc: '练习手膝爬行（四点支撑）；在沙发旁引导扶站；拇食指捏取小物品', source: 'WHO身体活动指南', sourceUrl: 'https://www.who.int/publications/i/item/9789240015128' },
    9: { name: '灵活爬行+扶物站立', desc: '爬行自如，设置障碍爬行游戏；练习扶着沙发站立和移步', source: '美国儿科学会', sourceUrl: 'https://www.healthychildren.org/' },
    10: { name: '扶走+蹲起取物', desc: '扶着家具侧步移行；鼓励蹲下捡玩具再站起来，练习下肢力量', source: '美国儿科学会', sourceUrl: 'https://www.healthychildren.org/' },
    11: { name: '独站+牵手行走', desc: '练习独站片刻；牵手练习迈步；推学步车或小推车前行', source: '美国儿科学会', sourceUrl: 'https://www.healthychildren.org/' },
    12: { name: '独走练习+球类游戏', desc: '鼓励独立行走；练习滚球和接球游戏，促进手眼协调和大运动发展', source: 'WHO身体活动指南', sourceUrl: 'https://www.who.int/publications/i/item/9789240015128' },
    15: { name: '稳走+蹲下起立', desc: '走路稳定后练习跑步；蹲下捡物再站起；推拉玩具游戏', source: 'WHO身体活动指南', sourceUrl: 'https://www.who.int/publications/i/item/9789240015128' },
    18: { name: '跑步+扶栏上楼梯', desc: '练习跑步（注意安全）；扶栏杆上楼梯（一步一阶）；踢球游戏', source: 'WHO身体活动指南', sourceUrl: 'https://www.who.int/publications/i/item/9789240015128' },
    24: { name: '双脚跳+骑三轮车', desc: '练习双脚同时跳起；骑三轮车（脚踏式）；抛接大球；每天至少180分钟身体活动', source: 'WHO身体活动指南', sourceUrl: 'https://www.who.int/publications/i/item/9789240015128' },
    30: { name: '单脚站+平衡游戏', desc: '练习单脚站立2-3秒；平衡木行走；跳跃障碍物；每天至少180分钟活动', source: '美国儿科学会', sourceUrl: 'https://www.healthychildren.org/' },
    36: { name: '骑车+综合运动', desc: '骑平衡车或三轮车；跑跳自如；投接球；每天至少60分钟中高强度活动', source: 'WHO身体活动指南', sourceUrl: 'https://www.who.int/publications/i/item/9789240015128' }
  };

  function getActivityForAge(totalMonths) {
    var keys = Object.keys(BABY_ACTIVITIES).map(Number).sort(function(a, b) { return a - b; });
    var found = null;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] <= totalMonths) found = keys[i];
      else break;
    }
    if (found === null) return null;
    if (totalMonths > 36) found = 36;
    return BABY_ACTIVITIES[found];
  }

  // --- 育儿学习资源 ---
  var PARENTING_RESOURCES = [
    { name: '崔玉涛育学园', desc: '儿科医生崔玉涛的微博，每日分享喂养、疾病、发育等育儿科普', url: 'https://weibo.com/cuiyutao', type: '医生科普' },
    { name: '崔玉涛图解家庭育儿（系列图书）', desc: '畅销育儿图书系列，图文并茂讲解0-6岁育儿知识', url: 'https://book.douban.com/subject/26640907/', type: '育儿书籍' },
    { name: '张思莱医师（新浪微博）', desc: '儿科专家张思莱的育儿科普，涵盖喂养、疫苗接种、常见病防治', url: 'https://weibo.com/u/1412779214', type: '医生科普' },
    { name: '美国儿科学会育儿百科（第7版）', desc: '权威育儿全书，从出生到5岁全面指导，被全球父母奉为"育儿圣经"', url: 'https://book.douban.com/subject/35218443/', type: '育儿书籍' },
    { name: '年糕妈妈（B站辅食视频）', desc: '母婴科普博主，B站搜索辅食制作视频和育儿知识科普', url: 'https://search.bilibili.com/all?keyword=%E5%B9%B4%E7%B3%95%E5%A6%88%E5%A6%88%E8%BE%85%E9%A3%9F', type: '科普视频' },
    { name: '丁香妈妈', desc: '丁香园旗下母婴科普平台，专业医学背景的育儿知识', url: 'https://mama.dxy.com/', type: '医学科普' },
    { name: '小土大橙子·婴幼儿睡眠全书', desc: '知名婴幼儿睡眠科普博主，专注于宝宝睡眠引导和作息调整', url: 'https://book.douban.com/subject/35223279/', type: '睡眠科普' },
    { name: '中国营养学会·婴幼儿喂养指南', desc: '中国营养学会官方发布的0-2岁婴幼儿喂养权威指南', url: 'https://www.cnsoc.org/', type: '权威指南' }
  ];

  // 根据月龄推荐当天学习资源（轮换展示）
  function getResourceForToday(totalMonths) {
    if (totalMonths < 6) return PARENTING_RESOURCES[7]; // 喂养指南
    if (totalMonths < 12) return PARENTING_RESOURCES[0]; // 崔玉涛
    if (totalMonths < 24) return PARENTING_RESOURCES[4]; // 年糕妈妈
    // 24月以上轮换
    var dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    var pool = [1, 3, 5, 6]; // 书籍和科普
    return PARENTING_RESOURCES[pool[dayOfYear % pool.length]];
  }

  // --- 天气获取（Open-Meteo 免费API，无需key） ---
  function fetchWeather(city, callback) {
    if (!city) {
      callback(null);
      return;
    }
    // 先用 geocoding API 查城市坐标
    var geoUrl = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=zh&format=json';

    fetch(geoUrl)
      .then(function(res) { return res.json(); })
      .then(function(geoData) {
        if (!geoData.results || geoData.results.length === 0) {
          callback(null);
          return;
        }
        var lat = geoData.results[0].latitude;
        var lon = geoData.results[0].longitude;
        var weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
          '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Asia%2FShanghai&forecast_days=1';

        return fetch(weatherUrl).then(function(r) { return r.json(); });
      })
      .then(function(data) {
        if (!data) { callback(null); return; }
        callback(data);
      })
      .catch(function() { callback(null); });
  }

  // WMO天气码转中文描述
  function wmoToText(code) {
    var map = {
      0: '晴', 1: '晴', 2: '多云', 3: '阴',
      45: '雾', 48: '雾凇',
      51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
      56: '冻毛毛雨', 57: '强冻毛毛雨',
      61: '小雨', 63: '中雨', 65: '大雨',
      66: '冻雨', 67: '强冻雨',
      71: '小雪', 73: '中雪', 75: '大雪',
      77: '雪粒',
      80: '阵雨', 81: '中阵雨', 82: '强阵雨',
      85: '阵雪', 86: '强阵雪',
      95: '雷暴', 96: '雷暴伴冰雹', 99: '强雷暴伴冰雹'
    };
    return map[code] || '未知';
  }

  // 根据天气推荐穿着和出门物品
  function getWeatherOutfit(temp, weatherCode, precipProb) {
    var outfit = [];
    var items = [];
    var desc = wmoToText(weatherCode);

    if (temp >= 28) {
      outfit.push('短袖/背心 + 薄短裤');
      items.push('遮阳帽', '防晒霜（SPF30+）');
      if (temp >= 33) items.push('便携小风扇', '多备一套换洗衣物');
    } else if (temp >= 22) {
      outfit.push('短袖/薄长袖 + 长裤');
      items.push('遮阳帽');
    } else if (temp >= 15) {
      outfit.push('长袖 + 薄外套/卫衣 + 长裤');
      items.push('薄毯（午睡用）');
    } else if (temp >= 8) {
      outfit.push('保暖内衣 + 毛衣 + 外套 + 厚长裤');
      items.push('保暖帽', '薄手套');
    } else if (temp >= 0) {
      outfit.push('保暖内衣 + 毛衣 + 羽绒服 + 厚裤');
      items.push('保暖帽', '手套', '围巾');
    } else {
      outfit.push('全副保暖：内衣+毛衣+厚羽绒服+加绒裤');
      items.push('保暖帽', '厚手套', '围巾', '暖宝宝');
    }

    // 降水判断
    if (precipProb >= 50 || [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].indexOf(weatherCode) >= 0) {
      items.push('雨伞/雨衣', '防水鞋套');
    }
    if ([71,73,75,77,85,86].indexOf(weatherCode) >= 0) {
      items.push('防水靴', '额外袜子');
    }

    // 风大
    if (desc.indexOf('雷暴') >= 0) {
      items.push('建议减少外出');
    }

    return { outfit: outfit, items: items, desc: desc };
  }

  // --- 每日育儿小贴士 ---
  var PARENTING_TIPS = [
    { tag: '营养', title: '彩虹饮食法', content: '每天让孩子摄入5种不同颜色的蔬果，确保营养全面均衡。' },
    { tag: '睡眠', title: '建立睡前仪式', content: '固定的睡前流程（洗澡→讲故事→关灯）能帮孩子建立安全感。' },
    { tag: '情绪', title: '接纳孩子的情绪', content: '当孩子哭闹时，先说"我知道你很难过"，再引导表达。' },
    { tag: '运动', title: '每天户外1小时', content: '充足的户外活动不仅促进视力发育，还能提高免疫力。' },
    { tag: '阅读', title: '亲子共读20分钟', content: '每天固定时间亲子阅读，不仅能提升语言能力，更是建立亲密关系的黄金时刻。' },
    { tag: '安全', title: '家庭安全检查', content: '每月检查一次家中安全隐患：插座保护盖、药品锁好、尖锐物品收纳。' },
    { tag: '心理', title: '夸努力不夸聪明', content: '"你真努力"比"你真聪明"更能培养成长型思维。' },
    { tag: '陪伴', title: '高质量陪伴', content: '放下手机，全心全意陪孩子15分钟，胜过心不在焉地陪一整天。' }
  ];

  // --- 个人记录 ---
  function getParentingNotes() {
    var all = loadData('dashboard_parenting') || {};
    return all[getTodayKey()] || [];
  }

  function saveParentingNotes(notes) {
    var all = loadData('dashboard_parenting') || {};
    all[getTodayKey()] = notes;
    saveData('dashboard_parenting', all);
  }

  window.addParentingNote = function() {
    var input = document.getElementById('parentingInput');
    var text = input.value.trim();
    if (!text) return;
    var notes = getParentingNotes();
    var now = new Date();
    notes.push({
      id: Date.now(),
      text: text,
      time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
    });
    saveParentingNotes(notes);
    input.value = '';
    renderParentingNotes();
  };

  window.deleteParentingNote = function(id) {
    var notes = getParentingNotes();
    notes = notes.filter(function(n) { return n.id !== id; });
    saveParentingNotes(notes);
    renderParentingNotes();
  };

  // --- 渲染育儿面板 ---
  function renderParentingAge() {
    var el = document.getElementById('parentingAgeDisplay');
    if (!el) return;
    var profile = getBabyProfile();
    if (!profile.birthDate) {
      el.innerHTML = '<div class="baby-setup-hint">👆 请设置宝宝生日，解锁个性化育儿指导</div>';
      return;
    }
    var age = calcBabyAge(profile.birthDate);
    if (!age) {
      el.innerHTML = '<div class="baby-setup-hint">生日日期有误，请重新设置</div>';
      return;
    }
    var ageText = '';
    if (age.years > 0) ageText += age.years + '岁';
    ageText += age.months + '个月' + age.days + '天';
    var genderIcon = profile.gender === 'boy' ? '👦' : (profile.gender === 'girl' ? '👧' : '👶');
    var genderLabel = profile.gender === 'boy' ? '男宝' : (profile.gender === 'girl' ? '女宝' : '');
    el.innerHTML = '<div class="baby-age-card">' +
      '<span class="baby-age-icon">' + genderIcon + '</span>' +
      '<div class="baby-age-info">' +
        '<div class="baby-age-num">' + (genderLabel ? genderLabel + ' · ' : '') + ageText + '</div>' +
        '<div class="baby-age-total">（共 ' + age.totalMonths + ' 个月龄）</div>' +
      '</div></div>';
  }

  function renderParentingMilestone() {
    var el = document.getElementById('parentingMilestone');
    if (!el) return;
    var profile = getBabyProfile();
    if (!profile.birthDate) { el.innerHTML = ''; return; }
    var age = calcBabyAge(profile.birthDate);
    if (!age) { el.innerHTML = ''; return; }
    var ms = getMilestoneForAge(age.totalMonths);
    if (!ms) { el.innerHTML = ''; return; }

    var html = '<div class="parenting-section-block">' +
      '<div class="block-header"><span class="block-icon">📋</span>本月龄需做的事（' + ms.month + '月龄）</div>' +
      '<ul class="milestone-list">';
    ms.data.tasks.forEach(function(t) {
      html += '<li class="milestone-item">' + escapeHtml(t) + '</li>';
    });
    html += '</ul>';
    html += '<a class="block-source" href="' + ms.data.sourceUrl + '" target="_blank" rel="noopener">来源：' + escapeHtml(ms.data.source) + ' ↗</a>';
    html += '</div>';
    el.innerHTML = html;
  }

  function renderParentingWeather() {
    var el = document.getElementById('parentingWeather');
    if (!el) return;
    var profile = getBabyProfile();
    if (!profile.city) {
      el.innerHTML = '<div class="parenting-section-block"><div class="block-header"><span class="block-icon">🌤️</span>今日天气与穿着</div>' +
        '<div class="weather-hint">请设置城市获取天气穿着建议</div></div>';
      return;
    }

    el.innerHTML = '<div class="parenting-section-block"><div class="block-header"><span class="block-icon">🌤️</span>今日天气与穿着</div>' +
      '<div class="weather-loading">正在获取天气...</div></div>';

    fetchWeather(profile.city, function(data) {
      if (!data || !data.current) {
        el.innerHTML = '<div class="parenting-section-block"><div class="block-header"><span class="block-icon">🌤️</span>今日天气与穿着</div>' +
          '<div class="weather-hint">天气获取失败，请检查城市名或稍后重试</div></div>';
        return;
      }

      var cur = data.current;
      var daily = data.daily || {};
      var temp = cur.temperature_2m;
      var feelTemp = cur.apparent_temperature;
      var code = cur.weather_code;
      var precipProb = daily.precipitation_probability_max || 0;
      var tempMax = daily.temperature_2m_max || temp;
      var tempMin = daily.temperature_2m_min || temp;
      var desc = wmoToText(code);
      var wind = cur.wind_speed_10m;

      var rec = getWeatherOutfit(temp, code, precipProb);

      var html = '<div class="parenting-section-block">' +
        '<div class="block-header"><span class="block-icon">🌤️</span>今日天气与穿着 · ' + escapeHtml(profile.city) + '</div>' +
        '<div class="weather-info">' +
          '<div class="weather-main">' +
            '<span class="weather-temp">' + Math.round(temp) + '°C</span>' +
            '<span class="weather-desc">' + desc + '</span>' +
          '</div>' +
          '<div class="weather-detail">体感 ' + Math.round(feelTemp) + '°C · ' + tempMin + '°~' + tempMax + '° · 风速 ' + wind + 'km/h · 降水概率 ' + precipProb + '%</div>' +
        '</div>' +
        '<div class="weather-outfit"><span class="outfit-label">👕 穿着建议：</span>' + rec.outfit.join('、') + '</div>';

      if (rec.items.length > 0) {
        html += '<div class="weather-items"><span class="outfit-label">🎒 出门携带：</span>' + rec.items.map(function(i) {
          return '<span class="item-tag">' + escapeHtml(i) + '</span>';
        }).join('') + '</div>';
      }

      html += '<a class="block-source" href="https://open-meteo.com/" target="_blank" rel="noopener">来源：Open-Meteo ↗</a>';
      html += '</div>';
      el.innerHTML = html;
    });
  }

  function renderParentingFood() {
    var el = document.getElementById('parentingFood');
    if (!el) return;
    var profile = getBabyProfile();
    if (!profile.birthDate) { el.innerHTML = ''; return; }
    var age = calcBabyAge(profile.birthDate);
    if (!age) { el.innerHTML = ''; return; }
    if (age.totalMonths < 6) {
      el.innerHTML = '<div class="parenting-section-block"><div class="block-header"><span class="block-icon">🥣</span>今日辅食推荐</div>' +
        '<div class="food-hint">6个月以下宝宝纯奶喂养，暂不需要添加辅食</div>' +
        '<a class="block-source" href="https://www.cnsoc.org/" target="_blank" rel="noopener">来源：中国营养学会 ↗</a></div>';
      return;
    }
    var food = getFoodForAge(age.totalMonths);
    if (!food) { el.innerHTML = ''; return; }

    el.innerHTML = '<div class="parenting-section-block">' +
      '<div class="block-header"><span class="block-icon">🥣</span>今日辅食推荐（' + age.totalMonths + '月龄）</div>' +
      '<div class="food-card">' +
        '<div class="food-name">' + escapeHtml(food.name) + '</div>' +
        '<div class="food-desc">' + escapeHtml(food.desc) + '</div>' +
        '<div class="food-ingredients">食材：' + escapeHtml(food.ingredients) + '</div>' +
      '</div>' +
      '<a class="block-source" href="' + food.sourceUrl + '" target="_blank" rel="noopener">来源：' + escapeHtml(food.source) + ' ↗</a>' +
    '</div>';
  }

  function renderParentingActivity() {
    var el = document.getElementById('parentingActivity');
    if (!el) return;
    var profile = getBabyProfile();
    if (!profile.birthDate) { el.innerHTML = ''; return; }
    var age = calcBabyAge(profile.birthDate);
    if (!age) { el.innerHTML = ''; return; }
    var act = getActivityForAge(age.totalMonths);
    if (!act) { el.innerHTML = ''; return; }

    el.innerHTML = '<div class="parenting-section-block">' +
      '<div class="block-header"><span class="block-icon">🏃</span>今日运动活动推荐（' + age.totalMonths + '月龄）</div>' +
      '<div class="activity-card">' +
        '<div class="activity-name">' + escapeHtml(act.name) + '</div>' +
        '<div class="activity-desc">' + escapeHtml(act.desc) + '</div>' +
      '</div>' +
      '<a class="block-source" href="' + act.sourceUrl + '" target="_blank" rel="noopener">来源：' + escapeHtml(act.source) + ' ↗</a>' +
    '</div>';
  }

  function renderParentingResource() {
    var el = document.getElementById('parentingResource');
    if (!el) return;
    var profile = getBabyProfile();
    var age = profile.birthDate ? calcBabyAge(profile.birthDate) : null;
    var totalMonths = age ? age.totalMonths : 0;
    var res = getResourceForToday(totalMonths);

    el.innerHTML = '<div class="parenting-section-block">' +
      '<div class="block-header"><span class="block-icon">📚</span>育儿学习资源</div>' +
      '<div class="resource-card">' +
        '<div class="resource-type">' + escapeHtml(res.type) + '</div>' +
        '<a class="resource-name" href="' + res.url + '" target="_blank" rel="noopener">' + escapeHtml(res.name) + ' ↗</a>' +
        '<div class="resource-desc">' + escapeHtml(res.desc) + '</div>' +
      '</div>' +
    '</div>';
  }

  // --- 疫苗提醒（中国国家免疫规划疫苗程序） ---
  // 来源：国家疾病预防控制局《国家免疫规划疫苗儿童免疫程序表》
  var VACCINE_SCHEDULE = [
    { ageMonths: 0, name: '乙肝疫苗（第1剂）', desc: '出生后24小时内接种', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 0, name: '卡介苗（第1剂）', desc: '出生后尽早接种，预防结核病', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 1, name: '乙肝疫苗（第2剂）', desc: '出生后1月龄接种', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 2, name: '脊灰灭活疫苗（第1剂）', desc: '2月龄接种，预防脊髓灰质炎', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 3, name: '脊灰减毒活疫苗（第2剂）', desc: '3月龄接种', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 3, name: '百白破疫苗（第1剂）', desc: '3月龄接种，预防百日咳、白喉、破伤风', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 4, name: '脊灰减毒活疫苗（第3剂）', desc: '4月龄接种', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 4, name: '百白破疫苗（第2剂）', desc: '4月龄接种', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 5, name: '百白破疫苗（第3剂）', desc: '5月龄接种', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 6, name: '乙肝疫苗（第3剂）', desc: '6月龄接种', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 6, name: 'A群流脑多糖疫苗（第1剂）', desc: '6月龄接种，预防流行性脑脊髓膜炎', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 8, name: '麻腮风疫苗（第1剂）', desc: '8月龄接种，预防麻疹、流行性腮腺炎、风疹', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 9, name: 'A群流脑多糖疫苗（第2剂）', desc: '9月龄接种', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 12, name: '乙脑减毒活疫苗（第1剂）', desc: '12月龄接种，预防流行性乙型脑炎', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 18, name: '百白破疫苗（第4剂）', desc: '18月龄接种（加强）', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 18, name: '麻腮风疫苗（第2剂）', desc: '18月龄接种（加强）', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 18, name: '甲肝减毒活疫苗（第1剂）', desc: '18月龄接种，预防甲型肝炎', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 24, name: '乙脑减毒活疫苗（第2剂）', desc: '2岁接种（加强）', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 24, name: 'A+C群流脑多糖疫苗（第1剂）', desc: '2岁接种（加强）', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 36, name: 'A+C群流脑多糖疫苗（第2剂）', desc: '3岁接种（加强）', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 48, name: '脊灰减毒活疫苗（第4剂）', desc: '4岁接种（加强）', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' },
    { ageMonths: 72, name: '白破疫苗（第5剂）', desc: '6岁接种（加强）', source: '国家免疫规划', sourceUrl: 'http://www.nhc.gov.cn/' }
  ];

  function renderParentingVaccine() {
    var el = document.getElementById('parentingVaccine');
    if (!el) return;
    var profile = getBabyProfile();
    if (!profile.birthDate) { el.innerHTML = ''; return; }
    var age = calcBabyAge(profile.birthDate);
    if (!age) { el.innerHTML = ''; return; }

    var totalMonths = age.totalMonths;
    // 获取已接种记录
    var vaccinated = loadData('dashboard_vaccinated') || {};

    // 找出：已到月龄但尚未标记接种的疫苗（待接种）
    var dueVaccines = [];
    var upcomingVaccines = [];
    VACCINE_SCHEDULE.forEach(function(v) {
      var vKey = v.name + '_' + v.ageMonths;
      if (v.ageMonths <= totalMonths) {
        if (!vaccinated[vKey]) {
          dueVaccines.push(v);
        }
      } else if (v.ageMonths <= totalMonths + 3) {
        upcomingVaccines.push(v);
      }
    });

    var html = '<div class="parenting-section-block">' +
      '<div class="block-header"><span class="block-icon">💉</span>疫苗提醒</div>';

    if (dueVaccines.length > 0) {
      html += '<div class="vaccine-group-label vaccine-due">需接种</div>';
      dueVaccines.forEach(function(v) {
        var vKey = v.name + '_' + v.ageMonths;
        html += '<div class="vaccine-item vaccine-due-item">' +
          '<div class="vaccine-info">' +
            '<div class="vaccine-name">' + escapeHtml(v.name) + '</div>' +
            '<div class="vaccine-desc">' + escapeHtml(v.desc) + '（' + v.ageMonths + '月龄）</div>' +
          '</div>' +
          '<button class="vaccine-check-btn" onclick="toggleVaccine(\'' + vKey + '\')" title="标记已接种">✓</button>' +
        '</div>';
      });
    }

    if (upcomingVaccines.length > 0) {
      html += '<div class="vaccine-group-label vaccine-upcoming">即将接种</div>';
      upcomingVaccines.forEach(function(v) {
        var vKey = v.name + '_' + v.ageMonths;
        var isVaccinated = vaccinated[vKey];
        html += '<div class="vaccine-item' + (isVaccinated ? ' vaccine-done' : '') + '">' +
          '<div class="vaccine-info">' +
            '<div class="vaccine-name">' + escapeHtml(v.name) + (isVaccinated ? ' ✓' : '') + '</div>' +
            '<div class="vaccine-desc">' + escapeHtml(v.desc) + '（' + v.ageMonths + '月龄）</div>' +
          '</div>' +
          '<button class="vaccine-check-btn" onclick="toggleVaccine(\'' + vKey + '\')" title="' + (isVaccinated ? '取消标记' : '标记已接种') + '">' + (isVaccinated ? '✓' : '○') + '</button>' +
        '</div>';
      });
    }

    if (dueVaccines.length === 0 && upcomingVaccines.length === 0) {
      html += '<div class="weather-hint">当前月龄暂无需要接种的疫苗</div>';
    }

    html += '<a class="block-source" href="http://www.nhc.gov.cn/" target="_blank" rel="noopener">来源：国家免疫规划疫苗儿童免疫程序 ↗</a>';
    html += '</div>';
    el.innerHTML = html;
  }

  window.toggleVaccine = function(vKey) {
    var vaccinated = loadData('dashboard_vaccinated') || {};
    if (vaccinated[vKey]) {
      delete vaccinated[vKey];
    } else {
      vaccinated[vKey] = new Date().toISOString().substring(0, 10);
    }
    saveData('dashboard_vaccinated', vaccinated);
    renderParentingVaccine();
  };

  function renderParentingTip() {
    var tipEl = document.getElementById('parentingTip');
    if (!tipEl) return;
    var dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    var tip = PARENTING_TIPS[dayOfYear % PARENTING_TIPS.length];
    tipEl.innerHTML =
      '<div class="parenting-tip">' +
      '<span class="tip-tag">' + tip.tag + '</span>' +
      '<div class="tip-title">' + tip.title + '</div>' +
      '<div class="tip-content">' + tip.content + '</div>' +
      '</div>';
  }

  function renderParentingNotes() {
    var list = document.getElementById('parentingNotes');
    if (!list) return;
    var notes = getParentingNotes();
    if (notes.length === 0) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = notes.map(function(n) {
      return '<li class="parenting-note-item">' +
        '<span class="note-text">' + escapeHtml(n.text) + '</span>' +
        '<span class="note-time">' + n.time + '</span>' +
        '<button class="btn-icon" onclick="deleteParentingNote(' + n.id + ')" title="删除">×</button>' +
        '</li>';
    }).join('');
  }

  function renderParenting() {
    // 恢复已保存的宝宝信息到输入框
    var profile = getBabyProfile();
    var birthInput = document.getElementById('babyBirthInput');
    var cityInput = document.getElementById('babyCityInput');
    var genderInput = document.getElementById('babyGenderInput');
    if (birthInput && profile.birthDate && !birthInput.value) birthInput.value = profile.birthDate;
    if (cityInput && profile.city && !cityInput.value) cityInput.value = profile.city;
    if (genderInput && profile.gender) genderInput.value = profile.gender;

    renderParentingTip();
    renderParentingAge();
    renderParentingMilestone();
    renderParentingWeather();
    renderParentingFood();
    renderParentingActivity();
    renderParentingResource();
    renderParentingNotes();
  }

  // ========================================
  // 5. 今日花费
  // ========================================
  function getSpending() {
    var all = loadData('dashboard_spending') || {};
    return all[getTodayKey()] || [];
  }

  function saveSpending(items) {
    var all = loadData('dashboard_spending') || {};
    all[getTodayKey()] = items;
    saveData('dashboard_spending', all);
  }

  window.addSpending = function() {
    var catEl = document.getElementById('spendCategory');
    var amtEl = document.getElementById('spendAmount');
    var noteEl = document.getElementById('spendNote');
    var amount = parseFloat(amtEl.value);
    if (!amount || amount <= 0) return;

    var items = getSpending();
    items.push({
      id: Date.now(),
      category: catEl.value,
      amount: amount,
      note: noteEl.value.trim() || categoryMap[catEl.value].name
    });
    saveSpending(items);
    amtEl.value = '';
    noteEl.value = '';
    renderSpending();
  };

  window.deleteSpending = function(id) {
    var items = getSpending();
    items = items.filter(function(i) { return i.id !== id; });
    saveSpending(items);
    renderSpending();
  };

  function renderSpending() {
    var items = getSpending();
    var total = items.reduce(function(sum, i) { return sum + i.amount; }, 0);
    document.getElementById('spendingTotal').textContent = '¥' + total.toFixed(2);

    var list = document.getElementById('spendingList');
    if (items.length === 0) {
      list.innerHTML = '<li class="todo-empty">今日还没有花费记录</li>';
      return;
    }

    list.innerHTML = items.map(function(i) {
      var cat = categoryMap[i.category] || categoryMap.other;
      return '<li class="spending-item">' +
        '<span class="spending-cat ' + cat.cls + '">' + cat.name + '</span>' +
        '<span class="spending-note">' + escapeHtml(i.note) + '</span>' +
        '<span class="spending-amount">¥' + i.amount.toFixed(2) + '</span>' +
        '<button class="btn-icon" onclick="deleteSpending(' + i.id + ')" title="删除">×</button>' +
        '</li>';
    }).join('');
  }

  // ========================================
  // 4. 投资（大盘指数 + 股票行情 + 基金净值）
  // ========================================

  // --- JSONP 辅助 ---
  function jsonpRequest(url, callbackName, callback) {
    window[callbackName] = function(data) {
      try { callback(null, data); } finally {
        delete window[callbackName];
        var s = document.getElementById('jsonp_' + callbackName);
        if (s) s.parentNode.removeChild(s);
      }
    };
    var script = document.createElement('script');
    script.id = 'jsonp_' + callbackName;
    script.src = url + (url.indexOf('?') > -1 ? '&' : '?') + 'cb=' + callbackName;
    script.onerror = function() {
      delete window[callbackName];
      script.parentNode && script.parentNode.removeChild(script);
      callback(new Error('请求失败'));
    };
    document.head.appendChild(script);
  }

  // --- CORS 代理列表（与基金 API 一致） ---
  var CORS_PROXIES = [
    function(url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
    function(url) { return 'https://corsproxy.io/?url=' + encodeURIComponent(url); },
    function(url) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(url); }
  ];

  function fetchWithProxy(url, callback) {
    var proxyIdx = 0;
    function tryProxy(idx) {
      if (idx >= CORS_PROXIES.length) {
        callback(new Error('所有代理均失败'));
        return;
      }
      var proxyUrl = CORS_PROXIES[idx](url);
      var controller = new AbortController();
      var timeoutId = setTimeout(function() { controller.abort(); }, 8000);
      fetch(proxyUrl, { signal: controller.signal })
        .then(function(res) { clearTimeout(timeoutId); return res.json(); })
        .then(function(data) { callback(null, data); })
        .catch(function() {
          clearTimeout(timeoutId);
          tryProxy(idx + 1);
        });
    }
    tryProxy(0);
  }

  // --- 大盘指数 ---
  var MARKET_INDICES = [
    { secid: '1.000001', name: '上证指数', isUS: false },
    { secid: '0.399001', name: '深证成指', isUS: false },
    { secid: '0.399006', name: '创业板指', isUS: false },
    { secid: '0.000688', name: '科创50',  isUS: false },
    { secid: '100.SPX',  name: '标普500', isUS: true },
    { secid: '100.NDX',  name: '纳斯达克', isUS: true }
  ];

  function fetchMarketIndices() {
    var grid = document.getElementById('indexGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="index-loading">正在获取指数数据...</div>';

    var secids = MARKET_INDICES.map(function(i) { return i.secid; }).join(',');
    var apiUrl = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f2,f3,f4,f12,f13,f14&secids=' + secids;
    var cbName = 'jsonp_idx_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

    jsonpRequest(apiUrl, cbName, function(err, data) {
      if (err || !data || !data.data || !data.data.diff) {
        grid.innerHTML = '<div class="index-loading">数据获取失败，点击 ↻ 刷新重试</div>';
        return;
      }
      var items = data.data.diff;
      var html = '';
      MARKET_INDICES.forEach(function(mi) {
        var item = items.find(function(d) { return d.f13 + '.' + d.f12 === mi.secid; });
        if (!item) return;
        var price = (parseFloat(item.f2) || 0) / 100;
        var pct = (parseFloat(item.f3) || 0) / 100;
        var chg = (parseFloat(item.f4) || 0) / 100;
        var cls = pct > 0 ? 'up' : (pct < 0 ? 'down' : '');
        var prefix = pct > 0 ? '+' : '';
        html += '<div class="index-card' + (mi.isUS ? ' us-market' : '') + '">' +
          '<div class="idx-name">' + mi.name + (mi.isUS ? ' 🇺🇸' : ' 🇨🇳') + '</div>' +
          '<div class="idx-price">' + price.toFixed(2) + '</div>' +
          '<div class="idx-change ' + cls + '">' + prefix + chg.toFixed(2) + ' (' + prefix + pct.toFixed(2) + '%)</div>' +
        '</div>';
      });
      grid.innerHTML = html || '<div class="index-loading">暂无数据</div>';
    });
  }

  window.refreshMarketData = function() {
    fetchMarketIndices();
    fetchStockPrices();
    fetchFundValuations(true);
  };

  // --- 股票行情 ---
  function getStockList() {
    return loadData('dashboard_stock_list') || [];
  }
  function saveStockList(stocks) {
    saveData('dashboard_stock_list', stocks);
  }

  // 根据代码判断市场：6开头=沪市(1)，0/3开头=深市(0)
  function getStockSecid(code) {
    if (/^[6]/.test(code)) return '1.' + code;
    if (/^[0359]/.test(code)) return '0.' + code;
    if (/^[48]/.test(code)) return '0.' + code; // 北交所也用0
    return '1.' + code;
  }

  window.addStock = function() {
    var input = document.getElementById('stockCodeInput');
    var code = input.value.trim();
    if (!code || !/^\d{6}$/.test(code)) {
      alert('请输入有效的6位股票代码');
      return;
    }
    var stocks = getStockList();
    if (stocks.find(function(s) { return s.code === code; })) {
      alert('该股票已添加');
      return;
    }
    stocks.push({ code: code, name: '', addedAt: Date.now() });
    saveStockList(stocks);
    input.value = '';
    fetchStockPrices();
  };

  window.removeStock = function(code) {
    var stocks = getStockList();
    stocks = stocks.filter(function(s) { return s.code !== code; });
    saveStockList(stocks);
    fetchStockPrices();
  };

  function fetchStockPrices() {
    var listEl = document.getElementById('stockList');
    if (!listEl) return;
    var stocks = getStockList();
    if (stocks.length === 0) {
      listEl.innerHTML = '<li class="fund-loading">添加股票代码后显示实时行情</li>';
      return;
    }
    listEl.innerHTML = '<li class="fund-loading">正在获取股票行情...</li>';

    var secids = stocks.map(function(s) { return getStockSecid(s.code); }).join(',');
    var apiUrl = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f2,f3,f4,f12,f13,f14,f15,f16,f17&secids=' + secids;
    var cbName = 'jsonp_stk_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

    jsonpRequest(apiUrl, cbName, function(err, data) {
      if (err || !data || !data.data || !data.data.diff) {
        listEl.innerHTML = '<li class="fund-loading">数据获取失败，点击 ↻ 刷新重试</li>';
        return;
      }
      var items = data.data.diff;
      // 更新股票名称到存储
      var updated = stocks.map(function(s) {
        var item = items.find(function(d) { return d.f12 === s.code; });
        return { code: s.code, name: item ? item.f14 : s.name, addedAt: s.addedAt };
      });
      saveStockList(updated);
      // 渲染
      listEl.innerHTML = items.map(function(item) {
        var price = (parseFloat(item.f2) || 0) / 100;
        var pct = (parseFloat(item.f3) || 0) / 100;
        var chg = (parseFloat(item.f4) || 0) / 100;
        var high = (parseFloat(item.f15) || 0) / 100;
        var low = (parseFloat(item.f16) || 0) / 100;
        var cls = pct > 0 ? 'up' : (pct < 0 ? 'down' : '');
        var prefix = pct > 0 ? '+' : '';
        return '<li class="fund-item">' +
          '<div class="fund-info">' +
            '<div class="fund-name-row">' +
              '<span class="fund-name">' + escapeHtml(item.f14) + '</span>' +
              '<span class="fund-code">' + item.f12 + '</span>' +
            '</div>' +
            '<div class="fund-vals">' +
              '<span>现价 <b class="fund-gsz ' + cls + '">' + price.toFixed(2) + '</b></span>' +
              '<span class="fund-gsz ' + cls + '">' + prefix + chg.toFixed(2) + ' (' + prefix + pct.toFixed(2) + '%)</span>' +
              '<span style="font-size:0.68rem;color:var(--muted)">高 ' + high.toFixed(2) + ' 低 ' + low.toFixed(2) + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="btn-icon" onclick="removeStock(\'' + item.f12 + '\')" title="删除">×</button>' +
        '</li>';
      }).join('');
    });
  }

  // ========================================
  // 6. 天天基金实时估值
  // ========================================
  function getFundList() {
    return loadData('dashboard_fund_list') || [];
  }

  function saveFundList(funds) {
    saveData('dashboard_fund_list', funds);
  }

  window.addFund = function() {
    var input = document.getElementById('fundCodeInput');
    var code = input.value.trim();
    if (!code || !/^\d{5,6}$/.test(code)) {
      alert('请输入有效的基金代码（5-6位数字）');
      return;
    }
    var funds = getFundList();
    if (funds.find(function(f) { return f.code === code; })) {
      alert('该基金已添加');
      return;
    }
    funds.push({ code: code, name: '', addedAt: Date.now() });
    saveFundList(funds);
    input.value = '';
    fetchFundValuations();
  };

  window.removeFund = function(code) {
    var funds = getFundList();
    funds = funds.filter(function(f) { return f.code !== code; });
    saveFundList(funds);
    renderFundList([]);
    fetchFundValuations();
  };

  window.refreshFunds = function() {
    fetchFundValuations(true);
  };

  // 天天基金实时估值 API（JSONP格式）
  function fetchFundValuations(force) {
    var funds = getFundList();
    var listEl = document.getElementById('fundList');

    if (funds.length === 0) {
      if (listEl) listEl.innerHTML = '<li class="fund-loading">添加基金代码后显示实时估值</li>';
      return;
    }

    if (listEl) listEl.innerHTML = '<li class="fund-loading">正在获取基金估值...</li>';

    var results = [];
    var done = 0;
    var totalFunds = funds.length;

    funds.forEach(function(fund) {
      var apiUrl = 'https://fundgz.1234567.com.cn/js/' + fund.code + '.js?rt=' + Date.now();

      // 尝试多个代理
      var proxies = [
        function(url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
        function(url) { return 'https://corsproxy.io/?url=' + encodeURIComponent(url); },
        function(url) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(url); }
      ];

      function tryProxy(proxyIdx) {
        if (proxyIdx >= proxies.length) {
          results.push({ code: fund.code, name: fund.code, error: true });
          done++;
          checkAllDone();
          return;
        }

        var proxyUrl = proxies[proxyIdx](apiUrl);
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 8000);

        fetch(proxyUrl, { signal: controller.signal })
          .then(function(res) { clearTimeout(timeoutId); return res.text(); })
          .then(function(text) {
            // 解析 JSONP: jsonpgz({...});
            var match = text.match(/jsonpgz\((.+)\);?/);
            if (match) {
              var data = JSON.parse(match[1]);
              results.push({
                code: data.fundcode || fund.code,
                name: data.name || fund.code,
                dwjz: data.dwjz,      // 单位净值
                gsz: data.gsz,         // 估算值
                gszzl: data.gszzl,     // 估算涨跌幅%
                gztime: data.gztime    // 估值时间
              });
            } else {
              results.push({ code: fund.code, name: fund.code, error: true });
            }
            done++;
            checkAllDone();
          })
          .catch(function() {
            clearTimeout(timeoutId);
            tryProxy(proxyIdx + 1);
          });
      }

      tryProxy(0);
    });

    function checkAllDone() {
      if (done < totalFunds) return;
      // 更新基金名称到存储
      var updatedFunds = results.map(function(r) {
        var orig = funds.find(function(f) { return f.code === r.code; });
        return { code: r.code, name: r.name || (orig ? orig.name : r.code), addedAt: orig ? orig.addedAt : Date.now() };
      });
      saveFundList(updatedFunds);
      // 缓存估值数据
      saveData('dashboard_fund_cache', { data: results, time: new Date().toISOString() });
      renderFundList(results);
    }
  }

  function renderFundList(funds) {
    var listEl = document.getElementById('fundList');
    if (!listEl) return;

    if (funds.length === 0) {
      listEl.innerHTML = '<li class="fund-loading">添加基金代码后显示实时估值</li>';
      return;
    }

    listEl.innerHTML = funds.map(function(f) {
      if (f.error) {
        return '<li class="fund-item">' +
          '<div class="fund-info">' +
            '<div class="fund-name-row"><span class="fund-name">' + f.code + '</span><span class="fund-code">获取失败</span></div>' +
            '<div class="fund-vals"><span style="color:var(--warning)">数据获取失败，点击刷新重试</span></div>' +
          '</div>' +
          '<button class="btn-icon" onclick="removeFund(\'' + f.code + '\')" title="删除">×</button>' +
        '</li>';
      }

      var gszzl = parseFloat(f.gszzl) || 0;
      var cls = gszzl > 0 ? 'up' : (gszzl < 0 ? 'down' : '');
      var prefix = gszzl > 0 ? '+' : '';
      var gsz = parseFloat(f.gsz) || 0;
      var dwjz = parseFloat(f.dwjz) || 0;

      return '<li class="fund-item">' +
        '<div class="fund-info">' +
          '<div class="fund-name-row">' +
            '<span class="fund-name">' + escapeHtml(f.name) + '</span>' +
            '<span class="fund-code">' + f.code + '</span>' +
          '</div>' +
          '<div class="fund-vals">' +
            '<span>净值 ' + dwjz.toFixed(4) + '</span>' +
            '<span>估值 <b class="fund-gsz ' + cls + '">' + gsz.toFixed(4) + '</b></span>' +
            '<span class="fund-gsz ' + cls + '">' + prefix + gszzl.toFixed(2) + '%</span>' +
            (f.gztime ? '<span class="fund-gztime">' + f.gztime + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<button class="btn-icon" onclick="removeFund(\'' + f.code + '\')" title="删除">×</button>' +
      '</li>';
    }).join('');
  }

  // === HTML 转义 ===
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ========================================
  // 日历同步展示（实时拉取 + 本地缓存回退）
  // ========================================

  // iCloud 日历订阅链接（webcal:// 转 https://）
  var CALENDAR_URL = 'webcal://p222-caldav.icloud.com.cn/published/2/MjEwODg3ODI0NzcyMTA4OLnhEhnohYQmA0EBxvANrrjlrfY_f-K_Vs-vB8Y2dIYVlFQVfl1sT7LFx80Qj-rCyyJjabmDaUnOPMf6HxC7Xe0';
  // CORS 代理列表（依次尝试，第一个成功即用）
  var CORS_PROXIES = [
    function(url) { return 'https://corsproxy.io/?url=' + encodeURIComponent(url); },
    function(url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
    function(url) { return 'https://proxy.cors.sh/' + url; }
  ];

  function renderCalendarLoading() {
    var section = document.getElementById('calendarSection');
    if (!section) return;
    section.innerHTML =
      '<div class="calendar-section">' +
      '<div class="calendar-section-head">' +
      '<span class="calendar-section-title">日历同步</span>' +
      '<span class="calendar-sync-time">正在获取...</span>' +
      '</div>' +
      '<div class="calendar-empty">正在从 iCloud 拉取今日日程...</div>' +
      '</div>';
  }

  function renderCalendarEvents(events, source) {
    var section = document.getElementById('calendarSection');
    if (!section) return;

    var now = new Date();
    var timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var sourceLabel = source === 'live' ? '实时获取 ' + timeStr : '缓存 ' + (window.CALENDAR_SYNC_TIME || timeStr);

    // 获取已推迟的日历事件 key 列表
    var deferredCalKeys = loadData('dashboard_deferred_cal') || {};

    var html = '<div class="calendar-section">';
    html += '<div class="calendar-section-head">';
    html += '<span class="calendar-section-title">日历同步</span>';
    html += '<div class="cal-head-right">';
    html += '<span class="calendar-sync-time">' + sourceLabel + '</span>';
    html += '<button class="cal-refresh-btn" onclick="refreshCalendar()" title="刷新日历">↻</button>';
    html += '</div>';
    html += '</div>';

    if (!events || events.length === 0) {
      html += '<div class="calendar-empty">今日日历暂无日程</div>';
    } else {
      events.forEach(function(ev, idx) {
        var timeText = ev.allDay ? '全天' : (ev.startTime + (ev.endTime ? '-' + ev.endTime : ''));
        var calKey = ev.title + '|' + timeText + '|' + getTodayKey();
        var isDeferred = !!deferredCalKeys[calKey];

        html += '<div class="calendar-event' + (isDeferred ? ' cal-deferred' : '') + '">';
        html += '<span class="ev-time">' + escapeHtml(timeText) + '</span>';
        html += '<span class="ev-title">' + escapeHtml(ev.title) + '</span>';
        if (ev.location) {
          html += '<span class="ev-loc">' + escapeHtml(ev.location) + '</span>';
        }
        if (isDeferred) {
          html += '<span class="cal-defer-badge">已推迟</span>';
        } else {
          html += '<button class="btn btn-defer-text cal-defer-btn" onclick="toggleCalDeferPicker(' + idx + ')" title="推迟到其他日期">推迟</button>';
        }
        html += '</div>';

        // 推迟选择器（日期+时间）
        if (!isDeferred) {
          html += '<div class="cal-defer-picker" id="cal-defer-picker-' + idx + '" style="display:none">';
          html += '<input type="date" id="cal-defer-date-' + idx + '" class="defer-date-input">';
          html += '<input type="time" id="cal-defer-time-' + idx + '" class="defer-date-input" placeholder="时间(可选)">';
          html += '<button class="btn btn-primary btn-sm" onclick="confirmCalDefer(' + idx + ')">确认</button>';
          html += '</div>';
        }
      });
    }
    html += '</div>';
    section.innerHTML = html;

    // 保存当前日历事件引用，供推迟使用
    window._currentCalEvents = events || [];
  }

  // 显示/隐藏日历事件推迟选择器
  window.toggleCalDeferPicker = function(idx) {
    var picker = document.getElementById('cal-defer-picker-' + idx);
    if (picker) {
      picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
    }
  };

  // 确认推迟日历事件
  window.confirmCalDefer = function(idx) {
    var events = window._currentCalEvents || [];
    var ev = events[idx];
    if (!ev) return;

    var dateInput = document.getElementById('cal-defer-date-' + idx);
    var timeInput = document.getElementById('cal-defer-time-' + idx);
    if (!dateInput || !dateInput.value) {
      alert('请选择日期');
      return;
    }

    var dateStr = dateInput.value;
    var timeStr = timeInput && timeInput.value ? timeInput.value : '';

    var origTimeText = ev.allDay ? '全天' : (ev.startTime + (ev.endTime ? '-' + ev.endTime : ''));
    var todoText = '📅 ' + ev.title;
    if (timeStr) {
      todoText += ' (' + timeStr + ')';
    } else if (!ev.allDay && ev.startTime) {
      todoText += ' (' + origTimeText + ')';
    }
    if (ev.location) {
      todoText += ' @ ' + ev.location;
    }

    // 创建待办到目标日期
    var all = getAllTodosByDate();
    if (!all[dateStr]) all[dateStr] = [];
    var newTodo = {
      id: Date.now(),
      text: todoText,
      done: false,
      fromCalendar: true
    };
    if (timeStr) {
      newTodo.time = timeStr;
      newTodo.notified = false;
    }
    all[dateStr].push(newTodo);
    saveData('dashboard_todos', all);

    // 标记日历事件为已推迟
    var deferredCalKeys = loadData('dashboard_deferred_cal') || {};
    var calKey = ev.title + '|' + origTimeText + '|' + getTodayKey();
    deferredCalKeys[calKey] = dateStr + (timeStr ? ' ' + timeStr : '');
    saveData('dashboard_deferred_cal', deferredCalKeys);

    // 重新渲染
    renderCalendarEvents(events, 'live');
    renderTodos();
    startReminderCheck();
  };

  function renderCalendarError(msg) {
    var section = document.getElementById('calendarSection');
    if (!section) return;
    section.innerHTML =
      '<div class="calendar-section">' +
      '<div class="calendar-section-head">' +
      '<span class="calendar-section-title">日历同步</span>' +
      '<div class="cal-head-right">' +
      '<span class="calendar-sync-time">获取失败</span>' +
      '<button class="cal-refresh-btn" onclick="refreshCalendar()" title="重试">↻</button>' +
      '</div>' +
      '</div>' +
      '<div class="calendar-error">' + escapeHtml(msg) + '</div>' +
      '</div>';
  }

  // 手动刷新日历
  window.refreshCalendar = function() {
    renderCalendarLoading();
    fetchLiveCalendar();
  };

  // 实时从 iCloud 拉取日历
  function fetchLiveCalendar() {
    var httpsUrl = CALENDAR_URL.replace('webcal://', 'https://');

    function tryProxy(idx) {
      if (idx >= CORS_PROXIES.length) {
        // 所有代理都失败，回退到本地缓存
        var cached = window.CALENDAR_EVENTS;
        if (cached && cached.length >= 0 && window.CALENDAR_SYNC_TIME) {
          renderCalendarEvents(cached, 'cache');
        } else {
          renderCalendarError('无法连接 iCloud，请稍后刷新重试');
        }
        return;
      }

      var proxyUrl = CORS_PROXIES[idx](httpsUrl);
      fetch(proxyUrl)
        .then(function(resp) {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.text();
        })
        .then(function(text) {
          if (!text || text.indexOf('BEGIN:VCALENDAR') === -1) {
            throw new Error('数据格式异常');
          }
          var events = window.ICSParser.parse(text);
          var todayEvents = window.ICSParser.getTodayEvents(events);
          // 缓存到 localStorage
          saveData('dashboard_calendar_cache', { events: todayEvents, time: new Date().toISOString() });
          renderCalendarEvents(todayEvents, 'live');
        })
        .catch(function(err) {
          tryProxy(idx + 1);
        });
    }

    tryProxy(0);
  }

  function renderCalendar() {
    var section = document.getElementById('calendarSection');
    if (!section) return;

    // 先检查本地缓存（今天的缓存）
    var cache = loadData('dashboard_calendar_cache');
    var now = new Date();
    var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    if (cache && cache.time && cache.time.substring(0, 10) === todayStr) {
      // 今天有缓存，先显示缓存，再后台刷新
      renderCalendarEvents(cache.events, 'cache');
      fetchLiveCalendar();
    } else {
      // 无缓存，显示加载中
      renderCalendarLoading();
      fetchLiveCalendar();
    }
  }

  // ========================================
  // 待办提醒（提前15分钟通知）
  // ========================================
  var REMINDER_MINUTES = 15; // 提前提醒分钟数
  var reminderTimer = null;

  // 请求通知权限
  window.requestNotifyPermission = function() {
    if (!('Notification' in window)) {
      alert('您的浏览器不支持通知功能');
      return;
    }
    Notification.requestPermission().then(function(result) {
      if (result === 'granted') {
        alert('通知已开启，待办事项将在设定时间前' + REMINDER_MINUTES + '分钟提醒您');
        startReminderCheck();
      } else {
        alert('需要允许通知才能使用提醒功能');
      }
    });
  };

  // 获取通知权限状态
  function notifyGranted() {
    return ('Notification' in window) && Notification.permission === 'granted';
  }

  // 发送通知
  function sendNotification(title, body) {
    if (!notifyGranted()) return;
    try {
      new Notification(title, {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📋</text></svg>',
        tag: 'todo-' + title
      });
    } catch(e) {}
  }

  // 检查所有待办，看是否需要提醒
  function checkReminders() {
    var all = getAllTodosByDate();
    var todayKey = getTodayKey();
    var todayTodos = all[todayKey] || [];
    var now = new Date();
    var nowMinutes = now.getHours() * 60 + now.getMinutes();
    var changed = false;

    todayTodos.forEach(function(t) {
      if (!t.time || t.done || t.notified) return;

      // 解析待办时间
      var parts = t.time.split(':');
      var todoMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      var reminderMinutes = todoMinutes - REMINDER_MINUTES;

      // 当前时间 >= 提醒时间 且 当前时间 < 待办时间（还没到点）
      if (nowMinutes >= reminderMinutes && nowMinutes < todoMinutes) {
        sendNotification('待办提醒：' + t.text,
          '将在 ' + t.time + ' 开始，还有约 ' + (todoMinutes - nowMinutes) + ' 分钟');
        t.notified = true;
        changed = true;
      } else if (nowMinutes >= todoMinutes) {
        // 已过时间点也提醒一次
        t.notified = true;
        changed = true;
      }
    });

    if (changed) {
      saveData('dashboard_todos', all);
    }
  }

  // 启动定时检查（每30秒检查一次）
  function startReminderCheck() {
    if (reminderTimer) clearInterval(reminderTimer);
    // 立即检查一次
    checkReminders();
    // 然后每30秒检查
    reminderTimer = setInterval(checkReminders, 30000);
  }

  // === 初始化 ===
  function init() {
    renderHeader();
    renderCalendar();
    renderTodos();
    renderWeight();
    renderCalorie();
    fetchNews(false);
    renderParenting();
    renderSpending();
    fetchMarketIndices();
    fetchStockPrices();
    fetchFundValuations();
    // 如果已有通知权限，启动提醒检查
    if (notifyGranted()) {
      startReminderCheck();
    }
    // 行情自动刷新：交易日 9:00-15:30 每分钟刷新
    setInterval(function() {
      var now = new Date();
      var hour = now.getHours();
      var min = now.getMinutes();
      var day = now.getDay();
      if (day >= 1 && day <= 5 && (hour > 9 || (hour === 9 && min >= 0)) && (hour < 15 || (hour === 15 && min <= 30))) {
        fetchMarketIndices();
        fetchStockPrices();
        fetchFundValuations();
      }
    }, 60000);
  }

  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
