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
    
    // Start monitoring existing cookies after initialization
    setTimeout(() => {
        monitorExistingCookies();
    }, 1000);
}

// Save data to storage
async function saveData() {
    await chrome.storage.local.set({ preferences, data });
}

// Monitor existing cookies and remove blocked ones
async function monitorExistingCookies() {
    if (!data.filters || data.filters.length === 0) {
        return;
    }

    try {
        const allCookies = await chrome.cookies.getAll({});
        
        for (const cookie of allCookies) {
            for (const filter of data.filters) {
                if (filterMatchesCookie(filter, cookie.name, cookie.domain, cookie.value)) {
                    const cookieUrl = buildCookieUrl(cookie);
                    await chrome.cookies.remove({
                        url: cookieUrl,
                        name: cookie.name,
                        storeId: cookie.storeId
                    });
                    
                    data.nCookiesFlagged++;
                    await saveData();
                    console.log(`Blocked cookie: ${cookie.name} from ${cookie.domain}`);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Error monitoring existing cookies:', error);
    }
}

// Helper function to build cookie URL
function buildCookieUrl(cookie) {
    const protocol = cookie.secure ? 'https://' : 'http://';
    let domain = cookie.domain;
    
    // Remove leading dot from domain if present
    if (domain.startsWith('.')) {
        domain = domain.substring(1);
    }
    
    return protocol + domain + cookie.path;
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

// Enhanced filter matching function
function filterMatchesCookie(rule, name, domain, value) {
    try {
        // Check domain filter
        if (rule.domain !== undefined && rule.domain !== null && rule.domain !== '') {
            const ruleDomainReg = new RegExp(rule.domain, 'i');
            // Check both the domain and domain with leading dot
            const domainToCheck = domain.startsWith('.') ? domain.substring(1) : domain;
            const domainWithDot = domain.startsWith('.') ? domain : '.' + domain;
            
            if (!ruleDomainReg.test(domain) && !ruleDomainReg.test(domainToCheck) && !ruleDomainReg.test(domainWithDot)) {
                return false;
            }
        }
        
        // Check name filter
        if (rule.name !== undefined && rule.name !== null && rule.name !== '') {
            const ruleNameReg = new RegExp(rule.name, 'i');
            if (!ruleNameReg.test(name)) {
                return false;
            }
        }
        
        // Check value filter
        if (rule.value !== undefined && rule.value !== null && rule.value !== '') {
            const ruleValueReg = new RegExp(rule.value, 'i');
            if (!ruleValueReg.test(value)) {
                return false;
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error in filterMatchesCookie:', error);
        return false;
    }
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
    
    // Re-initialize data after install/update
    await initializeData();
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

// Listen for storage changes to update local data
chrome.storage.onChanged.addListener(async function(changes, namespace) {
    if (namespace === 'local') {
        if (changes.data) {
            data = { ...data, ...changes.data.newValue };
            // Re-monitor cookies when filters change
            if (changes.data.newValue?.filters) {
                setTimeout(() => {
                    monitorExistingCookies();
                }, 100);
            }
        }
        if (changes.preferences) {
            preferences = { ...preferences, ...changes.preferences.newValue };
        }
    }
});

// Enhanced cookie monitoring with better blocking
chrome.cookies.onChanged.addListener(async function (changeInfo) {
    const removed = changeInfo.removed;
    const cookie = changeInfo.cookie;
    const cause = changeInfo.cause;

    if (cause === "expired" || cause === "evicted") return;

    const name = cookie.name;
    const domain = cookie.domain;
    const value = cookie.value;

    // Reload data from storage to ensure we have latest filters
    const result = await chrome.storage.local.get(['data']);
    const currentData = result.data || { readOnly: [], filters: [] };

    // Check protected cookies (read-only)
    for (let i = 0; i < currentData.readOnly.length; i++) {
        const currentRORule = currentData.readOnly[i];
        if (compareCookies(cookie, currentRORule)) {
            if (removed) {
                const cookieUrl = buildCookieUrl(currentRORule);
                const existingCookie = await chrome.cookies.get({
                    'url': cookieUrl,
                    'name': currentRORule.name,
                    'storeId': currentRORule.storeId
                });
                
                if (!existingCookie || !compareCookies(existingCookie, currentRORule)) {
                    const newCookie = cookieForCreationFromFullCookie(currentRORule);
                    await chrome.cookies.set(newCookie);
                    currentData.nCookiesProtected = (currentData.nCookiesProtected || 0) + 1;
                    await chrome.storage.local.set({ data: currentData });
                }
            }
            return;
        }
    }

    // Check blocked cookies (filters) - both on creation and modification
    if (!removed) {
        for (let i = 0; i < currentData.filters.length; i++) {
            const currentFilter = currentData.filters[i];
            if (filterMatchesCookie(currentFilter, name, domain, value)) {
                const cookieUrl = buildCookieUrl(cookie);
                
                // Remove the blocked cookie
                await chrome.cookies.remove({
                    url: cookieUrl,
                    name: name,
                    storeId: cookie.storeId
                });
                
                currentData.nCookiesFlagged = (currentData.nCookiesFlagged || 0) + 1;
                await chrome.storage.local.set({ data: currentData });
                
                console.log(`Blocked cookie: ${name} from ${domain} (cause: ${cause})`);
                break;
            }
        }
    }
});

// Monitor tab updates to check for blocked cookies on page load
chrome.tabs.onUpdated.addListener(async function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'loading' && tab.url) {
        // Small delay to let page start loading
        setTimeout(async () => {
            await monitorTabCookies(tab.url, tabId);
        }, 500);
    }
});

// Monitor cookies for a specific tab/URL
async function monitorTabCookies(url, tabId) {
    if (!data.filters || data.filters.length === 0) {
        return;
    }

    try {
        // Get cookies for this URL
        const cookies = await chrome.cookies.getAll({ url: url });
        
        for (const cookie of cookies) {
            for (const filter of data.filters) {
                if (filterMatchesCookie(filter, cookie.name, cookie.domain, cookie.value)) {
                    const cookieUrl = buildCookieUrl(cookie);
                    await chrome.cookies.remove({
                        url: cookieUrl,
                        name: cookie.name,
                        storeId: cookie.storeId
                    });
                    
                    data.nCookiesFlagged++;
                    await saveData();
                    console.log(`Blocked cookie on page load: ${cookie.name} from ${cookie.domain}`);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Error monitoring tab cookies:', error);
    }
}

// Set Christmas icon periodically
setInterval(setChristmasIcon, 60 * 60 * 1000); // Every hour

// Initialize on startup
chrome.runtime.onStartup.addListener(initializeData);

// Periodic cleanup of blocked cookies (every 30 seconds)
setInterval(async () => {
    if (data.filters && data.filters.length > 0) {
        await monitorExistingCookies();
    }
}, 30000);