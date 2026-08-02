// charts.js — ECharts 图表渲染
(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var success = style.getPropertyValue('--success').trim();
  var warning = style.getPropertyValue('--warning').trim();
  var danger = style.getPropertyValue('--danger').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  var weightChart = null;
  var investChart = null;

  // 初始化图表实例
  function initCharts() {
    var weightEl = document.getElementById('chart-weight');
    var investEl = document.getElementById('chart-invest');
    if (weightEl) weightChart = echarts.init(weightEl, null, { renderer: 'svg' });
    if (investEl) investChart = echarts.init(investEl, null, { renderer: 'svg' });
    window.addEventListener('resize', function() {
      if (weightChart) weightChart.resize();
      if (investChart) investChart.resize();
    });
  }

  // 体重趋势图（含目标体重线）
  window.renderWeightChart = function(dates, weights, goalWeight) {
    if (!weightChart) initCharts();
    if (!weightChart) return;

    var series = [{
      type: 'line',
      data: weights,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: success, width: 2.5 },
      itemStyle: { color: success, borderColor: '#fff', borderWidth: 1.5 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(16, 185, 129, 0.25)' },
            { offset: 1, color: 'rgba(16, 185, 129, 0.02)' }
          ]
        }
      }
    }];

    // 如果有目标体重，添加目标线
    if (goalWeight && goalWeight > 0) {
      series.push({
        type: 'line',
        data: dates.map(function() { return goalWeight; }),
        symbol: 'none',
        lineStyle: { color: warning, width: 1.5, type: 'dashed' },
        itemStyle: { color: warning },
        tooltip: {
          formatter: function() { return '目标体重: ' + goalWeight + ' kg'; }
        },
        z: 1
      });
    }

    weightChart.setOption({
      animation: false,
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        formatter: function(params) {
          var html = params[0].name + '<br/>';
          params.forEach(function(p) {
            var label = p.seriesIndex === 0 ? '体重' : '目标';
            html += label + ': ' + p.value + ' kg<br/>';
          });
          return html;
        }
      },
      grid: { left: 40, right: 15, top: 15, bottom: 25 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: rule } },
        axisLabel: {
          color: muted,
          fontSize: 10,
          formatter: function(val) {
            return val.substring(5);
          }
        },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLine: { show: false },
        axisLabel: { color: muted, fontSize: 10 },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      series: series
    });
  };

  // 投资分布图
  window.renderInvestChart = function(labels, values) {
    if (!investChart) initCharts();
    if (!investChart) return;

    var colors = labels.map(function(_, i) {
      return i % 2 === 0 ? accent : accent2;
    });

    investChart.setOption({
      animation: false,
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        formatter: function(params) {
          var p = params[0];
          var val = p.value;
          var prefix = val >= 0 ? '+' : '';
          return p.name + '<br/>金额: ' + prefix + '¥' + Math.abs(val).toFixed(2);
        }
      },
      grid: { left: 40, right: 15, top: 10, bottom: 25 },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: rule } },
        axisLabel: {
          color: muted,
          fontSize: 10,
          interval: 0,
          rotate: labels.length > 4 ? 25 : 0
        },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: muted, fontSize: 10 },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      series: [{
        type: 'bar',
        data: values.map(function(v) {
          return {
            value: v,
            itemStyle: { color: v >= 0 ? success : danger, borderRadius: [4, 4, 0, 0] }
          };
        }),
        barWidth: '50%'
      }]
    });
  };

  // 初始化
  if (document.readyState !== 'loading') {
    initCharts();
  } else {
    document.addEventListener('DOMContentLoaded', initCharts);
  }
})();
