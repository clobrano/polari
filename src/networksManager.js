const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const Lang = imports.lang;
const Signals = imports.signals;

let _singleton = null;

function getDefault() {
    if (_singleton == null)
        _singleton = new NetworksManager();
    return _singleton;
}

const NetworksManager = new Lang.Class({
    Name: 'NetworksManager',

    _init: function() {
        this._networks = [];
        this._networksById = new Map();

        let uri = 'resource:///org/gnome/Polari/data/networks.json';
        let file = Gio.File.new_for_uri(uri);
        let success, data;
        try {
            [success, data, ] = file.load_contents(null);
            this._parseNetworks(data);
        } catch(e) {
            log('Failed to load network list: ' + e.message);
        }
    },

    _onContentsReady: function(f, res) {
        let success, data;
        try {
            [success, data, ] = f.load_contents_finish(res);
        } catch(e) {
            log('Failed to load network list: ' + e.message);
            return;
        }
        if (this._parseNetworks(data))
            this.emit('changed');
    },

    _parseNetworks: function(data) {
        let networks;
        try {
            networks = JSON.parse(data);
        } catch(e) {
            log('Failed to parse network list: ' + e.message);
            return false;
        }

        this._networksById.clear();
        this._networks = networks;
        this._networks.forEach(Lang.bind(this,
            function(network) {
                this._networksById.set(network.id, network);
            }));
        return true;
    },

    _lookupNetwork: function(id) {
        let network = this._networksById.get(id);
        if (!network)
            throw new Error('Invalid network ID');
        return network;
    },

    get networks() {
        return this._networks;
    },

    get favoriteNetworks() {
        let favNetworks = [ ];
        for (let network of this._networks) {
            if (this.getNetworkIsFavorite(network.id))
                favNetworks.push(network);
        }
        return favNetworks;
    },

    getAccountIsPredefined: function(account) {
        return account && this._networksById.get(account.service) != null;
    },

    getNetworkName: function(id) {
        return this._lookupNetwork(id).name;
    },

    getNetworkIsFavorite: function(id) {
        let network = this._lookupNetwork(id);

        if (network.hasOwnProperty('favorite'))
            return network['favorite'];

        return false;
    },

    getNetworkDetails: function(id) {
        let network = this._lookupNetwork(id);
        if (!network.servers || !network.servers.length)
            throw new Error('No servers for network ' + id);

        let server = this.getNetworkServers(id)[0];
        return {
            'account': new GLib.Variant('s', GLib.get_user_name()),
            'server': new GLib.Variant('s', server.address),
            'port': new GLib.Variant('u', server.port),
            'use-ssl': new GLib.Variant('b', server.ssl)
        };
    },

    getNetworkServers: function(id) {
        let network = this._lookupNetwork(id);
        let sslServers = network.servers.filter(s => s.ssl);
        return sslServers.length > 0 ? sslServers
                                     : network.servers.slice();
    },

    getNetworkMatchTerms: function(id) {
        let network = this._lookupNetwork(id);
        let servers = network.servers.map(function(s) {
            return s.address.toLowerCase();
        });
        return [network.name.toLowerCase(),
                network.id.toLowerCase()].concat(servers);
    },

    findByServer: function(server) {
        for (let n of this._networks)
           if (n.servers.some(s => s.address == server))
               return n.id;
        return null;
    }
});
Signals.addSignalMethods(NetworksManager.prototype);
