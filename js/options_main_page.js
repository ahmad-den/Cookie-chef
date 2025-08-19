var panel = null;
chrome.storage.local.get(["option_panel"], function(result) {
    panel = result.option_panel;
    initializeOptions();
});

function initializeOptions() {
var arguments = getUrlVars();
var element;

if (panel === "null" || panel === null || panel === undefined) {
    element = "support";
} else {
    element = panel;
}

if (arguments.page !== undefined) {
    element = arguments.page;
}

location.href = "/options_pages/" + element + ".html";
}