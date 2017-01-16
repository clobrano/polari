const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Polari = imports.gi.Polari;
const Tp = imports.gi.TelepathyGLib;

const Lang = imports.lang;
const NetworksManager = imports.networksManager;
const Utils = imports.utils;

const CONFIGURE_TIMEOUT = 100; /* ms */

const SetupPage = {
    CONNECTION: 0,
    ROOM: 1
};

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
                        'connectionPageList',
                        'serverRoomList',
                        'nameEntry',
                        'spinner' ],

    _init: function(params) {

        this.parent(params);

        this._currentAccount = null;

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

        this._connectionPageList.connect('account-created', Lang.bind(this,
            function(w, account) {
                this._setPage(SetupPage.ROOM);
                this._currentAccount = account;
                this._serverRoomList.setAccount(account);
            }));
    },

    _setPage: function(page) {
        let isConnection = page == SetupPage.CONNECTION;

        if (!isConnection)
            this._nameEntry.grab_focus();

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

        this._doneButton.connect('clicked', Lang.bind(this,
            function() {
                this._joinRoom();
                this.destroy();
            }));

        this._doneButton.sensitive = false;

        this._nameEntry.connect('changed',
                                Lang.bind(this, this._updateCanJoin));
        this._serverRoomList.connect('notify::can-join',
                                     Lang.bind(this, this._updateCanJoin));
        this._serverRoomList.bind_property('loading', this._spinner, 'active',
                                            GObject.BindingFlags.SYNC_CREATE);
    },

    get _page() {
        if (this._contentStack.visible_child_name == 'roomPage')
            return SetupPage.ROOM;
        else
            return SetupPage.MAIN;
    },

    _updateCanJoin: function() {
        let sensitive = false;

        if (this._page == SetupPage.ROOM)
            sensitive = this._serverRoomList.can_join;

        this._doneButton.sensitive = sensitive;
    },

    _joinRoom: function() {
        this.hide();

        let toJoinRooms = this._serverRoomList.selectedRooms;
        if (this._nameEntry.get_text_length() > 0)
            toJoinRooms.push(this._nameEntry.get_text());

        let account = this._currentAccount;
        toJoinRooms.forEach(function(room) {
            if (room[0] != '#')
                room = '#' + room;

            let app = Gio.Application.get_default();
            let action = app.lookup_action('join-room');
            action.activate(GLib.Variant.new('(ssu)',
                                             [ account.get_object_path(),
                                             room,
                                             Utils.getTpEventTime() ]));
        });
    }

});

const InitSetupConnectionsList = new Lang.Class({
    Name: 'InitSetupConnectionsList',
    Extends: Gtk.Frame,
    Signals: { 'account-created': { param_types: [Tp.Account.$gtype] } },

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
        for (let network of this._networksManager.favoriteNetworks) {
            this._rows.set(network.id,
                           new InitSetupConnectionRow({ id: network.id }));
            this._list.add(this._rows.get(network.id));
        }
    },

    _onRowActivated: function(list, row) {
        let name = this._networksManager.getNetworkName(row.id);
        let req = new Tp.AccountRequest({ account_manager: Tp.AccountManager.dup(),
                                          connection_manager: 'idle',
                                          protocol: 'irc',
                                          display_name: name });
        req.set_service(row.id);
        req.set_enabled(true);

        let details = this._networksManager.getNetworkDetails(row.id);

        for (let prop in details)
            req.set_parameter(prop, details[prop]);

        req.create_account_async(Lang.bind(this,
            function(r, res) {
                let account = req.create_account_finish(res);
                this.emit('account-created', account);
            }));
    }
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

    get id() {
        return this._id;
    }

});
