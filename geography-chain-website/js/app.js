/* Geography Chain — browser implementation of the supplied Python games.
   The city databases are loaded locally from ./data/; no third-party scripts are used. */
"use strict";

const DATA_FILES = {
  us: "./data/uscities.csv",
  world: "./data/worldcities.csv"
};

const CONFIG = {
  us: {
    label: "U.S. GEOGRAPHY",
    title: "U.S. Geography Chain",
    minPopulation: 1_000_000,
    attribution: "https://simplemaps.com/data/us-cities"
  },
  world: {
    label: "INTERNATIONAL GEOGRAPHY",
    title: "International Geography Chain",
    minPopulation: 10_000_000,
    attribution: "https://simplemaps.com/data/world-cities"
  }
};

const state = {
  mode: null,
  database: null,
  startingCities: [],
  round: 1,
  errors: [],
  currentPromptCity: null,
  targetCoordinate: null,
  targetType: null,
  pendingCity: null,
  pendingMatches: null,
  awaitingContinue: false
};

const $ = (id) => document.getElementById(id);

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function parseNumber(value) {
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

// CSV parser supporting quoted fields, escaped quotes, commas and line breaks.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'; i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field); field = "";
    } else if (char === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field); rows.push(row);
  }
  if (!rows.length) throw new Error("The CSV file is empty.");
  const headers = rows.shift().map((h) => h.replace(/^\uFEFF/, "").trim());
  return rows.filter((r) => r.some((v) => v.trim() !== "")).map((r) => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i] ?? "");
    return obj;
  });
}

function validateColumns(rows, required) {
  if (!rows.length) throw new Error("The CSV file contains no city records.");
  const columns = Object.keys(rows[0]);
  const missing = required.filter((col) => !columns.includes(col));
  if (missing.length) throw new Error("The CSV is missing required columns: " + missing.join(", "));
}

async function loadDatabase(mode) {
  const response = await fetch(DATA_FILES[mode]);
  if (!response.ok) {
    throw new Error(`Could not load ${mode === "us" ? "uscities.csv" : "worldcities.csv"}. Put the correct CSV file in the project's data folder, then refresh this page.`);
  }
  const rows = parseCSV(await response.text());
  const cities = [];
  const lookup = new Map();
  const countries = new Set();

  if (mode === "us") {
    validateColumns(rows, ["city", "city_ascii", "state_id", "state_name", "lat", "lng", "population"]);
    for (const row of rows) {
      const name = (row.city || "").trim();
      const ascii = (row.city_ascii || "").trim();
      const stateCode = (row.state_id || "").trim().toUpperCase();
      if (!name || !stateCode) continue;
      const city = {
        name, ascii, stateCode, stateName: (row.state_name || "").trim(),
        latitude: Number(row.lat), longitude: Number(row.lng),
        population: parseNumber(row.population)
      };
      if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) continue;
      cities.push(city);
      lookup.set(`${normalize(name)}|${stateCode}`, city);
      if (ascii) lookup.set(`${normalize(ascii)}|${stateCode}`, city);
    }
  } else {
    validateColumns(rows, ["city", "city_ascii", "lat", "lng", "country", "iso2", "population", "admin_name"]);
    for (const row of rows) {
      const name = (row.city || "").trim();
      const ascii = (row.city_ascii || "").trim();
      const country = (row.country || "").trim();
      const countryCode = (row.iso2 || "").trim().toUpperCase();
      const region = (row.admin_name || "").trim();
      if (!name || !countryCode || !country) continue;
      const city = {
        name, ascii, country, countryCode, region,
        latitude: Number(row.lat), longitude: Number(row.lng),
        population: parseNumber(row.population)
      };
      if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) continue;
      cities.push(city);
      countries.add(country);
      const names = new Set([normalize(name)]);
      if (ascii) names.add(normalize(ascii));
      (row.city_alt || "").split("|").forEach((alt) => {
        if (alt.trim()) names.add(normalize(alt));
      });
      for (const cityName of names) {
        const key = `${cityName}|${normalize(country)}`;
        if (!lookup.has(key)) lookup.set(key, []);
        const matches = lookup.get(key);
        const duplicate = matches.some((existing) =>
          existing.latitude === city.latitude &&
          existing.longitude === city.longitude &&
          normalize(existing.region) === normalize(region)
        );
        if (!duplicate) matches.push(city);
      }
    }
  }

  const startingCities = cities.filter((city) => city.population > CONFIG[mode].minPopulation);
  if (!cities.length) throw new Error("No valid city records were loaded. Check that you uploaded the correct CSV.");
  if (!startingCities.length) throw new Error(`No cities have a population greater than ${CONFIG[mode].minPopulation.toLocaleString()} in this dataset.`);
  return { cities, lookup, countries: [...countries].sort(), startingCities };
}

function formatCoordinate(value, type) {
  const direction = type === "latitude"
    ? (value >= 0 ? "N" : "S")
    : (value >= 0 ? "E" : "W");
  return `${Math.abs(value).toFixed(2)}° ${direction}`;
}

function calculateError(guess, actual) {
  return Math.round(Math.abs(guess - actual) * 100) / 100;
}

function cityLabel(city, mode) {
  return mode === "us" ? `${city.name}, ${city.stateCode}` : `${city.name}, ${city.country}`;
}

function showScreen(screenId) {
  ["home-screen", "game-screen", "results-screen"].forEach((id) => $(id).classList.toggle("hidden", id !== screenId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setError(message = "") {
  $("form-error").textContent = message;
}

function clearMatchOptions() {
  $("match-options").replaceChildren();
  $("match-options").classList.add("hidden");
}

async function startGame(mode) {
  state.mode = mode;
  showScreen("game-screen");
  $("game-edition").textContent = CONFIG[mode].label;
  $("round-title").textContent = "Loading cities…";
  $("submit-answer").disabled = true;
  try {
    state.database = await loadDatabase(mode);
    state.startingCities = state.database.startingCities;
    resetGame();
  } catch (error) {
    $("round-title").textContent = "Dataset unavailable";
    $("prompt-tag").textContent = "SETUP REQUIRED";
    $("prompt-title").textContent = "We couldn't load the city database.";
    $("prompt-description").textContent = error.message;
    $("prompt-city").textContent = "";
    $("answer-form").classList.add("hidden");
    $("feedback-card").classList.add("hidden");
  }
}

function resetGame() {
  state.round = 1;
  state.errors = [];
  state.pendingCity = null;
  state.pendingMatches = null;
  state.awaitingContinue = false;
  $("answer-form").classList.remove("hidden");
  $("feedback-card").classList.add("hidden");
  $("submit-answer").disabled = false;
  const start = state.startingCities[Math.floor(Math.random() * state.startingCities.length)];
  state.currentPromptCity = start;
  state.targetCoordinate = start.latitude;
  state.targetType = "latitude";
  renderRound();
}

function renderRound() {
  const r = state.round;
  $("round-number").textContent = String(r).padStart(2, "0");
  $("round-title").textContent = `Round ${r}`;
  $("progress-fill").style.width = `${r * 20}%`;
  $("running-score").textContent = state.errors.reduce((a, b) => a + b, 0).toFixed(2);
  renderScoreRows();

  $("answer-form").reset();
  setError();
  clearMatchOptions();
  $("feedback-card").classList.add("hidden");
  $("answer-form").classList.remove("hidden");
  $("submit-answer").disabled = false;
  $("prompt-city").textContent = "";
  $("coordinate-entry").classList.add("hidden");
  $("city-entry").classList.add("hidden");

  if (r === 1) {
    configureCoordinatePrompt("latitude", state.currentPromptCity);
  } else if (r === 2) {
    configureCityPrompt("latitude");
  } else if (r === 3) {
    configureCoordinatePrompt("longitude", state.currentPromptCity);
  } else if (r === 4) {
    configureCityPrompt("longitude");
  } else {
    configureCoordinatePrompt("latitude", state.currentPromptCity);
  }
}

function configureCoordinatePrompt(type, city) {
  state.targetType = type;
  state.targetCoordinate = city[type];
  $("prompt-tag").textContent = "COORDINATE GUESS";
  $("prompt-title").textContent = `Guess the ${type}.`;
  $("prompt-description").textContent = `Enter a value between ${type === "latitude" ? "−90° and 90°" : "−180° and 180°"}.`;
  $("prompt-city").textContent = cityLabel(city, state.mode);
  $("coordinate-entry").classList.remove("hidden");
  $("coordinate-input").placeholder = type === "latitude" ? "e.g. 40.71" : "e.g. -73.94";
  $("coordinate-unit").textContent = type === "latitude" ? "° N / S" : "° E / W";
}

function configureCityPrompt(type) {
  state.targetType = type;
  $("prompt-tag").textContent = "CITY IDENTIFICATION";
  $("prompt-title").textContent = `Find a city near this ${type}.`;
  $("prompt-description").textContent = `Name a ${state.mode === "us" ? "U.S. city" : "city anywhere in the world"} whose actual ${type} is closest to the target below.`;
  $("prompt-city").textContent = formatCoordinate(state.targetCoordinate, type);
  $("city-entry").classList.remove("hidden");
  $("city-input").placeholder = state.mode === "us" ? "City, ST" : "City, Country";
  $("city-format-hint").textContent = state.mode === "us"
    ? "Enter the city followed by its two-letter state abbreviation."
    : "Enter the city followed by its full country name (for example, Tokyo, Japan).";
}

function renderScoreRows() {
  const list = $("round-score-list");
  list.replaceChildren();
  for (let i = 1; i <= 5; i++) {
    const row = document.createElement("div");
    row.className = "score-row" + (i === state.round ? " current" : "");
    const label = document.createElement("span");
    label.textContent = `ROUND ${String(i).padStart(2, "0")}`;
    const score = document.createElement("b");
    score.textContent = state.errors[i - 1] === undefined ? "—" : `${state.errors[i - 1].toFixed(2)}°`;
    row.append(label, score);
    list.append(row);
  }
}

function submitCoordinate() {
  const raw = $("coordinate-input").value.trim();
  if (!raw) return setError("Enter a coordinate to continue.");
  const guess = Number(raw);
  const max = state.targetType === "latitude" ? 90 : 180;
  if (!Number.isFinite(guess) || guess < -max || guess > max) {
    return setError(`Enter a valid ${state.targetType} between ${-max} and ${max}.`);
  }
  const error = calculateError(Math.round(guess * 100) / 100, state.targetCoordinate);
  completeRound(error, formatCoordinate(state.targetCoordinate, state.targetType),
    `Your guess was ${formatCoordinate(Math.round(guess * 100) / 100, state.targetType)}. The actual ${state.targetType} was ${formatCoordinate(state.targetCoordinate, state.targetType)}.`);
}

function findUSCity(input) {
  const parts = input.split(",");
  if (parts.length < 2) return { error: "Use this format: City, ST (for example, Pittsburgh, PA)." };
  const cityName = parts.slice(0, -1).join(",").trim();
  const stateCode = parts.at(-1).trim().toUpperCase();
  if (!cityName || stateCode.length !== 2) return { error: "Enter a city and a two-letter state abbreviation." };
  const city = state.database.lookup.get(`${normalize(cityName)}|${stateCode}`);
  if (!city) return { error: `"${cityName}, ${stateCode}" was not found. Check the spelling and state abbreviation.` };
  return { city };
}

function findWorldCity(input) {
  const normalizedInput = normalize(input);
  // Match against the full country-name suffix. This also supports country names
  // containing commas, such as "Korea, Republic of".
  const countries = state.database.countries.slice().sort((a, b) => b.length - a.length);
  const country = countries.find((name) => normalizedInput.endsWith(`, ${normalize(name)}`));
  if (!country) return { error: "Use this format: City, Country (for example, Tokyo, Japan). Use the full country name." };
  const cityName = input.slice(0, input.length - country.length - 1).trim().replace(/,\s*$/, "");
  if (!cityName) return { error: "Enter a city name before the country." };
  const matches = state.database.lookup.get(`${normalize(cityName)}|${normalize(country)}`) || [];
  if (!matches.length) return { error: `"${cityName}, ${country}" was not found. Check the spelling and full country name.` };
  if (matches.length === 1) return { city: matches[0] };
  return { matches, cityName, country };
}

function submitCity() {
  const input = $("city-input").value.trim();
  if (!input) return setError("Enter a city to continue.");
  const result = state.mode === "us" ? findUSCity(input) : findWorldCity(input);
  if (result.error) return setError(result.error);
  if (result.matches) {
    showWorldMatches(result.matches, result.cityName, result.country);
    return;
  }
  acceptCity(result.city);
}

function showWorldMatches(matches, cityName, country) {
  clearMatchOptions();
  $("match-options").classList.remove("hidden");
  const intro = document.createElement("p");
  intro.className = "field-hint";
  intro.textContent = `Several matches for ${cityName}, ${country}. Select the correct region:`;
  $("match-options").append(intro);
  matches.forEach((city) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "match-option";
    button.textContent = city.region || "Region not specified";
    button.addEventListener("click", () => {
      clearMatchOptions();
      acceptCity(city);
    });
    $("match-options").append(button);
  });
}

function acceptCity(city) {
  const type = state.targetType;
  const actual = city[type];
  const error = calculateError(actual, state.targetCoordinate);
  completeRound(error, formatCoordinate(actual, type),
    `${cityLabel(city, state.mode)} has an actual ${type} of ${formatCoordinate(actual, type)}.`);
  // The guessed city becomes the next coordinate prompt, just as in the Python version.
  if (state.round === 2 || state.round === 4) {
    state.pendingCity = city;
  }
}

function completeRound(error, correctCoordinate, detail) {
  state.errors.push(error);
  $("answer-form").classList.add("hidden");
  $("feedback-card").classList.remove("hidden");
  $("feedback-error").textContent = `${error.toFixed(2)}°`;
  $("feedback-correct").textContent = correctCoordinate;
  $("feedback-detail").textContent = detail;
  $("feedback-status").textContent = error === 0 ? "PERFECT" : "RECORDED";
  $("running-score").textContent = state.errors.reduce((a, b) => a + b, 0).toFixed(2);
  renderScoreRows();
  $("continue-button").textContent = state.round === 5 ? "See final score →" : "Continue →";
  state.awaitingContinue = true;
}

function advanceRound() {
  if (!state.awaitingContinue) return;
  state.awaitingContinue = false;
  if (state.round === 5) {
    showResults();
    return;
  }
  // Correct city coordinates determine the next coordinate target.
  if (state.round === 2) {
    state.currentPromptCity = state.pendingCity;
  } else if (state.round === 4) {
    state.currentPromptCity = state.pendingCity;
  }
  state.round += 1;
  if (state.round === 2) state.targetCoordinate = state.currentPromptCity.latitude;
  if (state.round === 3) state.targetCoordinate = state.currentPromptCity.longitude;
  if (state.round === 4) state.targetCoordinate = state.currentPromptCity.longitude;
  if (state.round === 5) state.targetCoordinate = state.currentPromptCity.latitude;
  renderRound();
}

function showResults() {
  const total = Math.round(state.errors.reduce((a, b) => a + b, 0) * 100) / 100;
  $("final-score").innerHTML = `${total.toFixed(2)}<span>°</span>`;
  const list = $("final-score-list");
  list.replaceChildren();
  state.errors.forEach((error, index) => {
    const row = document.createElement("div");
    row.className = "final-score-row";
    const label = document.createElement("span");
    label.textContent = `ROUND ${String(index + 1).padStart(2, "0")}`;
    const score = document.createElement("strong");
    score.textContent = `${error.toFixed(2)}°`;
    row.append(label, score);
    list.append(row);
  });
  showScreen("results-screen");
}

function returnHome() {
  state.mode = null;
  state.database = null;
  showScreen("home-screen");
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => startGame(button.dataset.mode));
});
$("answer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.round === 1 || state.round === 3 || state.round === 5) submitCoordinate();
  else submitCity();
});
$("continue-button").addEventListener("click", advanceRound);
$("back-home").addEventListener("click", returnHome);
$("results-home").addEventListener("click", returnHome);
$("play-again").addEventListener("click", () => {
  if (state.database) resetGame();
  showScreen("game-screen");
});
