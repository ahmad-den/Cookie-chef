// Options page for Cookie Chef
var preferences = {};
var data = {};

jQuery(document).ready(function () {
    loadData();
    setEvents();
});

async function loadData() {
    const result = await chrome.storage.local.get(['preferences', 'data']);
    
    preferences = result.preferences || {
        showContextMenu: true,
        showChristmasIcon: true
    };
    
    data = result.data || {
        filters: [],
        readOnly: []
    };
    
    updateUI();
}

async function saveData() {
    await chrome.storage.local.set({ preferences, data });
}

function updateUI() {
    // Update checkboxes
    $("#show-context-menu").prop('checked', preferences.showContextMenu);
    $("#show-christmas-icon").prop('checked', preferences.showChristmasIcon);
    
    // Update blocked cookies list
    const blockedList = $("#blocked-list");
    blockedList.empty();
    
    if (data.filters.length === 0) {
        blockedList.append("<p>No blocked cookies</p>");
    } else {
        data.filters.forEach((filter, index) => {
            const item = $("<div class='rule-item'>");
            let text = "Block cookies ";
            if (filter.domain) text += `from domain: ${filter.domain} `;
            if (filter.name) text += `with name: ${filter.name} `;
            if (filter.value) text += `with value: ${filter.value} `;
            
            item.append($("<span>").text(text));
            item.append($("<button class='remove-blocked' data-index='" + index + "'>Remove</button>"));
            blockedList.append(item);
        });
    }
    
    // Update protected cookies list
    const protectedList = $("#protected-list");
    protectedList.empty();
    
    if (data.readOnly.length === 0) {
        protectedList.append("<p>No protected cookies</p>");
    } else {
        data.readOnly.forEach((rule, index) => {
            const item = $("<div class='rule-item'>");
            const text = `${rule.domain} - ${rule.name}`;
            
            item.append($("<span>").text(text));
            item.append($("<button class='remove-protected' data-index='" + index + "'>Remove</button>"));
            protectedList.append(item);
        });
    }
}

function setEvents() {
    $("#show-context-menu").change(function() {
        preferences.showContextMenu = $(this).prop('checked');
        saveData();
    });
    
    $("#show-christmas-icon").change(function() {
        preferences.showChristmasIcon = $(this).prop('checked');
        saveData();
    });
    
    $("#clear-blocked").click(function() {
        if (confirm("Clear all blocked cookie rules?")) {
            data.filters = [];
            saveData();
            updateUI();
        }
    });
    
    $("#clear-protected").click(function() {
        if (confirm("Clear all protected cookie rules?")) {
            data.readOnly = [];
            saveData();
            updateUI();
        }
    });
    
    $(document).on('click', '.remove-blocked', function() {
        const index = parseInt($(this).data('index'));
        if (confirm("Remove this blocked cookie rule?")) {
            data.filters.splice(index, 1);
            saveData();
            updateUI();
        }
    });
    
    $(document).on('click', '.remove-protected', function() {
        const index = parseInt($(this).data('index'));
        if (confirm("Remove this protected cookie rule?")) {
            data.readOnly.splice(index, 1);
            saveData();
            updateUI();
        }
    });
}