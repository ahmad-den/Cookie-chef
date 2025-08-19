jQuery(document).ready(function () {
    setPageCooserEvents();
});

//Set Events
function setPageCooserEvents() {
    $(".chooser").click(function () {
        var panel = $(this).attr("id");
        if ($(this).hasClass("selected"))
            return;
        var id = $(this).attr("id");
        if (id == "getting_started") {
            openExtPage("https://cookiechef.dev/start/");
            return;
        } else if (id == "help") {
            openExtPage("https://cookiechef.dev/faq/");
            return;
        }
        chrome.storage.local.set({"option_panel": panel});
        location.href = "/options_pages/" + id + ".html";
    });
}

function openExtPage(url) {
    chrome.tabs.getCurrent(function (tab) {
        chrome.tabs.create({
            index: tab.index + 1,
            url: url,
            active: true,
            openerTabId: tab.id
        });
    })
}
