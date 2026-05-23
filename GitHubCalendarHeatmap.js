define(["qlik", "jquery", "text!./style.css"], function (qlik, $, cssContent) {
  "use strict";

  if (!document.getElementById("qgh-style")) {
    var style = document.createElement("style");
    style.id = "qgh-style";
    style.innerHTML = cssContent;
    document.head.appendChild(style);
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function getCurrentLocale() {
    // Qlik Sense normally follows the configured UI/browser language.
    return (navigator.languages && navigator.languages.length ? navigator.languages[0] : navigator.language) || "en-US";
  }

  function getMonthLabel(monthIndex, locale) {
    try {
      return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
        .format(new Date(Date.UTC(2024, monthIndex, 1)))
        .replace(".", "");
    } catch (e) {
      return MONTHS[monthIndex];
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function parseDate(qText, qNum) {
    if (typeof qNum === "number" && !isNaN(qNum)) {
      var qlikEpoch = new Date(Date.UTC(1899, 11, 30));
      var parsed = new Date(qlikEpoch.getTime() + Math.floor(qNum) * 86400000);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    if (!qText) return null;
    var text = String(qText).trim();
    var iso = text.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    var br = text.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (br) return new Date(Date.UTC(+br[3], +br[2] - 1, +br[1]));
    var dt = new Date(text);
    if (!isNaN(dt.getTime())) return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    return null;
  }

  function dateKey(date) { return date.toISOString().slice(0, 10); }
  function addDays(date, days) { var d = new Date(date.getTime()); d.setUTCDate(d.getUTCDate() + days); return d; }
  function startOfWeekSunday(date) { return addDays(date, -date.getUTCDay()); }
  function endOfWeekSaturday(date) { return addDays(date, 6 - date.getUTCDay()); }
  function startOfYear(year) { return new Date(Date.UTC(year, 0, 1)); }
  function endOfYear(year) { return new Date(Date.UTC(year, 11, 31)); }

  function hexToRgb(hex) {
    if (!hex) return { r: 46, g: 160, b: 67 };
    var clean = String(hex).replace("#", "").trim();
    if (clean.length === 3) clean = clean.split("").map(function (c) { return c + c; }).join("");
    var num = parseInt(clean, 16);
    if (isNaN(num)) return { r: 46, g: 160, b: 67 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function blendWithWhite(hex, factor) {
    var rgb = hexToRgb(hex);
    return "rgb(" + Math.round(255 - (255 - rgb.r) * factor) + "," + Math.round(255 - (255 - rgb.g) * factor) + "," + Math.round(255 - (255 - rgb.b) * factor) + ")";
  }

  function colorForValue(value, maxValue, baseColor, emptyColor) {
    if (!value || value <= 0 || !maxValue) return emptyColor;
    var ratio = Math.max(0, Math.min(1, value / maxValue));
    if (ratio <= 0.25) return blendWithWhite(baseColor, 0.25);
    if (ratio <= 0.50) return blendWithWhite(baseColor, 0.45);
    if (ratio <= 0.75) return blendWithWhite(baseColor, 0.65);
    return blendWithWhite(baseColor, 0.90);
  }

  function getColor(layout) {
    var color = layout.props && layout.props.baseColor;
    if (color && color.color) return color.color;
    if (typeof color === "string") return color;
    return "#2da44e";
  }

  function createTooltip() {
    var el = document.querySelector(".qgh-tooltip");
    if (!el) {
      el = document.createElement("div");
      el.className = "qgh-tooltip";
      el.style.display = "none";
      document.body.appendChild(el);
    }
    return el;
  }

  function render($element, layout) {
    var rows = (layout.qHyperCube.qDataPages[0] && layout.qHyperCube.qDataPages[0].qMatrix) || [];
    var props = layout.props || {};
    var baseColor = getColor(layout);
    var emptyColor = props.emptyColor || "#ebedf0";
    var showLegend = props.showLegend !== false;
    var showWeekdays = props.showWeekdays !== false;
    var locale = getCurrentLocale();

    var byDate = {}, dates = [], maxValue = 0;

    rows.forEach(function (row) {
      var dim = row[0], meas = row[1];
      var d = parseDate(dim.qText, dim.qNum);
      if (!d) return;
      var key = dateKey(d);
      var val = typeof meas.qNum === "number" && !isNaN(meas.qNum) ? meas.qNum : 0;
      var valueText = meas && meas.qText != null ? meas.qText : String(val);
      if (!byDate[key]) {
        byDate[key] = {
          date: d,
          text: dim.qText,
          value: 0,
          valueText: valueText,
          elemNo: dim.qElemNumber,
          state: dim.qState || "O",
          rows: 0
        };
        dates.push(d);
      }
      byDate[key].value += val;
      byDate[key].rows += 1;
      byDate[key].state = dim.qState || byDate[key].state;
      // When Qlik returns one row per date, qText already respects the measure number format.
      // If duplicate rows are aggregated here, fall back to the summed numeric value.
      byDate[key].valueText = byDate[key].rows === 1 ? valueText : String(byDate[key].value);
      maxValue = Math.max(maxValue, byDate[key].value);
    });

    dates.sort(function (a, b) { return a - b; });

    // Always render a full Jan-Dec calendar, even when some months are empty.
    // When data exists, use the first available date's year. With no data, show current year empty.
    var displayYear = dates.length ? dates[0].getUTCFullYear() : new Date().getFullYear();
    var first = startOfWeekSunday(startOfYear(displayYear));
    var last = endOfWeekSaturday(endOfYear(displayYear));
    var totalDays = Math.round((last - first) / 86400000) + 1;
    var totalWeeks = Math.ceil(totalDays / 7);
    var cellStep = 15;

    var monthLabels = [];
    for (var monthIndex = 0; monthIndex < 12; monthIndex++) {
      var monthStart = new Date(Date.UTC(displayYear, monthIndex, 1));
      var weekIndex = Math.floor((startOfWeekSunday(monthStart) - first) / 86400000 / 7);
      monthLabels.push({ label: getMonthLabel(monthIndex, locale), left: Math.max(0, weekIndex * cellStep) });
    }

    var html = '<div class="qgh-wrap"><div class="qgh-inner" style="min-width:' + (totalWeeks * cellStep + 48) + 'px">';
    html += '<div class="qgh-months" style="width:' + (totalWeeks * cellStep) + 'px">';
    monthLabels.forEach(function (m) { html += '<span class="qgh-month" style="left:' + m.left + 'px">' + escapeHtml(m.label) + '</span>'; });
    html += '</div><div class="qgh-grid-row"><div class="qgh-weekdays">';

    var days = showWeekdays ? ["", "Mon", "", "Wed", "", "Fri", ""] : ["", "", "", "", "", "", ""];
    days.forEach(function (d) { html += '<span class="qgh-weekday">' + d + '</span>'; });
    html += '</div><div class="qgh-weeks" style="grid-template-columns: repeat(' + totalWeeks + ', 12px);">';

    for (var day = 0; day < totalWeeks * 7; day++) {
      var current = addDays(first, day);
      var key = dateKey(current);
      var item = byDate[key];
      var isCurrentYear = current.getUTCFullYear() === displayYear;
      var val = item && isCurrentYear ? item.value : 0;
      var valueText = item && isCurrentYear ? item.valueText : "0";
      var color = isCurrentYear ? colorForValue(val, maxValue, baseColor, emptyColor) : "transparent";
      var text = item ? item.text : key;
      var elem = item && item.elemNo >= 0 && isCurrentYear ? item.elemNo : "";
      var state = item && item.state ? item.state : "O";
      var selectedClass = state === "S" ? " qgh-selected" : (state === "A" ? " qgh-alternative" : (state === "X" ? " qgh-excluded" : ""));
      var delay = Math.min(day * 9, 900);
      html += '<div class="qgh-cell qgh-animate' + selectedClass + (elem !== "" ? ' qgh-selectable' : '') + '" data-date="' + escapeHtml(text) + '" data-value="' + escapeHtml(valueText) + '" data-elem="' + escapeHtml(elem) + '" data-state="' + escapeHtml(state) + '" style="--qgh-color:' + color + ';--qgh-empty:' + emptyColor + ';--qgh-delay:' + delay + 'ms;' + (!isCurrentYear ? '--qgh-color:transparent;outline:none;' : '') + '"></div>';
    }

    html += '</div></div>';

    if (showLegend) {
      html += '<div class="qgh-legend"><span>Less</span><span class="qgh-legend-cells">';
      [0, 0.25, 0.45, 0.65, 0.90].forEach(function (f) {
        html += '<span class="qgh-legend-cell" style="background:' + (f === 0 ? emptyColor : blendWithWhite(baseColor, f)) + '"></span>';
      });
      html += '</span><span>More</span></div>';
    }

    html += '</div></div>';
    $element.html(html);

    var tooltip = createTooltip();
    $element.find(".qgh-cell").on("mousemove", function (event) {
      tooltip.innerHTML = '<strong>' + escapeHtml($(this).attr("data-value")) + '</strong><br>' + escapeHtml($(this).attr("data-date"));
      tooltip.style.left = event.clientX + "px";
      tooltip.style.top = event.clientY + "px";
      tooltip.style.display = "block";
    }).on("mouseleave", function () {
      tooltip.style.display = "none";
    }).on("click", function (event) {
      var elem = $(this).attr("data-elem");
      if (elem !== "") {
        // Toggle keeps previous selections, allowing users to click several days.
        this.backendApi.selectValues(0, [parseInt(elem, 10)], true);
        $(this).toggleClass("qgh-selected");
      }
    }.bind(this));
  }

  return {
    initialProperties: {
      qHyperCubeDef: { qDimensions: [], qMeasures: [], qInitialDataFetch: [{ qWidth: 2, qHeight: 5000 }] },
      props: { baseColor: { color: "#2da44e", index: -1 }, emptyColor: "#ebedf0", showLegend: true, showWeekdays: true }
    },
    definition: {
      type: "items",
      component: "accordion",
      items: {
        dimensions: { uses: "dimensions", min: 1, max: 1 },
        measures: { uses: "measures", min: 1, max: 1 },
        sorting: { uses: "sorting" },
        appearance: {
          uses: "settings",
          items: {
            colors: {
              type: "items", label: "Colors",
              items: {
                baseColor: { ref: "props.baseColor", label: "Base color", type: "object", component: "color-picker", dualOutput: true, defaultValue: { color: "#2da44e", index: -1 } },
                emptyColor: { ref: "props.emptyColor", label: "Empty day color", type: "string", expression: "optional", defaultValue: "#ebedf0" }
              }
            },
            legend: {
              type: "items", label: "Legend",
              items: {
                showLegend: { ref: "props.showLegend", label: "Show legend", type: "boolean", component: "switch", options: [{ value: true, label: "On" }, { value: false, label: "Off" }], defaultValue: true },
                showWeekdays: { ref: "props.showWeekdays", label: "Show weekdays", type: "boolean", component: "switch", options: [{ value: true, label: "On" }, { value: false, label: "Off" }], defaultValue: true }
              }
            }
          }
        }
      }
    },
    support: { snapshot: true, export: true, exportData: true },
    paint: function ($element, layout) { render.call(this, $element, layout); return qlik.Promise.resolve(); }
  };
});
