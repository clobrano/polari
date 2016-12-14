const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Polari = imports.gi.Polari;
const Tp = imports.gi.TelepathyGLib;

const Lang = imports.lang;
const NetworksManager = imports.networksManager;

const CONFIGURE_TIMEOUT = 100; /* ms */

const SetupPage = {
    CONNECTION: 0,
    ROOM: 1
};


// SETUP WINDOW CONFIG

const InitSetup = new Lang.Class({
    Name: 'InitSetup',
    Extends: Gtk.Window,
    Template: 'resource:///org/gnome/Polari/ui/init-setup.ui',
    InternalChildren: [ 'leftHeaderStack',
                        'cancelButton',
                        'backButton',
                        'rightHeaderStack',
                        'nextButton',
                        'doneButton',
                        'contentStack',
                        'connectionPageList' ],

    _init: function(params) {

        this.parent(params);

        // Allow css styling
        this._addApplicationStyle();

        this._setupConnectionPage();
        this._setupRoomPage();
    },

    _addApplicationStyle: function() {
        let provider = new Gtk.CssProvider();
        let uri = 'resource:///org/gnome/Polari/css/application.css';
        let file = Gio.File.new_for_uri(uri);
        try {
            provider.load_from_file(Gio.File.new_for_uri(uri));
        } catch(e) {
            logError(e, "Failed to add application style");
        }
        Gtk.StyleContext.add_provider_for_screen(
            this.get_screen(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    },

    _setupConnectionPage: function() {
        this._nextButton.connect('clicked', Lang.bind(this,
            function() {
                this._setPage(SetupPage.ROOM);
            }));

        this._cancelButton.connect('clicked', Lang.bind(this,
            function() {
                this.destroy();
            }));

        this._connectionPageList.connect('row-selected', Lang.bind(this,
            function() {
                this._setPage(SetupPage.ROOM);
            }));
    },

    _setPage: function(page) {
        let isConnection = page == SetupPage.CONNECTION;

        this._contentStack.visible_child_name = isConnection ? 'connectionPage'
                                                       : 'roomPage';
        this._leftHeaderStack.visible_child_name = isConnection ? 'cancelButton'
                                                          : 'backButton';
        this._rightHeaderStack.visible_child_name = isConnection ? 'nextButton'
                                                           : 'doneButton';
    },

    _setupRoomPage: function() {
        this._backButton.connect('clicked', Lang.bind(this,
            function() {
                this._setPage(SetupPage.CONNECTION);
            }));
    }

});

// CONNECTION LIST SETUP
const InitSetupConnectionsList = new Lang.Class({
    Name: 'InitSetupConnectionsList',
    Extends: Gtk.Frame,
    Signals: { 'row-selected' : {} },

    _init: function(params) {
        this.parent(params);

        this._list = new Gtk.ListBox({ visible: true });
        this._list.connect('row-activated',
                           Lang.bind(this, this._onRowActivated));
        this.add(this._list);

        this._rows = new Map();

        this._list.set_header_func(Lang.bind(this, this._updateHeader));

        this._networksManager = NetworksManager.getDefault();
        this._networksChanged();
    },

    _updateHeader: function(row, before) {
        if (!before)
            row.set_header(null);
        else if (!row.get_header())
            row.set_header(new Gtk.Separator());
    },

    _networksChanged: function() {

        let networkList = this._networksManager.networks;
        for (let n of networkList) {
            if (this._networksManager.getNetworkIsFavorite(n.id)) {
                this._rows.set(n.id,
                               new InitSetupConnectionRow({ id: n.id }));
                this._list.add(this._rows.get(n.id));
            }
        }
    },

    _onRowActivated: function() {
        this.emit('row-selected');
    },
});

const InitSetupConnectionRow = new Lang.Class({
    Name: 'InitSetupConnectionRow',
    Extends: Gtk.ListBoxRow,

    _init: function(params) {
        if (!params || !params.id)
            throw new Error('No id in parameters');

        this._id = params.id;
        delete params.id;

        this.parent(params);

        let box = new Gtk.Box({ spacing: 12, margin: 12 });
        this.add(box);

        let name = NetworksManager.getDefault().getNetworkName(this._id);
        box.add(new Gtk.Label({ label: name, halign: Gtk.Align.START }));

        this.show_all();
    },

});
