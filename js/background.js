// Service worker for Cookie Chef
// Core functionality for blocking/unblocking cookies

var showContextMenu = undefined;
var preferences = {};
var data = {};

// Initialize data and preferences
initializeData();

async function initializeData() {
    // Load preferences with defaults
    const defaultPreferences = {
        showContextMenu: true,
        showChristmasIcon: true,
        useMaxCookieAge: false,
        maxCookieAge: 1,
        maxCookieAgeType: -1
    };

    const result = await chrome.storage.local.get(['preferences', 'data']);
    preferences = { ...defaultPreferences, ...(result.preferences || {}) };
    data = {
        filters: [],
        readOnly: [],
        nCookiesFlagged: 0,
        nCookiesProtected: 0,
        nCookiesDeleted: 0,
        lastVersionRun: undefined,
        ...(result.data || {})
    };

    setContextMenu(preferences.showContextMenu);
    setChristmasIcon();
}

// Save data to storage
async function saveData() {
    await chrome.storage.local.set({ preferences, data });
}

// Set Christmas icon based on date and preferences
function setChristmasIcon() {
    const now = new Date();
    const isMidDecember = (now.getMonth() === 11 && now.getDate() > 5);
    const isStartJanuary = (now.getMonth() === 0 && now.getDate() <= 6);
    const isChristmasPeriod = isMidDecember || isStartJanuary;

    if (isChristmasPeriod && preferences.showChristmasIcon) {
        chrome.action.setIcon({ "path": "/img/cookie_xmas_19x19.png" });
    } else {
        chrome.action.setIcon({ "path": "/img/icon_19x19.png" });
    }
}

// Set up context menu
function setContextMenu(show) {
    chrome.contextMenus.removeAll();
    if (show) {
        chrome.contextMenus.create({
            "title": "Cookie Chef",
            "contexts": ["page"],
            "id": "cookieChefContext"
        });
    }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "cookieChefContext") {
        showPopup(info, tab);
    }
});

// Show popup function
function showPopup(info, tab) {
    const tabUrl = encodeURI(tab.url);
    const tabID = encodeURI(tab.id);
    const tabIncognito = encodeURI(tab.incognito);

    const urlToOpen = chrome.runtime.getURL("popup.html") + "?url=" + tabUrl + "&id=" + tabID + "&incognito=" + tabIncognito;

    chrome.tabs.query({ 'currentWindow': true }, function (tabList) {
        for (let x = 0; x < tabList.length; x++) {
            const cTab = tabList[x];
            if (cTab.url.indexOf(urlToOpen) === 0) {
                chrome.tabs.update(cTab.id, {
                    'active': true
                });
                return;
            }
        }
        chrome.tabs.create({
            'url': urlToOpen
        });
    });
}

// Helper function to check if filter matches cookie
function filterMatchesCookie(rule, name, domain, value) {
    if (rule.domain !== undefined) {
        const ruleDomainReg = new RegExp(rule.domain);
        if (domain.match(ruleDomainReg) === null) {
            return false;
        }
    }
    if (rule.name !== undefined) {
        const ruleNameReg = new RegExp(rule.name);
        if (name.match(ruleNameReg) === null) {
            return false;
        }
    }
    if (rule.value !== undefined) {
        const ruleValueReg = new RegExp(rule.value);
        if (value.match(ruleValueReg) === null) {
            return false;
        }
    }
    return true;
}

// Helper function to compare cookies
function compareCookies(b, a) {
    try {
        if (b.name !== a.name) return false;
        if (b.value !== a.value) return false;
        if (b.path !== a.path) return false;
        if (b.secure !== a.secure) return false;
        if (b.httpOnly !== a.httpOnly) return false;

        const aHostOnly = !!(a.hostOnly || a.domain === undefined);
        const bHostOnly = !!(b.hostOnly || b.domain === undefined);
        if (aHostOnly !== bHostOnly) return false;
        if (!aHostOnly && b.domain !== a.domain) return false;

        const aSession = !!(a.session || a.expirationDate === undefined);
        const bSession = !!(b.session || b.expirationDate === undefined);
        if (aSession !== bSession) return false;
        if (aSession === false && b.expirationDate !== a.expirationDate) return false;
    } catch (e) {
        console.error(e.message);
        return false;
    }
    return true;
}

// Helper function to create cookie for creation
function cookieForCreationFromFullCookie(fullCookie) {
    const newCookie = {};
    newCookie.url = "http" + ((fullCookie.secure) ? "s" : "") + "://" + fullCookie.domain + fullCookie.path;
    newCookie.name = fullCookie.name;
    newCookie.value = fullCookie.value;
    if (!fullCookie.hostOnly)
        newCookie.domain = fullCookie.domain;
    newCookie.path = fullCookie.path;
    newCookie.secure = fullCookie.secure;
    newCookie.httpOnly = fullCookie.httpOnly;
    if (!fullCookie.session)
        newCookie.expirationDate = fullCookie.expirationDate;
    newCookie.storeId = fullCookie.storeId;
    return newCookie;
}

// Version check and first run
chrome.runtime.onInstalled.addListener(async function(details) {
    const currentVersion = chrome.runtime.getManifest().version;
    
    if (details.reason === 'install') {
        // First install
        chrome.tabs.create({ url: 'https://cookiechef.dev/start/' });
        data.lastVersionRun = currentVersion;
        await saveData();
    } else if (details.reason === 'update') {
        // Extension updated
        const result = await chrome.storage.local.get(['data']);
        const oldVersion = result.data?.lastVersionRun;
        
        if (oldVersion !== currentVersion) {
            chrome.notifications.create("cookie-chef-update", {
                type: "basic",
                title: "Cookie Chef",
                message: "Cookie Chef has been updated. Click to see what's new.",
                iconUrl: "/img/icon_128x128.png"
            });
            
            data.lastVersionRun = currentVersion;
            await saveData();
        }
    }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener(function (notificationId) {
    if (notificationId === "cookie-chef-update") {
        chrome.tabs.create({
            url: 'https://cookiechef.dev/changelog/'
        });
        chrome.notifications.clear(notificationId);
    }
});

// Monitor cookie changes for blocking and protection
chrome.cookies.onChanged.addListener(async function (changeInfo) {
    const removed = changeInfo.removed;
    const cookie = changeInfo.cookie;
    const cause = changeInfo.cause;

    if (cause === "expired" || cause === "evicted") return;

    const name = cookie.name;
    const domain = cookie.domain;
    const value = cookie.value;

    // Check protected cookies (read-only)
    for (let i = 0; i < data.readOnly.length; i++) {
        const currentRORule = data.readOnly[i];
        if (compareCookies(cookie, currentRORule)) {
            if (removed) {
                const cookieUrl = "http" + ((currentRORule.secure) ? "s" : "") + "://" + currentRORule.domain + currentRORule.path;
                const existingCookie = await chrome.cookies.get({
                    'url': cookieUrl,
                    'name': currentRORule.name,
                    'storeId': currentRORule.storeId
                });
                
                if (!compareCookies(existingCookie, currentRORule)) {
                    const newCookie = cookieForCreationFromFullCookie(currentRORule);
                    chrome.cookies.set(newCookie);
                    data.nCookiesProtected++;
                    await saveData();
                }
            }
            return;
        }
    }

    // Check blocked cookies (filters)
    if (!removed) {
        for (let i = 0; i < data.filters.length; i++) {
            const currentFilter = data.filters[i];
            if (filterMatchesCookie(currentFilter, name, domain, value)) {
                const cookieUrl = "http" + ((cookie.secure) ? "s" : "") + "://" + cookie.domain + cookie.path;
                chrome.cookies.remove({
                    url: cookieUrl,
                    name: name,
                    storeId: cookie.storeId
                });
                data.nCookiesFlagged++;
                await saveData();
                break;
            }
        }
    }
});

// Set Christmas icon periodically
setInterval(setChristmasIcon, 60 * 60 * 1000); // Every hour

// Initialize on startup
chrome.runtime.onStartup.addListener(initializeData);