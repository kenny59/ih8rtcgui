let { ipcRenderer } = require("electron")
let { XMLParser } =  require( 'fast-xml-parser');
const moment = require("moment");
const diffMatchPatch = require('diff-match-patch');
const _ = require("lodash")
const DOMPurify = require('dompurify');

let projectArea = $("#project-area");
let date = $("#date");
let filterBy = $('#filter-by');
let filterType = $('#filter-type');

let DATE_FORMAT = 'yyyy-MM-DD HH:mm:ss';
const dmp = new diffMatchPatch();

let openWorkitems = new Set([]);

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

function validateEmpty(input) {
    return (!Array.isArray(input) && input) || (Array.isArray(input) && input.length !== 0);
}

async function setDefaultValues() {
    await ipcRenderer.invoke("getDefaultValues").then(resp => {
        projectArea.html(resp.projectAreas.map(pa => `<option value="${pa}">${pa}</option>`).join('\n'));

        if(!validateEmpty(resp.history.lastProjectArea)) {
            projectArea.prop("selectedIndex", 0);
        } else {
            projectArea.val(resp.history.lastProjectArea)
        }
        if(!validateEmpty(resp.history.lastDate)) {
            date.val(moment(new Date()).format('YYYY-MM-DD'))
        } else {
            date.val(resp.history.lastDate)

        }
        if(!validateEmpty(resp.history.lastFilterBy)) {
            filterBy.prop("selectedIndex", 0);
        } else {
            filterBy.val(resp.history.lastFilterBy)
        }
        if(!validateEmpty(resp.history.lastFilterType)) {
            filterType.prop("selectedIndex", 0);
        } else {
            filterType.val(resp.history.lastFilterType)
        }

    });
}

let DROPDOWN_COLUMNS = ["State", "Owner"];

(async () => {
    await setDefaultValues();
    ipcRenderer.on("changedConfig", (event, config) => {
        setDefaultValues();
    })

    let firstLoad = true;

    let table = $('#workitem-list').DataTable({
        scrollY: true,
        scrollX: true,
        processing: true,
        stateSave: true,
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
            ipcRenderer.invoke("loadWorkItems", projectArea.val(), date.val(), filterBy.val(), filterType.val()).then(value => {
                cb({'data': value});
                $('#lastUpdatedAt').html(moment(new Date()).format(DATE_FORMAT))
                table.columns().every((col) => {
                    let that = table.column(col);
                    if(!DROPDOWN_COLUMNS.includes(that.header().textContent)) return;
                    var select = $('<select class="form-select"><option value="">-</option></select>')
                        .appendTo($(that.footer()).empty())
                        .on('change', function () {
                            var val = $.fn.dataTable.util.escapeRegex($(this).val());

                            that.search(val ? '^' + val + '$' : '', true, false).draw();
                        });

                    that
                        .data()
                        .unique()
                        .sort()
                        .each(function (d, j) {
                            select.append('<option value="' + d + '">' + d + '</option>');
                        });
                })
            })
        },
        columns: [
            {   data: 'id',
                width: 120,
                className: 'dt-control fs-5'
            },
            { data: 'state.name', width: 120 },
            { data: 'summary', width: 400, className: 'wrap_everything' },
            { data: 'owner.name', width: 300, className: 'wrap_everything' },
            { data: 'modified', width: 300, type: 'date', render: function (data, type, row, meta) {
                    return moment(data).format(DATE_FORMAT);
                }},
            { data: 'subscriptions', width: 300, className: 'wrap_everything', render: (data, type, row, meta) => {
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
        }
    });
    $(function() {
        $.contextMenu({
            selector: 'tr.odd > td,tr.even > td',
            trigger: 'right',
            callback: function (key, options) {
                var row = table.cell(options.$trigger)
                switch (key) {
                    case 'copy' :
                        navigator.clipboard.writeText(row.render('display'))
                        break;
                    default :
                        break
                }
            },
            items: {
                "copy": {name: "Copy", icon: "copy"},
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

    function format(d) {

        let comments = "";
        let history = "";
        let attachments = "";

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
                return '<ul class="list-group list-group-horizontal-lg">' +
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
        let listGroupHeaders = ["Id", "Creator", "Creation date", "Summary", "Description", "Attachments", "Comments", "History"];
        let listGroup = [d.id, d.creator?.name, moment(d.creationDate).format(DATE_FORMAT), d.summary, d.formattedDescription, attachments, comments, history].map((item, i) => '<ul class="list-group list-group-horizontal-lg"><li class="list-group-item list-group-item-secondary fw-bold col-2">' + listGroupHeaders[i] + '</li><li class="list-group-item col-10">' + item + '</li></ul>').join('\n')
        return (
            listGroup
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
            // Open this row
            let data = await ipcRenderer.invoke("loadWorkItemData", row.data().id);

            row.child(format(data?.['workitem']?.['workItem'])).show();
            tr.addClass('shown');

            addToOpenWorkItems(row.data().id);
        }
    });
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
    if(openWorkitems.size > 0) return;
    $('#workitem-list').DataTable().ajax.reload();
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