let { ipcRenderer } = require("electron")
let { XMLParser } =  require( 'fast-xml-parser');
const moment = require("moment");
const diffMatchPatch = require('diff-match-patch');
const _ = require("lodash")
const DOMPurify = require('dompurify');
const getArray = require("../../utils");
const select2 = require('../../public/jquery/select2.js')
select2(window, $)

let projectArea = $("#project-area");
let date = $("#date");
let filterBy = $('#filter-by');
let filterType = $('#filter-type');

let daterangepickeroptions = {
    autoUpdateInput: true,
    locale: {
        cancelLabel: 'Clear',
        format: 'DD/MM/YYYY'
    },
    showWeekNumbers: true,
    //timePicker: true,
    //timePicker24Hour: true,
    //timePickerIncrement: 15,
    showDropdowns: true,
    autoApply: true
}
filterType.on('change', () => {
    reinitDateRangePicker($('#date').data('daterangepicker').startDate, $('#date').data('daterangepicker').endDate)
})
function reinitDateRangePicker(startDate, endDate) {
    if(filterType.val() !== "!!") {
        daterangepickeroptions['singleDatePicker'] = true;
        $(this).val(moment(startDate).format(DATE_FORMAT));
    } else {
        daterangepickeroptions['singleDatePicker'] = false;
        $(this).val(moment(startDate).format(DATE_FORMAT) + ' - ' + moment(endDate).format(DATE_FORMAT));
    }
    daterangepickeroptions['startDate'] = startDate ? moment(startDate) : moment();
    daterangepickeroptions['endDate'] = endDate ? moment(endDate) : moment();
    $('#date').daterangepicker("destroy");
    $('#date').daterangepicker(daterangepickeroptions)

    $('#date').on('cancel.daterangepicker', function(ev, picker) {
        $(this).val('');
    });

}

let DATE_FORMAT = 'yyyy-MM-DD HH:mm:ss';
const dmp = new diffMatchPatch();

let openWorkitems = new Set([]);
let states = [];
let teamAreaUsers = [];

function addToOpenWorkItems(item) {
    openWorkitems.add(item);
    let teamAreaButton = $('#team-area-selector-button');
    let refreshIntervalSelector = $('#refresh-interval');
    teamAreaButton.prop('disabled', true);
    refreshIntervalSelector.prop('disabled', true);
}
function deleteFromOpenWorkItems(item) {
    openWorkitems.delete(item);
    if(openWorkitems.size === 0) {
        let teamAreaButton = $('#team-area-selector-button');
        let refreshIntervalSelector = $('#refresh-interval');
        teamAreaButton.prop('disabled', false);
        refreshIntervalSelector.prop('disabled', false);
    }
}

async function getValueFromRTCObject(rtcObject, workitemObject) {
    if(!rtcObject) return null;
    switch(rtcObject['itemType']) {
        case "com.ibm.team.workitem.Category":
        case "com.ibm.team.repository.Contributor":
            return String(rtcObject['name'])
        case "com.ibm.team.workitem.Attribute":
            let allExtensions = getArray(workitemObject, ['allExtensions'])
            allExtensions = allExtensions.filter(ae => {
                return ae.key === rtcObject['identifier']
            })
            if(allExtensions.length > 0) {
                switch(rtcObject?.['attributeType']) {
                    case "contributor":
                        let contributorName = await ipcRenderer.invoke("getContributorName", allExtensions?.[0]?.['itemValue']?.['itemId']);
                        return String(contributorName);
                    default:
                        return String(allExtensions[0]['displayValue'])
                }
            }
            return null;
        default:
            return String(rtcObject['displayValue']);
    }
}

function validateEmpty(input) {
    return (!Array.isArray(input) && input) || (Array.isArray(input) && input.length !== 0);
}

let customAttributes = new Map();
async function setDefaultValues() {
    await ipcRenderer.invoke("getDefaultValues").then(resp => {
        projectArea.html(resp.projectAreas.map(pa => `<option value="${pa}">${pa}</option>`).join('\n'));

        if(!validateEmpty(resp.history.lastProjectArea)) {
            projectArea.prop("selectedIndex", 0);
        } else {
            projectArea.val(resp.history.lastProjectArea)
        }
        if(!validateEmpty(resp.history.lastFilterType)) {
            filterType.prop("selectedIndex", 0);
            filterType.trigger("change");
        } else {
            filterType.val(resp.history.lastFilterType)
            filterType.trigger("change");
        }
        if(!validateEmpty(resp.history.lastFilterBy)) {
            filterBy.prop("selectedIndex", 0);
        } else {
            filterBy.val(resp.history.lastFilterBy)
        }
        if(!validateEmpty(resp.history.lastStartDate)) {
            date.val(moment(new Date()).format('YYYY-MM-DD'))
        }
        if(!validateEmpty(resp.history.lastEndDate)) {
            date.val(moment(new Date()).format('YYYY-MM-DD'))
        }

        reinitDateRangePicker(resp.history.lastStartDate, resp.history.lastEndDate)

        customAttributes = new Map(Object.entries(JSON.parse(resp.customAttributes)));
    });
}

let DROPDOWN_COLUMNS = ["State", "Owner"];

(async () => {
    $('#date').daterangepicker(daterangepickeroptions);
    $('#date').val("")

    await setDefaultValues();
    ipcRenderer.on("changedConfig", (event, config) => {
        setDefaultValues();
    })
    states = await ipcRenderer.invoke("getAllStates");

    let firstLoad = true;

    let table = $('#workitem-list').DataTable({
        scrollResize: true,
        scrollY: 100,
        scrollX: true,
        scrollCollapse: true,
        lengthChange: true,
        processing: true,
        paging: true,
        responsive: false,
        stateSave: true,
        stateDuration: -1,
        fixedHeader: true,
        lengthMenu: [
            [5, 10, 25, 50, 100, -1],
            [5, 10, 25, 50, 100, 'All'],
        ],
        language: {
            processing: '<i class="fa fa-spinner fa-spin fa-3x fa-fw"></i>Processing...',
        },
        ajax: (d, cb) => {
            if(firstLoad) {
                firstLoad = false;
                cb({'data': []});
                return;
            }
            ipcRenderer.invoke("loadWorkItems", projectArea.val(), date.data('daterangepicker').startDate.format(DATE_FORMAT), date.data('daterangepicker').endDate.format(DATE_FORMAT), filterBy.val(), filterType.val())
                .then(value => {
                cb({'data': value});
                $('#lastUpdatedAt').html(moment(new Date()).format(DATE_FORMAT))
                table.columns().every((col) => {
                    let that = table.column(col);
                    if(!DROPDOWN_COLUMNS.includes(that.header().textContent)) {
                        $(that.footer()).find('input').val(that.search());
                        return;
                    }
                    var select = $('<select class="form-select" multiple="multiple"></select>');
                    let footer = $(that.footer());
                    select.appendTo(footer.empty())
                    .on('change', function () {
                        if($(this).val().includes("")) $(this).val(_.pull($(this).val(), ''));
                        let val = $(this).val().map(user => $.fn.dataTable.util.escapeRegex(user)).join("|")

                        that.search(val ? '^(' + val + ')$' : '', true, false).draw();
                    });
                    select.select2({
                        multiple: true,
                        closeOnSelect: false,
                        width: '100%',
                        placeholder: that.header().textContent,
                        allowClear: true
                    })

                    let selected = table.column(that).search();
                    let selectedList = [];
                    that
                        .data()
                        .unique()
                        .sort()
                        .each(function (d, j) {
                            let isSelected = '';
                            if(selected.split('|').filter(e => e).some(s => s.indexOf(d) > -1)) {
                                isSelected = 'selected';
                                selectedList.push(d);
                            }
                            select.append('<option value="' + d + '"' + isSelected + '>' + d + '</option>');
                        });
                    table.column(that).search(selectedList.join('|') ? '^(' + selectedList.join('|') + ')$' : '', true, false).draw()
                })
            }).then(() => {
                table.columns.adjust();
            })
        },
        columns: [
            {   data: 'id',
                width: '5%',
                defaultContent: '',
                className: 'dt-control'
            },
            { data: 'state.name', width: '10%' },
            { data: 'summary', width: '35%', className: 'wrap_everything' },
            { data: 'owner.name', width: '10%', className: 'wrap_everything' },
            { data: 'modified', width: '5%', type: 'date', render: function (data, type, row, meta) {
                    return moment(data).format(DATE_FORMAT);
                }},
            { data: 'subscriptions', width: '15%', className: 'wrap_everything', render: (data, type, row, meta) => {
                    return Array.isArray(data) ? data?.map(d => d.name).join(", ") : data?.name
                }},
            { data: 'tags', className: 'wrap_everything', render: (data, type, row, meta) => {
                    return data?.split("|").filter(e => e).join(", ")
            }}
        ],
        initComplete: function () {
            // Apply the search
            this.api()
                .columns()
                .every(function () {
                    var that = this;

                    $('input', that.footer()).on('keyup change clear', function () {
                        if (that.search() !== this.value) {
                            that.search(this.value).draw();
                        }
                    });
                });
        },
        stateSaveCallback: function(settings,data,) {
            ipcRenderer.invoke("saveDataTables", data);
        },
        stateLoadCallback: function(settings, callback) {
            ipcRenderer.invoke("loadDataTables").then(res => callback(res));
        },
        stateLoaded: (settings, data) => {
            $("#column-visibility").select2({
                width: "100%",
                tags: true,
                multiple: true,
                closeOnSelect: false,
                data: $('#workitem-list').DataTable().columns()[0].map(column => {
                    let col = $('#workitem-list').DataTable().column(column);
                    return {
                        id: column,
                        text: col.header().textContent,
                        selected: col.visible()
                    }
                })
            });

            $('#column-visibility').on('select2:select', function (e) {
                handleSelectUnselect(e)
            });
            $('#column-visibility').on('select2:unselect', function (e) {
                handleSelectUnselect(e)
            });

            function handleSelectUnselect(e) {
                let id = parseInt(e.params.data.id);
                $('#workitem-list').DataTable().column(id).visible(e.params.data.selected)
            }
        }
    });
    $(function() {
        $.contextMenu({
            selector: 'tr.odd > td,tr.even > td',
            trigger: 'right',
            callback: function (key, options) {
                var cell = table.cell(options.$trigger)
                var row = table.row(options.$trigger)
                switch (key) {
                    case 'copy':
                        navigator.clipboard.writeText(cell.render('display'))
                        break;
                    case 'modify':
                        $('#detail-id').html(row.data().id);
                        $('#detail-title').val(row.data().summary);
                        let workflowTypeStates = states.find(s => s.workflowName === row.data()?.['state']?.['workflow']?.['id']);
                        let possibleStates = workflowTypeStates?.['states'].find(s => s.stateName === row.data()?.['state']?.['name']);
                        let possibleActionOptions = possibleStates?.['possibleStates'].map(pa => {
                            return `<option value="${pa['action']}">${pa['humanFriendlyName']}</option>`
                        }).join('')
                        $('#detail-user').html(`<option value="" selected>${row.data().owner.name}</option>`)
                        $('#detail-state').html(`<option value="" selected>${row.data().state.name}</option>` + possibleActionOptions);
                        $('#detail-modal').modal('show');
                        break;
                    default :
                        break
                }
            },
            items: {
                "copy": {name: "Copy cell value", icon: "fa-copy"},
                "modify": {name: "Modify row", icon: "fa-edit"},
            }
        })
    });
    table.search('').columns().search('').draw();

    $('#close-all-details').click(() => {
        table.rows({filter:'applied'}).every(rowId => {
            let row = table.row(rowId);
            if (row.child.isShown()) {
                row.child.hide();
                $(this).removeClass('shown');
            }
        })
        openWorkitems.forEach(wi => deleteFromOpenWorkItems(wi))
    })

    function getPrettyHtmlDiff(text1, text2) {
        if(!text1) text1 = '';
        if(!text2) text2 = '';
        if(text1 === text2) return null
        let diff = dmp.diff_main(text1, text2);
        return DOMPurify.sanitize(_.unescape(dmp.diff_prettyHtml(diff)), { USE_PROFILES: { html: true } });
    }

    function itemHistoryToString(d, ih, isObject = false) {
        let historyFollowedValuesHeaders = ["Summary", "Owner", "Description", "State", "Subscribers"]
        let historyFollowedValues = ["formattedSummary", "owner.name", "formattedDescription", "state.name", "subscriptions"];
        let fullTextDiffNeeded = ["formattedSummary", "formattedDescription"]
        let arrayDiffCheckNeeded = ["subscriptions"];

        return historyFollowedValues.map(hfv => {
            let predecessorText = !isObject ? _.property(hfv.split("."))(d.itemHistory.filter(i => i.stateId === ih.predecessor)[0]) : '';
            let currentText = _.property(hfv.split("."))(ih);
            if(fullTextDiffNeeded.includes(hfv)) {
                return getPrettyHtmlDiff(predecessorText, currentText);
            } else if (arrayDiffCheckNeeded.includes(hfv)) {
                if(!Array.isArray(predecessorText)) predecessorText = Array.of(predecessorText);
                if(!Array.isArray(currentText)) currentText = Array.of(currentText);
                let newSubscribers, removedSubscribers = [];
                newSubscribers = _.differenceBy(currentText, predecessorText, 'name').filter(e => e);
                removedSubscribers = _.differenceBy(predecessorText, currentText, 'name').filter(e => e);
                let returnText = [];
                if(newSubscribers.length > 0) {
                    returnText.push(`Added ${newSubscribers.map(ns => ns?.name).join(', ')}`)
                }
                if(removedSubscribers.length > 0) {
                    returnText.push(`Removed ${removedSubscribers.map(ns => ns?.name).join(', ')}`)
                }
                return returnText.length > 0 ? returnText : null;
            } else {
                if(predecessorText === currentText) return null;
                if(!predecessorText) predecessorText = 'None'
                return `${predecessorText} -> ${currentText}`
            }
        }).map((v, i) => {
            if(!v) return null;
            return '<ul class="list-group list-group-horizontal-lg">' +
                '<li class="col-2 list-group-item fw-bold list-group-item-secondary" style="min-width: 160px">' +
                historyFollowedValuesHeaders[i] +
                '</li>' +
                '<li class="col-10 list-group-item flex-fill">' +
                v +
                '</li>' +
                '</ul>'
        }).filter(e => e).join('');
    }

    async function format(d) {

        let comments = "";
        let history = "";
        let attachments = "";

        d = d?.['workitem']?.['workItem'];

        if(Array.isArray(d?.auditableLinks)) {
            attachments = d?.auditableLinks.map(al => {
                if(!al.targetRef?.referencedItem?.['@_href']) return null;
                return '<ul class="list-group list-group-horizontal-lg">' +
                '<li class="col-2 list-group-item fw-bold list-group-item-secondary" style="min-width: 160px">' +
                `${moment(al?.modified).format(DATE_FORMAT)}` +
                '</li>' +
                '<li class="col-10 list-group-item flex-fill">' +
                `<a href="${al.targetRef?.referencedItem?.['@_href']}">${al.targetRef?.comment}</a>` +
                '</li>' +
                '</ul>'
            }).filter(e => e).join('')
        } else if (d?.auditableLinks) {
            let al = d?.auditableLinks;
            attachments = '<ul class="list-group list-group-horizontal-lg">' +
                '<li class="col-2 list-group-item fw-bold list-group-item-secondary" style="min-width: 160px">' +
                `${moment(al?.modified).format(DATE_FORMAT)}` +
                '</li>' +
                '<li class="col-10 list-group-item flex-fill">' +
                `<a href="${al.targetRef?.referencedItem?.['@_href']}">${al.targetRef?.comment}</a>` +
                '</li>' +
                '</ul>';
            if(!al.targetRef?.referencedItem?.['@_href']) attachments = '';
        }

        if(Array.isArray(d.itemHistory)) {
            history =
            d?.itemHistory?.map(ih => {
                let historyString = itemHistoryToString(d, ih)

                if(historyString === '') return null;
                return '<ul class="list-group list-group-horizontal-lg" id="history">' +
                    '<li class="col-2 list-group-item fw-bold list-group-item-secondary" style="min-width: 160px">' +
                    moment(ih.modified).format(DATE_FORMAT) +
                    '</li>' +
                    '<li class="col-10 list-group-item flex-fill">' +
                    historyString +
                '</li>' +
                '</ul>'
            }).filter(e => e).join('')
        } else if (d?.itemHistory) {
            let ih = d?.itemHistory;

            let historyString = itemHistoryToString(d, ih, true)

            if(historyString === '') return null;
            history = '<ul class="list-group list-group-horizontal-lg">' +
                    '<li class="col-2 list-group-item fw-bold list-group-item-secondary" style="min-width: 160px">' +
                    moment(ih.modified).format(DATE_FORMAT) +
                    '</li>' +
                    '<li class="col-10 list-group-item flex-fill">' +
                    historyString +
                    '</li>' +
                    '</ul>'
        }

        if(d.commentCount === 1) {
            comments = '<ul class="list-group list-group-horizontal-lg">' +
                '<li class="col-2 list-group-item fw-bold list-group-item-secondary" style="min-width: 160px">' +
                d?.comments?.creator.name +
                '</li>' +
                '<li class="col-2 list-group-item">' +
                moment(d?.comments?.creationDate).format(DATE_FORMAT) +
                '</li>' +
                '<li class="list-group-item flex-fill col-8">' +
                d?.comments?.formattedContent +
                '</li>' +
                '</ul>'
        } else if (d.commentCount > 1) {
            comments = d?.comments?.sort((a,b) => Date.parse(b.creationDate)-Date.parse(a.creationDate))?.map(comment => {
                return '<ul class="list-group list-group-horizontal-lg">' +
                '<li class="col-2 list-group-item fw-bold list-group-item-secondary" style="min-width: 160px">' +
                comment?.creator.name +
                '</li>' +
                '<li class="col-2 list-group-item" style="min-width: 120px">' +
                moment(comment?.creationDate).format(DATE_FORMAT) +
                '</li>' +
                '<li class="list-group-item flex-fill col-8">' +
                comment?.formattedContent +
                '</li>' +
                '</ul>'
            })?.join('');
        }
        let listGroupHeaders = ["Id", "Creator", "Creation date", "Summary", "Description", "Comments", "Attachments", "History"];
        let listGroup = [d.id, await getValueFromRTCObject(d.creator, d), moment(d.creationDate).format(DATE_FORMAT), d.summary, d.formattedDescription, comments, attachments, history];
        let spliceAtIndex = 4;
        for (let [k, v] of customAttributes) {
            let val = await getValueFromRTCObject(getArray(d, ['customAttributes']).filter(ca => ca.identifier === k)?.[0], d)
            if(val !== undefined && val !== null) {
                listGroupHeaders.splice(spliceAtIndex, 0, v);
                listGroup.splice(spliceAtIndex, 0, val);
            }
        }
        let listGroupString = listGroup
            .map((item, i) => {
                let isCollapsible =  ["History"].includes(listGroupHeaders[i]);
                    return '<ul class="list-group list-group-horizontal-lg">' +
                    '<li class="list-group-item list-group-item-secondary fw-bold col-2">' +
                    `${isCollapsible ? '<a data-bs-toggle="collapse" href="#' + listGroupHeaders[i] + '" aria-expanded="false">' : ''}`+
                    listGroupHeaders[i] +
                    `${isCollapsible ? '</a>' : ''}` +
                    '</li>' +
                    `<li class="list-group-item col-10 ${isCollapsible ? 'collapse' : ''}" id="${listGroupHeaders[i]}">` +
                    item +
                    '</li>' +
                    `${isCollapsible ? '<li class="list-group-item col-10"></li>' : ''}` +
                    '</ul>'
            }).join('\n');
        return (
            listGroupString
        );
    }

    // Add event listener for opening and closing details
    $('#workitem-list tbody').on('click', 'td.dt-control', async function () {
        var tr = $(this).closest('tr');
        var row = table.row(tr);

        if (row.child.isShown()) {
            // This row is already open - close it
            row.child.hide();
            tr.removeClass('shown');
            deleteFromOpenWorkItems(row.data().id)
        } else {
            $(this).addClass('spinner-grow');
            // Open this row
            let data = await ipcRenderer.invoke("loadWorkItemData", row.data().id);

            row.child(await format(data), 'detail-size').show();
            tr.addClass('shown');
            $(this).removeClass('spinner-grow');

            addToOpenWorkItems(row.data().id);
        }
    });

    $('#overlay').fadeOut();
})();


$('tfoot th').each(function () {
    var title = $(this).text();
    if(DROPDOWN_COLUMNS.includes(title)) {
        let placeholderSelect = '<select class="form-select"><option value="">' + title + '</option></select>';
        $(this).html(placeholderSelect);
        return;
    }
    $(this).html('<input class="form-control" type="text" placeholder="Search ' + title + '" />');
});

function reloadDataTable() {
    $('#overlay').fadeIn();
    if(openWorkitems.size > 0) {
        $('#overlay').fadeOut();
        return;
    }
    $('#workitem-list').DataTable().ajax.reload();
    $('#overlay').fadeOut();
}

$('#team-area-selector-button').click(() => {
    reloadDataTable();
});

let id = 0;

$('#refresh-interval').change((event) => {
    let interval = event.target.value;
    if(interval !== "0") {
        clearInterval(id);
        id = setInterval('reloadDataTable();', interval*1000);
    } else {
        clearInterval(id);
    }
})

$('#detail-save-button').click(() => {
    let stateVal = $('#detail-state').val();
    let userVal = $('#detail-user').val();
    let commentVal = $('#detail-comment').trumbowyg('html');
    let idVal = $('#detail-id').html();
    ipcRenderer.invoke("modifyState", idVal, stateVal, userVal, commentVal).then(() => {
        reloadDataTable();
        $('#detail-comment').trumbowyg('empty');
    })
    $('#detail-modal').modal('hide');
});

let requestTimes = [];

$('#detail-user').select2({
    ajax: {
        dataType: 'json',
        transport: async function (params, success, failure) {
            let startTime = new Date();
            requestTimes.push(startTime);
            let users = await ipcRenderer.invoke("getUsersByCondition", params?.['data']?.['term']);
            console.log(requestTimes.length > 0 && requestTimes.some(rt => rt > startTime));
            if(_.max(requestTimes) === startTime) {
                success(users);
                requestTimes = [];
            }
        },
        delay: 250
    },
    dropdownParent: $('#detail-modal'),
    theme: "bootstrap-5"
});
$('#detail-comment').trumbowyg({
    btns: [['strong'], ['historyUndo', 'historyRedo'], ['link']],
    autogrow: false,
    autogrowOnEnter: false,
    minimalLinks: true,
    removeformatPasted: true
})

$('#detail-user')
    .parent('div')
    .children('span')
    .children('span')
    .children('span')
    .css('height', ' calc(3.5rem + 2px)');
$('#detail-user')
    .parent('div')
    .children('span')
    .children('span')
    .children('span')
    .children('span')
    .css('margin-top', '18px');
$('#detail-user')
    .parent('div')
    .find('label')
    .css('z-index', '1');