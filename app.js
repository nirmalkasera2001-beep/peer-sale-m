/* ==========================================
   HOSTEL STUFF - CENTRAL LOGIC ENGINE
   ========================================== */

const STORAGE_KEY = 'hostel_stuff_listings';
const FAVORITES_KEY = 'hostel_stuff_favorites';
const SUGGESTIONS_KEY = 'hostel_stuff_suggestions';

// ==========================================
// Firebase Realtime Database Configuration
// ==========================================
// Paste your Web App Firebase config keys here:
const firebaseConfig = {
  apiKey: "AIzaSyAY71rgWRT7mOFaeJqVSUgis_iom8ITwuU",
  authDomain: "hostel-stuff-72cd3.firebaseapp.com",
  databaseURL: "https://hostel-stuff-72cd3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "hostel-stuff-72cd3",
  storageBucket: "hostel-stuff-72cd3.firebasestorage.app",
  messagingSenderId: "620499637183",
  appId: "1:620499637183:web:925ec1d5035191947e070a"
};

let db = null;
let isFirebaseActive = false;

function checkFirebaseConfigured() {
  return firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    firebaseConfig.databaseURL &&
    firebaseConfig.databaseURL !== "https://YOUR_PROJECT-default-rtdb.firebaseio.com";
}
try {
  if (checkFirebaseConfigured()) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    isFirebaseActive = true;
    console.log("Firebase Realtime Database initialized successfully!");
  } else {
    console.warn("Firebase not configured. Running in LocalStorage fallback mode.");
  }
} catch (err) {
  console.error("Error initializing Firebase: ", err);
  console.warn("Falling back to LocalStorage mode.");
}

// Default mock suggestions
const DEFAULT_SUGGESTIONS = [
  {
    id: "sug-1",
    title: "Add a Dark/Light Mode toggle",
    type: "design",
    description: "The dark mode is beautiful, but some users might prefer a lighter theme during the day. A simple toggle in the navbar would be awesome!",
    author: "Sarah, Room 305",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "sug-2",
    title: "Search autocomplete and history",
    type: "feature",
    description: "It would be nice if the search bar suggested common items or colleges as you type and saved our recent searches.",
    author: "Anonymous",
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  }
];

// Default Seed Listings (Empty by default)
const DEFAULT_LISTINGS = [];

// Central App State
let state = {
  listings: [],
  favorites: [],
  suggestions: [],
  currentTab: "browse", // "browse" | "how" | "my-listings" | "favorites" | "suggestions"
  selectedCategory: "all",
  searchQuery: "",
  collegeQuery: "",
  sortBy: "newest",
  activeProductId: null,
  pinAction: null, // "delete" | "sold"
  uploadedBase64: null, // Store image base64 during upload
  recoveryCode: null // Store generated recovery code
};

// ==========================================
// Initialization
// ==========================================
function init() {
  // Load favorites (favorites are stored locally per device)
  const storedFavs = localStorage.getItem(FAVORITES_KEY);
  if (storedFavs) {
    state.favorites = JSON.parse(storedFavs);
  }

  if (isFirebaseActive) {
    // Load and listen to listings from Firebase Realtime Database
    db.ref('listings').on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        state.listings = Object.values(data);
        // Filter out any default listings just in case
        state.listings = state.listings.filter(item => !item.id.startsWith("default-"));
      } else {
        state.listings = [];
      }
      checkAutoExpiries();
      render();
    }, (error) => {
      console.error("Firebase listings load error:", error);
    });

    // Load and listen to suggestions from Firebase Realtime Database
    db.ref('suggestions').on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        state.suggestions = Object.values(data).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else {
        state.suggestions = [];
      }
      if (state.currentTab === "suggestions") {
        render();
      }
    }, (error) => {
      console.error("Firebase suggestions load error:", error);
    });
  } else {
    // FALLBACK: Load listings from LocalStorage
    const storedListings = localStorage.getItem(STORAGE_KEY);
    if (storedListings) {
      state.listings = JSON.parse(storedListings).filter(item => !item.id.startsWith("default-"));
      saveListingsToStorage();
    } else {
      state.listings = [...DEFAULT_LISTINGS];
      saveListingsToStorage();
    }

    // FALLBACK: Load suggestions from LocalStorage
    const storedSuggestions = localStorage.getItem(SUGGESTIONS_KEY);
    if (storedSuggestions) {
      state.suggestions = JSON.parse(storedSuggestions);
    } else {
      state.suggestions = [...DEFAULT_SUGGESTIONS];
      saveSuggestionsToStorage();
    }
  }

  // Check auto-expiry limits (for local mode setup)
  if (!isFirebaseActive) {
    checkAutoExpiries();
  }

  // Setup Event Listeners
  setupEventListeners();

  // Initial Render
  render();
}

function saveListingsToStorage() {
  if (isFirebaseActive) {
    const listingsMap = {};
    state.listings.forEach(item => {
      listingsMap[item.id] = item;
    });
    db.ref('listings').set(listingsMap).catch(err => console.error("Firebase save listings failed:", err));
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.listings));
  }
}

function saveFavoritesToStorage() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
}

function saveSuggestionsToStorage() {
  if (isFirebaseActive) {
    const suggestionsMap = {};
    state.suggestions.forEach(item => {
      suggestionsMap[item.id] = item;
    });
    db.ref('suggestions').set(suggestionsMap).catch(err => console.error("Firebase save suggestions failed:", err));
  } else {
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(state.suggestions));
  }
}

function checkAutoExpiries() {
  let updated = false;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  state.listings = state.listings.map(item => {
    const ageMs = now - new Date(item.createdAt).getTime();
    if (item.status === "active" && ageMs >= fourteenDaysMs) {
      updated = true;
      return { ...item, status: "expired" };
    }
    return item;
  });

  if (updated) {
    saveListingsToStorage();
  }
}

// ==========================================
// Rendering Engine
// ==========================================
function render() {
  const grid = document.getElementById("products-grid");
  const emptyState = document.getElementById("empty-state");
  const suggestionsLog = document.getElementById("suggestions-log");
  const howPanel = document.getElementById("how-it-works-panel");
  const heroSection = document.querySelector(".hero-section");
  const filterControls = document.querySelector(".filter-controls");

  grid.innerHTML = "";
  if (howPanel) howPanel.classList.add("hidden");

  if (state.currentTab === "how") {
    grid.classList.add("hidden");
    emptyState.classList.add("hidden");
    if (suggestionsLog) suggestionsLog.classList.add("hidden");
    if (filterControls) filterControls.classList.add("hidden");
    if (heroSection) heroSection.classList.add("hidden");
    if (howPanel) howPanel.classList.remove("hidden");
  } else if (state.currentTab === "suggestions") {
    grid.classList.add("hidden");
    emptyState.classList.add("hidden");

    if (filterControls) filterControls.classList.add("hidden");
    if (heroSection) heroSection.classList.add("hidden");

    if (suggestionsLog) {
      suggestionsLog.classList.remove("hidden");
      renderSuggestions();
    }
  } else {
    if (suggestionsLog) suggestionsLog.classList.add("hidden");

    // Only show the hero section on the "browse" tab
    if (heroSection) {
      if (state.currentTab === "browse") {
        heroSection.classList.remove("hidden");
      } else {
        heroSection.classList.add("hidden");
      }
    }

    // Show filter controls for catalog tabs
    if (filterControls) {
      if (state.currentTab === "suggestions" || state.currentTab === "how") {
        filterControls.classList.add("hidden");
      } else {
        filterControls.classList.remove("hidden");
      }
    }

    // Apply filters
    let filtered = getFilteredListings();

    // Apply sorting
    filtered = sortListings(filtered);

    // Render Grid
    if (filtered.length === 0) {
      grid.classList.add("hidden");
      emptyState.classList.remove("hidden");
    } else {
      grid.classList.remove("hidden");
      emptyState.classList.add("hidden");

      filtered.forEach(item => {
        const card = createProductCard(item);
        grid.appendChild(card);
      });
    }
  }

  // Update tabs/filters active classes
  updateActiveUI();
}

function getFilteredListings() {
  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  return state.listings.filter(item => {
    // 1. Tab filter
    if (state.currentTab === "browse") {
      const isExpired = (now - new Date(item.createdAt).getTime()) >= fourteenDaysMs;
      if (item.status !== "active" || isExpired) return false;
    } else if (state.currentTab === "my-listings") {
      if (!item.isUserAdded) return false;
    } else if (state.currentTab === "favorites") {
      if (!state.favorites.includes(item.id)) return false;
    }

    // 2. Category filter
    if (state.selectedCategory !== "all" && item.category !== state.selectedCategory) {
      return false;
    }

    // 3. Search query filter
    if (state.searchQuery.trim() !== "") {
      const q = state.searchQuery.toLowerCase();
      const titleMatch = item.title.toLowerCase().includes(q);
      const descMatch = item.description.toLowerCase().includes(q);
      if (!titleMatch && !descMatch) return false;
    }

    // 4. College query filter
    if (state.collegeQuery.trim() !== "") {
      const cq = state.collegeQuery.toLowerCase();
      if (!item.collegeName || !item.collegeName.toLowerCase().includes(cq)) {
        return false;
      }
    }

    return true;
  });
}

function sortListings(list) {
  return [...list].sort((a, b) => {
    if (state.sortBy === "newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } else if (state.sortBy === "price-low") {
      return a.price - b.price;
    } else if (state.sortBy === "price-high") {
      return b.price - a.price;
    }
    return 0;
  });
}

function createProductCard(item) {
  const isFav = state.favorites.includes(item.id);
  const card = document.createElement("div");
  card.className = "product-card";
  card.dataset.id = item.id;

  const priceStr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(item.price);
  const relativeDate = formatRelativeDate(item.createdAt);

  // Badge Status logic
  let badgeHTML = "";
  if (item.status === "sold") {
    badgeHTML = `<span class="badge badge-sold"><i class="fa-solid fa-circle-check"></i> Sold</span>`;
  } else if (item.status === "flagged") {
    badgeHTML = `<span class="badge badge-flagged"><i class="fa-solid fa-triangle-exclamation"></i> Flagged</span>`;
  } else if (item.status === "expired") {
    badgeHTML = `<span class="badge badge-expired"><i class="fa-solid fa-clock"></i> Expired</span>`;
  } else {
    badgeHTML = `<span class="badge badge-condition">${item.condition}</span>`;
  }

  card.innerHTML = `
    <div class="product-image-wrapper">
      <div class="card-badges">
        ${badgeHTML}
      </div>
      <button class="btn-favorite-card ${isFav ? 'active' : ''}" data-id="${item.id}" title="${isFav ? 'Remove' : 'Save'}">
        <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
      </button>
      <img src="${item.image}" alt="${item.title}" onerror="this.src='https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&auto=format&fit=crop'">
    </div>
    <div class="product-info">
      <div class="product-meta-top">
        <span class="product-category">${item.category}</span>
        <span class="product-date">${relativeDate}</span>
      </div>
      <h3 class="product-title">${item.title}</h3>
      <div class="product-college">
        <i class="fa-solid fa-graduation-cap"></i> ${item.collegeName || 'Unknown College'}
      </div>
      <p class="product-desc-snippet">${item.description}</p>
      <div class="product-meta-bottom">
        <span class="product-price">${priceStr}</span>
        <button class="btn btn-secondary btn-sm btn-view-details" data-id="${item.id}">View Details</button>
      </div>
    </div>
  `;

  card.addEventListener("click", (e) => {
    if (e.target.closest(".btn-favorite-card")) {
      e.stopPropagation();
      toggleFavorite(item.id);
      return;
    }
    openDetailsModal(item.id);
  });

  return card;
}

function updateActiveUI() {
  const title = document.getElementById("section-title");
  if (state.currentTab === "browse") {
    title.innerText = "Explore Catalog";
  } else if (state.currentTab === "how") {
    title.innerText = "How It Works";
  } else if (state.currentTab === "my-listings") {
    title.innerText = "My Listings";
  } else if (state.currentTab === "favorites") {
    title.innerText = "My Saved Favorites";
  } else if (state.currentTab === "suggestions") {
    title.innerText = "Website Improvement Suggestions";
  }

  // Update navbar tab highlight
  document.querySelectorAll(".btn-tab").forEach(btn => btn.classList.remove("active"));
  if (state.currentTab === "browse") {
    document.getElementById("btn-browse-tab").classList.add("active");
  } else if (state.currentTab === "how") {
    document.getElementById("btn-how-tab").classList.add("active");
  } else if (state.currentTab === "my-listings") {
    document.getElementById("btn-my-listings-tab").classList.add("active");
  } else if (state.currentTab === "favorites") {
    document.getElementById("btn-favorites-tab").classList.add("active");
  } else if (state.currentTab === "suggestions") {
    document.getElementById("btn-suggestions-tab").classList.add("active");
  }

  // Category buttons highlight
  document.querySelectorAll(".category-btn").forEach(btn => {
    if (btn.dataset.category === state.selectedCategory) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

// ==========================================
// Business Operations
// ==========================================
function toggleFavorite(id) {
  const index = state.favorites.indexOf(id);
  if (index === -1) {
    state.favorites.push(id);
    showToast("Added to favorites", "success");
  } else {
    state.favorites.splice(index, 1);
    showToast("Removed from favorites", "info");
  }
  saveFavoritesToStorage();
  render();

  if (state.activeProductId === id) {
    const detailFavBtn = document.getElementById("detail-btn-fav");
    if (detailFavBtn) {
      const isFav = state.favorites.includes(id);
      detailFavBtn.className = `btn-favorite-toggle ${isFav ? 'active' : ''}`;
      detailFavBtn.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
    }
  }
}

function deleteListing(id) {
  state.listings = state.listings.filter(x => x.id !== id);
  state.favorites = state.favorites.filter(x => x !== id);
  saveListingsToStorage();
  saveFavoritesToStorage();
  closeModal("detail-modal");
  showToast("Listing deleted successfully", "success");
  render();
}

function markListingAsSold(id) {
  state.listings = state.listings.map(item => {
    if (item.id === id) {
      return { ...item, status: "sold" };
    }
    return item;
  });
  saveListingsToStorage();
  closeModal("detail-modal");
  showToast("Item marked as Sold", "success");
  render();
}

function reportListingAsSold(id) {
  const check = confirm("Did the seller inform you this item is sold?\n\nReporting will flag it and hide it from the catalog to help other students.");
  if (check) {
    state.listings = state.listings.map(item => {
      if (item.id === id) {
        return { ...item, status: "flagged" };
      }
      return item;
    });
    saveListingsToStorage();
    closeModal("detail-modal");
    showToast("Listing flagged as sold. Thank you!", "warning");
    render();
  }
}

// ==========================================
// Modals View Managers
// ==========================================
function openDetailsModal(id) {
  const item = state.listings.find(x => x.id === id);
  if (!item) return;

  state.activeProductId = id;

  document.getElementById("detail-image").src = item.image;
  document.getElementById("detail-image").onerror = function () {
    this.src = "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop";
  };
  document.getElementById("detail-title").innerText = item.title;
  document.getElementById("detail-category-badge").innerText = item.category;
  document.getElementById("detail-desc").innerText = item.description;
  document.getElementById("detail-seller-name").innerText = item.ownerName;
  document.getElementById("detail-seller-college").innerText = item.collegeName || "Unknown College";

  document.getElementById("detail-condition").innerText = item.condition;
  document.getElementById("detail-age-tag").innerText = `Listed ${formatRelativeDate(item.createdAt)}`;

  const priceStr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(item.price);
  document.getElementById("detail-price").innerText = priceStr;

  // Favorites button details
  const isFav = state.favorites.includes(item.id);
  const detailFavBtn = document.getElementById("detail-btn-fav");
  detailFavBtn.className = `btn-favorite-toggle ${isFav ? 'active' : ''}`;
  detailFavBtn.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;

  // Pre-fill links
  document.getElementById("link-email-seller").href = `mailto:${item.ownerEmail}?subject=Inquiry: ${encodeURIComponent(item.title)}`;
  document.getElementById("link-phone-seller").href = `tel:${item.ownerPhone}`;

  // Configure action buttons based on state
  const buyerActions = document.getElementById("buyer-actions");
  const ownerActions = document.getElementById("owner-actions");

  if (item.status === "active") {
    buyerActions.innerHTML = `
      <button class="btn btn-primary-gradient w-100" id="btn-contact-seller">
        <i class="fa-solid fa-message"></i> Contact Owner
      </button>
      <div class="buyer-alternative-contact">
        <a href="mailto:${item.ownerEmail}?subject=Inquiry: ${encodeURIComponent(item.title)}" class="contact-link" id="link-email-seller" target="_blank">
          <i class="fa-regular fa-envelope"></i> Email Seller
        </a>
        <a href="tel:${item.ownerPhone}" class="contact-link" id="link-phone-seller">
          <i class="fa-solid fa-phone"></i> Call / WhatsApp
        </a>
      </div>
      <button class="btn btn-flag" id="btn-report-sold-dyn">
        <i class="fa-solid fa-flag"></i> Report as Already Sold
      </button>
    `;

    document.getElementById("btn-contact-seller").addEventListener("click", () => openChatWindow(item));
    document.getElementById("btn-report-sold-dyn").addEventListener("click", () => {
      reportListingAsSold(item.id);
    });
  } else {
    let alertText = "Item unavailable";
    if (item.status === "sold") alertText = "Sold Out";
    if (item.status === "flagged") alertText = "Reported Sold";
    if (item.status === "expired") alertText = "Listing Expired";

    buyerActions.innerHTML = `
      <div class="seller-card" style="border-color: var(--accent-danger); background-color: rgba(239, 68, 68, 0.05);">
        <div style="font-size: 1.4rem; color: var(--accent-danger); margin-right: 10px;">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div>
          <h4 style="color: var(--text-main); font-family: var(--font-display);">${alertText}</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted);">This transaction has been completed or expired.</p>
        </div>
      </div>
    `;
  }

  // Show owner dashboard controls
  ownerActions.classList.remove("hidden");

  openModal("detail-modal");
}

function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  if (id === "detail-modal") state.activeProductId = null;
  if (id === "pin-prompt-modal") {
    // Reset PIN Prompt UI elements to standard
    document.getElementById("pin-prompt-text").innerText = "Please enter the 4-digit Owner PIN you created when listing this item.";
    document.getElementById("btn-forgot-pin").classList.remove("hidden");
    document.getElementById("pin-input").placeholder = "••••";
    state.recoveryCode = null;
  }
}

// ==========================================
// Owner PIN Verification Prompt
// ==========================================
function openPinPrompt(action) {
  state.pinAction = action;
  document.getElementById("pin-input").value = "";
  document.getElementById("pin-error-message").classList.add("hidden");
  openModal("pin-prompt-modal");
  document.getElementById("pin-input").focus();
}

function verifyPinAndExecute() {
  const pinInput = document.getElementById("pin-input").value;
  const item = state.listings.find(x => x.id === state.activeProductId);

  if (!item) return;

  // Use recovery code if set, else check standard PIN
  const targetCode = state.recoveryCode ? state.recoveryCode : item.ownerPin;

  if (pinInput === targetCode) {
    closeModal("pin-prompt-modal");
    if (state.pinAction === "delete") {
      deleteListing(item.id);
    } else if (state.pinAction === "sold") {
      markListingAsSold(item.id);
    }
  } else {
    document.getElementById("pin-error-message").classList.remove("hidden");
    document.getElementById("pin-input").value = "";
    document.getElementById("pin-input").focus();
  }
}

// ==========================================
// Interactive Simulated Chat Window
// ==========================================
function openChatWindow(item) {
  document.getElementById("chat-seller-title").innerText = item.ownerName;
  document.getElementById("chat-product-name").innerText = item.title;

  const chatBody = document.getElementById("chat-body");
  chatBody.innerHTML = `
    <div class="message-system">
      <span>Inquiry regarding: <strong>${item.title}</strong></span>
    </div>
    <div class="message message-received">
      <div class="message-text">Hi! Thanks for checking out my listing. How can I help you?</div>
      <div class="message-time">${formatCurrentTime()}</div>
    </div>
  `;

  openModal("chat-overlay");
  document.getElementById("chat-input").focus();
}

function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const val = input.value.trim();
  if (val === "") return;

  const chatBody = document.getElementById("chat-body");

  // Append user message
  const userMsg = document.createElement("div");
  userMsg.className = "message message-sent";
  userMsg.innerHTML = `
    <div class="message-text">${escapeHTML(val)}</div>
    <div class="message-time">${formatCurrentTime()}</div>
  `;
  chatBody.appendChild(userMsg);

  chatBody.scrollTop = chatBody.scrollHeight;
  input.value = "";

  // Simulate seller response
  setTimeout(() => {
    const item = state.listings.find(x => x.id === state.activeProductId);
    let replyText = `Hey! I am currently in class/study group, but you can shoot me a text or call at ${item ? item.ownerPhone : 'my number'} to organize a quick pickup.`;

    const lower = val.toLowerCase();
    if (lower.includes("available") || lower.includes("still have")) {
      replyText = `Yes, it is still available! A few people have asked, but first come, first served. When would you like to drop by?`;
    } else if (lower.includes("price") || lower.includes("negotiable") || lower.includes("cheaper") || lower.includes("discount")) {
      replyText = `I might be willing to go slightly lower, but please make a reasonable offer. What price are you thinking?`;
    } else if (lower.includes("condition") || lower.includes("defect") || lower.includes("scratch")) {
      replyText = `It is in ${item ? item.condition.toLowerCase() : 'good'} condition. I uploaded the actual photo so you can see its exact current shape!`;
    }

    const sellerMsg = document.createElement("div");
    sellerMsg.className = "message message-received";
    sellerMsg.innerHTML = `
      <div class="message-text">${replyText}</div>
      <div class="message-time">${formatCurrentTime()}</div>
    `;
    chatBody.appendChild(sellerMsg);
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 1200);
}

// ==========================================
// Event Listeners Configuration
// ==========================================
function setupEventListeners() {
  // Navigation Tabs
  document.getElementById("btn-browse-tab").addEventListener("click", () => {
    state.currentTab = "browse";
    render();
  });
  document.getElementById("btn-how-tab").addEventListener("click", () => {
    state.currentTab = "how";
    render();
  });
  document.getElementById("btn-my-listings-tab").addEventListener("click", () => {
    state.currentTab = "my-listings";
    render();
  });
  document.getElementById("btn-favorites-tab").addEventListener("click", () => {
    state.currentTab = "favorites";
    render();
  });
  document.getElementById("btn-suggestions-tab").addEventListener("click", () => {
    state.currentTab = "suggestions";
    render();
  });

  // Website Suggestions / Improvement Modal events
  document.getElementById("btn-open-feedback").addEventListener("click", () => {
    document.getElementById("feedback-form").reset();
    openModal("feedback-modal");
  });
  document.getElementById("close-feedback-modal").addEventListener("click", () => closeModal("feedback-modal"));
  document.getElementById("btn-cancel-feedback").addEventListener("click", () => closeModal("feedback-modal"));
  document.getElementById("feedback-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const titleVal = document.getElementById("feedback-title").value.trim();
    const typeVal = document.getElementById("feedback-type").value;
    const descVal = document.getElementById("feedback-desc").value.trim();
    const authorVal = document.getElementById("feedback-author").value.trim();

    if (!titleVal || !typeVal || !descVal) {
      showToast("Please fill out all required fields", "danger");
      return;
    }

    const newSuggestion = {
      id: "sug-" + Date.now(),
      title: titleVal,
      type: typeVal,
      description: descVal,
      author: authorVal || "Anonymous",
      createdAt: new Date().toISOString()
    };

    state.suggestions.unshift(newSuggestion);
    saveSuggestionsToStorage();
    closeModal("feedback-modal");
    showToast("Feedback submitted! Thank you.", "success");

    if (state.currentTab === "suggestions") {
      render();
    }
  });

  // Search filter inputs
  document.getElementById("search-input").addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    render();
  });
  document.getElementById("search-college").addEventListener("input", (e) => {
    state.collegeQuery = e.target.value;
    render();
  });

  // Category tags
  document.getElementById("category-bar").addEventListener("click", (e) => {
    const btn = e.target.closest(".category-btn");
    if (!btn) return;
    state.selectedCategory = btn.dataset.category;
    render();
  });

  // Sorting
  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    render();
  });

  // Reset Filters
  document.getElementById("btn-reset-filters").addEventListener("click", () => {
    state.searchQuery = "";
    state.collegeQuery = "";
    state.selectedCategory = "all";
    document.getElementById("search-input").value = "";
    document.getElementById("search-college").value = "";
    render();
  });

  // Brand logo reset
  document.getElementById("brand-logo").addEventListener("click", (e) => {
    e.preventDefault();
    state.currentTab = "browse";
    state.selectedCategory = "all";
    state.searchQuery = "";
    state.collegeQuery = "";
    document.getElementById("search-input").value = "";
    document.getElementById("search-college").value = "";
    render();
  });

  // Form Open Trigger
  document.getElementById("btn-list-item").addEventListener("click", () => {
    document.getElementById("upload-form").reset();
    resetImageUploader();
    openModal("upload-modal");
  });

  document.getElementById("close-upload-modal").addEventListener("click", () => closeModal("upload-modal"));
  document.getElementById("btn-cancel-upload").addEventListener("click", () => closeModal("upload-modal"));

  // ==========================================
  // Image Upload Event Handlers
  // ==========================================
  const imageInput = document.getElementById("image-input");
  const dropzoneLabel = document.getElementById("dropzone-label");
  const previewContainer = document.getElementById("preview-container");
  const imagePreview = document.getElementById("image-preview");
  const btnRemovePreview = document.getElementById("btn-remove-preview");

  imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check size limit: 1.5MB to stay safe in localStorage
    if (file.size > 1.5 * 1024 * 1024) {
      showToast("File size too large (Max 1.5MB). Please compress it.", "danger");
      imageInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = function (evt) {
      state.uploadedBase64 = evt.target.result;
      imagePreview.src = evt.target.result;

      // Update UI elements
      dropzoneLabel.classList.add("hidden");
      previewContainer.classList.remove("hidden");
      showToast("Real condition photo uploaded!", "success");
    };
    reader.readAsDataURL(file);
  });

  // Drag and Drop styling helpers
  dropzoneLabel.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzoneLabel.style.borderColor = "var(--primary-accent)";
    dropzoneLabel.style.backgroundColor = "hsla(230, 100%, 65%, 0.08)";
  });
  dropzoneLabel.addEventListener("dragleave", () => {
    dropzoneLabel.style.borderColor = "var(--card-border)";
    dropzoneLabel.style.backgroundColor = "transparent";
  });
  dropzoneLabel.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzoneLabel.style.borderColor = "var(--card-border)";
    dropzoneLabel.style.backgroundColor = "transparent";

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      if (file.size > 1.5 * 1024 * 1024) {
        showToast("File size too large (Max 1.5MB).", "danger");
        return;
      }

      const reader = new FileReader();
      reader.onload = function (evt) {
        state.uploadedBase64 = evt.target.result;
        imagePreview.src = evt.target.result;
        dropzoneLabel.classList.add("hidden");
        previewContainer.classList.remove("hidden");
        showToast("Real condition photo uploaded!", "success");
      };
      reader.readAsDataURL(file);
    } else {
      showToast("Invalid file format. Please drop an image.", "danger");
    }
  });

  // Remove uploaded image preview
  btnRemovePreview.addEventListener("click", () => {
    resetImageUploader();
    showToast("Image removed", "info");
  });

  function resetImageUploader() {
    imageInput.value = "";
    state.uploadedBase64 = null;
    imagePreview.src = "";
    previewContainer.classList.add("hidden");
    dropzoneLabel.classList.remove("hidden");
  }

  // Form Submit Listing logic
  document.getElementById("upload-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const title = document.getElementById("item-title").value.trim();
    const price = parseFloat(document.getElementById("item-price").value);
    const category = document.getElementById("item-category").value;
    const condition = document.getElementById("item-condition").value;
    const pin = document.getElementById("owner-pin").value;
    const desc = document.getElementById("item-desc").value.trim();

    const sellerName = document.getElementById("owner-name").value.trim();
    const college = document.getElementById("owner-college").value.trim();
    const sellerEmail = document.getElementById("owner-email").value.trim();
    const sellerPhone = document.getElementById("owner-phone").value.trim();

    // Check mandatory image upload
    if (!state.uploadedBase64) {
      showToast("Please upload a real condition image of your product!", "danger");
      return;
    }

    if (!title || isNaN(price) || !category || !pin || !desc || !sellerName || !sellerEmail || !sellerPhone || !college) {
      showToast("Please fill out all required fields", "danger");
      return;
    }

    if (pin.length !== 4 || isNaN(pin)) {
      showToast("Owner PIN must be exactly 4 digits", "danger");
      return;
    }

    const newProduct = {
      id: "listing-" + Date.now(),
      title: title,
      price: price,
      category: category,
      description: desc,
      condition: condition,
      ownerPin: pin,
      ownerName: sellerName,
      collegeName: college,
      ownerEmail: sellerEmail,
      ownerPhone: sellerPhone,
      image: state.uploadedBase64,
      createdAt: new Date().toISOString(),
      status: "active",
      isUserAdded: true
    };

    state.listings.unshift(newProduct);
    saveListingsToStorage();

    closeModal("upload-modal");
    showToast("Product listing published successfully!", "success");

    state.currentTab = "my-listings";
    render();
  });

  // Modal actions
  document.getElementById("close-detail-modal").addEventListener("click", () => closeModal("detail-modal"));

  // Mock Chat
  document.getElementById("close-chat").addEventListener("click", () => closeModal("chat-overlay"));
  document.getElementById("btn-send-message").addEventListener("click", sendChatMessage);
  document.getElementById("chat-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendChatMessage();
  });

  // Toggle favorite on details modal
  document.getElementById("detail-btn-fav").addEventListener("click", () => {
    if (state.activeProductId) toggleFavorite(state.activeProductId);
  });

  // Owner dashboard triggers
  document.getElementById("btn-owner-mark-sold").addEventListener("click", () => openPinPrompt("sold"));
  document.getElementById("btn-owner-delete").addEventListener("click", () => openPinPrompt("delete"));

  // PIN prompt modal buttons
  document.getElementById("close-pin-modal").addEventListener("click", () => closeModal("pin-prompt-modal"));
  document.getElementById("btn-cancel-pin").addEventListener("click", () => closeModal("pin-prompt-modal"));
  document.getElementById("btn-submit-pin").addEventListener("click", verifyPinAndExecute);
  document.getElementById("pin-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") verifyPinAndExecute();
  });

  // Forgot PIN link trigger handler
  document.getElementById("btn-forgot-pin").addEventListener("click", (e) => {
    e.preventDefault();
    const item = state.listings.find(x => x.id === state.activeProductId);
    if (!item) return;

    // Generate random 4-digit code
    const recoveryVal = String(Math.floor(1000 + Math.random() * 9000));
    state.recoveryCode = recoveryVal;

    // Update UI instructions
    document.getElementById("pin-prompt-text").innerText = `For security, a recovery code has been sent to ${item.ownerEmail}. Please check and enter the code below:`;
    document.getElementById("btn-forgot-pin").classList.add("hidden");
    document.getElementById("pin-input").placeholder = "Code";
    document.getElementById("pin-input").value = "";
    document.getElementById("pin-input").focus();

    // Show mock toast delivery containing the recovery code
    showToast(`📬 Recovery code sent to ${item.ownerEmail}! Code: ${recoveryVal}`, "warning");
  });
}

// ==========================================
// UI Helpers
// ==========================================
function formatRelativeDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else {
    return `${diffDays} days ago`;
  }
}

function formatCurrentTime() {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  return hours + ':' + minutes + ' ' + ampm;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let icon = '<i class="fa-solid fa-circle-info"></i>';
  if (type === "success") icon = '<i class="fa-solid fa-circle-check"></i>';
  if (type === "danger") icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
  if (type === "warning") icon = '<i class="fa-solid fa-circle-exclamation"></i>';

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 50);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==========================================
// Website Suggestions Render
// ==========================================
function renderSuggestions() {
  const container = document.getElementById("suggestions-log");
  if (!container) return;
  container.innerHTML = "";

  if (state.suggestions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <i class="fa-regular fa-lightbulb"></i>
        </div>
        <h3>No suggestions yet</h3>
        <p>Be the first to suggest a website improvement!</p>
      </div>
    `;
    return;
  }

  state.suggestions.forEach(item => {
    const card = document.createElement("div");
    card.className = "suggestion-item";

    let typeDisplay = "Suggestion";
    if (item.type === "feature") typeDisplay = "Feature Request";
    if (item.type === "design") typeDisplay = "Design / UI / UX";
    if (item.type === "bug") typeDisplay = "Bug Report";

    const relativeDate = formatRelativeDate(item.createdAt);

    card.innerHTML = `
      <div class="suggestion-meta">
        <span class="suggestion-type-badge type-${item.type}">${typeDisplay}</span>
        <span class="suggestion-date">${relativeDate}</span>
      </div>
      <h4 class="suggestion-title">${escapeHTML(item.title)}</h4>
      <p class="suggestion-desc">${escapeHTML(item.description)}</p>
      <div class="suggestion-author">Submitted by: ${escapeHTML(item.author || "Anonymous")}</div>
    `;
    container.appendChild(card);
  });
}
// ================= GOOGLE LOGIN =================

const loginBtn = document.getElementById("btn-google-login");
// Start Engine on load
document.addEventListener("DOMContentLoaded", init);