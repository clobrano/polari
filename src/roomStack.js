const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const Tp = imports.gi.TelepathyGLib;

const AccountsMonitor = imports.accountsMonitor;
const ChatView = imports.chatView;
const EntryArea = imports.entryArea;
const Lang = imports.lang;
const RoomManager = imports.roomManager;

const RoomStack = new Lang.Class({
    Name: 'RoomStack',
    Extends: Gtk.Stack,
    Properties: {
        'entry-area-height': GObject.ParamSpec.uint('entry-area-height',
                                                    'entry-area-height',
                                                    'entry-area-height',
                                                    GObject.ParamFlags.READABLE,
                                                    0, GLib.MAXUINT32, 0)
    },

    _init: function(params) {
        this.parent(params);

        this._sizeGroup = new Gtk.SizeGroup({ mode: Gtk.SizeGroupMode.VERTICAL });
        this._rooms = new Map();

        this._roomManager = RoomManager.getDefault();

        this._roomManager.connect('room-added',
                                  Lang.bind(this, this._roomAdded));
        this._roomManager.connect('room-removed',
                                  Lang.bind(this, this._roomRemoved));
        this._roomManager.rooms.forEach(r => { this._roomAdded(this._roomManager, r); });

        this.add_named(new ChatPlaceholder(this._sizeGroup), 'placeholder');

        this._entryAreaHeight = 0;
        this._sizeGroup.get_widgets()[0].connect('size-allocate', (w, rect) => {
            this._entryAreaHeight = rect.height - 1;
            this.notify('entry-area-height');
        });
    },

    vfunc_realize: function() {
        this.parent();

        let toplevel = this.get_toplevel();

        toplevel.connect('notify::active-room',
                         Lang.bind(this, this._activeRoomChanged));
        toplevel.connect('active-room-state-changed',
                         Lang.bind(this, this._updateSensitivity));
        this._activeRoomChanged();
        this._updateSensitivity();
    },

    get entry_area_height() {
        return this._entryAreaHeight;
    },

    _addView: function(id, view) {
        this._rooms.set(id, view);
        this.add_named(view, id);
    },

    _roomAdded: function(roomManager, room) {
        this._addView(room.id, new RoomView(room, this._sizeGroup));
    },

    _roomRemoved: function(roomManager, room) {
        this._rooms.get(room.id).destroy();
        this._rooms.delete(room.id);
    },

    _activeRoomChanged: function() {
        let room = this.get_toplevel().active_room;
        this.set_visible_child_name(room ? room.id : 'placeholder');
    },

    _updateSensitivity: function() {
        let room = this.get_toplevel().active_room;
        if (!room)
            return;
        let sensitive = room && room.channel;
        this._rooms.get(room.id).inputSensitive = sensitive;
    }
});

const SavePasswordConfirmationBar = new Lang.Class({
    Name: 'SavePasswordConfirmationBar',
    Extends: Gtk.Revealer,

    _init: function(room) {
        this._room = room;

        this.parent({ valign: Gtk.Align.START });

        this.connect('destroy', Lang.bind(this, this._onDestroy));

        this._createWidget();

        this._identifySentId = this._room.connect('identify-sent', () => {
            this.reveal_child = true;
        });
        this._infoBar.connect('response', (w, res) => {
            if (res == Gtk.ResponseType.CLOSE) {
                let app = Gio.Application.get_default();
                let target = new GLib.Variant('o', this._room.account.object_path);
                app.lookup_action('discard-identify-password').activate(target);
            }
            this.reveal_child = false;
        });
    },

    _createWidget: function() {
        this._infoBar = new Gtk.InfoBar({ show_close_button: true })
        this.add(this._infoBar);

        let target = new GLib.Variant('o', this._room.account.object_path);
        let button = new Gtk.Button({ label: _("_Save Password"),
                                      use_underline: true,
                                      action_name: 'app.save-identify-password',
                                      action_target: target });
        this._infoBar.add_action_widget(button, Gtk.ResponseType.ACCEPT);

        let box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        this._infoBar.get_content_area().add(box);

        let title = _("Should the password be saved?");
        this._titleLabel = new Gtk.Label({ halign: Gtk.Align.START,
                                           valign: Gtk.Align.CENTER,
                                           wrap: true });
        this._titleLabel.set_markup('<b>' + title + '</b>');
        box.add(this._titleLabel);

        let accountName = this._room.account.display_name;
        let text = _("Identification will happen automatically the next time you connect to %s").format(accountName);
        this._subtitleLabel = new Gtk.Label({ label: text,
                                              ellipsize: Pango.EllipsizeMode.END });
        box.add(this._subtitleLabel);

        this._infoBar.show_all();
    },

    _onDestroy: function() {
        if (this._identifySentId)
            this._room.disconnect(this._identifySentId);
        this._identifySentId = 0;
    }
});

const ChatPlaceholder = new Lang.Class({
    Name: 'ChatPlaceholder',
    Extends: Gtk.Overlay,

    _init: function(sizeGroup) {
        this._accountsMonitor = AccountsMonitor.getDefault();

        let image = new Gtk.Image({ icon_name: 'org.gnome.Polari-symbolic',
                                      pixel_size: 96, halign: Gtk.Align.END,
                                      margin_end: 14 });

        let title = new Gtk.Label({ use_markup: true, halign: Gtk.Align.START,
                                    margin_start: 14 });
        title.label = '<span letter_spacing="4500">%s</span>'.format(_("Polari"));
        title.get_style_context().add_class('polari-background-title');

        let description = new Gtk.Label({ label: _("Join a room using the + button."),
                                          halign: Gtk.Align.CENTER, wrap: true,
                                          margin_top: 24, use_markup: true });
        description.get_style_context().add_class('polari-background-description');

        let inputPlaceholder = new Gtk.Box({ valign: Gtk.Align.END });
        sizeGroup.add_widget(inputPlaceholder);

        this.parent();
        let grid = new Gtk.Grid({ column_homogeneous: true, can_focus: false,
                                  column_spacing: 18, hexpand: true, vexpand: true,
                                  valign: Gtk.Align.CENTER });
        grid.get_style_context().add_class('polari-background');
        grid.attach(image, 0, 0, 1, 1);
        grid.attach(title, 1, 0, 1, 1);
        grid.attach(description, 0, 1, 2, 1);
        this.add(grid);
        this.add_overlay(inputPlaceholder);
        this.show_all();
    }
});

const RoomView = new Lang.Class({
    Name: 'RoomView',
    Extends: Gtk.Overlay,

    _init: function(room, sizeGroup) {
        this.parent();

        let box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        this.add(box);

        if (room.type == Tp.HandleType.CONTACT)
            this.add_overlay(new SavePasswordConfirmationBar(room));

        this._view = new ChatView.ChatView(room);
        box.add(this._view);

        this._entryArea = new EntryArea.EntryArea({ room: room,
                                                    sensitive: false });
        box.add(this._entryArea);

        this._view.bind_property('max-nick-chars',
                                 this._entryArea, 'max-nick-chars',
                                 GObject.BindingFlags.SYNC_CREATE);
        sizeGroup.add_widget(this._entryArea);

        this._view.connect('text-dropped', (view, text) => {
           this._entryArea.pasteText(text, text.split('\n').length);
        });
        this._view.connect('image-dropped', (view, image) => {
           this._entryArea.pasteImage(image);
        });
        this._view.connect('file-dropped', (view, file) => {
           this._entryArea.pasteFile(file);
        });

        this.show_all();
    },

    set inputSensitive(sensitive) {
        this._entryArea.sensitive = sensitive;
    }
});
