(() => {
  const VALID_LANGS = ['en', 'zh-Hant', 'ja'];
  const queryLang = new URLSearchParams(location.search).get('lang');
  state.lang = VALID_LANGS.includes(queryLang) ? queryLang : 'en';

  const originalDisplayName = displayName;
  let countryCodes = null;

  const countryAliases = {
    'United States': 'US', 'United States of America': 'US',
    'South Korea': 'KR', 'North Korea': 'KP',
    'Russia': 'RU', 'Czechia': 'CZ', 'Taiwan': 'TW',
    'Vietnam': 'VN', 'Laos': 'LA', 'Bolivia': 'BO',
    'Venezuela': 'VE', 'Tanzania': 'TZ', 'Moldova': 'MD',
    'Syria': 'SY', 'Iran': 'IR', 'Brunei': 'BN'
  };

  function localeCode() {
    return state.lang === 'zh-Hant' ? 'zh-TW' : state.lang;
  }

  function localizedCountry(feature) {
    const raw = rawName(feature);
    const code = countryAliases[raw] || countryCodes?.get(raw);
    if (code) {
      try {
        return new Intl.DisplayNames([localeCode()], { type: 'region' }).of(code) || raw;
      } catch (_) {}
    }
    return originalDisplayName(feature);
  }

  displayName = localizedCountry;

  const US_ZH = {
    Alabama:'阿拉巴馬州', Alaska:'阿拉斯加州', Arizona:'亞利桑那州', Arkansas:'阿肯色州', California:'加利福尼亞州', Colorado:'科羅拉多州',
    Connecticut:'康乃狄克州', Delaware:'德拉瓦州', 'District of Columbia':'華盛頓哥倫比亞特區', Florida:'佛羅里達州', Georgia:'喬治亞州', Hawaii:'夏威夷州',
    Idaho:'愛達荷州', Illinois:'伊利諾州', Indiana:'印第安納州', Iowa:'愛荷華州', Kansas:'堪薩斯州', Kentucky:'肯塔基州', Louisiana:'路易斯安那州',
    Maine:'緬因州', Maryland:'馬里蘭州', Massachusetts:'麻薩諸塞州', Michigan:'密西根州', Minnesota:'明尼蘇達州', Mississippi:'密西西比州', Missouri:'密蘇里州',
    Montana:'蒙大拿州', Nebraska:'內布拉斯加州', Nevada:'內華達州', 'New Hampshire':'新罕布夏州', 'New Jersey':'紐澤西州', 'New Mexico':'新墨西哥州',
    'New York':'紐約州', 'North Carolina':'北卡羅來納州', 'North Dakota':'北達科他州', Ohio:'俄亥俄州', Oklahoma:'奧克拉荷馬州', Oregon:'奧勒岡州',
    Pennsylvania:'賓夕法尼亞州', 'Rhode Island':'羅德島州', 'South Carolina':'南卡羅來納州', 'South Dakota':'南達科他州', Tennessee:'田納西州', Texas:'德州',
    Utah:'猶他州', Vermont:'佛蒙特州', Virginia:'維吉尼亞州', Washington:'華盛頓州', 'West Virginia':'西維吉尼亞州', Wisconsin:'威斯康辛州', Wyoming:'懷俄明州'
  };

  const US_JA = {
    Alabama:'アラバマ州', Alaska:'アラスカ州', Arizona:'アリゾナ州', Arkansas:'アーカンソー州', California:'カリフォルニア州', Colorado:'コロラド州',
    Connecticut:'コネチカット州', Delaware:'デラウェア州', 'District of Columbia':'ワシントンD.C.', Florida:'フロリダ州', Georgia:'ジョージア州', Hawaii:'ハワイ州',
    Idaho:'アイダホ州', Illinois:'イリノイ州', Indiana:'インディアナ州', Iowa:'アイオワ州', Kansas:'カンザス州', Kentucky:'ケンタッキー州', Louisiana:'ルイジアナ州',
    Maine:'メイン州', Maryland:'メリーランド州', Massachusetts:'マサチューセッツ州', Michigan:'ミシガン州', Minnesota:'ミネソタ州', Mississippi:'ミシシッピ州', Missouri:'ミズーリ州',
    Montana:'モンタナ州', Nebraska:'ネブラスカ州', Nevada:'ネバダ州', 'New Hampshire':'ニューハンプシャー州', 'New Jersey':'ニュージャージー州', 'New Mexico':'ニューメキシコ州',
    'New York':'ニューヨーク州', 'North Carolina':'ノースカロライナ州', 'North Dakota':'ノースダコタ州', Ohio:'オハイオ州', Oklahoma:'オクラホマ州', Oregon:'オレゴン州',
    Pennsylvania:'ペンシルベニア州', 'Rhode Island':'ロードアイランド州', 'South Carolina':'サウスカロライナ州', 'South Dakota':'サウスダコタ州', Tennessee:'テネシー州', Texas:'テキサス州',
    Utah:'ユタ州', Vermont:'バーモント州', Virginia:'バージニア州', Washington:'ワシントン州', 'West Virginia':'ウェストバージニア州', Wisconsin:'ウィスコンシン州', Wyoming:'ワイオミング州'
  };

  function localizedUSRegion(name) {
    if (!name) return '';
    if (state.lang === 'zh-Hant') return US_ZH[name] || name;
    if (state.lang === 'ja') return US_JA[name] || name;
    return name;
  }

  function localizedJPPrefecture(value) {
    const pair = JP_PREFECTURES.find(([, v]) => v === value);
    if (!pair) return value || '';
    const [jp, en] = pair;
    if (state.lang === 'en') return en;
    if (state.lang === 'ja') return jp;
    return jp.replace(/県$/, '縣');
  }

  window.localizedUSRegion = localizedUSRegion;
  window.localizedJPPrefecture = localizedJPPrefecture;

  function localizeRegionDropdown() {
    if (!state.country || ui.regionControls.classList.contains('hidden')) return;
    const current = state.region;
    ui.regionSelect.innerHTML = '';
    ui.regionSelect.append(new Option(t('all'), ''));
    if (isUS()) {
      US_STATES.forEach(name => ui.regionSelect.append(new Option(localizedUSRegion(name), name)));
    } else if (isJapan()) {
      JP_PREFECTURES.forEach(([, value]) => ui.regionSelect.append(new Option(localizedJPPrefecture(value), value)));
    }
    ui.regionSelect.value = current;
  }

  function refreshLanguageUI() {
    ui.languageButtons.forEach(button => button.classList.toggle('active', button.dataset.lang === state.lang));
    document.documentElement.lang = state.lang;
    updateLabels();
    localizeRegionDropdown();

    if (state.country) {
      ui.localTime.textContent = formatLocalTime(state.country);
      if (state.region) {
        ui.locationType.textContent = isUS() ? t('state') : t('prefecture');
        ui.locationName.textContent = isUS() ? localizedUSRegion(state.region) : localizedJPPrefecture(state.region);
      } else {
        ui.locationType.textContent = t('country');
        ui.locationName.textContent = displayName(state.country);
      }
    }

    if (typeof updateOverlayText === 'function') updateOverlayText();
    if (typeof updateUSOverlayText === 'function') updateUSOverlayText();
  }

  window.refreshLanguageUI = refreshLanguageUI;

  // Override region-selection functions only at the presentation layer.
  if (typeof choosePrefecture === 'function') {
    const originalChoosePrefecture = choosePrefecture;
    choosePrefecture = function(value) {
      originalChoosePrefecture(value);
      ui.locationName.textContent = localizedJPPrefecture(state.region);
      localizeRegionDropdown();
    };
  }
  if (typeof chooseUSState === 'function') {
    const originalChooseUSState = chooseUSState;
    chooseUSState = function(name) {
      originalChooseUSState(name);
      ui.locationName.textContent = localizedUSRegion(state.region);
      localizeRegionDropdown();
    };
  }

  // Parent-level handlers run after each state's/prefecture's own hover handler.
  const jpSvg = document.getElementById('japanOverlayMap');
  jpSvg?.addEventListener('pointerover', event => {
    const group = event.target.closest?.('.jp-pref');
    if (group) ui.globeStatus.textContent = localizedJPPrefecture(group.dataset.value);
  });
  jpSvg?.addEventListener('pointerout', event => {
    if (event.target.closest?.('.jp-pref')) ui.globeStatus.textContent = overlayText().title;
  });

  const usSvg = document.getElementById('usOverlayMap');
  usSvg?.addEventListener('pointerover', event => {
    const group = event.target.closest?.('.us-state');
    if (group) ui.globeStatus.textContent = localizedUSRegion(group.dataset.name);
  });
  usSvg?.addEventListener('pointerout', event => {
    if (event.target.closest?.('.us-state')) ui.globeStatus.textContent = usOverlayText().title;
  });

  ui.languageButtons.forEach(button => button.addEventListener('click', () => setTimeout(refreshLanguageUI, 0)));
  ui.regionSelect.addEventListener('change', () => setTimeout(refreshLanguageUI, 0));

  fetch('https://cdn.jsdelivr.net/npm/country-list@2.3.0/data.json', { cache: 'force-cache' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error('country list unavailable')))
    .then(rows => {
      countryCodes = new Map(rows.map(row => [row.name, row.code]));
      refreshLanguageUI();
    })
    .catch(() => refreshLanguageUI());

  refreshLanguageUI();
})();
