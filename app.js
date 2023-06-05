let { ipcRenderer } = require("electron")
let { XMLParser } =  require( 'fast-xml-parser');
const moment = require("moment");
const diffMatchPatch = require('diff-match-patch');
const _ = require("underscore")

let projectArea = $("#project-area");
let date = $("#date");
let filterBy = $('#filter-by');
let filterType = $('#filter-type');

let DATE_FORMAT = 'yyyy-MM-DD HH:mm:ss';
const dmp = new diffMatchPatch();

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
            })
        },
        columns: [
            {   data: 'id',
                width: 120,
                className: 'dt-control'
            },
            { data: 'state.name', width: 120 },
            { data: 'summary', width: 400, className: 'wrap_everything' },
            { data: 'owner.name', width: 300, className: 'wrap_everything' },
            { data: 'modified', width: 300, type: 'date', render: function (data, type, row, meta) {
                    return moment(data).format(DATE_FORMAT);
                }},
            { data: 'tags', className: 'wrap_everything', render: (data, type, row, meta) => {
                    return data?.split("|").filter(e => e).join("<br>")
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

    function getPrettyHtmlDiff(text1, text2) {
        if(!text1) text1 = '';
        if(!text2) text2 = '';
        if(text1 === text2) return null;
        return _.unescape(dmp.diff_prettyHtml(dmp.diff_main(text1, text2)))
    }

    function itemHistoryToString(d, ih, isObject = false) {
        let historyFollowedValuesHeaders = ["Summary", "Owner", "Description", "State"]
        let historyFollowedValues = ["formattedSummary", "owner.name", "formattedDescription", "state.name"];
        let fullTextDiffNeeded = ["formattedSummary", "formattedDescription"]


        return historyFollowedValues.map(hfv => {
            let predecessorText = !isObject ? _.property(hfv.split("."))(d.itemHistory.filter(i => i.stateId === ih.predecessor)[0]) : '';
            let currentText = _.property(hfv.split("."))(ih);
            if(fullTextDiffNeeded.includes(hfv)) {
                return getPrettyHtmlDiff(predecessorText, currentText);
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
        let listGroupHeaders = ["Id", "Summary", "Description", "Attachments", "Comments", "History"];
        let listGroup = [d.id, d.summary, d.formattedDescription, attachments, comments, history].map((item, i) => '<ul class="list-group list-group-horizontal-lg"><li class="list-group-item list-group-item-secondary fw-bold col-2">' + listGroupHeaders[i] + '</li><li class="list-group-item col-10">' + item + '</li></ul>').join('\n')
        return (
            listGroup
        );
    }

    // Add event listener for opening and closing details
    $('#workitem-list tbody').on('click', 'td.dt-control', async function () {
        var tr = $(this).closest('tr');
        var row = table.row(tr);
        let data = await ipcRenderer.invoke("loadWorkItemData", row.data().id);

        if (row.child.isShown()) {
            // This row is already open - close it
            row.child.hide();
            tr.removeClass('shown');
        } else {
            // Open this row
            row.child(format(data?.['workitem']?.['workItem'])).show();
            tr.addClass('shown');
        }
    });
})();


$('tfoot th').each(function () {
    var title = $(this).text();
    $(this).html('<input type="text" placeholder="Search ' + title + '" />');
});

function reloadDataTable() {
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

//teamAreaSelectorButton.addEventListener('click', () => {
//    ipcRenderer.invoke("loadWorkItems", tagSearch.value, date.value).then(async value => {
//        workitemList.innerHTML = "";
//        let watched = await ipcRenderer.invoke("getWatched");
//        value.sort(function (a,b) {
//            if(watched.includes(String(b['id']))) return Number.MAX_VALUE;
//            return moment(b['modified']) - moment(a['modified']);
//        }).forEach(wi => {
//            let tr = document.createElement("tr");
//            let td = document.createElement("td");
//            let a = document.createElement("a");
//            a.text = wi['id'];
//            a.addEventListener('click', async () => {
//                let added = await ipcRenderer.invoke('addToWatchedWorkItems', wi['id']);
//                if(added) {
//                    tr.classList.add('bg-primary', 'text-white');
//                } else {
//                    tr.classList.remove('bg-primary', 'text-white');
//                }
//            })
//            td.appendChild(a);
//            tr.innerHTML = `<td>${wi['summary']}</td><td>${wi['state']['name']}</td><td>${wi['modified']}</td>`;
//            tr.prepend(td);
//            if(watched.includes(String(wi['id']))) tr.classList.add('bg-primary', 'text-white');
//            workitemList.appendChild(tr);
//        })
//    });
//})

//ipcRenderer.invoke("loadTeamAreas").then(value => {
//
//    value['foundation']['projectArea'].forEach(projectArea => {
//        var option = document.createElement("option");
//        option.text = projectArea.name;
//        option.value = projectArea.name;
//        teamAreaSelector.appendChild(option);
//    })
//})