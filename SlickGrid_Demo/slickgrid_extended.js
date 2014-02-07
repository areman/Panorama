/**
* (c) 2014 Peter Ramm
*
* Personal extension for SlickGrid v2.1 (by Michael Leibman)
*
*/

/**
 * Helper function to initialize
 **/
function createSlickGridExtended(container_id, data, columns, options, additional_context_menu){
    var sle = new SlickGridExtended(container_id, data, columns, options, additional_context_menu);
    sle.initSlickGridExtended(container_id, data, columns, options, additional_context_menu);
    sle.calculate_current_grid_column_widths('createSlickGridExtended');        // Sicherstellen, dass mindestens ein zweites Mal diese Funktion durchlaufen wird und Scrollbars real berücksichtigt werden
    return sle;
}

/**
 * Creates a new instance of the grid.
 * @class SlickGridExtended
 * @constructor
 * @param {Node}              container_id  ID of DOM-Container node to create the grid in. (without jQuery-Selector prefix).  This Container should not have additional styles (margin, padding, etc.)
 * @param {Array}             data          An array of objects for databinding.
 * @param {Array}             columns       An array of column definitions.
 * @param {Object}            options       Grid options.
 * @param {Array}             additional_context_menu Array with additional context menu entries as object
 *                             { label: "Menu-Label", hint: "MouseOver-Hint", ui_icon: "ui-icon-image", action:  function(t){ ActionName } }
 **/
function SlickGridExtended(container_id, data, columns, options, additional_context_menu){
    // ###################### Begin Constructor-Code #######################
    var thiz = this;                                                            // Persistieren Objekt-Zeiger über Constructor hinaus, da this in privaten Methoden nicht mehr gültig ist

    // Ermitteln der Breite eines Scrollbars (nur einmal je Session wirklich ausführen, sonst gecachten wert liefern)
    var scrollbarWidth_internal_cache   = null;   // Ergebnis von scrollbarWidth zur Wiederverwendung
    var slickgrid_render_needed         = 0;                                    // globale Variable, die steuert, ob aktuell gezeichnetes Grid nach Abschluss neu gerendert werden muss, da sich Größen geändert haben
    var test_cell                       = null;                                 // Objekt zum Test der realen string-Breite für td, wird bei erstem Zugriff initialisiert
    var test_cell_wrap                  = null;                                 // Objekt zum Test der realen string-Breite für td, wird bei erstem Zugriff initialisiert
    var data_view                       = null;
    var columnFilters                   = {};                                   // aktuelle Filter-Kriterien der Daten
    var force_height_calculation        = false;                                // true aktiviert Neuberechnung der Grid-Höhe

    this.gridContainer = jQuery('#'+container_id);                              // Puffern des jQuery-Objektes
    this.gridContainer.addClass('slickgrid_top');                               // css-Klasse setzen zur Wiedererkennung
    jQuery(window).resize(function(){ resize_slickGrids();});                   // Registrieren des Resize-Event Handlers




    // ###################### Ende Constructor-Code #######################

    /**
     *  Helper zur Initialisierung des Objektes
     **/
    this.initSlickGridExtended = function(container_id, data, columns, options, additional_context_menu){
        init_columns_and_calculate_header_column_width(columns, container_id);  // columns um Defaults und Weiten-Info der Header erweitern
        init_data(data, columns);                                               // data im fortlaufende id erweitern
        init_options(options);                                                  // Options um Defaults erweitern
        init_test_cells();                                                      // hidden DIV-Elemente fuer Groessentest aufbauen

        dataView = new Slick.Data.DataView();
        dataView.setItems(data);
        options["searchFilter"] = slickgrid_filter_item_row;                    // merken filter-Funktion für Aktivierung über Menü
        //dataView.setFilter(slickgrid_filter_item_row);

        options['headerHeight']  = 1;                                           // Default, der später nach Notwendigkeit größer gesetzt wird
        options['rowHeight']     = 1;                                           // Default, der später nach Notwendigkeit größer gesetzt wird

        options['plotting']      = false;                                       // Soll Diagramm zeichenbar sein: Default=false wenn nicht eine Spalte als x-Achse deklariert ist
        for (var col_index in columns) {
            column = columns[col_index];
            if (options['plotting'] && (column['plot_master'] || column['plot_master_time']))
                alert('Es kann nur eine Spalte einer Tabelle Plot-Master für X-Achse sein');
            if (column['plot_master'] || column['plot_master_time'])
                options['plotting'] = true;
        }
        if (options['plotting'] && !options['plot_area_id']){                       // DIV fuer Anzeige des Diagramms fehlt noch
            options['plot_area_id'] = 'plot_area_' + container_id;                  // Generierte ID des DIVs fuer Diagramm-Anzeige
            this.gridContainer.after('<div id="' + options['plot_area_id'] + '"></div>');
        }

        this.grid = new Slick.Grid(this.gridContainer, dataView, columns, options);

        this.gridContainer
            .data('slickgrid', this.grid)                                                // speichern Link auf JS-Objekt für Zugriff auf slickgrid-Objekt über DOM
            .data('slickgridextended', this)                                        // speichern Link auf JS-Objekt für Zugriff auf slickgrid-Objekt über DOM
            .css('margin-top', '2px')
            .css('margin-bottom', '2px')
        ;

        // Grid durch Schieber am unteren Ende horitontal resizable gestalten
        this.gridContainer.resizable({
            stop: function( event, ui ) {
                ui.element
                    .css('width', '')                                         // durch Resize gesetzte feste Weite wieder entfernen, da sonst Weiterleitung resize des Parents nicht wirkt
                    .css('top', '')
                    .css('left', '')
                ;
                finish_vertical_resize(ui.element);                          // Sicherstellen, dass Höhe des Containers nicht größer als Höhe des Grids mit allen Zeilen sichtbar
            }
        })
        ;
        this.gridContainer.find(".ui-resizable-e").remove();                             // Entfernen des rechten resizes-Cursors
        this.gridContainer.find(".ui-resizable-se").remove();                            // Entfernen des rechten unteren resize-Cursors

        initialize_slickgrid(this.grid);                                                     // einmaliges Initialisieren des SlickGrid

        this.calculate_current_grid_column_widths('setup_slickgrid'); // erstmalige Berechnung der Größen

        adjust_real_grid_height(this.gridContainer);                                     // Anpassen der Höhe des Grid an maximale Höhe des Inhaltes

        build_slickgrid_context_menu(container_id, additional_context_menu);           // Aufbau Context-Menu fuer Liste

    }


    // initialer Aufbau des SlickGrid-Objektes
    function initialize_slickgrid(grid){
        grid.onSort.subscribe(function(e, args) {
            var col = args.sortCol;
            var field = col.field;

            function convert_german_date(value){                                // de-Datum in sortierbaren string konvetieren
                var tag_zeit = value.split(" ");
                var dat = tag_zeit[0].split(".")
                return dat[2]+dat[1]+dat[0]+(tag_zeit[1] ? tag_zeit[1] : "");
            }

            // Quicksort-Funktion zum schnellen sortieren
            function quickSort(){

                sortFunc = function(a,b){                                       // Default für String
                    if (a[field] < b[field])
                        return -1;
                    if (a[field] > b[field])
                        return 1;
                    if (a[field] === b[field])
                        return 0;
                }

                if (col['sort_type'] == "float") {
                    sortFunc  = function(a, b) {
                        return parseFloatLocale(a[field]) - parseFloatLocale(b[field]);
                    }
                } else if (col['sort_type'] == "date" && options['locale'] == 'de'){
                    sortFunc  = function(a, b){
                        var fa = convert_german_date(a[field]);
                        var fb = convert_german_date(b[field]);
                        if (a < b)
                            return -1;
                        if (a > b)
                            return 1;
                        if (a === b)
                            return 0;
                    }
                }
                dataView.getItems().sort(sortFunc);
            }


            // Bubblesort-Funktion zur Erhaltung der vorherigen Sortierung innerhalb gleicher Werte als Ersatz für Array.sort
            function bubbleSort(){
                var data_array = dataView.getItems();

                var sort_smaller = function(value1, value2){return value1<value2;};     // Default-Sortier-Funktion für String

                if (col['sort_type'] == "float"){
                    sort_smaller = function(value1, value2){
                        return parseFloatLocale(value1) < parseFloatLocale(value2);
                    }
                }

                if (col['sort_type'] == "date" && options['locale'] == 'de'){              // englisches Date lässt sich als String sortieren
                    sort_smaller = function(value1, value2){
                        return convert_german_date(value1) < convert_german_date(value2);
                    }
                }

                function swap(a,b) {
                    temp=data_array[a];
                    data_array[a]=data_array[b];
                    data_array[b]=temp;
                }

                for(var m=data_array.length-1; m>0; m--){
                    for(var n=0; n<m; n++){
                        if (sort_smaller(data_array[n+1][field], data_array[n][field]))
                            swap(n,n+1);
                    }
                }
            }
            if (grid.getOptions()['sort_method'] == 'QuickSort'){
                quickSort();
            } else if (grid.getOptions()['sort_method'] == 'BubbleSort'){
                bubbleSort();
            } else {
                alert('Option "sort_method" with unsuported value "'+grid.getOptions()['sort_type']+'"');
            }

            if (!args.sortAsc)
                dataView.getItems().reverse();
            dataView.refresh();                                                     // DataView mit sortiertem Inhalt synchr.
            grid.invalidate();
            grid.render();
        });

        grid.onScroll.subscribe(function(){
            if (slickgrid_render_needed ==1){
                slickgrid_render_needed = 0;
                thiz.calculate_current_grid_column_widths('onScroll');
            }
        });

        grid.onHeaderCellRendered.subscribe(function(node, column){
            jQuery(column.node).css('height', column.grid.getOptions()['headerHeight']);        // Höhe der Header-Zeile setzen nach dem initialen setzen der Höhe durch slickgrid
        });

        grid.onColumnsResized.subscribe(function(){
            processColumnsResized(this);
        });

        dataView.onRowCountChanged.subscribe(function (e, args) {                   // benötigt für Search-Filter
            grid.updateRowCount();
            grid.render();
        });

        dataView.onRowsChanged.subscribe(function (e, args) {                       // benötigt für Search-Filter
            grid.invalidateRows(args.rows);
            grid.render();
        });


        $(grid.getHeaderRow()).delegate(":input", "change keyup", function (e) {
            var columnId = $(this).data("columnId");
            if (columnId != null) {
                columnFilters[columnId] = $.trim($(this).val());
                dataView.refresh();
            }
        });


        grid.onHeaderRowCellRendered.subscribe(function(e, args) {                  // Zeichnen der Zeile mit Filter-Eingaben

            function input_hint(column_id){                                         // Ermitteln spezifischer Hints für numerisch oder nicht
                if (grid.getColumns()[grid.getColumnIndex(column_id)].sort_type == "float" )
                    return locale_translate("slickgrid_filter_hint_numeric");
                else
                    return locale_translate("slickgrid_filter_hint_not_numeric");
            }

            $(args.node).empty();
            $("<input type='text' style='font-size: 11.5; width: 100%;' title='"+input_hint(args.column.id)+"'>")
                .data("columnId", args.column.id)
                .val(columnFilters[args.column.id])
                .appendTo(args.node);
        });

        grid.onDblClick.subscribe(function(e, args){
            show_full_cell_content(jQuery(grid.getCellNode(args['row'], args['cell'])).children().text());  // Anzeige des Zell-Inhaltes
        });

        // Caption setzen
        if (options['caption'] && options['caption'] != ""){
            var caption = jQuery("<div id='caption_"+container_id.replace(/#/, "")+"' class='slick-caption'></div>").insertBefore('#'+container_id);
            caption.html(options['caption'])
        }
    }   // initialize_slickgrid

    function processColumnsResized(grid){
        for (var col_index in grid.getColumns()){
            var column = grid.getColumns()[col_index];
            if (column['previousWidth'] != column['width']){                        // Breite dieser Spalte wurde resized durch drag
                column['fixedWidth'] = column['width'];                             // Diese spalte von Kalkulation der Spalten ausnehmen
            }
        }
        grid.getOptions()["rowHeight"] = 1;                                         //Neuberechnung der wirklich benötigten Höhe auslösen
        thiz.calculate_current_grid_column_widths("processColumnsResized");
        //grid.render();                                                              // Grid neu berechnen und zeichnen
    }

    // Parsen eines numerischen Wertes aus der landesspezifischen Darstellung mit Komma und Dezimaltrenner
    function parseFloatLocale(value){
        if (value == "")
            return 0;
        if (options['locale'] == 'en'){                                               // globale Option vom Aufrufer
            return parseFloat(value.replace(/\,/g, ""));
        } else {
            return parseFloat(value.replace(/\./g, "").replace(/,/,"."));
        }
    }

    function init_test_cells(){
        // DIVs anlegen am Ende des Grids für Test der resultierenden Breite von Zellen für slickGrid
        var test_cell_id        = 'test_cell'       +container_id;
        var test_cell_wrap_id   = 'test_cell_wrap'  +container_id;
        var test_cells_outer = jQuery(
            '<div id="slick_test_cells">'+
                //Tables für Test der resultierenden Hoehe und Breite von Zellen für slickGrid
                // Zwei table für volle Zeichenbreite
                '<div class="slick-inner-cell" style="visibility:hidden; position: absolute; z-index: -1; padding: 0; margin: 0; height: 20px; width: 90%;"><nobr><div id="' + test_cell_id + '" style="width: 1px; overflow: hidden;"></div></nobr></div>'+
                // Zwei table für umgebrochene Zeichenbreite
                '<table style="visibility:hidden; position:absolute; width:1;"><tr><td class="slick-inner-cell"  style="padding: 0; margin: 0;"><div id="' + test_cell_wrap_id + '"></div></td></tr></table>' +
                '</div>'
        );

        thiz.gridContainer.after(test_cells_outer);                                  // am lokalen Grid unterbringen

        thiz.test_cell       = test_cells_outer.find('#'+test_cell_id);         // Objekt zum Test der realen string-Breite
        thiz.test_cell_wrap  = test_cells_outer.find('#'+test_cell_wrap_id);    // Objekt zum Test der realen string-Breite für td
    }

    // Filtern einer Zeile des Grids gegen aktuelle Filter
    function slickgrid_filter_item_row(item) {
        for (var columnId in columnFilters) {
            if (columnId !== undefined && columnFilters[columnId] !== "") {
                var c = thiz.grid.getColumns()[thiz.grid.getColumnIndex(columnId)];
                if (c.sort_type == "float" &&  item[c.field] != columnFilters[columnId]) {
                    return false;
                }
                if (c.sort_type != "float" &&  (item[c.field].toUpperCase().match(columnFilters[columnId].toUpperCase())) == null ) {
                    return false;
                }
            }
        }
        return true;
    }

    // Testen, ob DOM-Objekt vertikalen Scrollbar besitzt
    // Parameter: jQuery-Objekt des grids
    function has_slickgrid_vertical_scrollbar(){
        var viewport = thiz.gridContainer.find(".slick-viewport");
        var scrollHeight = viewport.prop('scrollHeight');
        var clientHeight = viewport.prop('clientHeight');
        // Test auf vertikalen Scrollbar nur vornehmen, wenn clientHeight wirklich gesetzt ist und dann Differenz zu ScrollHeight
        return clientHeight > 0 && scrollHeight != clientHeight;
    }


// Berechnung der aktuell möglichen Spaltenbreiten in Abhängigkeit des Parent und anpassen slickGrid
// Diese Funktion muss gegen rekursiven Aufruf geschützt werden,recursive from Height set da sie durch diverse Events getriggert wird
// Parameter: jQuery-Object der Table, Herkunfts-String
    this.calculate_current_grid_column_widths = function(caller){


        var options = this.grid.getOptions();

        var current_grid_width = this.gridContainer.parent().prop('clientWidth');           // erstmal maximale Breit als Client annehmen, wird für auto-Breite später auf das notwendige reduziert
        var columns = this.grid.getColumns();
        var columns_changed = false;
        var max_table_width = 0;                                                    // max. Summe aller Spaltenbreiten (komplett mit Scrollbereich)
        var wrapable_count  = 0;                                                    // aktuelle Anzahl noch umzubrechender Spalten
        var column_count    = columns.length;                                       // Anzahl Spalten
        var column;
        var h_padding       = 10;                                                   // Horizontale Erweiterung der Spaltenbreite: padding-right(2) + padding-left(2) + border-left(1) + Karrenz(1)

        trace_log("start calculate_current_grid_column_widths "+caller);

        for (var col_index in columns) {
            column = columns[col_index];
            if (column['fixedWidth']){
                if (column['width'] != column['fixedWidth']) {                      // Feste Breite vorgegeben ?
                    column['width']      = column['fixedWidth'];                    // Feste Breite der Spalte beinhaltet bereits padding
                    columns_changed = true;
                }

            } else {                                                                // keine feste Breite vorgegeben
                if (column['width'] != column['max_nowrap_width']+h_padding) {
                    column['width']      = column['max_nowrap_width']+h_padding;    // per Default komplette Breite des Inhaltes als Spaltenbreite annehmen , Korrektur um padding-right(2) + padding-left(2) + border-left(1) + Karrenz(1)
                    columns_changed = true;
                }
            }

            max_table_width += column['width'];
            if (column['max_wrap_width'] < column['max_nowrap_width'] && !column['no_wrap'])
                wrapable_count += 1;
        }
        // Prüfen auf Möglichkeit des Umbruchs in der Zelle
        var current_table_width = max_table_width                                   // Summe aller max. Spaltenbreiten
        if (has_slickgrid_vertical_scrollbar())
            current_table_width += scrollbarWidth();
        while (current_table_width > current_grid_width && wrapable_count > 0){     // es könnten noch weitere Spalten umgebrochen werden und zur Verringerung horiz. Scrollens dienen
            var min_wrap_diff = 1000000;                                            // kleinste Differenz
            var wrap_column  = null;                                                // sollte definitiv noch belegt werden
            for (var col_index in columns) {
                column = columns[col_index];
                var max_wrap_width = column['max_wrap_width']+h_padding;
                var width          = column['width'];
                if (max_wrap_width < width                  &&                      // Differenz existiert und ist kleiner als bisher je Spalte gesehene
                    width-max_wrap_width < min_wrap_diff    &&
                    !column['fixedWidth']                   &&                      // keine feste Breite der Spalte vorgegeben
                    !column['no_wrap']){                                            // Wrap der spalte nicht ausgeschlossen
                    min_wrap_diff  = width-max_wrap_width;                          // merken der kleinsten Differenz
                    wrap_column = column;                                           // merken der Spalte mit kleinster Differenz
                }
            }
            if (wrap_column){                                                       // Es wurde noch eine zu wrappende Spalte gefunden
                if (current_table_width-min_wrap_diff < current_grid_width){        // Wrappen der Spalte macht Tabelle kleiner als mögliche Breite wäre
                    wrap_column['width'] = wrap_column['width'] - (current_table_width - current_grid_width)  // Wrappen der Spalte nur um notwendigen Bereich
                    min_wrap_diff = current_table_width - current_grid_width        // reduziert auf wirkliche Reduzierung
                } else {
                    wrap_column['width'] = wrap_column['max_wrap_width']+h_padding; // padding-right(2) + padding-left(2) + border-left(1) + Karrenz(1)
                }
                current_table_width -= min_wrap_diff;
            }
            wrapable_count--;
        }
        // Evtl. Zoomen der Spalten wenn noch mehr Platz rechts vorhanden
        if (options['width'] == '' || options['width'] == '100%'){                  // automatische volle Breite des Grid
            while (current_table_width < current_grid_width){                       // noch Platz am rechten Rand, kann auch nach wrap einer Spalte verbleiben
                for (var col_index in columns) {
                    if (current_table_width < current_grid_width && !columns[col_index]['fixedWidth']){
                        columns[col_index]['width']++;
                        current_table_width++;
                        columns_changed = true;
                    }
                }
            }
        } else {                                                                    // auto-width
            var sort_pfeil_width = 10;
            for (var col_index in columns) {
                if (current_table_width < current_grid_width && !columns[col_index]['fixedWidth']){
                    columns[col_index]['width'] += sort_pfeil_width;                // erweitern um Darstellung des Sort-Pfeiles
                    current_table_width += sort_pfeil_width;
                    max_table_width += sort_pfeil_width;                            // max. Breite des Grids im auto-Modus
                    columns_changed = true;
                }
            }
        }

        this.gridContainer.data('last_resize_width', this.gridContainer.width());                   // Merken der aktuellen Breite, um unnötige resize-Events zu vermeiden

        var vertical_scrollbar_width = 0;
        if (has_slickgrid_vertical_scrollbar())
            vertical_scrollbar_width = scrollbarWidth();
        if (options['width'] == "auto" && max_table_width+vertical_scrollbar_width < this.gridContainer.parent().width() ) {     // Grid kann noch breiter dargestellt werden
            this.gridContainer.css('width', max_table_width+vertical_scrollbar_width);  // Gesamtes Grid auf die Breite des Canvas (Summe aller Spalten) setzten
        }

        jQuery('#caption_'+this.gridContainer.attr('id')).css('width', this.gridContainer.width()); // Breite des Caption-Divs auf Breite des Grid setzen
        this.grid.setOptions(options);                                                   // Setzen der veränderten options am Grid
        if (columns_changed)
            this.grid.setColumns(columns);                                               // Setzen der veränderten Spaltenweiten am slickGrid, löst onScroll-Ereignis aus mit wiederholtem aufruf dieser Funktion, daher erst am Ende setzen

        //############### Ab hier Berechnen der Zeilenhöhen ##############
        var header_height = options['headerHeight']                                 // alter Wert
        var row_height    = options['rowHeight']                                    // alter Wert
        var v_padding     = 4;                                                      // Vertiale Erweiterung der Spaltenhöhe um Padding
        var horizontal_scrollbar_width = 0;
        if (current_table_width+vertical_scrollbar_width > this.gridContainer.parent().width() )   // nuss horizontaler Scrollbar existieren?
            horizontal_scrollbar_width = scrollbarWidth();

        // Hoehen von Header so setzen, dass der komplette Inhalt dargestellt wird
        this.gridContainer.find(".slick-header-columns").children().each(function(){
            var scrollHeight = jQuery(this).prop("scrollHeight");
            var clientHeight = jQuery(this).prop("clientHeight");
            if (scrollHeight > clientHeight && scrollHeight-4 > header_height){     // Inhalt steht nach unten über
                header_height = scrollHeight-4;                                     // Padding hinzurechnen, da Höhe auf Ebene des Zeilen-DIV gesetzt wird
            }
        });

        if (options["line_height_single"]){
            row_height = single_line_height() + 8;
        } else {                                                                    // Volle notwendige Höhe errechnen
            // Hoehen von Cell so setzen, dass der komplette Inhalt dargestellt wird
            this.gridContainer.find(".slick-inner-cell").each(function(){
                var scrollHeight = jQuery(this).prop("scrollHeight");

                if (scrollHeight > row_height+v_padding){                           // Inhalt steht nach unten über
                    row_height = scrollHeight+6;                             // Padding hinzurechnen, da Höhe auf Ebene des Zeilen-DIV gesetzt wird
                }

            });
        }

        if (row_height != options['rowHeight'] || header_height != options['headerHeight'] || this.force_height_calculation){
            options['rowHeight']    = row_height;
            options['headerHeight'] = header_height;
            this.force_height_calculation = false;                              // einmaliger Zwang zur erneuten Höhenberechnung

            var total_height =      options['headerHeight']                         // innere Höhe eines Headers
                    + 8                                               // padding top und bottom=4 des Headers
                    + 2                                               // border=1 top und bottom des headers
                    + (options['rowHeight'] * this.grid.getDataLength() )  // Höhe aller Datenzeilen
                    + horizontal_scrollbar_width
                    + (options["showHeaderRow"] ? options["headerRowHeight"] : 0)
                ;                                                 // Linie über und unter dem Scrollbar

            this.gridContainer.data('total_height', total_height);                          // Speichern am DIV-Objekt für Zugriff aus anderen Funktionen

            //console.log("Height calculation:");
            //console.log("margin="+(this.gridContainer.outerHeight(true) - this.gridContainer.outerHeight()));
            //console.log("header="+options['headerHeight']);
            //console.log("padding header=8");
            //console.log("rowheight="+options['rowHeight']);
            //console.log("Scrollbar="+scrollbarWidth());
            //console.log("totalcanvas="+(options['rowHeight']) * grid.getDataLength());
            //console.log("total_height="+total_height);

            var final_height = total_height+scrollbarWidth();                      // Höhe des Grids nach Abschluss der Operationen

            if (options['maxHeight'] && options['maxHeight'] < total_height)
                final_height = options['maxHeight'];                                // Limitieren der Höhe auf Vorgabe wenn sonst überschritten

            this.gridContainer.height(final_height);                                        // Grid immer mit zusätzlicher Scrollbar-Höhe aufbauen

            this.grid.setOptions(options);                                               // Setzen der veränderten options am Grid
            this.grid.setColumns(columns);                                               // Setzen der veränderten Spaltenweiten am slickGrid, löst onScroll-Ereignis aus mit wiederholtem aufruf dieser Funktion, daher erst am Ende setzen
        }
        trace_log("end calculate_current_grid_column_widths "+caller);
    }


// Aufbau context-Menu für slickgrid, Parameter: DOM-ID, Array mit Entry-Hashes
    var last_slickgrid_contexmenu_col_header=null;                                  // globale Variable mit jQuery-Objekt des Spalten-Header der Spalte, in der Context-Menu zuletzt gerufen wurd
    var last_slickgrid_contexmenu_column_name='';                                   // globale Variable mit Spalten-Name der Spalte, in der Context-Menu zuletzt gerufen wurd
    var last_slickgrid_contexmenu_field_content='';                                 // globale Variable mit Inhalt des Feldes auf dem Context-Menu aufgerufen wurde
//    this.build_slickgrid_context_menu = function(table_id,  menu_entries){
    function build_slickgrid_context_menu(table_id,  menu_entries){
        var grid_table = jQuery('#'+table_id);
        var grid = grid_table.data('slickgrid');
        var options = grid.getOptions();
        var context_menu_id = "menu_"+table_id;
        var menu = jQuery("<div class='contextMenu' id='"+context_menu_id+"' style='display:none;'>").insertAfter('#'+table_id);
        var ul   = jQuery("<ul></ul>").appendTo(menu);
        jQuery("<div id='header_"+context_menu_id+"' style='padding: 3px;' align='center'>Header</div>").appendTo(ul);
        var bindings = {};

        function menu_entry(name, icon_class, click_action, label, hint){
            if (!label)
                label = locale_translate("slickgrid_context_menu_"+name);
            if (!hint)
                hint = locale_translate("slickgrid_context_menu_"+name+"_hint");
            jQuery("<li id='"+context_menu_id+"_"+name+"' title='"+hint+"'><span class='"+icon_class+"' style='float:left'></span><span id='"+context_menu_id+"_"+name+"_label'>"+label+"</span></li>").appendTo(ul);
            bindings[context_menu_id+"_"+name] = click_action;

        }

        menu_entry("sort_column",       "ui-icon ui-icon-carat-2-n-s",      function(t){ last_slickgrid_contexmenu_col_header.click();} );                  // Menu-Eintrag Sortieren
        menu_entry("search_filter",     "ui-icon ui-icon-zoomin",           function(t){ switch_slickgrid_filter_row(grid, grid_table);} );                 // Menu-Eintrag Filter einblenden / verstecken
        menu_entry("export_csv",        "ui-icon ui-icon-document",         function(t){ grid2CSV(table_id);} );                                            // Menu-Eintrag Export CSV
        menu_entry("column_sum",        "ui-icon ui-icon-document",         function(t){ show_column_stats(grid, last_slickgrid_contexmenu_column_name);} );  // Menu-Eintrag Spaltensumme
        menu_entry("field_content",     "ui-icon ui-icon-arrow-4-diag",     function(t){ show_full_cell_content(last_slickgrid_contexmenu_field_content);} ); // Menu-Eintrag Feld-Inhalt
        menu_entry("line_height_single","ui-icon ui-icon-arrow-2-n-s",      function(t){ options['line_height_single'] = !options['line_height_single']; thiz.calculate_current_grid_column_widths("context menu line_height_single");} );


        if (options['plotting']){
            // Menu-Eintrag Spalte in Diagramm
            menu_entry("plot_column",     "ui-icon ui-icon-image",     function(t){ plot_slickgrid_diagram(table_id, options['plot_area_id'], options['caption'], last_slickgrid_contexmenu_column_name, options['multiple_y_axes'], options['show_y_axes']);} );
            // Menu-Eintrag Alle entfernen aus Diagramm
            menu_entry("remove_all_from_diagram", "ui-icon ui-icon-trash",         function(t){
                    var columns = grid.getColumns();
                    for (var col_index in columns){
                        columns[col_index]['plottable'] = 0;
                    }
                    plot_slickgrid_diagram(table_id, options['plot_area_id'], options['caption'], null);  // Diagramm neu zeichnen
                }
            );
        }

        menu_entry("sort_method","ui-icon ui-icon-triangle-2-n-s",      function(t){
                if (options['sort_method'] == 'QuickSort'){
                    options['sort_method'] = 'BubbleSort';
                } else {
                    options['sort_method'] = 'QuickSort';
                }
                jQuery("#"+context_menu_id+"_sort_method_label").html(locale_translate('slickgrid_context_menu_sort_method_'+options['sort_method']));
            },
            locale_translate('slickgrid_context_menu_sort_method_'+options['sort_method']),
            locale_translate('slickgrid_context_menu_sort_method_hint')
        );

        for (entry_index in menu_entries){
            menu_entry(entry_index, "ui-icon "+menu_entries[entry_index]['ui_icon'], menu_entries[entry_index]['action'], menu_entries[entry_index]['label'], menu_entries[entry_index]['hint']);
        }

        grid_table.contextMenu(context_menu_id, {
            menuStyle: {  width: '330px' },
            bindings:   bindings,
            onContextMenu : function(event, menu)                                   // dynamisches Anpassen des Context-Menü
            {
                var cell = $(event.target);
                last_slickgrid_contexmenu_col_header = null;                        // Initialisierung, um nachfolgend Treffer zu testen

                if (cell.parents(".slickgrid_header_"+table_id).length > 0){        // Mouse-Event fand in Unterstruktur des Spalten-Headers statt
                    cell = cell.parents(".slickgrid_header_"+table_id);             // Zeiger auf Spaltenheader stellen
                }
                if (cell.hasClass("slickgrid_header_"+table_id)){                   // Mouse-Event fand direkt im Spalten-Header oder innerhalb statt
                    last_slickgrid_contexmenu_col_header = cell;
                    last_slickgrid_contexmenu_column_name = cell.data('column')['field']
                }
                if (cell.parents(".slick-cell").length > 0){                        // Mouse-Event fand in Unterstruktur der Zelle statt
                    cell = cell.parents(".slick-cell");                             // Zeiger auf äußerstes DIV der Zelle stellen
                }
                if (cell.hasClass("slick-cell")){                                   // Mouse-Event fand in äußerstem DIV der Zelle oder innerhalb statt
                    var slick_header = grid_table.find('.slick-header-columns');
                    cell = cell.find(".slick-inner-cell");                          // Inneren DIV mit Spalten-Info suchen
                    last_slickgrid_contexmenu_col_header = slick_header.children('[id$=\"'+cell.attr('column')+'\"]');  // merken der Header-Spalte des mouse-Events;
                    last_slickgrid_contexmenu_column_name = cell.attr('column');
                    last_slickgrid_contexmenu_field_content = cell.text();
                }

                if (last_slickgrid_contexmenu_col_header) {                         // konkrete Spalte ist bekannt
                    var column = grid.getColumns()[grid.getColumnIndex(last_slickgrid_contexmenu_column_name)];
                    jQuery('#header_'+context_menu_id)
                        .html('Column: <b>'+last_slickgrid_contexmenu_col_header.html()+'</b>')
                        .css('background-color','lightgray');

                    jQuery("#"+context_menu_id+"_plot_column_label").html(locale_translate(column['plottable'] ? "slickgrid_context_menu_switch_col_from_diagram" : "slickgrid_context_menu_switch_col_into_diagram"));
                    jQuery("#"+context_menu_id+"_line_height_single_label").html(locale_translate(options["line_height_single"] ? "slickgrid_context_menu_line_height_full" : "slickgrid_context_menu_line_height_single"));
                } else {
                    jQuery('#header_'+context_menu_id)
                        .html('Column/cell not exactly hit! Please retry.')
                        .css('background-color','red');
                }
                jQuery("#"+context_menu_id+"_search_filter_label").html(locale_translate(grid.getOptions()["showHeaderRow"] ? "slickgrid_context_menu_hide_filter" : "slickgrid_context_menu_show_filter"));
                return true;
            }
        });
    }

    // Ein- / Ausblenden der Filter-Inputs in Header-Rows des Slickgrids
    function switch_slickgrid_filter_row(grid, grid_table){
        var options = grid.getOptions();
        if (options["showHeaderRow"]) {
            grid.setHeaderRowVisibility(false);
            grid.getData().setFilter(null);
        } else {
            grid.setHeaderRowVisibility(true);
            grid.getData().setFilter(options["searchFilter"]);
        }
        grid.setColumns(grid.getColumns());                                     // Auslösen/Provozieren des Events onHeaderRowCellRendered für slickGrid
        thiz.force_height_calculation = true;                                   // Sicherstellen, dass Höhenberechnung nicht wegoptimiert wird
        thiz.calculate_current_grid_column_widths("switch_slickgrid_filter_row");  // Höhe neu berechnen
    }

    function grid2CSV(grid_id) {
        var grid_div = jQuery("#"+grid_id);
        var grid = grid_div.data("slickgrid");
        var data = "";

        function escape(cell){
            return cell.replace(/"/g,"\\\"").replace(/'/g,"\\\'").replace(/;/g, "\\;");
        }

        //Header
        grid_div.find(".slick-header-columns").children().each(function(index, element) {
            data += '"'+escape(jQuery(element).text())+'";'
        });
        data += "\n";

        // Zellen
        var grid_data    = grid.getData().getItems();
        var grid_columns = grid.getColumns();

        for (data_index in grid_data){
            for (col_index in grid_columns){
                data += '"'+escape(grid_data[data_index][grid_columns[col_index]['field']])+'";'
            }
            data += "\n"
        }

        if (navigator.appName.indexOf("Explorer") != -1)                            // Internet Explorer
            document.location.href = 'data:Application/octet-stream,' + encodeURIComponent(data);
        else {
            document.location.href = 'data:Application/download,' + encodeURIComponent(data);
        }
    }

    // Anzeige der Statistik aller Zeilen der Spalte (Summe etc.)
    function show_column_stats(grid, column_name){
        var column = grid.getColumns()[grid.getColumnIndex(column_name)];
        var data   = grid.getData().getItems();
        var sum   = 0;
        var count = 0;
        var distinct = {};
        var distinct_count = 0;
        for (var row_index in data){
            sum += parseFloatLocale(data[row_index][column_name])
            count ++;
            distinct[data[row_index][column_name]] = 1;     // Wert in hash merken
        }
        for (var i in distinct) {
            distinct_count += 1;
        }
        alert("Sum = "+sum+"\nCount = "+count+"\nCount distinct = "+distinct_count);
    }

// Anzeige des kompletten Inhaltes der Zelle
    function show_full_cell_content(content){
        alert(content);
    }

// Setzen/Limitieren der Höhe des Grids auf maximale Höhe des Inhaltes
// Parameter: jQuery-Objekt des Grid-Containers
    function adjust_real_grid_height(jq_container){
        // Einstellen der wirklich notwendigen Höhe des Grids (einige Browser wie Safari brauchen zum Aufbau des Grids Plastz für horizontalen Scrollbar, auch wenn dieser am Ende nicht sichtbar wird
        var total_height = jq_container.data('total_height');                       // gespeicherte Inhaltes-Höhe aus calculate_current_grid_column_widths
        if (total_height < jq_container.height())                                   // Sicherstellen, dass Höhe des Containers nicht größer als Höhe des Grids mit allen Zeilen sichtbar
            jq_container.height(total_height);
    }

// Justieren des Grids nach Abshcluss der Resize-Operation mit unterem Schieber
    function finish_vertical_resize(jg_container){
        thiz.calculate_current_grid_column_widths('finish_vertical_resize');  // Neuberechnen breiten (neue Situation bzgl. vertikalem Scrollbar)
        adjust_real_grid_height(jg_container);                                      // Limitieren Höhe
    }

    /**
     *  data im fortlaufende id erweitern
     * @param data
     */
    init_data = function(data, columns){
        for (var data_index in data){
            var data_row = data[data_index];
            data_row['id'] = data_index;                                        // Data-Array fortlaufend durchnumerieren
            if (!data[data_index]['metadata'])
                data[data_index]['metadata'] = {columns: {}};                   // Metadata-Objekt anlegen wenn noch nicht existiert
            for (var col_index in columns){                                     // Iteration über Columns
                var col = columns[col_index];
                if (!data_row['metadata']['columns'][col['field']])
                    data_row['metadata']['columns'][col['field']] = {};         // Metadata für alle Spalten anlegen
            }
        }
    }

// Ermittlung Spaltenbreite der Header auf Basis der konketen Inhalte
    init_columns_and_calculate_header_column_width = function(columns, container_id){
        function init_column(column, key, value){
            if (!column[key])
                column[key] = value;                            // Default-Attribut der Spalte, braucht damit nicht angegeben werden
        }

        // DIVs für Test der resultierenden Breite von Zellen für slickGrid
        var test_header_outer      = jQuery('<div class="slick_header_column ui-widget-header" style="visibility:hidden; position: absolute; z-index: -1; padding: 0; margin: 0;"><nobr><div id="test_header" style="width: 1px; overflow: hidden;"></div></nobr></div>');
        thiz.gridContainer.after(test_header_outer);                             // Einbinden in DOM-Baum
        var test_header         = test_header_outer.find('#test_header');       // Objekt zum Test der realen string-Breite

        // TABLE für umgebrochene Zeichenbreite
        var test_header_wrap_outer = jQuery('<table style="visibility:hidden; position:absolute; width:1;"><tr><td class="slick_header_column ui-widget-header" style="padding: 0; margin: 0;"><div id="test_header_wrap"></div></td></tr></table>');
        thiz.gridContainer.after(test_header_wrap_outer);
        var test_header_wrap  = test_header_wrap_outer.find('#test_header_wrap'); // Objekt zum Test der realen string-Breite für td

        var column;                                                             // aktuell betrachtete Spalte

        // Ermittlung max. Zeichenbreite ohne Umbrüche
        for (var col_index in columns){
            column = columns[col_index]

            init_column(column, 'formatter', HTMLFormatter)                     // Default-Formatter, braucht damit nicht angegeben werden
            init_column(column, 'sortable',  true);
            init_column(column, 'sort_type', 'string');                          // Sort-Type. TODO Ermittlung nach JavaScript verschieben
            init_column(column, 'field',     column['id']);                     // Field-Referenz in data-Record muss nicht angegeben werden wenn identisch
            init_column(column, 'minWidth',  5);                                // Default von 30 reduzieren
            init_column(column, 'headerCssClass', 'slickgrid_header_'+container_id);
            init_column(column, 'slickgridExtended', this);


            test_header.html(column['name']);                                   // Test-Zelle mit zu messendem Inhalt belegen
            column['header_nowrap_width']  = test_header.prop("scrollWidth");   // genutzt für Test auf Umbruch des Headers, dann muss Höhe der Header-Zeile angepasst werden

            test_header_wrap.html(column['name']);
            column['max_wrap_width']      = test_header_wrap.width();

            column['max_nowrap_width']    = column['max_wrap_width']            // Normbreite der Spalte mit Mindestbreite des Headers initialisieren (lieber Header umbrechen als Zeilen einer anderen Spalte)
        }

        // Entfernen der DIVs fuer Breitenermittlung aus dem DOM-Baum
        test_header_outer.remove();
        test_header_wrap_outer.remove();
    }

// Options um Defaults erweitern
    init_options = function(options){
        function init_option(key, value){
            if (!options[key])
                options[key] = value;                            // Default-Attribut der Option, braucht damit nicht angegeben werden
        }

        init_option('enableCellNavigation', true);
        init_option('headerRowHeight',      30);                // Höhe der optionalen Filter-Zeile
        init_option('enableColumnReorder',  false);
        init_option('width',                'auto');
        init_option('locale',               'en');
        init_option('sort_method',          'QuickSort');                       // QuickSort (Array.sort) oder BubbleSort
    }



    trace_log = function(msg){
        if (true){
            console.log(msg);                                                           // Aktivieren trace-Ausschriften
        }
    }



// Speichern Inhalt und Erneutes Berechnen der Breite und Höhe einer Zelle nach Änderung ihres Inhaltes + Aktualisieren der Anzeige, um kompletten neuen Content zeigen zu können (nicht abgeschnitten)
// Parameter: jQuery-Objekt auf dem innerhalb einer Zelle ein ajax-Call ausgelöst wurde
    this.save_new_cell_content = function(obj){
        var inner_cell = obj.parents(".slick-inner-cell");
        var grid_table = inner_cell.parents(".slickgrid_top");                      // Grid-Table als jQuery-Objekt
        var column = null;
        for (var column_index in this.grid.getColumns()){
            if (this.grid.getColumns()[column_index]['field'] == inner_cell.attr('column'))
                column = this.grid.getColumns()[column_index];
        }
        // Rückschreiben des neuen Dateninhaltes in Metadata-Struktur des Grid
        this.grid.getData().getItems()[inner_cell.attr("row")][inner_cell.attr("column")] = inner_cell.text();  // sichtbarer Anteil der Zelle
        this.grid.getData().getItems()[inner_cell.attr("row")]["metadata"]["columns"][inner_cell.attr("column")]["fulldata"] = inner_cell.html(); // Voller html-Inhalt der Zelle

        calc_cell_dimensions(inner_cell.text(), inner_cell.html(), column);     // Neu-Berechnen der max. Größen durch getürkten Aufruf der Zeichenfunktion
        this.calculate_current_grid_column_widths('recalculate_cell_dimension'); // Neuberechnung der Zeilenhöhe, Spaltenbreite etc. auslösen, auf jeden Fall, da sich die Höhe verändert haben kann
    }


    scrollbarWidth = function() {
        if (scrollbarWidth_internal_cache)
            return scrollbarWidth_internal_cache;
//    var div = $('<div style="width:50px;height:50px;overflow:hidden;position:absolute;top:-200px;left:-200px;"><div style="height:100px;"></div>');
        var div = $('<div style="width:50px;height:50px;overflow:scroll;"><div id="scrollbarWidth_testdiv">Hugo</div></div>');
        // Append our div, do our calculation and then remove it
        $('body').append(div);
        scrollbarWidth_internal_cache = div.width() - div.find("#scrollbarWidth_testdiv").width();
        $(div).remove();
        return scrollbarWidth_internal_cache;
    }


// Zeichnen eines Diagrammes mit den Daten einer slickgrid-Spalte
// Parameter:
// ID der Table
// jQuery-Selector des DIVs fuer Plotting
// Kopfzeile
// Name der Spalte, die ein/ausgeschalten wird
    plot_slickgrid_diagram = function(table_id, plot_area_id, caption, column_id, multiple_y_axes, show_y_axes) {
        var options = thiz.grid.getOptions();
        var columns = thiz.grid.getColumns();                          // JS-Objekt mit Spalten-Struktur gespeichert an DOM-Element, Originaldaten des Slickgrid, daher kein Speichern nötig
        var data    = thiz.grid.getData().getItems();                  // JS-Aray mit Daten-Struktur gespeichert an DOM-Element, Originaldaten des Slickgrid, daher kein Speichern nötig

        function get_numeric_content(celldata){ // Ermitteln des numerischen html-Inhaltes einer TD-Zelle bzw. ihrer Kinder, wenn weitere enthalten sind
            if (options['locale'] == 'de'){
                return parseFloat(celldata.replace(/\./g, "").replace(/,/,"."));   // Deutsche nach englische Float-Darstellung wandeln (Dezimatrenner, Komma)
            }
            if (options['locale'] == 'en'){
                return parseFloat(celldata.replace(/\,/g, ""));                   // Englische Float-Darstellung wandeln, Tausend-Separator entfernen
            }
            return "Error: unsupported locale "+options['locale'];
        }

        function get_date_content(celldata){ // Ermitteln des html-Inhaltes einer TD-Zelle bzw. ihrer Kinder, wenn weitere enthalten sind, als Date
            var parsed_field;
            if (options['locale'] == 'de'){
                var all_parts = celldata.split(" ");
                var date_parts = all_parts[0].split(".");
                parsed_field = date_parts[2]+"/"+date_parts[1]+"/"+date_parts[0]+" "+all_parts[1]   // Datum ISO neu zusammengsetzt + Zeit
            }
            if (options['locale'] == 'en'){
                parsed_field= celldata.replace(/-/g,"/");       // Umwandeln "-" nach "/", da nur so im Date-Konstruktor geparst werden kann
            }
            return new Date(parsed_field+" GMT");
        }

        //Sortieren eines DataArray nach dem ersten Element des inneren Arrays (X-Achse)
        function data_array_sort(a,b){
            return a[0] - b[0];
        }

        // Spaltenheader der Spalte mit class 'plottable' versehen oder wegnehmen wenn bereits gesetzt (wenn Column geschalten wird)
        for (var col_index in columns){
            if (columns[col_index]['id'] == column_id){
                if (columns[col_index]['plottable'] == 1)
                    columns[col_index]['plottable'] = 0
                else
                    columns[col_index]['plottable'] = 1
            }
        }

        var plot_master_column_index = null;                                        // Spalten-Nr. der Plotmaster-Spalte
        var plot_master_column_id = null;                                           // Spalten-Name der Plotmaster-Spalte
        var plot_master_time_column_index=null;                                     // Spalten-Nr. der Plotmaster-Spalte, wenn diese Zeit als Inhalt hat
        var plotting_column_count = 0;                                              // Anzahl der zu zeichnenden Spalten
        for (var column_index in columns) {
            var column = columns[column_index]                                      // konkretes Spalten-Objekt aus DOM
            if (column['plot_master']){                              // ermitteln der Spalte, die plot_master für X-Achse ist
                if (plot_master_column_index){ alert("Only one column may have attribute 'plot_master'");}
                plot_master_column_index = column_index;
                plot_master_column_id = column['id'];
            }
            if (column['plot_master_time']){                         // ermitteln der Spalte, die plot_master für X-Achse ist mit Zeit als Inhalt
                if (plot_master_time_column_index){ alert("Only one column may have attribute 'plot_master_time'");}
                plot_master_column_index = column_index;
                plot_master_column_id = column['id'];
                plot_master_time_column_index=column_index;
            }
            if (column['plottable'] == 1){
                plotting_column_count++;
            }
        }
        if (plot_master_column_index == null){
            alert('Fehler: Keine <th>-Spalte besitzt die Klasse "plot_master"! Exakt eine Spalte mit dieser Klasse wird erwartet');
        }

        var x_axis_time = false;                                                    // Defaut, wenn keine plot_master_time gesetzt werden
        var data_array = [];
        var plotting_index = 0
        // Iteration ueber plotting-Spalten
        for (var column_index in columns) {
            var column = columns[column_index]                                      // konkretes Spalten-Objekt aus DOM
            if (column['plottable']==1){                                            // nur fuer zu zeichnenden Spalten ausführen
                var col_data_array = [];
                // Iteration ueber alle Records der Tabelle
                var max_column_value = 0;                                           // groessten Wert der Spalte ermitteln für notwendige Breite der Anzeige
                for (var data_index in data){                                       // Iteration über Daten
                    var x_val = null;
                    var y_val = null;
                    // Aufbau eines Tupels aus Plot_master und plottable-Spalte
                    // Plottable-Spalte
                    y_val = get_numeric_content(data[data_index][column['id']]);
                    if (y_val > max_column_value)              // groessten wert der Spalte ermitteln
                        max_column_value = y_val;
                    // Plot-Master-Spalte
                    if (plot_master_time_column_index){
                        x_val = get_date_content(data[data_index][plot_master_column_id]).getTime();       // Zeit in ms seit 1970
                        x_axis_time = true;       // mindestens ein plot_master_time gesetzt werden
                    } else {
                        x_val = get_numeric_content(data[data_index][plot_master_column_id]);
                    }
                    col_data_array.push( [ x_val, y_val ]);
                }
                col_data_array.sort(data_array_sort);      // Data_Array der Spalte nach X-Achse sortieren
                col_attr = {label:column['name'],
                    data: col_data_array
                }
                data_array.push(col_attr);   // Erweiterung des primären arrays
                plotting_index = plotting_index + 1;  // Weiterzaehlen Index
            }
        }


        plot_diagram(
            table_id,
            plot_area_id,
            caption,
            data_array,
            multiple_y_axes,
            show_y_axes,
            x_axis_time,
            options['locale']
        );
    } // plot_slickgrid_diagram




    calc_cell_dimensions = function(value, fullvalue, column){
        var test_cell      = thiz.test_cell;
        var test_cell_wrap = thiz.test_cell_wrap;
        if (!column['last_calc_value'] || (value != column['last_calc_value'] && value.length*9 > column['max_wrap_width'])){  // gleicher Wert muss nicht erneut gecheckt werden, neuer Wert muss > alter sein bei 10 Pixel Breite, aber bei erstem Male durchlauen
            test_cell.html(fullvalue);                                              // Test-DOM nowrapped mit voll dekoriertem Inhalt füllen
            test_cell.attr('class', column['cssClass']);                            // Class ersetzen am Objekt durch aktuelle, dabei überschreiben evtl. vorheriger
            if (test_cell.prop("scrollWidth")  > column['max_nowrap_width']){
                column['max_nowrap_width']  = test_cell.prop("scrollWidth");
                thiz.slickgrid_render_needed = 1;
            }
            if (!column['no_wrap']  && test_cell.prop("scrollWidth") > column['max_wrap_width']){     // Nur Aufrufen, wenn max_wrap_width sich auch vergrößern kann (aktuelle Breite > bisher größte Wrap-Breite)
                test_cell_wrap.html(fullvalue);                                     // Test-DOM wrapped mit voll dekoriertem Inhalt füllen
                test_cell_wrap.attr('class', column['cssClass']);                   // Class ersetzen am Objekt durch aktuelle, dabei überschreiben evtl. vorheriger
                if (test_cell_wrap.width()  > column['max_wrap_width']){
//console.log("Column "+column['name']+" NewWrapWidth="+test_cell_wrap.width()+ " "+value+ " prevWrapWidth="+column['max_wrap_width'])
                    column['max_wrap_width']  = test_cell_wrap.width();
                    thiz.slickgrid_render_needed = 1;
                }
                if (fullvalue != value)                                             // Enthält Zelle einen mit tags dekorierten Wert ?
                    test_cell_wrap.html("");                                        // leeren der Testzelle, wenn fullvalue weitere html-tags etc. enthält, ansonsten könnten z.B. Ziel-DOM-ID's mehrfach existierem
            }
            if (fullvalue != value)                                                 // Enthält Zelle einen mit tags dekorierten Wert ?
                test_cell.html("");                                                 // leeren der Testzelle, wenn fullvalue weitere html-tags etc. enthält, ansonsten könnten z.B. Ziel-DOM-ID's mehrfach existierem
            column['last_calc_value'] = value;                                      // Merken an Spalte für nächsten Vergleich
        }
    }


    /**
     * Translate key into string according to options[:locale]
     * @param key
     */
    function locale_translate(key){
        var sl_locale = thiz.grid.getOptions()['locale'];

        if (get_slickgrid_translations()[key]){
            if (get_slickgrid_translations()[key][sl_locale]){
                return get_slickgrid_translations()[key][sl_locale];
            } else {
                if (get_slickgrid_translations()[key]['en'])
                    return get_slickgrid_translations()[key]['en'];
                else
                    return 'No default translation (en) available for key "'+key+'"';
            }
        } else {
              return 'No translation available for key "'+key+'"';
        }
    }


} // Ende SlickGridExtended



// ############################# begin public methods (prototype) ##############################






// ############################# end public methods (prototype) ##############################


// ############################# global functions ##############################

// Fangen des Resize-Events des Browsers und Anpassen der Breite aller slickGrids
function resize_slickGrids(){
    jQuery('.slickgrid_top').each(function(index, element){
        var gridContainer = jQuery(element);
        if (gridContainer.data('last_resize_width') && gridContainer.data('last_resize_width') != gridContainer.width() && gridContainer.data('slickgrid')) { // nur durchrechnen, wenn sich wirklich Breite ändert und grid bereits initialisiert ist
            gridContainer.data('slickgridextended').calculate_current_grid_column_widths("resize_slickGrids");
            gridContainer.data('last_resize_width', gridContainer.width());                       // persistieren Aktuelle Breite
        }
    });
}



// Default-Formatter für Umsetzung HTML in SlickGrid
// Parameter: row-,cell-Nr. beginnend mit 0
//            value:        Wert der Zelle in data
//            columnDef:    Spaltendefinition
//            dataContext:  komplette Zeile aus data-Array
// TODO Statt eines DIV den äusseren DIV dekorieren
function HTMLFormatter(row, cell, value, columnDef, dataContext){
    var column_metadata = dataContext['metadata']['columns'][columnDef['field']];  // Metadata der Spalte der Row
    var fullvalue = value;                                                      // wenn keine dekorierten Daten vorhanden sind, dann Nettodaten verwenden
    if (column_metadata['fulldata'])
        fullvalue = column_metadata['fulldata']                                 // Ersetzen des data-Wertes durch komplette Vorgabe incl. html-tags etc.

    if (!column_metadata['dc'] || column_metadata['dc']==0){                    // bislang fand noch keine Messung der Dimensionen der Zellen dieser Zeile statt
        columnDef['slickgridExtended'].calc_cell_dimensions(value, fullvalue, columnDef);   // Werte ermitteln und gegen bislang bekannte Werte der Spalte testen
        column_metadata['dc'] = 1;                                              // Zeile als berechnet markieren
    }

    var output = "<div class='slick-inner-cell' row="+row+" column='"+columnDef['field']+"'";           // sichert u.a. 100% Ausdehnung im Parent und Wiedererkennung der Spalte bei Mouse-Events
    if (column_metadata['title']) {
        output += " title='"+column_metadata['title']+"'";
    } else {
        if (columnDef['toolTip'])
            output += " title='"+columnDef['toolTip']+"'";
    }
    var style = "";
    if (column_metadata['style'])
        style += column_metadata['style'];
    if (columnDef['style'])
        style += columnDef['style'];
    if (!columnDef['no_wrap'])
        style += "white-space: normal; ";
    if (style != "")
        output += " style='"+style+"'";
    output += ">"+fullvalue+"</div>"
    return output;
}


// Ermittlung der Zeilenhöhe fuer einzeilige Darstellung
function single_line_height() {
    return jQuery('#test_cell').html("1").height();
}


/**
 * Übersetzungsliste
 */

function get_slickgrid_translations() {
    return {
        'slickgrid_context_menu_column_sum': {
            'en': 'Sums of all rows of this column',
            'de': 'Summen der Werte dieser Spalte'
        },
        'slickgrid_context_menu_column_sum_hint': {
            'en': 'Calculate numeric sum and count for all rows of this column',
            'de': 'Numerische Summe und Anzahl Zeilen dieser Spalte anzeigen'
        },
        'slickgrid_context_menu_export_csv': {
            'en': 'Export grid in csv-file'
        },
        'slickgrid_context_menu_export_csv_hint': {
            'en': 'Export grid in csv-file for import to Excel etc. (to browsers default download folder)',
            'de': 'Export grid in csv-file für import nach Excel etc. (in Standard-Download-Verzeichnis)'
        },
        'slickgrid_context_menu_field_content': {
            'en': 'Show content of table cell',
            'de': 'Anzeige des Inhaltes des Tabellenfeldes'
        },
        'slickgrid_context_menu_field_content_hint': {
            'en': 'Show content of table cell in popup window (for better copy & paste)',
            'de': 'Anzeige des Inhaltes des Tabellenfeldes in Popup-Fenster (zum Markieren und Kopieren)'
        },
        'slickgrid_context_menu_hide_filter': {
            'en': 'Hide search filter',
            'de': 'Suchfilter ausblenden'
        },
        'slickgrid_context_menu_line_height_full': {
            'en': 'Line height for full visible content',
            'de': 'Zeilenhöhe für volle Anzeige Feldinhalt'
        },
        'slickgrid_context_menu_line_height_single': {
            'en': 'Line height for single line only',
            'de': 'Zeilenhöhe für einzeiligen Text'
        },
        'slickgrid_context_menu_line_height_single_hint': {
            'en': 'Switch between single text line in row and display of complete content',
            'de': 'Wechsel zwischen einzeiligem Text und Anzeige des kompletten Feld-Inhaltes'
        },
        'slickgrid_context_menu_plot_column_hint': {
            'en': 'Add/remove column to graphic timeline diagram',
            'de': 'Hinzufügen/Löschen der Spalte aus grafischem Zeitleisten-Diagramm'
        },
        'slickgrid_context_menu_remove_all_from_diagram': {
            'en': 'Remove all graphs from diagram',
            'de': 'Alle Kurven aus Diagramm entfernen'
        },
        'slickgrid_context_menu_remove_all_from_diagram_hint': {
            'en': 'Remove all column-graphs from current diagram',
            'de': 'Antfernen aller Spalten-Kurven aus dem aktuellen Diagramm'
        },
        'slickgrid_context_menu_search_filter_hint': {
            'en': 'Show/hide column-specific search filter in first line of table',
            'de': 'Anzeigen/Ausblenden des spalten-spezifischen Suchfilters in erster Zeile der Tabelle'
        },
        'slickgrid_context_menu_show_filter': {
            'en': 'Show search filter',
            'de': 'Suchfilter einblenden'
        },
        'slickgrid_context_menu_sort_column': {
            'en': 'Sort by this column',
            'de': 'Nach dieser Spalte sortieren'
        },
        'slickgrid_context_menu_sort_column_hint': {
            'en': 'Sort table by this column. Each click switches between ascending and descending order',
            'de': 'Sortieren der Tabelle nach dieser Spalte. Wechselt zwischen aufsteigender und absteigender Folge.'
        },
        'slickgrid_context_menu_switch_col_into_diagram': {
            'en': 'Show column in diagram',
            'de': 'Spalte in Diagramm einblenden'
        },
        'slickgrid_context_menu_switch_col_from_diagram': {
            'en': 'Remove column from diagram',
            'de': 'Spalte aus Diagramm ausblenden'
        },
        'slickgrid_context_menu_sort_method_QuickSort': {
            'en': 'Switch column sort method to bubble sort',
            'de': 'Sortier-Methode für Spalten auf Bubble-Sort wechseln'
        },
        'slickgrid_context_menu_sort_method_BubbleSort': {
            'en': 'Switch column sort method to quick sort',
            'de': 'Sortier-Methode für Spalten auf Quick-Sort wechseln'
        },
        'slickgrid_context_menu_sort_method_hint': {
            'en': 'Switch column sort method between quick sort (fast) and bubble sort (remains last sort order for identical values)',
            'de': 'Wechsel der Sortier-Methode zwischen Quick-Sort (schnell) und Bubble-Sort (erhält vorherige Sortierfolge für gleiche Werte)'
        },
        'slickgrid_filter_hint_not_numeric': {
            'en': 'Filter by containing string',
            'de': 'Filtern nach enthaltener Zeichenkette'
        },
        'slickgrid_filter_hint_numeric': {
            'en': 'Filter by exact value (incl. thousands-delimiter and comma)',
            'de': 'Filtern nach exaktem Wert (incl. Tausender-Trennung und Komma)'
        }
    }
}








