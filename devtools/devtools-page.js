(function () {
    if (preferences.showDevToolsPanel)
        chrome.devtools.panels.create('Cookie Chef', 'img/icon_32x32.png', 'devtools/panel.html');
})();
