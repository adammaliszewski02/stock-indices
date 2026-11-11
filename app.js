const PAGE_SIZE = 12;

const searchInput = document.querySelector("#company-search");
const searchForm = document.querySelector(".search-form");
const suggestions = document.querySelector("#suggestions");
const companyGrid = document.querySelector("#company-grid");
const resultCount = document.querySelector("#result-count");
const collectionCount = document.querySelector("#collection-count");
const directoryMessage = document.querySelector("#directory-message");
const showMoreButton = document.querySelector("#show-more");
const filterButtons = [...document.querySelectorAll(".filter-button")];
const exampleButtons = [...document.querySelectorAll(".example-search")];

let companies = [];
let activeMarket = "All";
let expanded = false;
let highlightedIndex = -1;
let matchingSuggestions = [];

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchesCompany(company, query) {
  const searchText = normalize(`${company.ticker} ${company.name} ${company.market}`);
  return searchText.includes(normalize(query.trim()));
}

function getVisibleCompanies() {
  const query = searchInput.value.trim();
  return companies.filter((company) => {
    const matchesMarket = activeMarket === "All" || company.market === activeMarket;
    return matchesMarket && (!query || matchesCompany(company, query));
  });
}

function makeCompanyLink(company, suggestion = false) {
  const link = document.createElement("a");
  link.className = suggestion ? "suggestion-link" : "company-card";
  link.href = company.href;
  link.setAttribute("role", suggestion ? "option" : "listitem");
  link.dataset.ticker = company.ticker;

  const ticker = document.createElement("span");
  ticker.className = suggestion ? "suggestion-ticker" : "company-monogram";
  ticker.textContent = company.ticker;
  link.append(ticker);

  const details = document.createElement("span");
  details.className = suggestion ? "suggestion-company" : "company-details";

  const name = document.createElement("strong");
  name.textContent = company.name;
  const symbol = document.createElement("span");
  symbol.textContent = company.ticker;
  details.append(name, symbol);
  link.append(details);

  if (suggestion) {
    const market = document.createElement("span");
    market.className = "suggestion-market";
    market.textContent = company.market === "Warsaw" ? "WARSAW" : "US";
    link.append(market);
  } else {
    const arrow = document.createElement("span");
    arrow.className = "card-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    link.append(arrow);
  }

  return link;
}

function renderSuggestions() {
  const query = searchInput.value.trim();
  highlightedIndex = -1;
  matchingSuggestions = query
    ? companies.filter((company) => matchesCompany(company, query)).slice(0, 8)
    : [];
  suggestions.replaceChildren();

  if (!query) {
    suggestions.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.removeAttribute("aria-activedescendant");
    return;
  }

  if (matchingSuggestions.length === 0) {
    const empty = document.createElement("li");
    empty.className = "suggestion-empty";
    empty.textContent = "No matching companies. Try a ticker or another name.";
    suggestions.append(empty);
  } else {
    matchingSuggestions.forEach((company, index) => {
      const item = document.createElement("li");
      item.setAttribute("role", "presentation");
      const link = makeCompanyLink(company, true);
      link.id = `suggestion-${index}`;
      item.append(link);
      suggestions.append(item);
    });
  }

  suggestions.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
  searchInput.removeAttribute("aria-activedescendant");
}

function renderDirectory() {
  const visibleCompanies = getVisibleCompanies();
  const shownCompanies = expanded ? visibleCompanies : visibleCompanies.slice(0, PAGE_SIZE);
  companyGrid.replaceChildren();

  if (shownCompanies.length === 0) {
    const empty = document.createElement("p");
    empty.className = "grid-empty";
    empty.textContent = searchInput.value.trim()
      ? "No companies found. Try a different name or ticker."
      : "No reports are available for this market.";
    companyGrid.append(empty);
  } else {
    shownCompanies.forEach((company) => companyGrid.append(makeCompanyLink(company)));
  }

  resultCount.textContent = `${visibleCompanies.length} ${visibleCompanies.length === 1 ? "company" : "companies"}`;
  directoryMessage.textContent = visibleCompanies.length > PAGE_SIZE && !expanded
    ? `Showing ${shownCompanies.length} of ${visibleCompanies.length} companies`
    : "";
  showMoreButton.hidden = visibleCompanies.length <= PAGE_SIZE || expanded;
  showMoreButton.textContent = searchInput.value.trim() ? "Show all matches ↓" : "Show all companies ↓";
  companyGrid.setAttribute("aria-busy", "false");
}

function updateFilterButtons() {
  filterButtons.forEach((button) => {
    const active = button.dataset.market === activeMarket;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function highlightSuggestion(index) {
  const links = [...suggestions.querySelectorAll(".suggestion-link")];
  if (links.length === 0) return;

  highlightedIndex = (index + links.length) % links.length;
  links.forEach((link, linkIndex) => {
    const highlighted = linkIndex === highlightedIndex;
    link.classList.toggle("is-highlighted", highlighted);
    if (highlighted) {
      searchInput.setAttribute("aria-activedescendant", `suggestion-${linkIndex}`);
    }
  });
}

async function loadCompanies() {
  try {
    const response = await fetch("/api/companies");
    if (!response.ok) throw new Error(`Company directory request failed (${response.status})`);
    companies = await response.json();
    companies.sort((a, b) => a.ticker.localeCompare(b.ticker));
    collectionCount.firstChild.textContent = String(companies.length);
    renderDirectory();
  } catch (error) {
    resultCount.textContent = "Directory unavailable";
    directoryMessage.textContent = "Could not load the company reports. Refresh the page to try again.";
    companyGrid.setAttribute("aria-busy", "false");
    console.error(error);
  }
}

searchInput.addEventListener("input", () => {
  expanded = false;
  renderSuggestions();
  renderDirectory();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" && !suggestions.hidden) {
    event.preventDefault();
    highlightSuggestion(highlightedIndex + 1);
  } else if (event.key === "ArrowUp" && !suggestions.hidden) {
    event.preventDefault();
    highlightSuggestion(highlightedIndex - 1);
  } else if (event.key === "Enter") {
    const selected = matchingSuggestions[highlightedIndex >= 0 ? highlightedIndex : 0];
    if (selected) {
      event.preventDefault();
      window.location.assign(selected.href);
    }
  } else if (event.key === "Escape") {
    suggestions.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.removeAttribute("aria-activedescendant");
  }
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const firstMatch = matchingSuggestions[0];
  if (firstMatch) window.location.assign(firstMatch.href);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-wrap")) {
    suggestions.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.removeAttribute("aria-activedescendant");
  }
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeMarket = button.dataset.market;
    expanded = false;
    updateFilterButtons();
    renderDirectory();
  });
});

exampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    searchInput.value = button.dataset.query;
    searchInput.focus();
    expanded = false;
    renderSuggestions();
    renderDirectory();
  });
});

showMoreButton.addEventListener("click", () => {
  expanded = true;
  renderDirectory();
});

loadCompanies();
