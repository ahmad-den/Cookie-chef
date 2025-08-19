var currentTabID;
var isTabIncognito = false;
var cookieList = [];
var currentLayout = "none";

$.fx.speeds._default = 200;

jQuery(document).ready(function () {
    start();

    /**
     * Force Repaint
     * Temporary workaround for Chromium #428044 bug
     */
    let body = $('body').css('display', 'none');
    setTimeout(() => {
        body.css('display', '');
    }, 100);
});

function start() {
    setLoaderVisible(true);

    var arguments = getUrlVars();
    if (arguments.url === undefined) {
        chrome.tabs.query(
            {
                active: true,
                lastFocusedWindow: true
            },
            function (tabs) {
                let currentTabURL = tabs[0].url;
                currentTabID = tabs[0].id;
                $('input', '#cookieSearchCondition').val(currentTabURL);
                document.title = document.title + "-" + currentTabURL;
                doSearch(false);
            }
        );
    } else {
        var url = decodeURI(arguments.url);
        currentTabID = parseInt(decodeURI(arguments.id));
        isTabIncognito = decodeURI(arguments.incognito) === "true";
        $('input', '#cookieSearchCondition').val(url);
        document.title = document.title + "-" + url;
        doSearch(true);
    }
}

function getUrlOfCookies() {
    return $('input', '#cookieSearchCondition').val();
}

function doSearch(isSeparateWindow) {
    var url = $('input', '#cookieSearchCondition').val();
    if (url.length < 3)
        return;
    var filter = new Filter();
    if (/^https?:\/\/.+$/.test(url)) {
        filter.setUrl(url);
    } else {
        filter.setDomain(url);
    }
    createList(filter.getFilter(), isSeparateWindow);
}

function createList(filters, isSeparateWindow) {
    var filteredCookies = [];

    if (filters === null)
        filters = {};

    var filterURL = {};
    if (filters.url !== undefined)
        filterURL.url = filters.url;
    if (filters.domain !== undefined)
        filterURL.domain = filters.domain;

    if (!isSeparateWindow) {
        $('#submitDiv').css({
            'bottom': 0
        });
    } else {
        $('#submitDiv').addClass("submitDivSepWindow");
    }

    chrome.cookies.getAllCookieStores(function (cookieStores) {
        for (let x = 0; x < cookieStores.length; x++) {
            if (cookieStores[x].tabIds.indexOf(currentTabID) != -1) {
                filterURL.storeId = cookieStores[x].id;
                break;
            }
        }

        chrome.cookies.getAll(filterURL, function (cks) {
            // Get data from storage
            chrome.storage.local.get(['data'], function(result) {
                const data = result.data || { readOnly: [], filters: [] };
                
                var currentC;
                for (var i = 0; i < cks.length; i++) {
                    currentC = cks[i];

                    if (filters.name !== undefined && currentC.name.toLowerCase().indexOf(filters.name.toLowerCase()) === -1)
                        continue;
                    if (filters.domain !== undefined && currentC.domain.toLowerCase().indexOf(filters.domain.toLowerCase()) === -1)
                        continue;
                    if (filters.secure !== undefined && currentC.secure.toLowerCase().indexOf(filters.secure.toLowerCase()) === -1)
                        continue;
                    if (filters.session !== undefined && currentC.session.toLowerCase().indexOf(filters.session.toLowerCase()) === -1)
                        continue;

                    // Check if cookie is protected
                    for (var x = 0; x < data.readOnly.length; x++) {
                        try {
                            var lock = data.readOnly[x];
                            if (lock.name === currentC.name && lock.domain === currentC.domain) {
                                currentC.isProtected = true;
                                break;
                            }
                        } catch (e) {
                            console.error(e.message);
                        }
                    }
                    
                    // Check if cookie is blocked
                    for (var x = 0; x < data.filters.length; x++) {
                        try {
                            var filter = data.filters[x];
                            if (filterMatchesCookie(filter, currentC.name, currentC.domain, currentC.value)) {
                                currentC.isBlocked = true;
                                break;
                            }
                        } catch (e) {
                            console.error(e.message);
                        }
                    }
                    
                    filteredCookies.push(currentC);
                }
                cookieList = filteredCookies;

                $("#cookiesList").empty();

                if (cookieList.length === 0) {
                    switchLayout();
                    setEvents();
                    setLoaderVisible(false);
                    return;
                }

                // Sort cookies by domain and name
                cookieList.sort(function (a, b) {
                    var compDomain = a.domain.toLowerCase().localeCompare(b.domain.toLowerCase());
                    if (compDomain)
                        return compDomain;
                    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                });

                createAccordionList(cookieList, function () {
                    switchLayout();
                    setEvents();
                    $("input:checkbox").uniform();
                    setLoaderVisible(false);
                });
            });
        });
    });
}

function createAccordionList(cks, callback, callbackArguments) {
    let createAccordionCallback = callback;
    let createAccordionCallbackArguments = callbackArguments;

    // Check if accordion is already initialized before destroying
    if ($("#cookiesList").hasClass("ui-accordion")) {
        try {
            $("#cookiesList").accordion("destroy");
        } catch (e) {
            console.warn("Accordion destroy error:", e.message);
        }
    }

    if (cks === null)
        cks = cookieList;
    
    for (var i = 0; i < cks.length; i++) {
        currentC = cks[i];

        var domainText = currentC.domain;
        var titleText = $("<p/>").text(domainText + " | ").append($("<b/>").text(currentC.name));
        
        if (currentC.isProtected) {
            $(":first-child", titleText).css("color", "green");
        } else if (currentC.isBlocked) {
            $(":first-child", titleText).css("color", "red");
        }

        var titleElement = $("<h3/>").append($("<a/>").html(titleText.html()).attr("href", "#"));

        var cookie = $(".cookie_details_template").clone().removeClass("cookie_details_template");

        $(".index", cookie).val(i);
        $(".name", cookie).val(currentC.name);
        $(".value", cookie).val(currentC.value);
        $(".domain", cookie).val(currentC.domain);
        $(".path", cookie).val(currentC.path);
        $(".storeId", cookie).val(currentC.storeId);
        $(".sameSite", cookie).val(currentC.sameSite);

        if (currentC.isProtected) {
            $(".unprotected", cookie).hide();
        } else {
            $(".protected", cookie).hide();
        }

        if (currentC.hostOnly) {
            $(".domain", cookie).attr("disabled", "disabled");
            $(".hostOnly", cookie).prop("checked", true);
        }
        if (currentC.secure) {
            $(".secure", cookie).prop("checked", true);
        }
        if (currentC.httpOnly) {
            $(".httpOnly", cookie).prop("checked", true);
        }
        if (currentC.session) {
            $(".expiration", cookie).attr("disabled", "disabled");
            $(".session", cookie).prop("checked", true);
        }

        var expDate;
        if (currentC.session) {
            expDate = new Date();
            expDate.setFullYear(expDate.getFullYear() + 1);
        } else {
            expDate = new Date(currentC.expirationDate * 1000.0);
        }
        $('.expiration', cookie).val(expDate);

        $("#cookiesList").append(titleElement);
        $("#cookiesList").append(cookie);
    }

    $("#cookiesList").accordion({
        autoHeight: false,
        heightStyle: "content",
        collapsible: true,
        active: cks.length - 1,
        create: function (event, ui) {
            $.uniform.update();
            if (createAccordionCallback !== undefined)
                createAccordionCallback(createAccordionCallbackArguments);
        }
    });
}

function setEvents() {
    if (cookieList.length > 0) {
        $("#submitDiv").show();
    }

    $("#deleteAllButton").unbind().click(function () {
        if (cookieList.length === 0)
            return false;

        var okFunction = function () {
            deleteAll(cookieList, getUrlOfCookies());
            // Update storage
            chrome.storage.local.get(['data'], function(result) {
                const data = result.data || {};
                data.nCookiesDeleted = (data.nCookiesDeleted || 0) + cookieList.length;
                chrome.storage.local.set({ data });
            });
            doSearch();
        }
        startAlertDialog(_getMessage("Alert_deleteAll"), okFunction);
    });

    $("#refreshButton").unbind().click(function () {
        location.reload(true);
    });

    $("#optionsButton").unbind().click(function () {
        var urlToOpen = chrome.runtime.getURL('options_main_page.html');
        chrome.tabs.create({
            url: urlToOpen
        });
    });

    $('input', '#cookieSearchCondition').unbind().keyup(doSearch);

    setCookieEvents();
}

function setCookieEvents() {
    $(".hostOnly").click(function () {
        var cookie = $(this).closest(".cookie");
        var checked = $(this).prop("checked");
        if (!!checked)
            $(".domain", cookie).attr("disabled", "disabled");
        else
            $(".domain", cookie).removeAttr("disabled");
    });

    $(".session").click(function () {
        var cookie = $(this).closest(".cookie");
        var checked = $(this).prop("checked");
        if (!!checked)
            $(".expiration", cookie).attr("disabled", "disabled");
        else
            $(".expiration", cookie).removeAttr("disabled");
    });

    $(".deleteOne").click(function () {
        var cookie = $(this).closest(".cookie");
        var name = $(".name", cookie).val();
        var domain = $(".domain", cookie).val();
        var path = $(".path", cookie).val();
        var secure = $(".secure", cookie).prop("checked");
        var storeId = $(".storeId", cookie).val();
        
        var okFunction = function () {
            var url = buildUrl(domain, path, getUrlOfCookies());
            deleteCookie(url, name, storeId, function (success) {
                if (success === true) {
                    var head = cookie.prev('h3');
                    cookie.add(head).slideUp(function () {
                        $(this).remove();
                        switchLayout();
                    });
                } else {
                    location.reload(true);
                }
            });
            // Update storage
            chrome.storage.local.get(['data'], function(result) {
                const data = result.data || {};
                data.nCookiesDeleted = (data.nCookiesDeleted || 0) + 1;
                chrome.storage.local.set({ data });
            });
        };
        startAlertDialog(_getMessage("Alert_deleteCookie") + ": \"" + name + "\"?", okFunction);
    });

    $(".flagOne").click(function () {
        var cookie = $(this).closest(".cookie");
        var domain = $(".domain", cookie).val();
        var name = $(".name", cookie).val();
        var path = $(".path", cookie).val();
        var index = $(".index", cookie).val();

        var newRule = {
            domain: domain,
            name: name,
            path: path
        };

        // Add block rule
        chrome.storage.local.get(['data'], function(result) {
            const data = result.data || { filters: [] };
            
            // Check if rule already exists
            let exists = false;
            for (let x = 0; x < data.filters.length; x++) {
                const currFilter = data.filters[x];
                if (currFilter.domain === newRule.domain && 
                    currFilter.name === newRule.name) {
                    exists = true;
                    break;
                }
            }
            
            if (!exists) {
                data.filters.push(newRule);
                data.nCookiesFlagged = (data.nCookiesFlagged || 0) + 1;
                chrome.storage.local.set({ data });
                
                // Delete the cookie immediately
                var url = buildUrl(domain, path, getUrlOfCookies());
                deleteCookie(url, name, cookieList[index].storeId);
                
                // Update UI to show blocked status
                var titleName = $("b", cookie.prev()).first();
                titleName.css("color", "red");
                cookieList[index].isBlocked = true;
            }
        });
    });

    $(".protectOne").click(function () {
        var cookie = $(this).closest(".cookie");
        var titleName = $("b", cookie.prev()).first();
        var index = $(".index", cookie).val();
        var currentCookie = cookieList[index];
        
        chrome.storage.local.get(['data'], function(result) {
            const data = result.data || { readOnly: [] };
            
            var newRule = {
                domain: currentCookie.domain,
                name: currentCookie.name,
                path: currentCookie.path,
                value: currentCookie.value,
                secure: currentCookie.secure,
                httpOnly: currentCookie.httpOnly,
                session: currentCookie.session,
                expirationDate: currentCookie.expirationDate,
                storeId: currentCookie.storeId
            };

            // Check if already protected
            let isProtected = false;
            let ruleIndex = -1;
            for (let x = 0; x < data.readOnly.length; x++) {
                const rule = data.readOnly[x];
                if (rule.domain === newRule.domain && 
                    rule.name === newRule.name && 
                    rule.path === newRule.path) {
                    isProtected = true;
                    ruleIndex = x;
                    break;
                }
            }

            if (isProtected) {
                // Remove protection
                data.readOnly.splice(ruleIndex, 1);
                cookieList[index].isProtected = false;
                $(".protected", cookie).fadeOut('fast', function () {
                    $(".unprotected", cookie).fadeIn('fast');
                });
                titleName.css("color", "#000");
            } else {
                // Add protection
                data.readOnly.push(newRule);
                data.nCookiesProtected = (data.nCookiesProtected || 0) + 1;
                cookieList[index].isProtected = true;
                $(".unprotected", cookie).fadeOut('fast', function () {
                    $(".protected", cookie).fadeIn('fast');
                });
                titleName.css("color", "green");
            }
            
            chrome.storage.local.set({ data });
        });
    });
}

function startAlertDialog(title, ok_callback, cancel_callback) {
    if (ok_callback == undefined) {
        return;
    }
    
    // Always show alerts for this simplified version
    $("#alert_ok").unbind().click(function () {
        $("#alert_wrapper").hide();
        ok_callback();
    });

    if (cancel_callback !== undefined) {
        $("#alert_cancel").show();
        $("#alert_cancel").unbind().click(function () {
            $("#alert_wrapper").hide('fade');
            cancel_callback();
        });
    } else {
        $("#alert_cancel").hide();
    }
    $("#alert_title_p").empty().text(title);
    $("#alert_wrapper").show('fade');
}

function switchLayout(newLayout) {
    if (newLayout === undefined) {
        if ($("h3", "#cookiesList").length) {
            newLayout = "list";
        } else {
            newLayout = "empty";
        }
    }

    if (currentLayout === newLayout)
        return;
    currentLayout = newLayout;

    if (newLayout === "list") {
        $(".commands-table").first().animate({ opacity: 0 }, function () {
            $("#deleteAllButton").show();
            $("#optionsButton").show();
            $(".commands-table").first().animate({ opacity: 1 });
            $("#cookieSearchCondition").show();
        });
        $("#noCookies").slideUp();
        $("#cookiesList").slideDown();
        $("#submitDiv").show();
    } else if (newLayout === "empty") {
        $(".commands-table").first().animate({ opacity: 0 }, function () {
            $("#deleteAllButton").hide();
            $("#optionsButton").show();
            $(".commands-table").first().animate({ opacity: 1 });
            $("#cookieSearchCondition").show();
        });
        $("#noCookies").slideDown();
        $("#cookiesList").slideUp();
        $("#submitDiv").hide();
    }
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