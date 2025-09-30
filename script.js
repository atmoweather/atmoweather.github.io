/* script.js */
/*
  ОНОВЛЕННЯ: Якщо місто не знайдено — показуємо підказки (до 5 варіантів).
  Також додаємо візуальний ефект (shake) та підсвітку помилки.
*/

const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const card = document.getElementById('card');
const hint = document.getElementById('hint');
const suggestionsEl = document.getElementById('suggestions');

const locationEl = document.getElementById('location');
const tempEl = document.getElementById('temp');
const descEl = document.getElementById('desc');
const iconEl = document.getElementById('icon');
const feelsEl = document.getElementById('feels');
const humidityEl = document.getElementById('humidity');
const adviceEl = document.getElementById('advice');
const forecastEl = document.getElementById('forecast');
const timezoneEl = document.getElementById('timezone');

const LAST_CITY_KEY = 'weather_last_city_openm';

// weathercode map (emoji + опис)
const WC_MAP = {
  0: ['☀️','ясно'],1:['🌤️','мало хмарно'],2:['⛅','перемінна хмарність'],3:['☁️','хмарно'],
  45:['🌫️','туман'],48:['🌫️','осідання'],51:['🌦️','дрібний дощ'],53:['🌦️','помірний дрібний дощ'],
  55:['🌧️','щільний дрібний дощ'],56:['🌧️','замерзаючий дрібний дощ'],57:['🌧️','замерзаючий сильний дрібний дощ'],
  61:['🌧️','дощ'],63:['🌧️','помірний дощ'],65:['⛈️','сильний дощ'],66:['🌨️','замерзаючий дощ'],
  67:['🌨️','сильний замерзаючий дощ'],71:['❄️','сніг'],73:['❄️','помірний сніг'],75:['❄️','сильний сніг'],
  77:['🌨️','снігові крихти'],80:['🌧️','зливи (локально)'],81:['🌧️','помірні зливи'],82:['⛈️','сильні зливи'],
  85:['❄️','снігопад (легкий)'],86:['❄️','снігопад (сильний)'],95:['⛈️','гроза'],96:['⛈️','гроза з градом'],99:['⛈️','сильна гроза з градом']
};

function wcToEmoji(code){ return WC_MAP[code] ? WC_MAP[code][0] : '🌈'; }
function wcToDesc(code){ return WC_MAP[code] ? WC_MAP[code][1] : 'непередбачувано'; }

function setLoading(is){
  if(is){ searchBtn.textContent = 'Завантаження...'; searchBtn.disabled = true; }
  else { searchBtn.textContent = 'Пошук'; searchBtn.disabled = false; }
}

function clearSuggestions(){ suggestionsEl.innerHTML = ''; suggestionsEl.style.display = 'none'; }
function showSuggestions(list){
  clearSuggestions();
  if(!list || !list.length) return;
  suggestionsEl.style.display = 'flex';
  list.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'suggestion';
    btn.type = 'button';
    const label = `${item.name}${item.admin1 ? ', ' + item.admin1 : ''}${item.country ? ' — ' + item.country : ''}`;
    btn.innerHTML = `<strong>${label}</strong><span class="sub">Кліковець — показати погоду</span>`;
    btn.addEventListener('click', ()=> {
      cityInput.value = label;
      clearSuggestions();
      fetchWeatherByCoords(item.latitude, item.longitude, item.name, item.country, item.timezone);
    });
    suggestionsEl.appendChild(btn);
  });
}

function showError(text){
  hint.innerHTML = text;
  card.classList.add('hidden');
  // shake input & add red ring
  cityInput.classList.remove('error');
  void cityInput.offsetWidth; // reflow to restart animation if present
  cityInput.classList.add('shake','error');
  setTimeout(()=>{ cityInput.classList.remove('shake'); }, 480);
}

function showNotFoundWithSuggestions(city, suggestions){
  if(suggestions && suggestions.length){
    hint.innerHTML = `Не знайдено точної відповідності для «<strong>${city}</strong>». Можливо ви мали на увазі:`;
    showSuggestions(suggestions);
    // підсвітити поле вводу
    cityInput.classList.add('error');
  } else {
    hint.innerHTML = `<span class="notfound">Місто «${city}» не знайдено. Спробуйте іншу назву або перевірте правопис.</span>`;
    cityInput.classList.add('error');
    // shake
    cityInput.classList.remove('shake');
    void cityInput.offsetWidth;
    cityInput.classList.add('shake');
    setTimeout(()=>{ cityInput.classList.remove('shake'); }, 480);
  }
}

function showCard(){ card.classList.remove('hidden'); hint.textContent = ''; clearSuggestions(); cityInput.classList.remove('error'); }

function adviceFor(tempC, weathercode, pop){
  const adv = [];
  const wc = Number(weathercode);
  if(pop > 0.4) adv.push('Можливі опади — візьміть парасольку ☔');
  if([51,53,55,61,63,65,80,81,82].includes(wc)) adv.push('Рекомендується дощовий одяг');
  if([71,73,75,85,86].includes(wc)) adv.push('Теплий одяг та черевики — буде сніг ❄️');
  if(tempC <= 5) adv.push('Холодно — надягніть куртку 🧥');
  if(tempC > 25) adv.push('Спекотно — не забувайте пити воду 💧');
  if([95,96,99].includes(wc)) adv.push('Можливі грози — обережно з відкритими просторами ⛈️');
  if(adv.length === 0) adv.push('Нічого особливого — приємного дня! 🙂');
  return adv.join(' | ');
}

// Повертаємо 1 результат (best) або null
async function geocodeOne(city){
  const q = encodeURIComponent(city);
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=uk`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Помилка геокодування');
  const j = await res.json();
  if(!j.results || j.results.length === 0) return null;
  return j.results[0];
}

// Запит підказок — max 5
async function geocodeSuggest(city){
  const q = encodeURIComponent(city);
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=5&language=uk`;
  const res = await fetch(url);
  if(!res.ok) return [];
  const j = await res.json();
  return j.results || [];
}

// Отримуємо прогноз від Open-Meteo
async function getForecast(lat, lon, timezone){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
              `&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
              `&timezone=${encodeURIComponent(timezone || 'auto')}&forecast_days=7`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Помилка отримання прогнозу');
  return await res.json();
}

function formatDateUADateString(isoDate){
  try{
    const d = new Date(isoDate);
    return d.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
  }catch(e){
    return isoDate;
  }
}

function renderWeather(name, country, timezone, forecast){
  const cur = forecast.current_weather;
  const ctemp = Math.round(cur.temperature);
  locationEl.textContent = `${name}${country ? ', ' + country : ''}`;
  tempEl.textContent = `${ctemp}°C`;
  descEl.textContent = wcToDesc(cur.weathercode);
  iconEl.textContent = wcToEmoji(cur.weathercode);
  feelsEl.textContent = `Вітер: ${Math.round(cur.windspeed)} м/с`;
  humidityEl.textContent = `Дані: Open-Meteo (детальна вологість потребує hourly-запиту)`;
  timezoneEl.textContent = `Часовий пояс: ${timezone || 'авто'}`;
  adviceEl.textContent = adviceFor(ctemp, cur.weathercode, 0);

  const daily = forecast.daily;
  const dates = daily.time;
  const codes = daily.weathercode;
  const tmax = daily.temperature_2m_max;
  const tmin = daily.temperature_2m_min;
  const popArr = daily.precipitation_probability_max || [];

  forecastEl.innerHTML = '';
  for(let i=0; i<Math.min(5, dates.length); i++){
    const dateStr = formatDateUADateString(dates[i]);
    const code = codes[i];
    const icon = wcToEmoji(code);
    const main = wcToDesc(code);
    const max = Math.round(tmax[i]);
    const min = Math.round(tmin[i]);
    const pop = popArr[i] !== undefined ? (popArr[i] / 100) : 0;
    const div = document.createElement('div');
    div.className = 'day';
    div.innerHTML = `
      <div class="date">${dateStr}</div>
      <div style="font-size:32px;margin:6px 0">${icon}</div>
      <div class="dmain">${main}</div>
      <div class="dtemp">${min}° / ${max}°</div>
      <div class="pop">${pop > 0 ? 'Опадів: ' + Math.round(pop*100) + '%' : 'Опадів малоймовірно'}</div>
      <div class="dadv" style="font-size:12px;margin-top:8px;color:var(--muted)">${adviceFor(Math.round((min+max)/2), code, pop)}</div>
    `;
    forecastEl.appendChild(div);
  }

  showCard();
}

async function fetchWeatherByCoords(lat, lon, name, country, timezone){
  try{
    setLoading(true);
    const fore = await getForecast(lat, lon, timezone);
    renderWeather(name, country, timezone, fore);
    localStorage.setItem(LAST_CITY_KEY, `${name}${country ? ', ' + country : ''}`);
  }catch(err){
    showError('⚠️ ' + (err.message || String(err)));
  }finally{
    setLoading(false);
  }
}

async function fetchWeatherByCity(city){
  try{
    setLoading(true);
    clearSuggestions();
    const best = await geocodeOne(city);
    if(best){
      await fetchWeatherByCoords(best.latitude, best.longitude, best.name, best.country, best.timezone);
      return;
    }
    // якщо не знайшли best — пробуємо підказки
    const suggestions = await geocodeSuggest(city);
    if(suggestions && suggestions.length){
      showNotFoundWithSuggestions(city, suggestions);
    } else {
      showNotFoundWithSuggestions(city, []);
    }
  }catch(err){
    showError('⚠️ ' + (err.message || String(err)));
  }finally{
    setLoading(false);
  }
}

// Події
searchBtn.addEventListener('click', () => {
  const city = cityInput.value.trim();
  if(!city) { showError('Введіть місто'); return; }
  fetchWeatherByCity(city);
});
cityInput.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') searchBtn.click();
});

window.addEventListener('load', ()=>{
  const last = localStorage.getItem(LAST_CITY_KEY);
  if(last){ cityInput.value = last; fetchWeatherByCity(last); }
});


// ------------- Ads + Sponsored + Cookie Consent helpers -------------

// Простий менеджер consent (localStorage)
const CONSENT_KEY = 'site_consent_ads';
function hasConsent(){ return localStorage.getItem(CONSENT_KEY) === 'granted'; }
function setConsent(v){ localStorage.setItem(CONSENT_KEY, v ? 'granted' : 'denied'); }

// DOM refs
const adBanner = document.getElementById('adBanner');
const sponsoredCard = document.getElementById('sponsoredCard');
const sponText = document.getElementById('sponText');
const sponLink = document.getElementById('sponLink');
const sponImg = document.getElementById('sponImg');
const cookieConsent = document.getElementById('cookieConsent');
const acceptCookies = document.getElementById('acceptCookies');
const rejectCookies = document.getElementById('rejectCookies');

// Показати/приховати рекламні блоки після consent
function updateAdsVisibility(){
  if(hasConsent()){
    adBanner.style.display = 'flex';
    // якщо хочеш — підвантажуй через script вставку AdSense тут
  } else {
    // показати заглушку (не зверху стороннього скрипта)
    adBanner.style.display = 'flex';
  }
}

// Заповнити sponsoredCard — приклад даних (можеш замінити на динамічні)
function showSponsoredCard(){
  sponText.textContent = 'Отримай 20% знижки на туристичні рюкзаки — промокод WEATHER20';
  sponLink.href = 'https://your-affiliate.link';
  sponImg.src = 'https://via.placeholder.com/240x140?text=Sponsor';
  sponsoredCard.classList.remove('hidden');
}

// Cookie consent controls
function initCookieConsent(){
  if(hasConsent()){
    cookieConsent.classList.add('hidden');
  } else {
    cookieConsent.classList.remove('hidden');
  }
  updateAdsVisibility();
}
acceptCookies?.addEventListener('click', ()=>{
  setConsent(true); cookieConsent.classList.add('hidden'); updateAdsVisibility();
});
rejectCookies?.addEventListener('click', ()=>{
  setConsent(false); cookieConsent.classList.add('hidden'); updateAdsVisibility();
});

// Викликати на load або після першого успішного рендеру погоди
initCookieConsent();

// Розумна інжекція реклами у forecast: замінити одну картку на ad (наприклад, 3-я)
function injectAdIntoForecast(){
  const cards = document.querySelectorAll('#forecast .day');
  if(cards.length >= 3){
    const adCard = document.createElement('div');
    adCard.className = 'day';
    adCard.innerHTML = `
      <div class="date">Реклама</div>
      <div style="font-size:28px;margin:6px 0">📣</div>
      <div class="dmain">Спонсор</div>
      <div class="dtemp">Пропозиція</div>
      <div class="pop"><a href="https://your-affiliate.link" target="_blank" rel="noopener noreferrer">Детальніше</a></div>
    `;
    // заміняємо 3-й елемент або вставляємо перед ним
    const third = cards[2];
    third.parentNode.insertBefore(adCard, third);
  }
}

// викликай injectAdIntoForecast() після renderWeather()
// ===== Mobile UX tweaks =====
(function(){
  // Якщо пристрій touch, зменшимо анімації і зробимо прогноз "snap" для зручності
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if(isTouch){
    // додаємо snap scrolling для forecast
    const forecast = document.getElementById('forecast');
    if(forecast){
      forecast.style.scrollSnapType = 'x mandatory';
      Array.from(forecast.children).forEach(child => {
        child.style.scrollSnapAlign = 'center';
      });
    }

    // вимикаємо background-attachment fixed якщо воно ще є
    const bg = document.querySelector('.bg-wrap');
    if(bg) bg.style.backgroundAttachment = 'scroll';
  }

  // автоматично приховати рекламу на маленьких екранах (опціонально)
  function maybeHideAds(){
    const w = window.innerWidth || document.documentElement.clientWidth;
    const ad = document.getElementById('adBanner');
    if(ad){
      if(w < 480) ad.style.display = 'none';
      else ad.style.display = '';
    }
  }
  maybeHideAds();
  window.addEventListener('resize', maybeHideAds);
})();


// ---------- Falling autumn leaves generator ----------
(function initLeaves(){
  // поважаєм reduced motion
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(prefersReduced) return; // нічого не робимо

  const layer = document.getElementById('leaf-layer');
  if(!layer) return;

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  // кількість листя: менше на мобільних
  const COUNT = isTouch ? 8 : 14;

  const EMOJIS = ['🍂','🍁','🍃']; // можна розширити
  const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

  // створити N листків
  for(let i=0;i<COUNT;i++){
    const leaf = document.createElement('div');
    leaf.className = 'leaf';
    const emoji = EMOJIS[Math.floor(Math.random()*EMOJIS.length)];
    leaf.setAttribute('data-emoji', emoji);

    // випадкові параметри
    const size = Math.round(18 + Math.random()*36); // px font-size
    const startX = Math.round(Math.random()*vw) + 'px'; // початкове ліво
    // дрейф в кінці (може бути в межах -25vw..+25vw)
    const driftSign = Math.random() < 0.5 ? -1 : 1;
    const drift = (Math.random()*0.25*vw*driftSign).toFixed(0) + 'px';
    const dur = (6 + Math.random()*8).toFixed(1) + 's'; // 6..14s
    const delay = (Math.random()*-8).toFixed(2) + 's'; // negative delays for staggering
    const spin = (360 + Math.random()*720).toFixed(0) + 'deg';
    const startRot = (Math.random()*360).toFixed(0) + 'deg';

    // задаємо змінні CSS для цього листка
    leaf.style.setProperty('--dur', dur);
    leaf.style.setProperty('--delay', delay);
    leaf.style.setProperty('--drift', drift);
    leaf.style.setProperty('--startX', startX);
    leaf.style.setProperty('--spin', spin);
    leaf.style.setProperty('--startRot', startRot);
    leaf.style.fontSize = size + 'px';

    // випадкова вертикальна початкова позиція (нема — використовуємо keyframe -10vh)
    // додаємо невеликий зсув по горизонталі через left
    leaf.style.left = Math.max(0, (Math.random()*100)) + 'vw';

    // випадкова opacity та blur (щоб відчуття глибини)
    leaf.style.opacity = (0.7 + Math.random()*0.3).toFixed(2);
    // додаємо трохи transform translateZ для кращого рендеру GPU
    leaf.style.willChange = 'transform, opacity';

    // inner content - emoji
    leaf.textContent = emoji;

    layer.appendChild(leaf);

    // очищення старих елементів, щоб DOM не ріс в нескінченність при SPA навігації
    // (необов'язково) — тут ми лиш залишаємо COUNT елементів
  }

  // при ресайзах оновлюємо позиції (щоб left обчислювався під новий vw)
  let resizeTimeout;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(()=>{
      // знищуємо і пересоздаємо, простіше для узгодженості
      while(layer.firstChild) layer.removeChild(layer.firstChild);
      initLeaves(); // безпечний рекурсивний виклик — але може викликатися багато разів при resize; тощо
    }, 250);
  }, {passive: true});
})();


