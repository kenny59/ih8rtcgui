let { ipcRenderer } = require("electron")
let { XMLParser } =  require( 'fast-xml-parser');
const moment = require("moment-timezone");
require( 'jquery' );
require( 'datatables.net-dt' );

let projectArea = document.querySelector("#project-area");
let date = document.querySelector("#date");
let teamAreaSelectorButton = document.querySelector("#team-area-selector-button");
let workitemList = document.querySelector("#workitem-list tbody");


(async () => {
    await ipcRenderer.invoke("getDefaultValues").then(resp => {
        projectArea.value = resp.projectArea;
        date.value = resp.date;
    });

    let table = $('#workitem-list').DataTable({
        processing: true,
        scrollX: true,
        scrollY: true,
        scrollCollapse: true,
        language: {
            processing: '<i class="fa fa-spinner fa-spin fa-3x fa-fw"></i>Processing...',
        },
        ajax: (d, cb) => {
            ipcRenderer.invoke("loadWorkItems", projectArea.value, date.value).then(value => {
                cb({'data': value});
            })
        },
        columns: [
            {   data: 'id',
                width: 120,
                className: 'dt-control',
                orderable: false
            },
            { data: 'state.name', width: 120},
            { data: 'summary', width: 400 },
            { data: 'owner.name', width: 300},
            { data: 'modified', width: 300 },
            { data: 'tags'}
        ],
        fixedColumns: {
            left: 1
        },
        initComplete: function () {
            // Apply the search
            this.api()
                .columns()
                .every(function () {
                    var that = this;

                    $('input', this.footer()).on('keyup change clear', function () {
                        if (that.search() !== this.value) {
                            that.search(this.value).draw();
                        }
                    });
                });
        }
    });

    function format(d) {
        // `d` is the original data object for the row
        let comments = "";
        if(d.commentCount === 1) {
            comments = '<div>' + d?.comments?.creator.name + " == " + d?.comments?.creationDate + " -> " + d?.comments?.content + '</div>';
        } else if (d.commentCount > 1) {
            comments = d?.comments?.sort((a,b) => Date.parse(b.creationDate)-Date.parse(a.creationDate))?.map(comment => {
                return '<div>' + comment.creator.name + " == " + comment.creationDate + " -> " + comment.content + '</div>';
            })?.join('');
        }
        return (
            '<table cellpadding="5" cellspacing="0" border="0" style="padding-left:50px;">' +
            '<tr>' +
            '<td>Full name:</td>' +
            '<td>' +
            d.id +
            '</td>' +
            '</tr>' +
            '<tr>' +
            '<td>Extension number:</td>' +
            '<td>' +
            comments +
            '</td>' +
            '</tr>' +
            '<tr>' +
            '<td>Extra info:</td>' +
            '<td>And any further details here (images etc)...</td>' +
            '</tr>' +
            '</table>'
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


$('#workitem-list tfoot th').each(function () {
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