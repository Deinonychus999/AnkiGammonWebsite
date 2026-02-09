/**
 * MET Calculator — UI controller.
 * Two sections: score lookup and interactive 25×25 grid.
 */
(function () {
  'use strict';

  var matchLengthEl, yourScoreEl, oppScoreEl;
  var resultEl, mwcValueEl, awayDisplayEl, crawfordBadgeEl;
  var postCrawfordGroupEl, postCrawfordCheckEl;
  var swingsBodyEl;
  var gridEl, gridFilterEl, selectedInfoEl;
  var preCrawfordTabEl, postCrawfordTabEl, gridFilterGroupEl;
  var postCrawfordTableEl;
  var selectedCell;

  function init() {
    matchLengthEl = document.getElementById('match-length');
    yourScoreEl = document.getElementById('your-score');
    oppScoreEl = document.getElementById('opp-score');
    resultEl = document.getElementById('lookup-result');
    mwcValueEl = document.getElementById('mwc-value');
    awayDisplayEl = document.getElementById('away-display');
    crawfordBadgeEl = document.getElementById('crawford-badge');
    postCrawfordGroupEl = document.getElementById('post-crawford-group');
    postCrawfordCheckEl = document.getElementById('post-crawford-check');
    swingsBodyEl = document.getElementById('swings-body');
    gridEl = document.getElementById('met-grid');
    gridFilterEl = document.getElementById('grid-filter');
    selectedInfoEl = document.getElementById('selected-cell-info');
    preCrawfordTabEl = document.getElementById('pre-crawford-tab');
    postCrawfordTabEl = document.getElementById('post-crawford-tab');
    gridFilterGroupEl = document.getElementById('grid-filter-group');
    postCrawfordTableEl = document.getElementById('post-crawford-table');

    matchLengthEl.addEventListener('input', doLookup);
    yourScoreEl.addEventListener('input', doLookup);
    oppScoreEl.addEventListener('input', doLookup);
    postCrawfordCheckEl.addEventListener('change', doLookup);
    gridFilterEl.addEventListener('change', renderGrid);
    preCrawfordTabEl.addEventListener('click', function () { showTab('pre'); });
    postCrawfordTabEl.addEventListener('click', function () { showTab('post'); });

    renderGrid();
    renderPostCrawfordTable();
    doLookup();
  }

  /* ---- Tab switching ---- */
  function showTab(which) {
    if (which === 'pre') {
      preCrawfordTabEl.classList.add('met-table-tab--active');
      postCrawfordTabEl.classList.remove('met-table-tab--active');
      gridEl.hidden = false;
      gridFilterGroupEl.hidden = false;
      selectedInfoEl.hidden = !selectedCell;
      postCrawfordTableEl.hidden = true;
    } else {
      postCrawfordTabEl.classList.add('met-table-tab--active');
      preCrawfordTabEl.classList.remove('met-table-tab--active');
      gridEl.hidden = true;
      gridFilterGroupEl.hidden = true;
      selectedInfoEl.hidden = true;
      postCrawfordTableEl.hidden = false;
    }
  }

  /* ---- Score Lookup ---- */
  function doLookup() {
    var ml = parseInt(matchLengthEl.value);
    var ys = parseInt(yourScoreEl.value);
    var os = parseInt(oppScoreEl.value);

    if (isNaN(ml) || isNaN(ys) || isNaN(os) || ml < 1 || ys < 0 || os < 0 || ys >= ml || os >= ml) {
      resultEl.hidden = true;
      return;
    }

    var yourAway = ml - ys;
    var oppAway = ml - os;

    if (yourAway < 1 || yourAway > 25 || oppAway < 1 || oppAway > 25) {
      resultEl.hidden = true;
      return;
    }

    var exactlyOneIs1Away = (yourAway === 1) !== (oppAway === 1);

    if (exactlyOneIs1Away) {
      postCrawfordGroupEl.hidden = false;
    } else {
      postCrawfordGroupEl.hidden = true;
      postCrawfordCheckEl.checked = false;
    }

    var isPostCrawford = exactlyOneIs1Away && postCrawfordCheckEl.checked;
    var mwc = window.MET.getMWC(yourAway, oppAway, isPostCrawford);

    resultEl.hidden = false;
    mwcValueEl.textContent = (mwc * 100).toFixed(3) + '%';
    mwcValueEl.className = 'met-result__value' +
      (mwc > 0.5 ? ' met-result__value--good' : mwc < 0.5 ? ' met-result__value--bad' : '');
    awayDisplayEl.textContent = yourAway + '-away vs ' + oppAway + '-away';

    if (yourAway === 1 && oppAway === 1) {
      crawfordBadgeEl.textContent = 'DMP';
      crawfordBadgeEl.hidden = false;
    } else if (exactlyOneIs1Away && !isPostCrawford) {
      crawfordBadgeEl.textContent = 'Crawford';
      crawfordBadgeEl.hidden = false;
    } else if (isPostCrawford) {
      crawfordBadgeEl.textContent = 'Post-Crawford';
      crawfordBadgeEl.hidden = false;
    } else {
      crawfordBadgeEl.hidden = true;
    }

    showSwings(yourAway, oppAway, mwc);

    // Sync grid filter to best fit for current away values
    var maxAway = Math.max(yourAway, oppAway);
    var best = 25;
    for (var k = 0; k < gridFilterEl.options.length; k++) {
      var val = parseInt(gridFilterEl.options[k].value);
      if (val >= maxAway && val < best) best = val;
    }
    if (parseInt(gridFilterEl.value) !== best) {
      gridFilterEl.value = best;
      renderGrid();
    }

    highlightCell(yourAway, oppAway);
  }

  /* ---- Swings Table ---- */
  function showSwings(yourAway, oppAway, currentMwc) {
    var outcomes = [
      { label: 'Win Single', pts: 1, win: true },
      { label: 'Win Gammon', pts: 2, win: true },
      { label: 'Win Backgammon', pts: 3, win: true },
      { label: 'Lose Single', pts: 1, win: false },
      { label: 'Lose Gammon', pts: 2, win: false },
      { label: 'Lose Backgammon', pts: 3, win: false }
    ];

    var html = '';
    for (var i = 0; i < outcomes.length; i++) {
      var o = outcomes[i];
      var newYour = o.win ? Math.max(0, yourAway - o.pts) : yourAway;
      var newOpp = o.win ? oppAway : Math.max(0, oppAway - o.pts);

      var resultMwc;
      if (newYour === 0) resultMwc = 1.0;
      else if (newOpp === 0) resultMwc = 0.0;
      else resultMwc = window.MET.getMWC(newYour, newOpp, false);

      var change = resultMwc - currentMwc;
      var changeClass = change >= 0 ? 'swing-positive' : 'swing-negative';
      var scoreText = newYour === 0 ? 'Won' : newOpp === 0 ? 'Lost' :
        newYour + '-away vs ' + newOpp + '-away';

      html += '<tr' + (i === 2 ? ' class="swings-table__divider"' : '') + '>' +
        '<td>' + o.label + '</td>' +
        '<td>' + scoreText + '</td>' +
        '<td>' + (resultMwc * 100).toFixed(3) + '%</td>' +
        '<td class="' + changeClass + '">' + (change >= 0 ? '+' : '') + (change * 100).toFixed(3) + '%</td>' +
        '</tr>';
    }
    swingsBodyEl.innerHTML = html;
  }

  /* ---- Pre-Crawford Grid ---- */
  function renderGrid() {
    var maxAway = parseInt(gridFilterEl.value) || 25;

    var html = '<table class="met-grid"><thead><tr>' +
      '<th class="met-cell met-cell--corner">You \\ Opp</th>';
    for (var j = 1; j <= maxAway; j++) {
      html += '<th class="met-cell met-cell--col-header">' + j + '</th>';
    }
    html += '</tr></thead><tbody>';

    for (var i = 1; i <= maxAway; i++) {
      html += '<tr><th class="met-cell met-cell--row-header">' + i + '</th>';
      for (var j2 = 1; j2 <= maxAway; j2++) {
        var mwc = window.MET.getMWC(i, j2, false);
        var pct = (mwc * 100).toFixed(1);
        var color = mwcToColor(mwc);
        html += '<td class="met-cell" data-r="' + i + '" data-c="' + j2 +
          '" style="background-color:' + color + '">' + pct + '</td>';
      }
      html += '</tr>';
    }

    html += '</tbody></table>';
    gridEl.innerHTML = html;

    selectedCell = null;
    selectedInfoEl.hidden = true;

    var cells = gridEl.querySelectorAll('.met-cell[data-r]');
    for (var k = 0; k < cells.length; k++) {
      cells[k].addEventListener('click', onCellClick);
    }
  }

  /* ---- Post-Crawford Table ---- */
  function renderPostCrawfordTable() {
    var html = '<table class="swings-table met-pc-table">' +
      '<thead><tr><th>Trailing Away</th><th>Trailing MWC</th><th>Leading MWC</th></tr></thead><tbody>';
    for (var i = 2; i <= 25; i++) {
      var trailMwc = window.MET.POST_CRAWFORD[i - 1];
      var leadMwc = 1.0 - trailMwc;
      var trailColor = mwcToColor(trailMwc);
      var leadColor = mwcToColor(leadMwc);
      html += '<tr>' +
        '<td>' + i + '-away</td>' +
        '<td style="background-color:' + trailColor + '">' + (trailMwc * 100).toFixed(3) + '%</td>' +
        '<td style="background-color:' + leadColor + '">' + (leadMwc * 100).toFixed(3) + '%</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    postCrawfordTableEl.innerHTML = html;
  }

  /* ---- Grid interaction ---- */
  function onCellClick(e) {
    var cell = e.currentTarget;
    var r = parseInt(cell.dataset.r);
    var c = parseInt(cell.dataset.c);
    var ml = parseInt(gridFilterEl.value) || 25;
    matchLengthEl.value = ml;
    yourScoreEl.value = ml - r;
    oppScoreEl.value = ml - c;
    doLookup();
  }

  function selectCell(r, c) {
    if (selectedCell) selectedCell.classList.remove('met-cell--selected');
    var cell = gridEl.querySelector('[data-r="' + r + '"][data-c="' + c + '"]');
    if (cell) {
      cell.classList.add('met-cell--selected');
      selectedCell = cell;
    }
    var mwc = window.MET.getMWC(r, c, false);
    selectedInfoEl.textContent = r + '-away vs ' + c + '-away: ' + (mwc * 100).toFixed(3) + '% MWC';
    selectedInfoEl.hidden = false;
  }

  function highlightCell(r, c) {
    var cell = gridEl.querySelector('[data-r="' + r + '"][data-c="' + c + '"]');
    if (!cell) return;
    selectCell(r, c);
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /* ---- Color mapping ---- */
  function mwcToColor(mwc) {
    var r, g, b;
    if (mwc <= 0.5) {
      var t = mwc / 0.5;
      r = Math.round(138 + (59 - 138) * t);
      g = Math.round(40 + (62 - 40) * t);
      b = Math.round(40 + (69 - 40) * t);
    } else {
      var t2 = (mwc - 0.5) / 0.5;
      r = Math.round(59 + (36 - 59) * t2);
      g = Math.round(62 + (107 - 62) * t2);
      b = Math.round(69 + (48 - 69) * t2);
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
